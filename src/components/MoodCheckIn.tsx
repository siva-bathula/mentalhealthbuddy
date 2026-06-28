import { useCallback, useMemo, useState } from "react";
import { calcStreak, getTodayEntry, loadMoodStore, logMood } from "../lib/moodPersistence";
import type { MoodEntry, MoodScore } from "../lib/moodPersistence";

const MOODS: { score: MoodScore; emoji: string; label: string }[] = [
  { score: 1, emoji: "😞", label: "Very low" },
  { score: 2, emoji: "😔", label: "Low" },
  { score: 3, emoji: "😐", label: "Okay" },
  { score: 4, emoji: "🙂", label: "Good" },
  { score: 5, emoji: "😄", label: "Great" },
];

const SCORE_COLOR: Record<MoodScore, string> = {
  1: "var(--danger)",
  2: "#ff9f7a",
  3: "var(--warn)",
  4: "#8fd4c1",
  5: "var(--accent2)",
};

function buildLast30Days(): { date: string; entry: MoodEntry | null }[] {
  const store = loadMoodStore();
  const byDate = new Map(store.entries.map((e) => [e.date, e]));
  const days: { date: string; entry: MoodEntry | null }[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    days.push({ date: key, entry: byDate.get(key) ?? null });
  }
  return days;
}

export function MoodCheckIn() {
  const [todayScore, setTodayScore] = useState<MoodScore | null>(
    () => getTodayEntry()?.score ?? null,
  );
  const [streak, setStreak] = useState<number>(() => calcStreak());
  const [justLogged, setJustLogged] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const chartDays = useMemo(() => (showHistory ? buildLast30Days() : []), [showHistory]);

  const handlePick = useCallback((score: MoodScore) => {
    logMood(score);
    setTodayScore(score);
    setStreak(calcStreak());
    setJustLogged(true);
  }, []);

  const selectedMood = MOODS.find((m) => m.score === todayScore);

  return (
    <section className="moodCheckIn" aria-labelledby="mood-checkin-heading">
      <div className="moodCheckInHeader">
        <h3 id="mood-checkin-heading" className="moodCheckInTitle">
          How are you feeling today?
        </h3>
        <div className="moodCheckInHeaderRight">
          {streak >= 2 && (
            <span className="streakChip" title={`${streak} days in a row`}>
              🔥 {streak}-day streak
            </span>
          )}
          <button
            type="button"
            className="btnGhost moodHistoryToggle"
            onClick={() => setShowHistory((v) => !v)}
            aria-expanded={showHistory}
          >
            {showHistory ? "Hide history" : "View history"}
          </button>
        </div>
      </div>

      <div className="moodEmojiRow" role="group" aria-label="Mood options">
        {MOODS.map(({ score, emoji, label }) => (
          <button
            key={score}
            type="button"
            className="moodEmojiBtn"
            aria-pressed={todayScore === score}
            aria-label={label}
            title={label}
            onClick={() => handlePick(score)}
          >
            {emoji}
          </button>
        ))}
      </div>

      {todayScore !== null && (
        <p className="moodLoggedNote" role="status">
          {justLogged
            ? `Logged ${selectedMood?.emoji ?? ""} — take care of yourself today.`
            : `Today's mood: ${selectedMood?.emoji ?? ""} ${selectedMood?.label ?? ""}. Tap to update.`}
        </p>
      )}

      {showHistory && (
        <div className="moodChart" aria-label="Mood history last 30 days">
          <p className="moodChartLabel">Last 30 days</p>
          <div className="moodChartBars">
            {chartDays.map(({ date, entry }) => {
              const score = entry?.score ?? null;
              const heightPct = score !== null ? (score / 5) * 100 : 0;
              const color = score !== null ? SCORE_COLOR[score] : "rgba(255,255,255,0.08)";
              const dayNum = new Date(date + "T00:00:00").getDate();
              return (
                <div key={date} className="moodChartCol" title={score !== null ? `${date}: ${MOODS[score - 1]?.label ?? ""}` : `${date}: not logged`}>
                  <div className="moodChartBarWrap">
                    <div
                      className="moodChartBar"
                      style={{ height: `${heightPct}%`, background: color }}
                    />
                  </div>
                  {dayNum === 1 || dayNum % 7 === 1 ? (
                    <span className="moodChartDayLabel">{dayNum}</span>
                  ) : (
                    <span className="moodChartDayLabel" aria-hidden="true" />
                  )}
                </div>
              );
            })}
          </div>
          <div className="moodChartLegend">
            {MOODS.map(({ emoji, label, score }) => (
              <span key={score} className="moodChartLegendItem">
                <span
                  className="moodChartLegendDot"
                  style={{ background: SCORE_COLOR[score] }}
                />
                {emoji} {label}
              </span>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
