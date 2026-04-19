export type AnswerTag =
  | "topic_stress"
  | "topic_mood"
  | "topic_anxiety"
  | "topic_sleep"
  | "topic_relationship"
  | "topic_other"
  | "severity_mild"
  | "severity_moderate"
  | "severity_high"
  | "coping_low"
  | "coping_some"
  | "support_alone"
  | "support_some"
  | "duration_acute"
  | "duration_ongoing";

export type AssessmentOption = {
  label: string;
  nextId: string;
  tags?: AnswerTag[];
};

export type QuestionNode = {
  id: string;
  kind: "question";
  prompt: string;
  /** Shown under the prompt for transparency (plan: "why we're asking"). */
  rationale?: string;
  options: AssessmentOption[];
};

export type TerminalNode = {
  id: string;
  kind: "terminal";
};

export type AssessmentNode = QuestionNode | TerminalNode;

export type AssessmentPathEntry = {
  nodeId: string;
  question: string;
  answer: string;
  tags?: AnswerTag[];
};
