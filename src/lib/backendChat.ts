import { chatEndpoint } from "../config/api";
import type { ChatUsagePayload } from "../types/chatUsage";
import type { ChatMessage } from "../types/chat";

/** One streamed reply chunk or final usage summary from `/api/chat`. */
export type ChatStreamPiece =
  | { type: "delta"; delta: string }
  | { type: "usage"; usage: ChatUsagePayload; costUsd: number | null; costInr: number | null };

/** Streams assistant deltas and a final usage object from POST /api/chat (SSE). */
export async function* streamBackendChat(
  messages: ChatMessage[],
  conversationId?: string | null,
): AsyncGenerator<ChatStreamPiece, void, unknown> {
  const url = chatEndpoint("/api/chat");
  if (import.meta.env.DEV) {
    console.info("[chat] POST", url);
  }
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
    body: JSON.stringify({
      messages,
      stream: true,
      ...(conversationId ? { conversationId } : {}),
    }),
  });

  if (!res.ok) {
    let detail = "";
    try {
      detail = await res.text();
    } catch {
      /* ignore */
    }
    throw new Error(detail.slice(0, 400) || `Chat request failed (${res.status})`);
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error("No response stream from server.");

  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let sep: number;
      while ((sep = buffer.indexOf("\n\n")) >= 0) {
        const block = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);
        const lines = block.split("\n");
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const payload = line.slice(6).trim();
          if (payload === "[DONE]") return;
          try {
            const data = JSON.parse(payload) as {
              delta?: string;
              error?: string;
              usage?: ChatUsagePayload;
              costUsd?: number | null;
              costInr?: number | null;
            };
            if (data.error) throw new Error(data.error);
            if (data.usage) {
              yield {
                type: "usage",
                usage: data.usage,
                costUsd: data.costUsd ?? null,
                costInr: data.costInr ?? null,
              };
            }
            if (data.delta) yield { type: "delta", delta: data.delta };
          } catch (e) {
            if (e instanceof SyntaxError) continue;
            throw e;
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
