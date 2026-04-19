/**
 * Thought challenger (cognitive reframing) persistence — same JSON shape as plan store, separate key.
 */
import { STORAGE_KEYS } from "../config/mvpSettings";
import type { ChatMessage } from "../types/chat";

export const MAX_CONVERSATIONS = 100;
export const MAX_CHAT_STORE_BYTES = 4 * 1024 * 1024;

export type LlmSessionTotals = {
  costUsd: number;
  costInr: number;
  promptTokens: number;
  completionTokens: number;
};

export type StoredReframeConversation = {
  id: string;
  title: string;
  messages: ChatMessage[];
  lastAccessedAt: number;
  updatedAt: number;
  llmTotals?: LlmSessionTotals;
};

export type ReframeStoreV1 = {
  version: 1;
  conversations: StoredReframeConversation[];
  activeConversationId: string | null;
};

function isStoredMessage(m: unknown): m is ChatMessage {
  if (typeof m !== "object" || m === null || !("role" in m) || !("content" in m)) {
    return false;
  }
  const r = (m as ChatMessage).role;
  return (r === "user" || r === "assistant") && typeof (m as ChatMessage).content === "string";
}

function deriveTitle(messages: ChatMessage[]): string {
  const firstUser = messages.find((m) => m.role === "user");
  if (!firstUser?.content?.trim()) return "New thought";
  const t = firstUser.content.trim().replace(/\s+/g, " ");
  return t.length > 72 ? `${t.slice(0, 69)}…` : t;
}

function estimateStoreBytes(store: ReframeStoreV1): number {
  return new Blob([JSON.stringify(store)]).size;
}

function evictOneLru(store: ReframeStoreV1): ReframeStoreV1 {
  if (store.conversations.length <= 1) return store;
  const sorted = [...store.conversations].sort(
    (a, b) => a.lastAccessedAt - b.lastAccessedAt || a.id.localeCompare(b.id),
  );
  const victim = sorted[0];
  if (!victim) return store;
  const conversations = store.conversations.filter((c) => c.id !== victim.id);
  let activeConversationId = store.activeConversationId;
  if (activeConversationId === victim.id) {
    const fallback = [...conversations].sort((a, b) => b.lastAccessedAt - a.lastAccessedAt)[0];
    activeConversationId = fallback?.id ?? null;
  }
  return { ...store, conversations, activeConversationId };
}

function ensureWithinLimits(store: ReframeStoreV1): ReframeStoreV1 {
  let s = store;
  let guard = 0;
  while (guard++ < 200) {
    const bytes = estimateStoreBytes(s);
    const overCount = s.conversations.length > MAX_CONVERSATIONS;
    const overBytes = bytes > MAX_CHAT_STORE_BYTES;
    if (!overCount && !overBytes) return s;
    if (s.conversations.length <= 1 && !overBytes) return s;
    if (s.conversations.length <= 1 && overBytes) {
      const only = s.conversations[0];
      if (only && only.messages.length > 0) {
        const trimmed = trimMessagesForBudget(only.messages, Math.floor(MAX_CHAT_STORE_BYTES / 4));
        s = {
          ...s,
          conversations: [
            {
              ...only,
              messages: trimmed,
              updatedAt: Date.now(),
            },
          ],
        };
      }
      return s;
    }
    s = evictOneLru(s);
  }
  return s;
}

function trimMessagesForBudget(messages: ChatMessage[], maxMsgs: number): ChatMessage[] {
  if (messages.length <= maxMsgs) return messages;
  return messages.slice(messages.length - maxMsgs);
}

/** Load store and reconcile active id when threads exist (no empty thread is auto-created). */
export function ensureReadyReframeStore(): ReframeStoreV1 {
  let s = loadReframeStore();
  if (!s.activeConversationId && s.conversations.length > 0) {
    const pick = [...s.conversations].sort((a, b) => b.lastAccessedAt - a.lastAccessedAt)[0];
    if (pick) {
      s = { ...s, activeConversationId: pick.id };
      persistReframeStore(s);
    }
  }
  return s;
}

export function loadReframeStore(): ReframeStoreV1 {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.reframeStore);
    if (!raw) return emptyStore();
    const parsed = JSON.parse(raw) as ReframeStoreV1;
    if (parsed?.version !== 1 || !Array.isArray(parsed.conversations)) return emptyStore();
    const conversations = parsed.conversations
      .filter(isValidConversation)
      .filter((c) => c.messages.length > 0);
    let activeConversationId = parsed.activeConversationId;
    if (activeConversationId && !conversations.some((c) => c.id === activeConversationId)) {
      activeConversationId = conversations.sort((a, b) => b.lastAccessedAt - a.lastAccessedAt)[0]?.id ?? null;
    }
    if (conversations.length > 0 && !activeConversationId) {
      activeConversationId = [...conversations].sort(
        (a, b) => b.lastAccessedAt - a.lastAccessedAt,
      )[0]?.id ?? null;
    }
    return ensureWithinLimits({
      version: 1,
      conversations,
      activeConversationId,
    });
  } catch {
    return emptyStore();
  }
}

function isValidConversation(c: unknown): c is StoredReframeConversation {
  if (typeof c !== "object" || c === null) return false;
  const o = c as Record<string, unknown>;
  return (
    typeof o.id === "string" &&
    typeof o.title === "string" &&
    typeof o.lastAccessedAt === "number" &&
    typeof o.updatedAt === "number" &&
    Array.isArray(o.messages) &&
    o.messages.every(isStoredMessage)
  );
}

function emptyStore(): ReframeStoreV1 {
  return { version: 1, conversations: [], activeConversationId: null };
}

function persistReframeStoreRaw(store: ReframeStoreV1): void {
  let s = ensureWithinLimits(store);
  for (let attempt = 0; attempt < 120; attempt++) {
    try {
      localStorage.setItem(STORAGE_KEYS.reframeStore, JSON.stringify(s));
      return;
    } catch (e) {
      const name = e instanceof DOMException ? e.name : "";
      const isQuota =
        name === "QuotaExceededError" ||
        (e instanceof Error && /quota|QuotaExceeded/i.test(e.message));
      if (isQuota && s.conversations.length > 1) {
        s = evictOneLru(s);
        continue;
      }
      if (isQuota && s.conversations.length === 1) {
        const only = s.conversations[0];
        if (only && only.messages.length > 2) {
          s = {
            ...s,
            conversations: [
              {
                ...only,
                messages: trimMessagesForBudget(only.messages, Math.max(4, Math.floor(only.messages.length / 2))),
                updatedAt: Date.now(),
              },
            ],
          };
          continue;
        }
      }
      console.error("Failed to persist reframe store", e);
      return;
    }
  }
}

export function persistReframeStore(store: ReframeStoreV1): void {
  persistReframeStoreRaw(ensureWithinLimits(store));
}

/** New thread is only added with at least the first user turn (no empty sessions in the list). */
export function createReframeConversation(
  store: ReframeStoreV1,
  initialMessages: ChatMessage[] = [],
): ReframeStoreV1 {
  const id = crypto.randomUUID();
  const now = Date.now();
  const conv: StoredReframeConversation = {
    id,
    title: deriveTitle(initialMessages),
    messages: initialMessages,
    lastAccessedAt: now,
    updatedAt: now,
  };
  const next: ReframeStoreV1 = {
    ...store,
    conversations: [...store.conversations, conv],
    activeConversationId: id,
  };
  return ensureWithinLimits(next);
}

export function setActiveReframeConversation(store: ReframeStoreV1, id: string): ReframeStoreV1 {
  const exists = store.conversations.some((c) => c.id === id);
  if (!exists) return store;
  const now = Date.now();
  const conversations = store.conversations.map((c) =>
    c.id === id ? { ...c, lastAccessedAt: now } : c,
  );
  return ensureWithinLimits({
    ...store,
    conversations,
    activeConversationId: id,
  });
}

export function removeReframeConversation(store: ReframeStoreV1, conversationId: string): ReframeStoreV1 {
  const conversations = store.conversations.filter((c) => c.id !== conversationId);
  let activeConversationId = store.activeConversationId;
  if (activeConversationId === conversationId) {
    activeConversationId =
      [...conversations].sort((a, b) => b.lastAccessedAt - a.lastAccessedAt)[0]?.id ?? null;
  }
  return ensureWithinLimits({
    ...store,
    conversations,
    activeConversationId,
  });
}

export function upsertReframeActiveMessages(store: ReframeStoreV1, messages: ChatMessage[]): ReframeStoreV1 {
  const id = store.activeConversationId;
  if (!id) return store;
  const now = Date.now();
  const title = deriveTitle(messages);
  const conversations = store.conversations.map((c) =>
    c.id === id
      ? { ...c, messages, title, updatedAt: now, lastAccessedAt: now }
      : c,
  );
  return ensureWithinLimits({ ...store, conversations });
}

export function getReframeActiveMessages(store: ReframeStoreV1): ChatMessage[] {
  const id = store.activeConversationId;
  if (!id) return [];
  return store.conversations.find((c) => c.id === id)?.messages ?? [];
}

export function getReframeConversationMessages(store: ReframeStoreV1, conversationId: string): ChatMessage[] {
  return store.conversations.find((c) => c.id === conversationId)?.messages ?? [];
}

export function accumulateReframeLlmUsage(
  store: ReframeStoreV1,
  conversationId: string,
  delta: {
    costUsd: number | null;
    costInr: number | null;
    promptTokens: number;
    completionTokens: number;
  },
): ReframeStoreV1 {
  const conversations = store.conversations.map((c) => {
    if (c.id !== conversationId) return c;
    const prev =
      c.llmTotals ??
      ({
        costUsd: 0,
        costInr: 0,
        promptTokens: 0,
        completionTokens: 0,
      } satisfies LlmSessionTotals);
    const nextTotals: LlmSessionTotals = {
      costUsd: prev.costUsd + (delta.costUsd ?? 0),
      costInr: prev.costInr + (delta.costInr ?? 0),
      promptTokens: prev.promptTokens + delta.promptTokens,
      completionTokens: prev.completionTokens + delta.completionTokens,
    };
    return { ...c, llmTotals: nextTotals, updatedAt: Date.now() };
  });
  return ensureWithinLimits({ ...store, conversations });
}
