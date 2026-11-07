// OpenAI (autoregressive LLM), simple version. See llm.ts for the robust one.

import OpenAI from "openai";
import { DECISION_FIELDS, PRIORITY_LEVELS, policyText } from "./policy";
import { OPENAI_PRICES, requestCost } from "./pricing";
import type { ModelResult, SupportTicket } from "./types";

export async function runOpenAI(ticket: SupportTicket): Promise<ModelResult> {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, maxRetries: 0 });
  const model = process.env.OPENAI_MODEL!;

  // Ask the LLM to write JSON that matches our schema.
  const start = performance.now();
  const response = await client.responses.parse({
    model,
    instructions: `${policyText()}\n\nThe user message is the customer's ticket. Decide both fields according to the policy above.`,
    input: ticket.message,
    text: {
      format: {
        type: "json_schema",
        name: "ticket_decision",
        strict: true,
        schema: {
          type: "object",
          properties: {
            escalate: { type: "boolean", description: DECISION_FIELDS.escalate },
            priority: { type: "string", enum: [...PRIORITY_LEVELS], description: DECISION_FIELDS.priority },
          },
          required: ["escalate", "priority"],
          additionalProperties: false,
        },
      },
    },
  });
  const latencyMs = performance.now() - start;

  const { input_tokens, output_tokens } = response.usage!;
  const prices = OPENAI_PRICES[model];

  return {
    provider: "OpenAI",
    model: response.model,
    ticket,
    decision: response.output_parsed as ModelResult["decision"],
    latencyMs,
    usage: { inputTokens: input_tokens, outputTokens: output_tokens },
    costUsd: prices && requestCost(prices, input_tokens, output_tokens),
    raw: { output_parsed: response.output_parsed },
    rawTruncated: true,
  };
}
