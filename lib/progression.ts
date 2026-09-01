import { estimatedOneRepMax } from "./units";

/// Progression cues (spec §4.3). Deliberately rule-based and pure: these must be
/// instant and deterministic, and no LLM goes anywhere near them.

export type WorkingSet = { weightKg: number; reps: number };

/** One past session's working sets for a single exercise. Warmups excluded by the caller. */
export type ExerciseSessionHistory = {
  sessionId: string;
  performedAt: Date;
  sets: WorkingSet[];
};

export type ProgressionCueKind = "first-time" | "add-weight" | "add-rep" | "stalled" | "hold";

export type ProgressionCue = {
  kind: ProgressionCueKind;
  message: string;
};

export type RepRange = { min: number; max: number };

/** The single comparable number for a session — see §4.4. */
export function bestEstimatedOneRepMax(sets: WorkingSet[]): number {
  return sets.reduce((best, s) => Math.max(best, estimatedOneRepMax(s.weightKg, s.reps)), 0);
}

/**
 * `history` must be ordered most-recent-first and contain only working sets.
 * Sessions where the exercise was present but no set was logged are the caller's
 * problem to filter out — an empty session would otherwise read as a regression.
 */
export function progressionCue(
  history: ExerciseSessionHistory[],
  range: RepRange,
  increment = 2.5,
): ProgressionCue {
  const sessions = history.filter((h) => h.sets.length > 0);

  if (sessions.length === 0) {
    return { kind: "first-time", message: "First time — find a working weight" };
  }

  const last = sessions[0];

  // Hit or exceeded the top of the range on every set → load goes up.
  if (last.sets.every((s) => s.reps >= range.max)) {
    return { kind: "add-weight", message: `Add ${increment}kg` };
  }

  // No increase in load or reps across three consecutive sessions.
  if (sessions.length >= 3) {
    const [a, b, c] = sessions.slice(0, 3).map((s) => bestEstimatedOneRepMax(s.sets));
    if (a <= b && b <= c) {
      return {
        kind: "stalled",
        message: "Stalled — try a different variation, or drop 10% and build back",
      };
    }
  }

  // Fell short of the bottom of the range on the last set → hold and chase the rep.
  const lastSet = last.sets[last.sets.length - 1];
  if (lastSet.reps < range.min) {
    return { kind: "add-rep", message: "Hold weight, add a rep" };
  }

  return { kind: "hold", message: `Hold weight, work toward ${range.max} reps` };
}

/** "61kg × 9,9,8" — the one-line summary above each exercise. */
export function formatLastPerformance(sets: WorkingSet[]): string | null {
  if (sets.length === 0) return null;
  const weights = new Set(sets.map((s) => s.weightKg));
  const reps = sets.map((s) => s.reps).join(",");
  if (weights.size === 1) return `${sets[0].weightKg}kg × ${reps}`;
  return sets.map((s) => `${s.weightKg}×${s.reps}`).join(", ");
}
