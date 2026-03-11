/**
 * Estimates cost in USD from token counts when the adapter doesn't report costUsd.
 *
 * Pricing table (per million tokens):
 *   Claude Sonnet 4:   $3 input, $15 output, $0.30 cache-read
 *   Claude Haiku 3.5:  $0.80 input, $4 output, $0.08 cache-read
 *   Claude Opus 4:     $15 input, $75 output, $1.50 cache-read
 *   GPT-4o:            $2.50 input, $10 output
 *   GPT-4o-mini:       $0.15 input, $0.60 output
 *
 * Default: Claude Sonnet 4 (most commonly used via Cursor).
 */

export interface TokenCounts {
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
}

interface PricingTier {
  inputPerMTok: number;
  outputPerMTok: number;
  cacheReadPerMTok: number;
}

const PRICING: Record<string, PricingTier> = {
  // Claude models
  "claude-sonnet-4-20250514": { inputPerMTok: 3, outputPerMTok: 15, cacheReadPerMTok: 0.3 },
  "claude-4-sonnet": { inputPerMTok: 3, outputPerMTok: 15, cacheReadPerMTok: 0.3 },
  "claude-sonnet": { inputPerMTok: 3, outputPerMTok: 15, cacheReadPerMTok: 0.3 },
  "claude-3.5-sonnet": { inputPerMTok: 3, outputPerMTok: 15, cacheReadPerMTok: 0.3 },
  "claude-3-5-sonnet": { inputPerMTok: 3, outputPerMTok: 15, cacheReadPerMTok: 0.3 },
  "claude-3-5-sonnet-20241022": { inputPerMTok: 3, outputPerMTok: 15, cacheReadPerMTok: 0.3 },
  "claude-opus-4-20250514": { inputPerMTok: 15, outputPerMTok: 75, cacheReadPerMTok: 1.5 },
  "claude-4-opus": { inputPerMTok: 15, outputPerMTok: 75, cacheReadPerMTok: 1.5 },
  "claude-opus": { inputPerMTok: 15, outputPerMTok: 75, cacheReadPerMTok: 1.5 },
  "claude-haiku-3-5": { inputPerMTok: 0.8, outputPerMTok: 4, cacheReadPerMTok: 0.08 },
  "claude-3-5-haiku": { inputPerMTok: 0.8, outputPerMTok: 4, cacheReadPerMTok: 0.08 },
  "claude-3-5-haiku-20241022": { inputPerMTok: 0.8, outputPerMTok: 4, cacheReadPerMTok: 0.08 },
  // GPT models
  "gpt-4o": { inputPerMTok: 2.5, outputPerMTok: 10, cacheReadPerMTok: 1.25 },
  "gpt-4o-mini": { inputPerMTok: 0.15, outputPerMTok: 0.6, cacheReadPerMTok: 0.075 },
  "gpt-4.1": { inputPerMTok: 2, outputPerMTok: 8, cacheReadPerMTok: 0.5 },
  "gpt-4.1-mini": { inputPerMTok: 0.4, outputPerMTok: 1.6, cacheReadPerMTok: 0.1 },
  "gpt-4.1-nano": { inputPerMTok: 0.1, outputPerMTok: 0.4, cacheReadPerMTok: 0.025 },
  // OpenAI Codex models
  "gpt-5.3-codex": { inputPerMTok: 1.75, outputPerMTok: 14, cacheReadPerMTok: 0.4375 },
  "gpt-5.2-codex": { inputPerMTok: 1.75, outputPerMTok: 14, cacheReadPerMTok: 0.4375 },
  "gpt-5-codex": { inputPerMTok: 1.25, outputPerMTok: 10, cacheReadPerMTok: 0.3125 },
  "gpt-5.1-codex-mini": { inputPerMTok: 0.3, outputPerMTok: 1.2, cacheReadPerMTok: 0.075 },
  // Gemini
  "gemini-2.5-pro": { inputPerMTok: 1.25, outputPerMTok: 10, cacheReadPerMTok: 0.315 },
  "gemini-2.5-flash": { inputPerMTok: 0.15, outputPerMTok: 0.6, cacheReadPerMTok: 0.0375 },
};

// Default: Claude Sonnet 4 pricing (most commonly used)
const DEFAULT_PRICING: PricingTier = { inputPerMTok: 3, outputPerMTok: 15, cacheReadPerMTok: 0.3 };

/**
 * Resolve pricing for a model string. Tries exact match, then fuzzy substring matching.
 */
function resolvePricing(model?: string | null): PricingTier {
  if (!model) return DEFAULT_PRICING;

  const lower = model.toLowerCase();

  // Exact match
  if (PRICING[lower]) return PRICING[lower];

  // Fuzzy: find the first key that is a substring of the model string (or vice versa)
  for (const [key, tier] of Object.entries(PRICING)) {
    if (lower.includes(key) || key.includes(lower)) return tier;
  }

  // Broad category matching
  if (lower.includes("opus")) return PRICING["claude-opus-4-20250514"];
  if (lower.includes("sonnet")) return PRICING["claude-sonnet-4-20250514"];
  if (lower.includes("haiku")) return PRICING["claude-haiku-3-5"];
  if (lower.includes("gpt-4o-mini")) return PRICING["gpt-4o-mini"];
  if (lower.includes("gpt-4o")) return PRICING["gpt-4o"];
  if (lower.includes("gemini") && lower.includes("flash")) return PRICING["gemini-2.5-flash"];
  if (lower.includes("gemini")) return PRICING["gemini-2.5-pro"];
  if (lower.includes("codex") && lower.includes("mini")) return PRICING["gpt-5.1-codex-mini"];
  if (lower.includes("codex")) return PRICING["gpt-5.3-codex"];

  return DEFAULT_PRICING;
}

/**
 * Estimate cost in USD from token counts.
 * Returns 0 if no tokens were used.
 */
export function estimateCostUsd(tokens: TokenCounts, model?: string | null): number {
  const input = tokens.inputTokens ?? 0;
  const output = tokens.outputTokens ?? 0;
  const cacheRead = tokens.cacheReadTokens ?? 0;

  if (input === 0 && output === 0 && cacheRead === 0) return 0;

  const pricing = resolvePricing(model);

  const costUsd =
    (input / 1_000_000) * pricing.inputPerMTok +
    (output / 1_000_000) * pricing.outputPerMTok +
    (cacheRead / 1_000_000) * pricing.cacheReadPerMTok;

  return costUsd;
}

/**
 * Estimate cost in cents, minimum 1 cent if any tokens were used.
 */
export function estimateCostCents(tokens: TokenCounts, model?: string | null): number {
  const usd = estimateCostUsd(tokens, model);
  if (usd <= 0) return 0;
  return Math.max(1, Math.ceil(usd * 100));
}
