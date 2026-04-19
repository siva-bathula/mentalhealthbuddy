import type { AssessmentNode } from "./types";

export const ASSESSMENT_START_ID = "start";

/** Adaptive branching tree (MVP): not a licensed clinical scale; inspired by screening style without scored PHQ/GAD outputs. */
export const assessmentNodes: Record<string, AssessmentNode> = {
  start: {
    id: "start",
    kind: "question",
    prompt: "What feels most present for you right now?",
    rationale:
      "A single focus helps guide the next questions so they stay relevant.",
    options: [
      {
        label: "Stress or feeling overwhelmed",
        nextId: "stress_depth",
        tags: ["topic_stress"],
      },
      {
        label: "Low mood or emptiness",
        nextId: "mood_depth",
        tags: ["topic_mood"],
      },
      {
        label: "Worry, anxiety, or panic",
        nextId: "anxiety_depth",
        tags: ["topic_anxiety"],
      },
      {
        label: "Sleep problems",
        nextId: "sleep_depth",
        tags: ["topic_sleep"],
      },
      {
        label: "Relationship or loneliness",
        nextId: "support_check",
        tags: ["topic_relationship"],
      },
      {
        label: "Something else / not sure",
        nextId: "support_check",
        tags: ["topic_other"],
      },
    ],
  },
  stress_depth: {
    id: "stress_depth",
    kind: "question",
    prompt: "How intense has the stress felt over the past two weeks?",
    rationale: "Intensity helps gauge how urgently to prioritize coping and rest.",
    options: [
      { label: "Manageable most days", nextId: "duration", tags: ["severity_mild"] },
      { label: "Often hard to cope", nextId: "duration", tags: ["severity_moderate"] },
      { label: "Overwhelming most days", nextId: "duration", tags: ["severity_high"] },
    ],
  },
  mood_depth: {
    id: "mood_depth",
    kind: "question",
    prompt: "How often have you felt down, unmotivated, or emotionally flat recently?",
    rationale:
      "This is a simple check-in — it is not a diagnosis, but it shapes suggestions.",
    options: [
      { label: "Occasionally", nextId: "duration", tags: ["severity_mild"] },
      { label: "Several days a week", nextId: "duration", tags: ["severity_moderate"] },
      { label: "Most days", nextId: "duration", tags: ["severity_high"] },
    ],
  },
  anxiety_depth: {
    id: "anxiety_depth",
    kind: "question",
    prompt: "How much are worry or physical anxiety symptoms interfering with your day?",
    rationale: "Impact on your day guides how practical the next steps should be.",
    options: [
      { label: "A little", nextId: "duration", tags: ["severity_mild"] },
      { label: "Moderately", nextId: "duration", tags: ["severity_moderate"] },
      { label: "Severely", nextId: "duration", tags: ["severity_high"] },
    ],
  },
  sleep_depth: {
    id: "sleep_depth",
    kind: "question",
    prompt: "What describes your sleep lately?",
    rationale: "Sleep often connects to mood, anxiety, and focus the next day.",
    options: [
      { label: "Mostly fine", nextId: "duration", tags: ["severity_mild"] },
      {
        label: "Trouble falling or staying asleep",
        nextId: "duration",
        tags: ["severity_moderate"],
      },
      {
        label: "Severely disrupted / nights feel terrible",
        nextId: "duration",
        tags: ["severity_high"],
      },
    ],
  },
  support_check: {
    id: "support_check",
    kind: "question",
    prompt: "Do you feel you have someone you could talk to if things got harder?",
    rationale: "Social support changes which steps are realistic right now.",
    options: [
      { label: "Yes, at least one person", nextId: "coping", tags: ["support_some"] },
      { label: "Not really / I feel alone with it", nextId: "coping", tags: ["support_alone"] },
    ],
  },
  duration: {
    id: "duration",
    kind: "question",
    prompt: "How long has this been going on at this level?",
    rationale: "Duration helps separate a rough patch from something more persistent.",
    options: [
      {
        label: "Days to a couple of weeks",
        nextId: "coping",
        tags: ["duration_acute"],
      },
      {
        label: "Weeks to months",
        nextId: "coping",
        tags: ["duration_ongoing"],
      },
    ],
  },
  coping: {
    id: "coping",
    kind: "question",
    prompt: "What best matches your coping lately?",
    rationale: "Honesty here helps avoid generic advice that would feel unrealistic.",
    options: [
      {
        label: "I’m doing small things that sometimes help",
        nextId: "end",
        tags: ["coping_some"],
      },
      {
        label: "I’m barely coping / nothing seems to help",
        nextId: "end",
        tags: ["coping_low"],
      },
    ],
  },
  end: {
    id: "end",
    kind: "terminal",
  },
};
