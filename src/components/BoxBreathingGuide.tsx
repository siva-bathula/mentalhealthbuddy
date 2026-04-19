import { useEffect, useMemo, useReducer, useState } from "react";

const PHASE_MS = 4000;
const PHASE_LABELS = ["Inhale", "Hold", "Exhale", "Hold"] as const;
/** Seven full cycles ≈ 112 seconds (close to ~2 minutes). */
const TOTAL_CYCLES = 7;

type RunState = { cycle: number; phase: number };
type BoxState =
  | { mode: "run"; run: RunState }
  | { mode: "done" };

function boxReducer(s: BoxState, _a: { type: "tick" }): BoxState {
  if (s.mode !== "run") return s;
  const { cycle, phase } = s.run;
  if (phase < 3) return { mode: "run", run: { cycle, phase: phase + 1 } };
  if (cycle + 1 >= TOTAL_CYCLES) return { mode: "done" };
  return { mode: "run", run: { cycle: cycle + 1, phase: 0 } };
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

  const [state, dispatch] = useReducer(boxReducer, {
    mode: "run",
    run: { cycle: 0, phase: 0 },
  } satisfies BoxState);

  const phaseKey =
    state.mode === "run" ? `${state.run.cycle}-${state.run.phase}` : "done";

  useEffect(() => {
    if (state.mode !== "run") return;
    const id = window.setTimeout(() => {
      dispatch({ type: "tick" });
    }, PHASE_MS);
    return () => window.clearTimeout(id);
  }, [phaseKey, state.mode]);

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
      ? Math.max(0, Math.ceil((phaseStart + PHASE_MS - Date.now()) / 1000))
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

  const { cycle, phase } = state.run;
  const phaseLabel = PHASE_LABELS[phase];
  const activeEdge = phase as 0 | 1 | 2 | 3;

  return (
    <div className="boxBreathingRoot">
      <p className="microModalSub">
        Box breathing (4-4-4-4) — about two minutes. Tap Stop anytime.
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
        <div className="boxBreathingSquare" aria-hidden>
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
