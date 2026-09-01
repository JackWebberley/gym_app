import { describe, expect, it } from "vitest";
import { formatLastPerformance, progressionCue, type ExerciseSessionHistory } from "../progression";

const range = { min: 8, max: 12 };

function session(id: string, sets: [number, number][], daysAgo = 0): ExerciseSessionHistory {
  return {
    sessionId: id,
    performedAt: new Date(Date.now() - daysAgo * 86_400_000),
    sets: sets.map(([weightKg, reps]) => ({ weightKg, reps })),
  };
}

describe("progressionCue", () => {
  it("prompts to find a working weight with no history", () => {
    expect(progressionCue([], range).kind).toBe("first-time");
  });

  it("ignores sessions where the exercise was logged with no sets", () => {
    const cue = progressionCue([session("empty", []), session("a", [[60, 12], [60, 12]])], range);
    expect(cue.kind).toBe("add-weight");
  });

  it("adds weight when every set hit the top of the range", () => {
    const cue = progressionCue([session("a", [[60, 12], [60, 12], [60, 13]])], range);
    expect(cue).toEqual({ kind: "add-weight", message: "Add 2.5kg" });
  });

  it("does not add weight when only some sets hit the top", () => {
    expect(progressionCue([session("a", [[60, 12], [60, 10]])], range).kind).not.toBe("add-weight");
  });

  it("respects a custom increment", () => {
    expect(progressionCue([session("a", [[60, 12]])], range, 1.25).message).toBe("Add 1.25kg");
  });

  it("says hold and add a rep when the last set fell below the range", () => {
    const cue = progressionCue([session("a", [[60, 9], [60, 8], [60, 6]])], range);
    expect(cue).toEqual({ kind: "add-rep", message: "Hold weight, add a rep" });
  });

  it("holds when inside the range and still moving", () => {
    expect(progressionCue([session("a", [[60, 10], [60, 9]])], range).kind).toBe("hold");
  });

  it("flags a stall after three sessions with no increase", () => {
    const cue = progressionCue(
      [
        session("c", [[60, 9], [60, 9]], 0),
        session("b", [[60, 9], [60, 9]], 7),
        session("a", [[60, 10], [60, 9]], 14),
      ],
      range,
    );
    expect(cue.kind).toBe("stalled");
  });

  it("does not flag a stall when the most recent session improved", () => {
    const cue = progressionCue(
      [
        session("c", [[62.5, 9]], 0),
        session("b", [[60, 9]], 7),
        session("a", [[60, 9]], 14),
      ],
      range,
    );
    expect(cue.kind).not.toBe("stalled");
  });

  it("does not flag a stall with fewer than three sessions", () => {
    const cue = progressionCue([session("b", [[60, 9]]), session("a", [[60, 9]])], range);
    expect(cue.kind).not.toBe("stalled");
  });

  it("compares sessions by estimated 1RM, so more reps at the same load is progress", () => {
    const cue = progressionCue(
      [
        session("c", [[60, 11]], 0),
        session("b", [[60, 9]], 7),
        session("a", [[60, 9]], 14),
      ],
      range,
    );
    expect(cue.kind).not.toBe("stalled");
  });

  it("prefers the add-weight instruction over a stall the user caused by ignoring it", () => {
    const cue = progressionCue(
      [session("c", [[60, 12]]), session("b", [[60, 12]]), session("a", [[60, 12]])],
      range,
    );
    expect(cue.kind).toBe("add-weight");
  });
});

describe("formatLastPerformance", () => {
  it("collapses a constant load into one figure", () => {
    expect(formatLastPerformance([{ weightKg: 61, reps: 9 }, { weightKg: 61, reps: 8 }])).toBe("61kg × 9,8");
  });

  it("spells out each set when the load changed", () => {
    expect(formatLastPerformance([{ weightKg: 60, reps: 9 }, { weightKg: 65, reps: 6 }])).toBe("60×9, 65×6");
  });

  it("returns null with nothing to show", () => {
    expect(formatLastPerformance([])).toBeNull();
  });
});
