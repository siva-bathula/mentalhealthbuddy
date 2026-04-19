import type { ChatProvider, Env } from "./env.js";

/** Normalized token counts for pricing and logs (both providers). */
export type NormalizedUsage = {
  promptTokens: number;
  completionTokens: number;
  totalTokens?: number;
};

export function normalizeDeepSeekUsage(raw: {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
}): NormalizedUsage | null {
  const promptTokens = raw.prompt_tokens ?? 0;
  const completionTokens = raw.completion_tokens ?? 0;
  if (!promptTokens && !completionTokens && !raw.total_tokens) return null;
  return {
    promptTokens,
    completionTokens,
    totalTokens: raw.total_tokens,
  };
}

export function normalizeGeminiUsage(raw: {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  totalTokenCount?: number;
}): NormalizedUsage | null {
  const promptTokens = raw.promptTokenCount ?? 0;
  const completionTokens = raw.candidatesTokenCount ?? 0;
  if (!promptTokens && !completionTokens && !raw.totalTokenCount) return null;
  return {
    promptTokens,
    completionTokens,
    totalTokens: raw.totalTokenCount,
  };
}

/** USD estimate from optional per-1M-token env prices; null if pricing not configured. */
export function estimateCostUsd(env: Env, provider: ChatProvider, usage: NormalizedUsage): number | null {
  let inputPerM: number | undefined;
  let outputPerM: number | undefined;
  if (provider === "deepseek") {
    inputPerM = env.DEEPSEEK_INPUT_USD_PER_1M;
    outputPerM = env.DEEPSEEK_OUTPUT_USD_PER_1M;
  } else {
    inputPerM = env.GEMINI_INPUT_USD_PER_1M;
    outputPerM = env.GEMINI_OUTPUT_USD_PER_1M;
  }
  if (
    inputPerM === undefined ||
    outputPerM === undefined ||
    Number.isNaN(inputPerM) ||
    Number.isNaN(outputPerM)
  ) {
    return null;
  }
  return (
    (usage.promptTokens / 1_000_000) * inputPerM + (usage.completionTokens / 1_000_000) * outputPerM
  );
}
