export type CrisisSeverity = "none" | "elevated" | "urgent";

/** Lightweight keyword pass — complements (not replaces) model-side safety policies. */
const URGENT_PATTERNS: RegExp[] = [
  /\bkill\s+myself\b/i,
  /\bkill\s+me\b/i,
  /\bend\s+my\s+life\b/i,
  /\bsuicid\w*\b/i,
  /\bself[\s-]?harm\b/i,
  /\bcut\s+myself\b/i,
  /\bhurt\s+myself\b/i,
  /\bwant\s+to\s+die\b/i,
  /\bdon'?t\s+want\s+to\s+live\b/i,
  /\bbetter\s+off\s+dead\b/i,
  /\btake\s+my\s+(own\s+)?life\b/i,
];

const ELEVATED_PATTERNS: RegExp[] = [
  /\bhopeless\b/i,
  /\bcan'?t\s+go\s+on\b/i,
  /\bno\s+way\s+out\b/i,
  /\bworthless\b/i,
  /\bbreakdown\b/i,
  /\bpani(c|ck)\s+attack\b/i,
];

export function detectCrisisSignals(text: string): CrisisSeverity {
  const t = text.trim();
  if (!t) return "none";
  if (URGENT_PATTERNS.some((re) => re.test(t))) return "urgent";
  if (ELEVATED_PATTERNS.some((re) => re.test(t))) return "elevated";
  return "none";
}

export function mergeSeverity(
  a: CrisisSeverity,
  b: CrisisSeverity,
): CrisisSeverity {
  const rank: Record<CrisisSeverity, number> = {
    none: 0,
    elevated: 1,
    urgent: 2,
  };
  return rank[a] >= rank[b] ? a : b;
}
