// OpenAI (autoregressive LLM) demo entry point.
//
// Read top to bottom:
//   1. The request    — policy.ts translated into instructions + a strict JSON schema
//   2. The API call   — callOpenAI(): the only place the model runs (inference)
//   3. The decision   — toDecision(): application code that checks and accepts the output
//   4. runOpenAI()    — ties them together into a ModelResult (exported for compare.ts)

import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import OpenAI from "openai";
import { parseCli } from "./cli";
import { printResult } from "./output";
import { DECISION_FIELDS, PRIORITY_LEVELS, policyText } from "./policy";
import { OPENAI_PRICES, requestCost } from "./pricing";
import type { ModelResult, SupportTicket, TicketDecision, TicketPriority, UsageMetrics } from "./types";

config({ quiet: true });

// ─── 1. The request ─────────────────────────────────────────────────────────

const INSTRUCTIONS = `${policyText()}\n\nThe user message is the customer's ticket. Decide both fields according to the policy above.`;

/** Strict structured output: the API guarantees the reply matches this schema exactly. */
const DECISION_SCHEMA = {
  type: "object",
  properties: {
    escalate: { type: "boolean", description: DECISION_FIELDS.escalate },
    priority: { type: "string", enum: [...PRIORITY_LEVELS], description: DECISION_FIELDS.priority },
  },
  required: ["escalate", "priority"],
  additionalProperties: false,
};

// ─── 2. The API call (model inference) ──────────────────────────────────────

interface Inference {
  readonly response: OpenAI.Responses.ParsedResponse<unknown>;
  readonly latencyMs: number;
}

async function callOpenAI(client: OpenAI, model: string, ticket: SupportTicket): Promise<Inference> {
  const send = async (temperature: number | undefined) => {
    const start = performance.now();
    const response = await client.responses.parse({
      model,
      instructions: INSTRUCTIONS,
      input: ticket.message,
      text: {
        format: { type: "json_schema", name: "ticket_decision", strict: true, schema: DECISION_SCHEMA },
      },
      ...(temperature === undefined ? {} : { temperature }),
      store: false,
    });
    return { response, latencyMs: performance.now() - start };
  };

  try {
    return await send(0);
  } catch (error) {
    // Some models (e.g. reasoning models) reject `temperature`. Retry once without it.
    // Only the successful request is timed.
    if (error instanceof OpenAI.BadRequestError && error.param === "temperature") {
      return await send(undefined);
    }
    throw error;
  }
}

// ─── 3. The decision (application logic) ────────────────────────────────────

class DecisionError extends Error {}

/** Accept the model's structured output as a decision, or explain why it can't be used. */
function toDecision(response: OpenAI.Responses.ParsedResponse<unknown>): TicketDecision {
  if (response.status !== "completed") {
    const reason = response.incomplete_details?.reason ?? response.status ?? "unknown";
    throw new DecisionError(`The model did not finish its response (${reason}).`);
  }

  const refusal = response.output
    .flatMap((item) => (item.type === "message" ? item.content : []))
    .find((content) => content.type === "refusal");
  if (refusal) throw new DecisionError(`The model refused to decide: ${refusal.refusal}`);

  // Parsed by the SDK from the schema-constrained output; checked here defensively anyway.
  const parsed = response.output_parsed as { escalate?: unknown; priority?: unknown } | null;
  if (
    !parsed ||
    typeof parsed.escalate !== "boolean" ||
    !PRIORITY_LEVELS.includes(parsed.priority as TicketPriority)
  ) {
    throw new DecisionError(`The model's output does not match the decision schema: ${response.output_text}`);
  }

  return { escalate: parsed.escalate, priority: parsed.priority as TicketPriority };
}

function toUsage(usage: OpenAI.Responses.ResponseUsage | undefined): UsageMetrics | undefined {
  if (!usage) return undefined;
  return {
    inputTokens: usage.input_tokens,
    outputTokens: usage.output_tokens,
    reasoningTokens: usage.output_tokens_details.reasoning_tokens,
    totalTokens: usage.total_tokens,
  };
}

/** Priced by the requested model name, so an unlisted model or snapshot shows N/A rather than a guess. */
function toCost(model: string, usage: OpenAI.Responses.ResponseUsage | undefined): number | undefined {
  const prices = OPENAI_PRICES[model];
  if (!usage || !prices) return undefined;
  return requestCost(prices, usage.input_tokens, usage.output_tokens);
}

// ─── 4. Putting it together ─────────────────────────────────────────────────

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new DecisionError(`${name} is not set. Copy .env.example to .env and fill it in.`);
  return value;
}

export async function runOpenAI(ticket: SupportTicket): Promise<ModelResult> {
  const model = requireEnv("OPENAI_MODEL");
  // No automatic retries, so the measured latency is exactly one request.
  const client = new OpenAI({ apiKey: requireEnv("OPENAI_API_KEY"), maxRetries: 0 });

  const { response, latencyMs } = await callOpenAI(client, model, ticket);

  return {
    provider: "OpenAI",
    model: response.model,
    ticket,
    decision: toDecision(response),
    latencyMs,
    usage: toUsage(response.usage),
    costUsd: toCost(model, response.usage),
    raw: response,
  };
}

export function describeError(error: unknown): string {
  if (error instanceof DecisionError) return error.message;
  if (error instanceof OpenAI.AuthenticationError) return "OpenAI rejected the API key (401). Check OPENAI_API_KEY.";
  if (error instanceof OpenAI.NotFoundError) return `OpenAI could not find the model (404). Check OPENAI_MODEL.\n${error.message}`;
  if (error instanceof OpenAI.RateLimitError) return `OpenAI rate limit or quota exceeded (429).\n${error.message}`;
  if (error instanceof OpenAI.APIConnectionError) return `Could not reach the OpenAI API: ${error.message}`;
  if (error instanceof OpenAI.APIError) {
    return `OpenAI API error (${error.status ?? "no status"}): ${error.message}${error.requestID ? `\nRequest ID: ${error.requestID}` : ""}`;
  }
  return error instanceof Error ? (error.stack ?? error.message) : String(error);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { ticket, raw } = parseCli("demo:llm");
  try {
    printResult(await runOpenAI(ticket), { raw });
  } catch (error) {
    console.error(`Error: ${describeError(error)}`);
    process.exit(1);
  }
}
