// Jev (purpose-built decision model), simple version. See jev.ts for the robust one.

import { ESCALATION_POLICY, PRIORITY_POLICY } from "./policy";
import { JEV_PRICES, requestCost } from "./pricing";
import type { ModelResult, SupportTicket, TicketPriority } from "./types";

export async function runJev(ticket: SupportTicket): Promise<ModelResult> {
  // Ask Jev two typed questions about the ticket. The question type fixes the answer's shape.
  const start = performance.now();
  const response = await fetch("https://api.typesafe.ai/v1/systemone", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.JEV_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: process.env.JEV_MODEL || "jev-latest",
      state: ticket.message,
      questions: {
        escalate: {
          type: "noul", // yes/no → probability of "yes"
          instructions: `Does this customer support ticket require immediate human escalation? ${ESCALATION_POLICY}`,
        },
        priority: {
          type: "choice", // one label → probability of every label
          instructions: "What support priority should this customer support ticket receive?",
          criteria: PRIORITY_POLICY,
        },
      },
    }),
  });
  if (!response.ok) throw new Error(`Jev API returned HTTP ${response.status}: ${await response.text()}`);
  const { model, answers, usage } = (await response.json()) as any;
  const latencyMs = performance.now() - start;

  return {
    provider: "Jev",
    model,
    ticket,
    decision: {
      escalate: answers.escalate.noul >= 0.5,
      priority: answers.priority.choice as TicketPriority,
    },
    latencyMs,
    probabilities: { escalate: { yes: answers.escalate.noul }, priority: answers.priority.probabilities },
    notes: [`priority confidence: ${(answers.priority.confidence * 100).toFixed(1)}%`],
    usage: { inputTokens: usage.input_tokens, outputTokens: usage.output_tokens },
    costUsd: requestCost(JEV_PRICES, usage.input_tokens, usage.output_tokens),
    raw: { answers },
    rawTruncated: true,
  };
}
