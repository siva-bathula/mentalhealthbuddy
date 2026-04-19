/**
 * Guided Plan conversation persistence — same JSON shape as chat store, separate localStorage key.
 */
import { STORAGE_KEYS } from "../config/mvpSettings";
import type { ChatMessage } from "../types/chat";

/** Hard cap on number of stored conversation threads. */
export const MAX_CONVERSATIONS = 100;

/** Budget for serialized store size (localStorage is ~5MB per origin on many browsers). */
export const MAX_CHAT_STORE_BYTES = 4 * 1024 * 1024;

/** Cumulative LLM usage for one thread (device-local estimate; INR uses server FX at reply time). */
export type LlmSessionTotals = {
  costUsd: number;
  costInr: number;
  promptTokens: number;
  completionTokens: number;
};

export type StoredConversation = {
  id: string;
  title: string;
  messages: ChatMessage[];
  lastAccessedAt: number;
  updatedAt: number;
  llmTotals?: LlmSessionTotals;
};

export type PlanStoreV1 = {
  version: 1;
  conversations: StoredConversation[];
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
  if (!firstUser?.content?.trim()) return "New plan";
  const t = firstUser.content.trim().replace(/\s+/g, " ");
  return t.length > 72 ? `${t.slice(0, 69)}…` : t;
}

function estimateStoreBytes(store: PlanStoreV1): number {
  return new Blob([JSON.stringify(store)]).size;
}

function evictOneLru(store: PlanStoreV1): PlanStoreV1 {
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

function ensureWithinLimits(store: PlanStoreV1): PlanStoreV1 {
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

/** Load store and guarantee at least one conversation + valid active id when possible. */
export function ensureReadyPlanStore(): PlanStoreV1 {
  let s = loadPlanStore();
  if (s.conversations.length === 0) {
    s = createPlanConversation(s);
    persistPlanStore(s);
    return s;
  }
  if (!s.activeConversationId) {
    const pick = [...s.conversations].sort((a, b) => b.lastAccessedAt - a.lastAccessedAt)[0];
    if (pick) {
      s = { ...s, activeConversationId: pick.id };
      persistPlanStore(s);
    }
  }
  return s;
}

export function loadPlanStore(): PlanStoreV1 {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.planStore);
    if (!raw) return emptyStore();
    const parsed = JSON.parse(raw) as PlanStoreV1;
    if (parsed?.version !== 1 || !Array.isArray(parsed.conversations)) return emptyStore();
    const conversations = parsed.conversations.filter(isValidConversation);
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

function isValidConversation(c: unknown): c is StoredConversation {
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

function emptyStore(): PlanStoreV1 {
  return { version: 1, conversations: [], activeConversationId: null };
}

function persistPlanStoreRaw(store: PlanStoreV1): void {
  let s = ensureWithinLimits(store);
  for (let attempt = 0; attempt < 120; attempt++) {
    try {
      localStorage.setItem(STORAGE_KEYS.planStore, JSON.stringify(s));
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
      console.error("Failed to persist plan store", e);
      return;
    }
  }
}

export function persistPlanStore(store: PlanStoreV1): void {
  persistPlanStoreRaw(ensureWithinLimits(store));
}

export function createPlanConversation(store: PlanStoreV1): PlanStoreV1 {
  const id = crypto.randomUUID();
  const now = Date.now();
  const conv: StoredConversation = {
    id,
    title: "New plan",
    messages: [],
    lastAccessedAt: now,
    updatedAt: now,
  };
  const next: PlanStoreV1 = {
    ...store,
    conversations: [...store.conversations, conv],
    activeConversationId: id,
  };
  return ensureWithinLimits(next);
}

export function setActivePlanConversation(store: PlanStoreV1, id: string): PlanStoreV1 {
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

/** Remove one thread from storage. If none remain, creates a fresh empty plan thread (same as {@link ensureReadyPlanStore}). */
export function removePlanConversation(store: PlanStoreV1, conversationId: string): PlanStoreV1 {
  const conversations = store.conversations.filter((c) => c.id !== conversationId);
  let activeConversationId = store.activeConversationId;
  if (activeConversationId === conversationId) {
    activeConversationId =
      [...conversations].sort((a, b) => b.lastAccessedAt - a.lastAccessedAt)[0]?.id ?? null;
  }
  let next: PlanStoreV1 = ensureWithinLimits({
    ...store,
    conversations,
    activeConversationId,
  });
  if (next.conversations.length === 0) {
    next = createPlanConversation({
      ...next,
      conversations: [],
      activeConversationId: null,
    });
  }
  return next;
}

export function upsertPlanActiveMessages(store: PlanStoreV1, messages: ChatMessage[]): PlanStoreV1 {
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

export function getPlanActiveMessages(store: PlanStoreV1): ChatMessage[] {
  const id = store.activeConversationId;
  if (!id) return [];
  return store.conversations.find((c) => c.id === id)?.messages ?? [];
}

export function getPlanConversationMessages(store: PlanStoreV1, conversationId: string): ChatMessage[] {
  return store.conversations.find((c) => c.id === conversationId)?.messages ?? [];
}

/** Adds one completion’s token/cost deltas (same semantics as chat {@link accumulateLlmUsage}). */
export function accumulatePlanLlmUsage(
  store: PlanStoreV1,
  conversationId: string,
  delta: {
    costUsd: number | null;
    costInr: number | null;
    promptTokens: number;
    completionTokens: number;
  },
): PlanStoreV1 {
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
