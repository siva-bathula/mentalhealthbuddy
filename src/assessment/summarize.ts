import type { AnswerTag } from "./types";

export type AssessmentSummary = {
  reflection: string;
  suggestedSteps: string[];
  disclaimer: string;
};

/** Deterministic narrative + steps from collected tags (auditable; no opaque scoring). */
export function summarizeAssessment(tags: ReadonlySet<AnswerTag>): AssessmentSummary {
  const topics = [
    tags.has("topic_stress") && "stress",
    tags.has("topic_mood") && "low mood",
    tags.has("topic_anxiety") && "anxiety",
    tags.has("topic_sleep") && "sleep",
    tags.has("topic_relationship") && "relationships or loneliness",
    tags.has("topic_other") && "something hard to name yet",
  ].filter(Boolean) as string[];

  const severityHigh =
    tags.has("severity_high") ||
    (tags.has("severity_moderate") && tags.has("duration_ongoing"));
  const mostlyAlone = tags.has("support_alone");
  const copingLow = tags.has("coping_low");

  let reflection =
    topics.length > 0
      ? `You highlighted ${topics.join(", ")} as prominent lately. `
      : "You walked through what’s been hardest lately. ";

  if (severityHigh || copingLow) {
    reflection +=
      "That sounds genuinely heavy — struggling here makes sense, and reaching for extra support can be an act of strength.";
  } else {
    reflection +=
      "Even manageable difficulties deserve attention — small shifts can still matter.";
  }

  const suggestedSteps: string[] = [];

  suggestedSteps.push(
    "Try one grounding cycle: name 5 things you see, 4 you feel, 3 you hear, 2 you smell, 1 you taste.",
  );

  if (tags.has("topic_sleep")) {
    suggestedSteps.push(
      "For sleep: fixed wake time for 7 days, dim screens 60 minutes before bed, and a short wind-down ritual (tea, stretch, journal).",
    );
  }

  if (tags.has("topic_anxiety")) {
    suggestedSteps.push(
      "For worry: pick a 10-minute “worry window” later today; when a thought intrudes, note it and postpone it to that window.",
    );
  }

  if (tags.has("topic_mood") || tags.has("topic_stress")) {
    suggestedSteps.push(
      "Add one tiny commitment: a 10-minute walk, one message to someone you trust, or one small task broken into two steps.",
    );
  }

  if (mostlyAlone) {
    suggestedSteps.push(
      "Isolation makes everything harder — consider one low-stakes connection (peer support group, faith community, or colleague) even if brief.",
    );
  }

  if (severityHigh) {
    suggestedSteps.push(
      "If symptoms stay strong for more than two weeks or you feel unsafe, prioritize a clinician or counselor — bring a short list of examples and goals to the first visit.",
    );
  }

  suggestedSteps.push(
    "If you export this summary, you can bring it to a licensed professional — they can interpret it in proper context.",
  );

  const disclaimer =
    "This walkthrough is educational self-reflection, not a diagnosis or treatment. It does not replace care from a qualified clinician, especially if you feel unsafe.";

  return { reflection, suggestedSteps, disclaimer };
}

/** Plain text for clipboard / sharing with a professional (context only, not a diagnosis). */
export function formatAssessmentPlainText(s: AssessmentSummary): string {
  const steps = s.suggestedSteps.map((line) => `• ${line}`).join("\n");
  return [
    "Mental Health Buddy — reflection summary",
    "",
    s.reflection.trim(),
    "",
    "Suggested next steps",
    steps,
    "",
    s.disclaimer,
  ].join("\n");
}
