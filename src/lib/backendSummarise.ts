import { chatEndpoint } from "../config/api";
import type { ChatMessage } from "../types/chat";

export type SummariseResult =
  | { ok: true; bullets: string[] }
  | { ok: false; error: string };

/** POST /api/summarise — returns bullet-point session summary (non-streaming). */
export async function fetchSessionSummary(
  messages: ChatMessage[],
): Promise<SummariseResult> {
  const url = chatEndpoint("/api/summarise");
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages }),
    });
    const json = (await res.json()) as { bullets?: unknown; error?: string };
    if (!res.ok || json.error) {
      return { ok: false, error: json.error ?? `Request failed (${res.status})` };
    }
    const bullets = Array.isArray(json.bullets)
      ? json.bullets.filter((b): b is string => typeof b === "string")
      : [];
    return { ok: true, bullets };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Network error" };
  }
}
