import type { ChatStreamYield } from "../chatStreamTypes.js";
import type { Env } from "../env.js";
import { estimateCostUsd, normalizeDeepSeekUsage } from "../tokenUsage.js";
import type { NormalizedUsage } from "../tokenUsage.js";
import { CHAT_SYSTEM_PROMPT } from "../systemPrompt.js";

export type ChatTurn = { role: "user" | "assistant"; content: string };

/** OpenAI-compatible streaming chat completions (DeepSeek). */
export async function* streamDeepSeek(
  env: Env,
  messages: ChatTurn[],
  systemPrompt: string = CHAT_SYSTEM_PROMPT,
): AsyncGenerator<ChatStreamYield, void, unknown> {
  if (!env.DEEPSEEK_API_KEY) throw new Error("DEEPSEEK_API_KEY is not set");
  const url = `${env.DEEPSEEK_BASE_URL.replace(/\/$/, "")}/chat/completions`;
  const body: Record<string, unknown> = {
    model: env.DEEPSEEK_MODEL,
    stream: true,
    messages: [
      { role: "system", content: systemPrompt },
      ...messages.map((m) => ({ role: m.role, content: m.content })),
    ],
    stream_options: { include_usage: true },
  };
  if (env.DEEPSEEK_THINKING === "enabled") {
    body.reasoning_effort = env.DEEPSEEK_REASONING_EFFORT;
    body.thinking = { type: "enabled" as const };
  } else {
    body.thinking = { type: "disabled" as const };
  }

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.DEEPSEEK_API_KEY}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`DeepSeek ${res.status}: ${errText.slice(0, 500)}`);
  }

  if (!res.body) throw new Error("DeepSeek: empty response body");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  let lastNormalized: NormalizedUsage | null = null;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed === "data: [DONE]") continue;
        if (!trimmed.startsWith("data: ")) continue;
        const jsonStr = trimmed.slice(6);
        try {
          const chunk = JSON.parse(jsonStr) as {
            choices?: Array<{
              delta?: { content?: string; reasoning_content?: string };
            }>;
            usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
          };
          const delta = chunk.choices?.[0]?.delta;
          const piece = delta?.content;
          if (piece) yield { kind: "delta", text: piece };
          // In thinking mode, `reasoning_content` also streams; we only forward `content` to the UI.
          if (chunk.usage) {
            lastNormalized = normalizeDeepSeekUsage(chunk.usage) ?? lastNormalized;
          }
        } catch {
          /* ignore partial JSON lines */
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  if (lastNormalized) {
    const costUsd = estimateCostUsd(env, "deepseek", lastNormalized);
    yield { kind: "usage", usage: lastNormalized, costUsd };
  }
}
