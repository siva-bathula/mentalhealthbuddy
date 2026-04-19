import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { pickGroundingIntro } from "../assessment/groundingIntro";
import type { AssessmentSummary } from "../assessment/summarize";
import { formatAssessmentPlainText, summarizeAssessment } from "../assessment/summarize";
import { ASSESSMENT_START_ID, assessmentNodes } from "../assessment/flow";
import type { AnswerTag, AssessmentPathEntry } from "../assessment/types";
import type { CrisisSeverity } from "../lib/crisisSignals";
import { detectCrisisSignals } from "../lib/crisisSignals";
import { GroundingExercise } from "./GroundingExercise";

type Props = {
  onAnswerText: (text: string) => void;
  onSeverityFromAssessment: (s: CrisisSeverity) => void;
  onComplete?: (payload: {
    path: AssessmentPathEntry[];
    tags: AnswerTag[];
    summary: AssessmentSummary;
  }) => void;
  onRestart?: () => void;
};

export function AssessmentMode({
  onAnswerText,
  onSeverityFromAssessment,
  onComplete,
  onRestart,
}: Props) {
  const [nodeId, setNodeId] = useState(ASSESSMENT_START_ID);
  const [path, setPath] = useState<AssessmentPathEntry[]>([]);
  const [tags, setTags] = useState<Set<AnswerTag>>(new Set());
  const [copyHint, setCopyHint] = useState<string | null>(null);
  const reportedKey = useRef<string | null>(null);

  const node = assessmentNodes[nodeId];

  const summary = useMemo(() => {
    if (node?.kind !== "terminal") return null;
    return summarizeAssessment(tags);
  }, [node, tags]);

  useEffect(() => {
    if (node?.kind !== "terminal") {
      reportedKey.current = null;
      return;
    }
    const key = `${nodeId}:${path.map((p) => p.answer).join("|")}`;
    if (reportedKey.current === key) return;
    reportedKey.current = key;
    const s = summarizeAssessment(tags);
    onComplete?.({ path, tags: [...tags], summary: s });
  }, [node, nodeId, path, tags, onComplete]);

  const choose = useCallback(
    (label: string, nextId: string, optionTags?: AnswerTag[]) => {
      if (node?.kind !== "question") return;
      onAnswerText(label);
      onSeverityFromAssessment(detectCrisisSignals(label));
      setPath((p) => [
        ...p,
        {
          nodeId: node.id,
          question: node.prompt,
          answer: label,
          tags: optionTags,
        },
      ]);
      if (optionTags?.length) {
        setTags((prev) => {
          const n = new Set(prev);
          for (const t of optionTags) n.add(t);
          return n;
        });
      }
      setNodeId(nextId);
    },
    [node, onAnswerText, onSeverityFromAssessment],
  );

  const restart = useCallback(() => {
    setNodeId(ASSESSMENT_START_ID);
    setPath([]);
    setTags(new Set());
    reportedKey.current = null;
    onRestart?.();
  }, [onRestart]);

  const copySummaryText = useCallback(async () => {
    if (!summary) return;
    const text = formatAssessmentPlainText(summary);
    try {
      await navigator.clipboard.writeText(text);
      setCopyHint("Copied to clipboard.");
    } catch {
      try {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.setAttribute("data-gramm", "false");
        ta.setAttribute("data-enable-grammarly", "false");
        ta.setAttribute("readonly", "");
        ta.style.position = "fixed";
        ta.style.left = "-9999px";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
        setCopyHint("Copied to clipboard.");
      } catch {
        setCopyHint("Could not copy — select and copy manually.");
      }
    }
    window.setTimeout(() => setCopyHint(null), 3500);
  }, [summary]);

  if (!node) {
    return <p className="errorText">Assessment definition missing node.</p>;
  }

  if (node.kind === "terminal" && summary) {
    const groundingIntro = pickGroundingIntro(tags);

    return (
      <section className="panel" aria-labelledby="assess-result-heading">
        <h2 id="assess-result-heading">Your reflection summary</h2>
        <p className="panelSub scopeNote">
          Educational self-reflection only — not a diagnosis. You can copy this text to share context
          with a licensed professional.
        </p>
        <p className="summaryReflection">{summary.reflection}</p>

        <GroundingExercise intro={groundingIntro} />

        <h3>Suggested next steps</h3>
        <ul className="stepsList">
          {summary.suggestedSteps.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ul>

        <div className="assessmentExportRow">
          <button type="button" className="btnPrimary" onClick={() => void copySummaryText()}>
            Copy summary to clipboard
          </button>
          {copyHint && (
            <span className="copyHint" role="status">
              {copyHint}
            </span>
          )}
        </div>

        <p className="finePrint">{summary.disclaimer}</p>
        <button type="button" className="btnSecondary" onClick={restart}>
          Start over
        </button>
      </section>
    );
  }

  if (node.kind !== "question") return null;

  return (
    <section className="panel assessPanel" aria-labelledby="assess-heading">
      <div className="panelHead">
        <h2 id="assess-heading">Assessment mode</h2>
        <p className="panelSub">
          Short branching walkthrough — not a diagnosis or clinical score. Answers stay in your
          browser until you finish; nothing is sent to the server during Assessment. About{" "}
          {path.length + 1} question
          {path.length === 0 ? "" : "s"} so far.
        </p>
      </div>

      <blockquote className="promptBlock">
        <p className="promptMain">{node.prompt}</p>
        {node.rationale && (
          <footer className="promptWhy">
            <strong>Why we ask:</strong> {node.rationale}
          </footer>
        )}
      </blockquote>

      <div className="optionGrid" role="group" aria-labelledby="assess-heading">
        {node.options.map((opt) => (
          <button
            key={opt.label}
            type="button"
            className="optionBtn"
            onClick={() => choose(opt.label, opt.nextId, opt.tags)}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </section>
  );
}
