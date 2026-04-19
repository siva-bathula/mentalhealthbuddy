/**
 * MVP scope (locked for this build):
 * - Primary locale: English copy; crisis routing for India only (Indian helplines).
 * - Chat: up to 100 threads in localStorage; least-recently-used threads evicted if over count or size budget.
 * - Assessment: conversational adaptive tree (branching JSON), not a licensed screening score.
 * - Estimated assessment length: about 5–10 minutes depending on branches.
 * - Chat: backend API + provider keys on server (DeepSeek / Gemini via CHAT_PROVIDER).
 */

export const STORAGE_KEYS = {
  disclaimerAccepted: "mhb_disclaimer_accepted_v1",
  /** Multi-conversation archive (JSON ChatStoreV1). */
  chatStore: "mhb_chat_store_v2",
  /** Guided Plan threads (same shape as chat store). */
  planStore: "mhb_plan_store_v1",
  /** Thought challenger / cognitive reframing threads. */
  reframeStore: "mhb_reframe_store_v1",
  /** Last downloaded export file per plan session (device-local). */
  planExportCache: "mhb_plan_export_cache_v1",
  /** Legacy keys removed from active use: mhb_chat_messages_v1, mhb_chat_persist_v1, mhb_region_pref_v1 */
} as const;
