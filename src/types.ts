export type TicketId = "high" | "low" | "ambiguous" | "calm" | "single" | "security" | "mixed";

export type TicketPriority = "low" | "medium" | "high";

export interface SupportTicket {
  readonly id: TicketId;
  readonly label: string;
  readonly message: string;
}

/** The normalized decision every provider is reduced to for comparison. */
export interface TicketDecision {
  readonly escalate: boolean;
  readonly priority: TicketPriority;
}

/**
 * Probabilities the provider itself returns for each decision field,
 * e.g. { escalate: { true: 0.97, false: 0.03 }, priority: { high: 0.91, ... } }.
 * Only populate this from values the API actually returns.
 */
export type NativeProbabilities = Readonly<Record<string, Readonly<Record<string, number>>>>;

/**
 * Usage metrics in the provider's own units and names
 * (e.g. { inputTokens: 98, outputTokens: 26 }). Not comparable across providers.
 */
export type UsageMetrics = Readonly<Record<string, number>>;

export interface ModelResult {
  readonly provider: string;
  readonly model?: string;
  readonly ticket: SupportTicket;
  readonly decision: TicketDecision;
  readonly latencyMs: number;
  readonly probabilities?: NativeProbabilities;
  readonly usage?: UsageMetrics;
  /** USD cost of this request at the list prices in pricing.ts. Undefined when no price is known. */
  readonly costUsd?: number;
  /** Provider-specific notes, e.g. confidence values or answers too uncertain to act on automatically. */
  readonly notes?: readonly string[];
  /** Full provider response, printed with --raw. */
  readonly raw: unknown;
  /** True when `raw` keeps only some of the response's properties; --raw then marks the rest with "...". */
  readonly rawTruncated?: boolean;
}
