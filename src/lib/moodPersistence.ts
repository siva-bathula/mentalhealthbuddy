import { STORAGE_KEYS } from "../config/mvpSettings";

export type MoodScore = 1 | 2 | 3 | 4 | 5;

export type MoodEntry = {
  date: string; // "YYYY-MM-DD" local date
  score: MoodScore;
  loggedAt: number; // epoch ms
};

export type MoodStore = {
  version: 1;
  entries: MoodEntry[];
};

const MAX_DAYS = 90;

function todayDateString(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function isMoodScore(v: unknown): v is MoodScore {
  return v === 1 || v === 2 || v === 3 || v === 4 || v === 5;
}

function isValidEntry(e: unknown): e is MoodEntry {
  if (typeof e !== "object" || e === null) return false;
  const o = e as Record<string, unknown>;
  return (
    typeof o.date === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(o.date) &&
    isMoodScore(o.score) &&
    typeof o.loggedAt === "number"
  );
}

function emptyStore(): MoodStore {
  return { version: 1, entries: [] };
}

export function loadMoodStore(): MoodStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.moodStore);
    if (!raw) return emptyStore();
    const parsed = JSON.parse(raw) as unknown;
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      (parsed as Record<string, unknown>).version !== 1
    ) {
      return emptyStore();
    }
    const raw_entries = (parsed as Record<string, unknown>).entries;
    if (!Array.isArray(raw_entries)) return emptyStore();
    const entries = raw_entries.filter(isValidEntry);
    return { version: 1, entries };
  } catch {
    return emptyStore();
  }
}

function saveMoodStore(store: MoodStore): void {
  try {
    localStorage.setItem(STORAGE_KEYS.moodStore, JSON.stringify(store));
  } catch {
    // localStorage quota exceeded — silently drop
  }
}

/** Upsert today's mood entry and trim history to MAX_DAYS. */
export function logMood(score: MoodScore): MoodStore {
  const today = todayDateString();
  const store = loadMoodStore();
  const existing = store.entries.filter((e) => e.date !== today);
  const updated: MoodEntry[] = [
    ...existing,
    { date: today, score, loggedAt: Date.now() },
  ];
  // Sort descending and keep only the most recent MAX_DAYS days
  updated.sort((a, b) => b.date.localeCompare(a.date));
  const trimmed = updated.slice(0, MAX_DAYS);
  const next: MoodStore = { version: 1, entries: trimmed };
  saveMoodStore(next);
  return next;
}

/** Returns today's entry, or null if none logged yet. */
export function getTodayEntry(): MoodEntry | null {
  const today = todayDateString();
  const store = loadMoodStore();
  return store.entries.find((e) => e.date === today) ?? null;
}

/**
 * Returns the current consecutive-day streak ending today (or yesterday if
 * today has not been logged yet). A streak of 0 means no recent entries.
 */
export function calcStreak(): number {
  const store = loadMoodStore();
  if (store.entries.length === 0) return 0;

  // Build a set of logged date strings for O(1) lookup
  const logged = new Set(store.entries.map((e) => e.date));

  const today = todayDateString();
  // Start counting from today if logged, otherwise from yesterday
  const startFrom = logged.has(today) ? today : (() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  })();

  if (!logged.has(startFrom)) return 0;

  let streak = 0;
  const cursor = new Date(startFrom + "T00:00:00");
  while (true) {
    const y = cursor.getFullYear();
    const m = String(cursor.getMonth() + 1).padStart(2, "0");
    const day = String(cursor.getDate()).padStart(2, "0");
    const dateStr = `${y}-${m}-${day}`;
    if (!logged.has(dateStr)) break;
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}
