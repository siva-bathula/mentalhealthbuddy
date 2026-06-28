import { STORAGE_KEYS } from "../config/mvpSettings";
import type { ChatMessage } from "../types/chat";

export type JournalEntry = {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
};

export type JournalStore = {
  version: 1;
  entries: JournalEntry[];
  activeEntryId: string | null;
};

const MAX_ENTRIES = 60;

function isValidMessage(m: unknown): m is ChatMessage {
  if (typeof m !== "object" || m === null) return false;
  const o = m as Record<string, unknown>;
  return (
    (o.role === "user" || o.role === "assistant") && typeof o.content === "string"
  );
}

function isValidEntry(e: unknown): e is JournalEntry {
  if (typeof e !== "object" || e === null) return false;
  const o = e as Record<string, unknown>;
  return (
    typeof o.id === "string" &&
    typeof o.title === "string" &&
    typeof o.createdAt === "number" &&
    typeof o.updatedAt === "number" &&
    Array.isArray(o.messages) &&
    o.messages.every(isValidMessage)
  );
}

function emptyStore(): JournalStore {
  return { version: 1, entries: [], activeEntryId: null };
}

function deriveTitle(messages: ChatMessage[]): string {
  const first = messages.find((m) => m.role === "user");
  if (!first?.content?.trim()) return "Journal entry";
  const t = first.content.trim().replace(/\s+/g, " ");
  return t.length > 72 ? `${t.slice(0, 69)}…` : t;
}

export function loadJournalStore(): JournalStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.journalStore);
    if (!raw) return emptyStore();
    const parsed = JSON.parse(raw) as unknown;
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      (parsed as Record<string, unknown>).version !== 1
    ) {
      return emptyStore();
    }
    const o = parsed as Record<string, unknown>;
    const entries = Array.isArray(o.entries) ? o.entries.filter(isValidEntry) : [];
    const activeEntryId =
      typeof o.activeEntryId === "string" ? o.activeEntryId : null;
    return { version: 1, entries, activeEntryId };
  } catch {
    return emptyStore();
  }
}

export function persistJournalStore(store: JournalStore): void {
  try {
    let s = store;
    if (s.entries.length > MAX_ENTRIES) {
      const sorted = [...s.entries].sort((a, b) => a.updatedAt - b.updatedAt);
      const toRemove = new Set(sorted.slice(0, s.entries.length - MAX_ENTRIES).map((e) => e.id));
      s = { ...s, entries: s.entries.filter((e) => !toRemove.has(e.id)) };
    }
    localStorage.setItem(STORAGE_KEYS.journalStore, JSON.stringify(s));
  } catch {
    // quota exceeded — silently drop
  }
}

export function createJournalEntry(store: JournalStore, initialMessages: ChatMessage[] = []): JournalStore {
  const id = crypto.randomUUID();
  const now = Date.now();
  const entry: JournalEntry = {
    id,
    title: deriveTitle(initialMessages),
    messages: initialMessages,
    createdAt: now,
    updatedAt: now,
  };
  return { ...store, entries: [...store.entries, entry], activeEntryId: id };
}

export function upsertActiveJournalMessages(store: JournalStore, messages: ChatMessage[]): JournalStore {
  const id = store.activeEntryId;
  if (!id) return store;
  const now = Date.now();
  const entries = store.entries.map((e) =>
    e.id === id
      ? { ...e, messages, title: deriveTitle(messages), updatedAt: now }
      : e,
  );
  return { ...store, entries };
}

export function getActiveJournalMessages(store: JournalStore): ChatMessage[] {
  const id = store.activeEntryId;
  if (!id) return [];
  return store.entries.find((e) => e.id === id)?.messages ?? [];
}

export function removeJournalEntry(store: JournalStore, id: string): JournalStore {
  const entries = store.entries.filter((e) => e.id !== id);
  const activeEntryId =
    store.activeEntryId === id
      ? entries.sort((a, b) => b.updatedAt - a.updatedAt)[0]?.id ?? null
      : store.activeEntryId;
  return { ...store, entries, activeEntryId };
}
