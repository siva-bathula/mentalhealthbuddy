/**
 * Device-local cache of the last exported plan file per conversation (separate from plan transcript store).
 */
import { STORAGE_KEYS } from "../config/mvpSettings";
export type PlanExportCacheEntry = {
  body: string;
  filename: string;
  savedAt: number;
};

type PlanExportCacheStoreV1 = {
  version: 1;
  byConversationId: Record<string, PlanExportCacheEntry>;
};

const MAX_ENTRIES = 100;
const MAX_TOTAL_BYTES = 2 * 1024 * 1024;

function empty(): PlanExportCacheStoreV1 {
  return { version: 1, byConversationId: {} };
}

function load(): PlanExportCacheStoreV1 {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.planExportCache);
    if (!raw) return empty();
    const parsed = JSON.parse(raw) as PlanExportCacheStoreV1;
    if (parsed?.version !== 1 || typeof parsed.byConversationId !== "object" || !parsed.byConversationId) {
      return empty();
    }
    const byConversationId: Record<string, PlanExportCacheEntry> = {};
    for (const [id, e] of Object.entries(parsed.byConversationId)) {
      if (
        typeof id === "string" &&
        e &&
        typeof (e as PlanExportCacheEntry).body === "string" &&
        typeof (e as PlanExportCacheEntry).filename === "string" &&
        typeof (e as PlanExportCacheEntry).savedAt === "number"
      ) {
        byConversationId[id] = {
          body: (e as PlanExportCacheEntry).body,
          filename: (e as PlanExportCacheEntry).filename,
          savedAt: (e as PlanExportCacheEntry).savedAt,
        };
      }
    }
    return { version: 1, byConversationId };
  } catch {
    return empty();
  }
}

function estimateBytes(store: PlanExportCacheStoreV1): number {
  return new Blob([JSON.stringify(store)]).size;
}

function persist(store: PlanExportCacheStoreV1): void {
  let s = store;
  let guard = 0;
  while (guard++ < 200) {
    const entries = Object.entries(s.byConversationId);
    const bytes = estimateBytes(s);
    const overCount = entries.length > MAX_ENTRIES;
    const overBytes = bytes > MAX_TOTAL_BYTES;
    if (!overCount && !overBytes) break;
    if (entries.length === 0) break;
    const sorted = [...entries].sort((a, b) => a[1].savedAt - b[1].savedAt);
    const victim = sorted[0]?.[0];
    if (!victim) break;
    const nextMap = { ...s.byConversationId };
    delete nextMap[victim];
    s = { ...s, byConversationId: nextMap };
  }
  try {
    localStorage.setItem(STORAGE_KEYS.planExportCache, JSON.stringify(s));
  } catch (e) {
    console.error("Failed to persist plan export cache", e);
  }
}

export function getCachedPlanExport(conversationId: string | null | undefined): PlanExportCacheEntry | null {
  if (!conversationId) return null;
  const e = load().byConversationId[conversationId];
  return e ?? null;
}

export function saveCachedPlanExport(conversationId: string, body: string, filename: string): void {
  const prev = load();
  const next: PlanExportCacheStoreV1 = {
    ...prev,
    byConversationId: {
      ...prev.byConversationId,
      [conversationId]: { body, filename, savedAt: Date.now() },
    },
  };
  persist(next);
}

export function removeCachedPlanExport(conversationId: string): void {
  const prev = load();
  if (!prev.byConversationId[conversationId]) return;
  const nextMap = { ...prev.byConversationId };
  delete nextMap[conversationId];
  persist({ ...prev, byConversationId: nextMap });
}

/** Drop cache entries for conversations that no longer exist (e.g. after LRU eviction in plan store). */
export function prunePlanExportCache(validConversationIds: ReadonlySet<string>): void {
  const prev = load();
  let changed = false;
  const nextMap: Record<string, PlanExportCacheEntry> = {};
  for (const [id, e] of Object.entries(prev.byConversationId)) {
    if (validConversationIds.has(id)) nextMap[id] = e;
    else changed = true;
  }
  if (changed) persist({ ...prev, byConversationId: nextMap });
}
