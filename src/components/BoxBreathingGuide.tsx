import { useEffect, useMemo, useReducer, useState } from "react";

const PHASE_LABELS = ["Inhale", "Hold", "Exhale", "Hold"] as const;
/** Seven full cycles; total wall time = 7 × 4 steps × N seconds. */
const TOTAL_CYCLES = 7;
const MAX_EDGE_SECONDS = 60;

type RunState = { cycle: number; phase: number };
type BoxState =
  | { mode: "idle" }
  | { mode: "run"; run: RunState; phaseMs: number }
  | { mode: "done" };

type BoxAction = { type: "start"; phaseMs: number } | { type: "tick" };

function boxReducer(s: BoxState, a: BoxAction): BoxState {
  if (a.type === "start") {
    if (s.mode !== "idle") return s;
    return { mode: "run", run: { cycle: 0, phase: 0 }, phaseMs: a.phaseMs };
  }
  if (a.type === "tick") {
    if (s.mode !== "run") return s;
    const { phaseMs, run: { cycle, phase } } = s;
    if (phase < 3) return { mode: "run", run: { cycle, phase: phase + 1 }, phaseMs };
    if (cycle + 1 >= TOTAL_CYCLES) return { mode: "done" };
    return { mode: "run", run: { cycle: cycle + 1, phase: 0 }, phaseMs };
  }
  return s;
}

function parseEdgeSeconds(draft: number): number {
  if (!Number.isFinite(draft) || draft < 1) return 4;
  return Math.max(2, Math.min(MAX_EDGE_SECONDS, Math.floor(draft)));
}

function totalSessionSeconds(edgeSec: number): number {
  return TOTAL_CYCLES * 4 * edgeSec;
}

function formatSessionDuration(totalSec: number): string {
  if (totalSec < 60) return `about ${totalSec} seconds`;
  const roundedMin = Math.round(totalSec / 60);
  return `about ${roundedMin} minute${roundedMin === 1 ? "" : "s"}`;
}

type Props = {
  onBack: () => void;
};

export function BoxBreathingGuide({ onBack }: Props) {
  const prefersReducedMotion = useMemo(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    [],
  );

  const [state, dispatch] = useReducer(boxReducer, { mode: "idle" } satisfies BoxState);
  const [draftEdgeSec, setDraftEdgeSec] = useState(4);

  const phaseKey =
    state.mode === "run" ? `${state.run.cycle}-${state.run.phase}` : state.mode === "idle" ? "idle" : "done";

  useEffect(() => {
    if (state.mode !== "run") return;
    const id = window.setTimeout(() => {
      dispatch({ type: "tick" });
    }, state.phaseMs);
    return () => window.clearTimeout(id);
  }, [phaseKey, state]);

  const [phaseStart, setPhaseStart] = useState(() => Date.now());
  useEffect(() => {
    if (state.mode === "run") setPhaseStart(Date.now());
  }, [phaseKey, state.mode]);

  const [, setRemainTick] = useState(0);
  useEffect(() => {
    if (state.mode !== "run") return;
    const id = window.setInterval(() => setRemainTick((n) => n + 1), 250);
    return () => window.clearInterval(id);
  }, [phaseKey, state.mode]);

  const secLeft =
    state.mode === "run"
      ? Math.max(0, Math.ceil((phaseStart + state.phaseMs - Date.now()) / 1000))
      : 0;

  if (state.mode === "done") {
    return (
      <div className="boxBreathingRoot">
        <p className="boxBreathingLead">
          You completed a full box-breathing round. Take a slow breath if you like, then continue when
          you’re ready.
        </p>
        <button type="button" className="btnPrimary" onClick={onBack}>
          Back to activities
        </button>
      </div>
    );
  }

  if (state.mode === "idle") {
    const edge = parseEdgeSeconds(draftEdgeSec);
    const totalSec = totalSessionSeconds(edge);
    const pattern = `${edge}-${edge}-${edge}-${edge}`;
    return (
      <div className="boxBreathingRoot">
        <p className="microModalSub">
          Same length for inhale, two holds, and exhale. Set seconds per side (min 2), then start. One
          round is {formatSessionDuration(totalSec)} ({pattern}).
        </p>
        <label className="boxBreathingFieldLabel" htmlFor="box-breathing-edge-sec">
          Seconds per side
        </label>
        <div className="boxBreathingStartRow">
          <input
            id="box-breathing-edge-sec"
            className="boxBreathingNumberInput"
            type="number"
            min={2}
            max={MAX_EDGE_SECONDS}
            inputMode="numeric"
            value={draftEdgeSec || ""}
            onChange={(e) => setDraftEdgeSec(e.target.value === "" ? 0 : Number(e.target.value))}
          />
          <button
            type="button"
            className="btnPrimary"
            onClick={() => dispatch({ type: "start", phaseMs: parseEdgeSeconds(draftEdgeSec) * 1000 })}
          >
            Start
          </button>
        </div>
        <div className="microModalActions">
          <button type="button" className="btnGhost" onClick={onBack}>
            Back
          </button>
        </div>
      </div>
    );
  }

  const { cycle, phase } = state.run;
  const { phaseMs } = state;
  const phaseLabel = PHASE_LABELS[phase];
  const activeEdge = phase as 0 | 1 | 2 | 3;
  const edgeSec = Math.round(phaseMs / 1000);
  const pattern = `${edgeSec}-${edgeSec}-${edgeSec}-${edgeSec}`;

  return (
    <div className="boxBreathingRoot">
      <p className="microModalSub">
        Box breathing ({pattern}) — {formatSessionDuration(totalSessionSeconds(edgeSec))}. Tap Stop anytime.
      </p>
      <div className="boxBreathingHud" aria-live="polite">
        <span className="boxBreathingPhase">{phaseLabel}</span>
        <span className="boxBreathingCount">{secLeft}s</span>
        <span className="boxBreathingMeta">
          Cycle {Math.min(cycle + 1, TOTAL_CYCLES)} of {TOTAL_CYCLES}
        </span>
      </div>

      {prefersReducedMotion ? (
        <p className="boxBreathingReducedNote">Follow the phase name and countdown.</p>
      ) : (
        <div
          className="boxBreathingSquare"
          style={{ ["--box-phase-seconds" as string]: `${edgeSec}s` }}
          aria-hidden
        >
          <div className={`boxBreathingEdge boxBreathingEdgeTop ${activeEdge === 0 ? "active" : ""}`} />
          <div className={`boxBreathingEdge boxBreathingEdgeRight ${activeEdge === 1 ? "active" : ""}`} />
          <div className={`boxBreathingEdge boxBreathingEdgeBottom ${activeEdge === 2 ? "active" : ""}`} />
          <div className={`boxBreathingEdge boxBreathingEdgeLeft ${activeEdge === 3 ? "active" : ""}`} />
          <div className="boxBreathingSquareInner" />
        </div>
      )}

      <div className="microModalActions">
        <button type="button" className="btnGhost" onClick={onBack}>
          Stop
        </button>
      </div>
    </div>
  );
}
