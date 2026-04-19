import { useEffect, useRef, useState } from "react";

type Phase = "inhale" | "holdIn" | "exhale" | "holdOut";

const PHASE_MS: Record<Phase, number> = {
  inhale: 4000,
  holdIn: 4000,
  exhale: 4000,
  holdOut: 4000,
};

const ORDER: Phase[] = ["inhale", "holdIn", "exhale", "holdOut"];

const LABELS: Record<Phase, string> = {
  inhale: "Breathe in slowly through your nose…",
  holdIn: "Hold gently…",
  exhale: "Breathe out slowly…",
  holdOut: "Soft pause…",
};

type Props = {
  intro?: string;
};

/** Simple box-breathing phases — optional wellness practice, not medical advice. */
export function GroundingExercise({ intro }: Props) {
  const [running, setRunning] = useState(false);
  const [phaseIdx, setPhaseIdx] = useState(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const phase = ORDER[phaseIdx % ORDER.length]!;

  useEffect(() => {
    if (!running) return;
    timerRef.current = setTimeout(() => {
      setPhaseIdx((i) => i + 1);
    }, PHASE_MS[phase]);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [running, phaseIdx]);

  const segment = phaseIdx % 4;
  const progressPct = ((segment + 0.5) / 4) * 100;

  return (
    <div className="groundingCard">
      <h3 className="groundingTitle">Optional: box breathing (~4 seconds per step)</h3>
      <p className="groundingIntro">
        {intro ??
          "A common calming rhythm — use only if comfortable. Stop if you feel dizzy or unwell."}
      </p>
      <div className="groundingPhase" aria-live="polite">
        {running ? LABELS[phase] : "Press start when you’re ready."}
      </div>
      <div
        className="groundingBar"
        role="progressbar"
        aria-valuenow={running ? segment + 1 : 0}
        aria-valuemin={0}
        aria-valuemax={4}
      >
        <div className="groundingBarFill" style={{ width: running ? `${progressPct}%` : "0%" }} />
      </div>
      <div className="groundingActions">
        {!running ? (
          <button
            type="button"
            className="btnSecondary"
            onClick={() => {
              setPhaseIdx(0);
              setRunning(true);
            }}
          >
            Start
          </button>
        ) : (
          <button
            type="button"
            className="btnGhost"
            onClick={() => {
              setRunning(false);
              setPhaseIdx(0);
            }}
          >
            Stop
          </button>
        )}
      </div>
    </div>
  );
}
