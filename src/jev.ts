// Jev (purpose-built decision model) demo entry point.
//
// Jev is made by TypeSafe. This file follows TypeSafe's official System One API
// (https://docs.typesafe.ai/api/system-one, spec: https://api.typesafe.ai/openapi.json).
// Third-party resellers of Jev use different URLs, model IDs and response fields; none are used here.
//
// Read top to bottom:
//   1. The request    — policy.ts translated into two typed questions (a Noul and a Choice)
//   2. The API call   — callJev(): the only place the model runs (inference)
//   3. The decision   — toDecision(): application code that reads the answers and decides
//   4. runJev()       — ties them together into a ModelResult (exported for compare.ts)

import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { parseCli } from "./cli";
import { printResult } from "./output";
import { ESCALATION_POLICY, PRIORITY_LEVELS, PRIORITY_POLICY } from "./policy";
import { JEV_PRICES, requestCost } from "./pricing";
import type { ModelResult, NativeProbabilities, SupportTicket, TicketDecision, TicketPriority } from "./types";

config({ quiet: true });

const DEFAULT_BASE_URL = "https://api.typesafe.ai";
const DEFAULT_MODEL = "jev-latest"; // TypeSafe's documented alias for the newest stable Jev release
const TIMEOUT_MS = 30_000;

// ─── 1. The request ─────────────────────────────────────────────────────────

/**
 * Two typed questions about the same state, answered in one request.
 * There is no output format to describe: the question type fixes the answer's shape.
 */
const QUESTIONS = {
  // Noul: a yes/no question, answered with the probability of "yes".
  escalate: {
    type: "noul",
    instructions: `Does this customer support ticket require immediate human escalation? ${ESCALATION_POLICY}`,
  },
  // Choice: one label from a fixed set, answered with a probability for every label.
  priority: {
    type: "choice",
    instructions: "What support priority should this customer support ticket receive?",
    criteria: Object.fromEntries(PRIORITY_LEVELS.map((level) => [level, PRIORITY_POLICY[level]])),
  },
};

// Answer shapes from the official schema (NoulAnswer, ChoiceAnswer, SystemOneResponse).
interface NoulAnswer {
  readonly type: "noul";
  readonly noul: number; // probability that the answer is yes, 0..1
}

interface ChoiceAnswer {
  readonly type: "choice";
  readonly choice: string; // the label with the highest probability
  readonly confidence: number; // how concentrated the distribution is, 0..1, NOT a class probability
  readonly probabilities: Readonly<Record<string, number>>; // per label, sums to ~1
}

interface SystemOneResponse {
  readonly model: string; // the versioned model ID that answered, e.g. jev-1.14.0
  readonly answers: Readonly<Record<string, unknown>>;
  readonly usage?: { readonly input_tokens: number; readonly output_tokens: number };
}

// ─── 2. The API call (model inference) ──────────────────────────────────────

class DecisionError extends Error {}

class JevApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: string,
  ) {
    super(`Jev API returned HTTP ${status}`);
  }
}

interface Inference {
  readonly response: SystemOneResponse;
  readonly latencyMs: number;
}

async function callJev(baseUrl: string, apiKey: string, model: string, ticket: SupportTicket): Promise<Inference> {
  // No retries, so the measured latency is exactly one request.
  const start = performance.now();
  const response = await fetch(`${baseUrl}/v1/systemone`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, state: ticket.message, questions: QUESTIONS }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const text = await response.text();
  const latencyMs = performance.now() - start;

  if (!response.ok) throw new JevApiError(response.status, text);
  try {
    return { response: JSON.parse(text) as SystemOneResponse, latencyMs };
  } catch {
    throw new DecisionError(`Jev returned a response that is not JSON: ${text.slice(0, 300)}`);
  }
}

// ─── 3. The decision (application logic) ────────────────────────────────────

// The review thresholds are this demo's policy, starting from the values TypeSafe's docs suggest.
// They are not calibrated to the real-world cost of a wrong escalation or priority.
const CLEAR_NO = 0.3;
const CLEAR_YES = 0.7;

const isProbability = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;

/** Check that the response contains the two answers in the shape the schema promises. */
function readAnswers(response: SystemOneResponse): { escalate: NoulAnswer; priority: ChoiceAnswer } {
  const escalate = response.answers?.escalate as Partial<NoulAnswer> | undefined;
  const priority = response.answers?.priority as Partial<ChoiceAnswer> | undefined;

  if (escalate?.type !== "noul" || !isProbability(escalate.noul)) {
    throw new DecisionError(`Jev's "escalate" answer is not a valid Noul: ${JSON.stringify(escalate)}`);
  }
  if (
    priority?.type !== "choice" ||
    !PRIORITY_LEVELS.includes(priority.choice as TicketPriority) ||
    !isProbability(priority.confidence) ||
    !PRIORITY_LEVELS.every((level) => isProbability(priority.probabilities?.[level]))
  ) {
    throw new DecisionError(`Jev's "priority" answer is not a valid Choice: ${JSON.stringify(priority)}`);
  }
  return { escalate: escalate as NoulAnswer, priority: priority as ChoiceAnswer };
}

/** Both fields take the more probable outcome. How sure Jev was is reported separately. */
function toDecision(answers: { escalate: NoulAnswer; priority: ChoiceAnswer }): TicketDecision {
  return {
    escalate: answers.escalate.noul >= 0.5,
    priority: answers.priority.choice as TicketPriority,
  };
}

/** Flag answers that shouldn't be acted on automatically, and explain what `confidence` is. */
function toNotes(answers: { escalate: NoulAnswer; priority: ChoiceAnswer }): string[] {
  const { escalate, priority } = answers;
  const topProbability = priority.probabilities[priority.choice]!;
  const notes = [
    `priority confidence: ${priority.confidence.toFixed(2)}. This measures how concentrated the distribution is. It is not the probability that "${priority.choice}" is correct (that's ${topProbability.toFixed(2)}).`,
  ];

  if (escalate.noul > CLEAR_NO && escalate.noul < CLEAR_YES) {
    notes.push(
      `UNCERTAIN escalate: P(yes) = ${escalate.noul.toFixed(2)} is between ${CLEAR_NO} and ${CLEAR_YES}. The decision shows the more probable side; send it to a person to review instead of acting on it automatically.`,
    );
  }
  if (topProbability < CLEAR_YES) {
    notes.push(
      `UNCERTAIN priority: P(${priority.choice}) = ${topProbability.toFixed(2)} is below ${CLEAR_YES}. The decision shows the most probable label; send it to a person to review instead of acting on it automatically.`,
    );
  }
  return notes;
}

/** Exactly what Jev returned: P(yes) for the Noul and the per-label distribution for the Choice. */
function toProbabilities(answers: { escalate: NoulAnswer; priority: ChoiceAnswer }): NativeProbabilities {
  return {
    escalate: { yes: answers.escalate.noul },
    priority: answers.priority.probabilities,
  };
}

// ─── 4. Putting it together ─────────────────────────────────────────────────

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new DecisionError(`${name} is not set. Copy .env.example to .env and fill it in.`);
  return value;
}

export async function runJev(ticket: SupportTicket): Promise<ModelResult> {
  const apiKey = requireEnv("JEV_API_KEY");
  const model = process.env.JEV_MODEL?.trim() || DEFAULT_MODEL;
  const baseUrl = (process.env.JEV_BASE_URL?.trim() || DEFAULT_BASE_URL).replace(/\/+$/, "");

  const { response, latencyMs } = await callJev(baseUrl, apiKey, model, ticket);
  const answers = readAnswers(response);

  return {
    provider: "Jev",
    model: response.model,
    ticket,
    decision: toDecision(answers),
    latencyMs,
    probabilities: toProbabilities(answers),
    notes: toNotes(answers),
    usage: response.usage
      ? { inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens }
      : undefined,
    costUsd: response.usage
      ? requestCost(JEV_PRICES, response.usage.input_tokens, response.usage.output_tokens)
      : undefined,
    raw: response,
  };
}

const STATUS_HINTS: Readonly<Record<number, string>> = {
  400: "Jev rejected the request (400). The body broke a request rule or exceeded the model's context length.",
  401: "Jev rejected the API key (401). Check JEV_API_KEY. It must be a TypeSafe key.",
  413: "The request body is too large (413).",
  415: "Jev rejected the request encoding (415).",
  422: "Jev rejected the request body (422). Check JEV_MODEL and the question definitions.",
  429: "Jev rate limit exceeded (429). Wait a moment and try again.",
  529: "Jev is temporarily overloaded (529). Wait a moment and try again.",
};

export function describeError(error: unknown): string {
  if (error instanceof DecisionError) return error.message;
  if (error instanceof JevApiError) {
    const hint = STATUS_HINTS[error.status] ?? `Jev API error (${error.status}).`;
    return `${hint}\n${error.body.slice(0, 1000)}`;
  }
  if (error instanceof DOMException && error.name === "TimeoutError") {
    return `Jev did not respond within ${TIMEOUT_MS / 1000} s.`;
  }
  if (error instanceof TypeError && error.message === "fetch failed") {
    return `Could not reach the Jev API: ${(error.cause as Error | undefined)?.message ?? error.message}`;
  }
  return error instanceof Error ? (error.stack ?? error.message) : String(error);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { ticket, raw } = parseCli("demo:jev");
  try {
    printResult(await runJev(ticket), { raw });
  } catch (error) {
    console.error(`Error: ${describeError(error)}`);
    process.exit(1);
  }
}
