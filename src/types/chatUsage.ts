/** Mirrors server normalized usage sent in the last SSE payload (optional). */
export type ChatUsagePayload = {
  promptTokens: number;
  completionTokens: number;
  totalTokens?: number;
};
