import { useCallback, useState } from "react";
import { fetchSessionSummary } from "../lib/backendSummarise";
import type { ChatMessage } from "../types/chat";

type Props = {
  messages: ChatMessage[];
};

type State =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "done"; bullets: string[] }
  | { kind: "error"; message: string };

export function SessionInsightCard({ messages }: Props) {
  const [state, setState] = useState<State>({ kind: "idle" });
  const [copyHint, setCopyHint] = useState<string | null>(null);

  const generate = useCallback(async () => {
    setState({ kind: "loading" });
    const result = await fetchSessionSummary(messages);
    if (result.ok) {
      setState({ kind: "done", bullets: result.bullets });
    } else {
      setState({ kind: "error", message: result.error });
    }
  }, [messages]);

  const copyText = useCallback(async () => {
    if (state.kind !== "done") return;
    const text = state.bullets.map((b) => `• ${b}`).join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopyHint("Copied.");
    } catch {
      setCopyHint("Could not copy — select and copy manually.");
    }
    window.setTimeout(() => setCopyHint(null), 3000);
  }, [state]);

  if (messages.length < 2) return null;

  return (
    <div className="sessionInsightCard">
      {state.kind === "idle" && (
        <button
          type="button"
          className="btnGhost sessionInsightBtn"
          onClick={() => void generate()}
        >
          ✦ What did we cover?
        </button>
      )}

      {state.kind === "loading" && (
        <p className="sessionInsightLoading" role="status">
          Generating summary…
        </p>
      )}

      {state.kind === "error" && (
        <div className="sessionInsightError">
          <p className="errorText">{state.message}</p>
          <button
            type="button"
            className="btnGhost"
            onClick={() => void generate()}
          >
            Retry
          </button>
        </div>
      )}

      {state.kind === "done" && (
        <div className="sessionInsightResult" role="region" aria-label="Session summary">
          <div className="sessionInsightHeader">
            <span className="sessionInsightTitle">Session summary</span>
            <button
              type="button"
              className="btnGhost sessionInsightClose"
              aria-label="Dismiss summary"
              onClick={() => setState({ kind: "idle" })}
            >
              ✕
            </button>
          </div>
          <ul className="sessionInsightBullets">
            {state.bullets.map((b, i) => (
              <li key={i}>{b}</li>
            ))}
          </ul>
          <div className="sessionInsightActions">
            <button type="button" className="btnGhost" onClick={() => void copyText()}>
              Copy
            </button>
            {copyHint && (
              <span className="copyHint" role="status">
                {copyHint}
              </span>
            )}
          </div>
          <p className="sessionInsightDisclaimer">
            Educational reflection only — not a clinical record.
          </p>
        </div>
      )}
    </div>
  );
}
