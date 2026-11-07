// The single source of truth for what both models are asked to decide.
// Each integration translates these descriptions into its own API format
// (a prompt + JSON schema for OpenAI, decision definitions for Jev)
// but must not change their meaning.

import type { TicketPriority } from "./types";

export const TASK_DESCRIPTION =
  "Decide how a customer support ticket should be handled: whether it needs immediate human escalation, and what support priority it should receive.";

export const PRIORITY_LEVELS: readonly TicketPriority[] = ["low", "medium", "high"];

export const PRIORITY_POLICY: Readonly<Record<TicketPriority, string>> = {
  high: "Critical business disruption, widespread outage, or complete inability to use a core service.",
  medium: "Material impairment of functionality without a complete outage or immediate critical business impact.",
  low: "Routine questions, cosmetic issues, or minor inconveniences.",
};

export const ESCALATION_POLICY =
  "Escalation means immediate human attention, not merely assigning a support priority. Generally, critical incidents should be escalated, while routine requests should not.";

export const DECISION_FIELDS = {
  escalate: "Boolean. Whether the ticket requires immediate human escalation.",
  priority: `One of: ${PRIORITY_LEVELS.join(", ")}. The support priority of the ticket.`,
} as const;

/** The full policy as plain text, for providers that take instructions as prose. */
export function policyText(): string {
  return [
    TASK_DESCRIPTION,
    "",
    "Fields:",
    `- escalate: ${DECISION_FIELDS.escalate}`,
    `- priority: ${DECISION_FIELDS.priority}`,
    "",
    "Priority policy:",
    ...PRIORITY_LEVELS.toReversed().map((p) => `- ${p.toUpperCase()}: ${PRIORITY_POLICY[p]}`),
    "",
    "Escalation policy:",
    ESCALATION_POLICY,
  ].join("\n");
}
