// List prices used to estimate what one request costs, in USD per 1M tokens.
// They are set by hand, not fetched from either provider. Update them when prices change.

export interface TokenPrices {
  readonly inputPerMillion: number;
  readonly outputPerMillion: number;
}

/** OpenAI prices by model name (OPENAI_MODEL). Models not listed here show cost as N/A. */
export const OPENAI_PRICES: Readonly<Record<string, TokenPrices>> = {
  "gpt-6-luna": { inputPerMillion: 0.1, outputPerMillion: 0.5 },
};

/** Jev bills input tokens only, so output tokens cost nothing. */
export const JEV_PRICES: TokenPrices = { inputPerMillion: 0.042, outputPerMillion: 0 };

/** USD cost of one request. OpenAI reasoning tokens are already counted in outputTokens. */
export function requestCost(prices: TokenPrices, inputTokens: number, outputTokens: number): number {
  return (inputTokens * prices.inputPerMillion + outputTokens * prices.outputPerMillion) / 1_000_000;
}
