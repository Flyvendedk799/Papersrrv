/**
 * llm-client — thin wrapper around @anthropic-ai/sdk for server-side
 * LLM calls.
 *
 * Degrades gracefully when not configured: if `ANTHROPIC_API_KEY` is
 * absent `getLlmClient()` returns null and any caller treats the
 * response as "LLM unavailable" → use a template fallback. This lets
 * local dev work without a key and ops teams disable LLM without
 * redeploying by unsetting the env var.
 *
 * Model defaults to Claude Haiku 4.5 — cheap and fast enough for
 * abstract-rewriting. Override via `ANTHROPIC_MODEL`.
 */

import Anthropic from "@anthropic-ai/sdk";
import { logger } from "../middleware/logger.js";

const DEFAULT_MODEL = "claude-haiku-4-5";

let cachedClient: Anthropic | null | undefined;

/** Lazy-initialise the SDK client. Returns `null` when no API key
 * is configured so callers can short-circuit cleanly. */
export function getLlmClient(): Anthropic | null {
  if (cachedClient !== undefined) return cachedClient;
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    cachedClient = null;
    return null;
  }
  try {
    cachedClient = new Anthropic({ apiKey });
    return cachedClient;
  } catch (err) {
    logger.warn(
      { err },
      "llm-client: failed to initialise Anthropic SDK; disabling LLM",
    );
    cachedClient = null;
    return null;
  }
}

export function llmModel(): string {
  return process.env.ANTHROPIC_MODEL?.trim() || DEFAULT_MODEL;
}

export interface LlmMessageOpts {
  /** Hard upper bound on output tokens. Keep small for cost. */
  maxTokens?: number;
  /** Temperature ∈ [0, 1]. Default 0.2 — consistent but not robotic. */
  temperature?: number;
  /** Top-level system prompt. Should be short + directive. */
  system?: string;
  /** Request timeout (ms). Defaults to 15000. */
  timeoutMs?: number;
}

/** Send a single-turn message. Returns the assistant's text content
 * or `null` on error / timeout / missing client. */
export async function callLlmText(
  userMessage: string,
  opts: LlmMessageOpts = {},
): Promise<string | null> {
  const client = getLlmClient();
  if (!client) return null;
  const {
    maxTokens = 400,
    temperature = 0.2,
    system,
    timeoutMs = 15_000,
  } = opts;
  try {
    const res = await withTimeout(
      client.messages.create({
        model: llmModel(),
        max_tokens: maxTokens,
        temperature,
        system,
        messages: [{ role: "user", content: userMessage }],
      }),
      timeoutMs,
    );
    const first = res.content.find((c) => c.type === "text");
    if (!first || first.type !== "text") return null;
    const text = first.text.trim();
    return text.length > 0 ? text : null;
  } catch (err) {
    logger.warn({ err }, "llm-client: call failed");
    return null;
  }
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`LLM call timed out after ${ms}ms`)), ms);
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}
