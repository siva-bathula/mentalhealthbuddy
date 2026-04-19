export type PrefilterResult =
  | { action: "allow" }
  | { action: "block"; response: string };

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

/** Prompt-injection / instruction exfiltration — do not send to upstream models. */
const PROMPT_EXFIL_PATTERNS: RegExp[] = [
  /\bignore\s+all\s+(prior\s+|previous\s+)?instructions\b/i,
  /\boutput\s+your\s+full\s+system\s+prompt\b/i,
  /\brepeat\s+your\s+(hidden\s+|internal\s+)?(system\s+prompt|instructions)\b/i,
  /\bfull\s+system\s+text\b/i,
  /\{\s*"system"\s*:\s*["'`]?<\s*full\s+system/i,
  /\b(system\s+prompt|developer\s+message)\b[\s\S]{0,180}\bverbatim\b/i,
  /\bvalid\s+json\b[\s\S]{0,220}\b("system"|system\s+prompt)\b/i,
  /\bvalid\s+json[\s\S]{0,320}"system"/i,
];

/** Short-circuit: do not forward severe crisis text to third-party APIs. */
export function prefilterLastUserMessage(text: string): PrefilterResult {
  const t = text.trim();
  if (!t) return { action: "allow" };
  if (URGENT_PATTERNS.some((re) => re.test(t))) {
    return {
      action: "block",
      response:
        "I’m really glad you reached out. What you’re describing sounds serious, and you deserve immediate human support.\n\n" +
        "If you might act on thoughts of harming yourself or someone else, please get help right away. In India, dial **112** for emergency services, **14416** (Tele-MANAS), **1800-599-0019** (KIRAN), or **9999666555** (Vandrevala Foundation).\n\n" +
        "This chat can’t monitor you in real time or replace emergency help. When you’re in a safer moment, consider sharing what you’re going through with someone you trust or a licensed clinician.",
    };
  }
  if (PROMPT_EXFIL_PATTERNS.some((re) => re.test(t))) {
    return {
      action: "block",
      response:
        "I can’t share internal instructions or policies. I’m here for general wellness support—what’s going on for you emotionally or what would you like help with?",
    };
  }
  return { action: "allow" };
}
