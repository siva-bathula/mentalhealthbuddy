import type { NormalizedUsage } from "./tokenUsage.js";

/** Streaming turns from providers before SSE serialization. */
export type ChatStreamYield =
  | { kind: "delta"; text: string }
  | { kind: "usage"; usage: NormalizedUsage; costUsd: number | null };
