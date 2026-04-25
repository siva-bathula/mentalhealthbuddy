import type { ChatProvider, Env } from "./env.js";
import type { ChatStreamYield } from "./chatStreamTypes.js";
import { streamDeepSeek } from "./providers/deepseek.js";
import { streamGemini } from "./providers/gemini.js";
import type { ChatTurn } from "./providers/deepseek.js";
import { CHAT_SYSTEM_PROMPT } from "./systemPrompt.js";

let activeProvider: ChatProvider;
let consecutiveFailures = 0;
let initialized = false;

export function initProviderFailover(env: Env): void {
  if (initialized) return;
  activeProvider = env.CHAT_PROVIDER;
  initialized = true;
}

export function getActiveProvider(): ChatProvider {
  if (!initialized) {
    throw new Error("getActiveProvider called before initProviderFailover");
  }
  return activeProvider;
}

function other(p: ChatProvider): ChatProvider {
  return p === "deepseek" ? "gemini" : "deepseek";
}

function hasApiKeyFor(env: Env, p: ChatProvider): boolean {
  return p === "deepseek" ? Boolean(env.DEEPSEEK_API_KEY) : Boolean(env.GEMINI_API_KEY);
}

export function markProviderSuccess(): void {
  consecutiveFailures = 0;
}

type FailoverLog = { warn: (obj: Record<string, unknown>) => void };

/** Call when a model request (stream or not) throws or errors before success. */
export function markProviderFailure(env: Env, log: FailoverLog): void {
  consecutiveFailures += 1;
  if (consecutiveFailures < 2) return;

  const target = other(activeProvider);
  if (!hasApiKeyFor(env, target)) {
    log.warn({
      msg: "provider_failover_unavailable",
      from: activeProvider,
      wouldSwitchTo: target,
    });
    consecutiveFailures = 0;
    return;
  }
  log.warn({
    msg: "provider_failover_switch",
    from: activeProvider,
    to: target,
  });
  activeProvider = target;
  consecutiveFailures = 0;
}

export async function* streamLlm(
  env: Env,
  provider: ChatProvider,
  thread: ChatTurn[],
  systemPrompt: string = CHAT_SYSTEM_PROMPT,
): AsyncGenerator<ChatStreamYield, void, unknown> {
  if (provider === "deepseek") {
    yield* streamDeepSeek(env, thread, systemPrompt);
  } else {
    yield* streamGemini(env, thread, systemPrompt);
  }
}
