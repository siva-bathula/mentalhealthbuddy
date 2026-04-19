import type { AnswerTag } from "./types";

/** Short intro line for optional breathing exercise based on assessment tags (non-clinical). */
export function pickGroundingIntro(tags: ReadonlySet<AnswerTag>): string | undefined {
  if (tags.has("topic_anxiety")) {
    return "If worry shows up in your body, slow breathing can sometimes soften the edge — skip if it doesn’t feel right.";
  }
  if (tags.has("topic_sleep")) {
    return "Gentle breathing can be part of winding down — not a cure for sleep problems, but sometimes helpful before bed.";
  }
  if (tags.has("topic_mood") || tags.has("topic_stress")) {
    return "A short breathing rhythm won’t fix everything — it’s just one small tool some people find grounding.";
  }
  return undefined;
}
