import { useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { streamBackendGrounding } from "../lib/backendGrounding";
import type { CrisisSeverity } from "../lib/crisisSignals";
import { detectCrisisSignals } from "../lib/crisisSignals";
import type { ChatMessage } from "../types/chat";
import { BoxBreathingGuide } from "./BoxBreathingGuide";

type View = "pick" | "box" | "coach";

const DEFAULT_COACH_STARTER =
  "I'd like a short micro-intervention—please suggest the best technique for how I'm feeling and guide me.";

type Props = {
  open: boolean;
  onClose: () => void;
  onSeverityFromGrounding: (s: CrisisSeverity) => void;
};

export function MicroInterventionsModal({
  open,
  onClose,
  onSeverityFromGrounding,
}: Props) {
  const [view, setView] = useState<View>("pick");
  const [coachTriage, setCoachTriage] = useState("");
  const [groundMessages, setGroundMessages] = useState<ChatMessage[]>([]);
  const [groundInput, setGroundInput] = useState("");
  const [groundStreaming, setGroundStreaming] = useState(false);
  const [groundStarted, setGroundStarted] = useState(false);
  const [groundError, setGroundError] = useState<string | null>(null);
  const groundSessionRef = useRef<string | null>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  const trapTab = useCallback((e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "Tab") return;
    const root = modalRef.current;
    if (!root) return;
    const els = Array.from(
      root.querySelectorAll<HTMLElement>(
        'button:not([disabled]), textarea:not([disabled]), [href], input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    );
    if (els.length === 0) return;
    const first = els[0];
    const last = els[els.length - 1];
    const ae = document.activeElement as HTMLElement | null;
    if (e.shiftKey) {
      if (ae === first) {
        e.preventDefault();
        last.focus();
      }
    } else if (ae === last) {
      e.preventDefault();
      first.focus();
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    setView("pick");
    setCoachTriage("");
    setGroundMessages([]);
    setGroundInput("");
    setGroundStreaming(false);
    setGroundStarted(false);
    setGroundError(null);
    groundSessionRef.current = null;
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const id = window.requestAnimationFrame(() => closeBtnRef.current?.focus());
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.cancelAnimationFrame(id);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  const resetCoach = useCallback(() => {
    setCoachTriage("");
    setGroundMessages([]);
    setGroundInput("");
    setGroundStreaming(false);
    setGroundStarted(false);
    setGroundError(null);
    groundSessionRef.current = null;
  }, []);

  const backToPick = useCallback(() => {
    setView("pick");
    resetCoach();
  }, [resetCoach]);

  const beginCoach = useCallback(async () => {
    const firstContent = coachTriage.trim() || DEFAULT_COACH_STARTER;
    const sid = crypto.randomUUID();
    groundSessionRef.current = sid;
    const starter: ChatMessage = { role: "user", content: firstContent };
    setGroundStarted(true);
    setGroundStreaming(true);
    setGroundError(null);
    let assistant = "";
    setGroundMessages([starter, { role: "assistant", content: "" }]);
    onSeverityFromGrounding(detectCrisisSignals(starter.content));
    try {
      for await (const piece of streamBackendGrounding([starter], sid)) {
        if (piece.type === "delta") {
          assistant += piece.delta;
          setGroundMessages([starter, { role: "assistant", content: assistant }]);
        }
      }
      const finalAssistant = assistant;
      setGroundMessages([starter, { role: "assistant", content: finalAssistant }]);
      onSeverityFromGrounding(detectCrisisSignals(finalAssistant));
    } catch (e) {
      setGroundError(e instanceof Error ? e.message : "Could not reach the server.");
      setGroundMessages([starter]);
    } finally {
      setGroundStreaming(false);
    }
  }, [coachTriage, onSeverityFromGrounding]);

  const sendGroundMessage = useCallback(async () => {
    const text = groundInput.trim();
    if (!text || groundStreaming) return;
    onSeverityFromGrounding(detectCrisisSignals(text));
    const sid = groundSessionRef.current ?? crypto.randomUUID();
    groundSessionRef.current = sid;
    const snapshotBefore = groundMessages;
    const prev = [...snapshotBefore, { role: "user" as const, content: text }];
    setGroundInput("");
    setGroundStreaming(true);
    setGroundError(null);
    let assistant = "";
    setGroundMessages([...prev, { role: "assistant", content: "" }]);
    try {
      for await (const piece of streamBackendGrounding(prev, sid)) {
        if (piece.type === "delta") {
          assistant += piece.delta;
          setGroundMessages([...prev, { role: "assistant", content: assistant }]);
        }
      }
      const fa = assistant;
      setGroundMessages([...prev, { role: "assistant", content: fa }]);
      onSeverityFromGrounding(detectCrisisSignals(fa));
    } catch (e) {
      setGroundError(e instanceof Error ? e.message : "Send failed.");
      setGroundMessages(snapshotBefore);
    } finally {
      setGroundStreaming(false);
    }
  }, [groundInput, groundMessages, groundStreaming, onSeverityFromGrounding]);

  if (!open) return null;

  return (
    <div className="microModalOverlay" role="presentation" onClick={onClose}>
      <div
        ref={modalRef}
        className="microModal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="micro-modal-title"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={trapTab}
      >
        <div className="microModalHead">
          <h2 id="micro-modal-title">Stress relief</h2>
          <button
            ref={closeBtnRef}
            type="button"
            className="btnGhost"
            aria-label="Close"
            onClick={onClose}
          >
            Close
          </button>
        </div>

        {view === "pick" && (
          <>
            <p className="microModalLead">
              Quick exercises for high stress — about two minutes. Not a substitute for emergency care.
            </p>
            <div className="microPicker">
              <button type="button" className="btnPrimary microPickerBtn" onClick={() => setView("coach")}>
                Guided techniques (coach)
              </button>
              <button type="button" className="btnSecondary microPickerBtn" onClick={() => setView("box")}>
                Box breathing (visual timer)
              </button>
            </div>
          </>
        )}

        {view === "box" && <BoxBreathingGuide onBack={backToPick} />}

        {view === "coach" && (
          <div className="groundingPanel">
            <p className="microModalSub">
              The coach suggests a brief skill that fits what you describe (breathing, grounding,
              relaxation cues, and similar — all short steps). Optional: say what you need before you start.
            </p>
            {!groundStarted ? (
              <>
                <label className="microTriageLabel" htmlFor="micro-coach-triage">
                  What do you need right now? (optional)
                </label>
                <textarea
                  id="micro-coach-triage"
                  data-gramm="false"
                  className="microTriageInput"
                  rows={2}
                  value={coachTriage}
                  onChange={(e) => setCoachTriage(e.target.value)}
                  placeholder="e.g. racing heart, anger spike, overwhelm, feeling spaced out…"
                />
                <button type="button" className="btnPrimary" onClick={() => void beginCoach()}>
                  Start
                </button>
              </>
            ) : (
              <>
                <div className="microMessageList" role="log">
                  {groundMessages.map((m, i) => (
                    <div key={`${i}-${m.role}-${m.content.slice(0, 8)}`} className={`bubble ${m.role}`}>
                      <span className="bubbleLabel">{m.role === "user" ? "You" : "Guide"}</span>
                      <p className="bubbleText">{m.content}</p>
                    </div>
                  ))}
                </div>
                {groundError && <p className="errorText">{groundError}</p>}
                <div className="microComposer">
                  <textarea
                    data-gramm="false"
                    rows={2}
                    value={groundInput}
                    onChange={(e) => setGroundInput(e.target.value)}
                    placeholder="Type your answer…"
                    disabled={groundStreaming}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        void sendGroundMessage();
                      }
                    }}
                  />
                  <button
                    type="button"
                    className="btnPrimary"
                    disabled={groundStreaming || !groundInput.trim()}
                    onClick={() => void sendGroundMessage()}
                  >
                    {groundStreaming ? "…" : "Send"}
                  </button>
                </div>
                <button type="button" className="btnGhost microBackBtn" onClick={backToPick}>
                  Back to activities
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
