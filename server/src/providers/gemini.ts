import { GoogleGenerativeAI } from "@google/generative-ai";
import type { ChatStreamYield } from "../chatStreamTypes.js";
import type { Env } from "../env.js";
import { estimateCostUsd, normalizeGeminiUsage } from "../tokenUsage.js";
import { CHAT_SYSTEM_PROMPT } from "../systemPrompt.js";

export type ChatTurn = { role: "user" | "assistant"; content: string };

function toGeminiParts(messages: ChatTurn[]): {
  history: Array<{ role: "user" | "model"; parts: Array<{ text: string }> }>;
  lastUserText: string;
} {
  if (messages.length === 0 || messages[messages.length - 1]?.role !== "user") {
    throw new Error("Gemini: last message must be from user");
  }
  const lastUserText = messages[messages.length - 1]?.content ?? "";
  const prior = messages.slice(0, -1);
  const history: Array<{ role: "user" | "model"; parts: Array<{ text: string }> }> =
    [];
  for (const m of prior) {
    history.push({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    });
  }
  return { history, lastUserText };
}

export async function* streamGemini(
  env: Env,
  messages: ChatTurn[],
  systemPrompt: string = CHAT_SYSTEM_PROMPT,
): AsyncGenerator<ChatStreamYield, void, unknown> {
  const key = env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY missing");

  const genAI = new GoogleGenerativeAI(key);
  const model = genAI.getGenerativeModel({
    model: env.GEMINI_MODEL,
    systemInstruction: systemPrompt,
  });

  const { history, lastUserText } = toGeminiParts(messages);
  const chat = model.startChat({
    history,
  });

  const streamResult = await chat.sendMessageStream(lastUserText);
  for await (const chunk of streamResult.stream) {
    try {
      const text = chunk.text();
      if (text) yield { kind: "delta", text };
    } catch {
      /* blocked / no text — skip fragment */
    }
  }

  const aggregated = await streamResult.response;
  const normalized = normalizeGeminiUsage(aggregated.usageMetadata ?? {});
  if (normalized) {
    const costUsd = estimateCostUsd(env, "gemini", normalized);
    yield { kind: "usage", usage: normalized, costUsd };
  }
}
