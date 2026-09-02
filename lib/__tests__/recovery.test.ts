import { describe, expect, it } from "vitest";
import {
  MUSCLE_GROUPS,
  byMuscleGroup,
  needsRest,
  readyToTrain,
  recoveryHoursFor,
  summariseRecovery,
  type SetRecord,
} from "../recovery";

const NOW = new Date("2026-09-02T18:00:00Z");

function hoursAgo(hours: number): Date {
  return new Date(NOW.getTime() - hours * 3_600_000);
}

/** `count` working sets on one muscle group, all in the same session. */
function sets(
  muscleGroup: string,
  count: number,
  opts: { hoursAgo: number; sessionId?: string; isWarmup?: boolean } = { hoursAgo: 0 },
): SetRecord[] {
  return Array.from({ length: count }, () => ({
    muscleGroup,
    sessionId: opts.sessionId ?? `session-${opts.hoursAgo}`,
    loggedAt: hoursAgo(opts.hoursAgo),
    isWarmup: opts.isWarmup ?? false,
  }));
}

describe("recoveryHoursFor", () => {
  it("gives a normal session two days", () => {
    expect(recoveryHoursFor(6)).toBe(48);
    expect(recoveryHoursFor(1)).toBe(48);
  });

  it("gives a bigger session longer", () => {
    expect(recoveryHoursFor(10)).toBe(56);
  });

  it("never goes past three days, however much you did", () => {
    expect(recoveryHoursFor(40)).toBe(72);
  });
});

describe("summariseRecovery", () => {
  it("lists every muscle group, in body order, even with no data at all", () => {
    const statuses = summariseRecovery([], NOW);
    expect(statuses.map((s) => s.muscleGroup)).toEqual([...MUSCLE_GROUPS]);
    expect(statuses.every((s) => s.state === "untrained")).toBe(true);
  });

  it("calls a muscle worked this morning worked, not recovering", () => {
    const statuses = byMuscleGroup(summariseRecovery(sets("chest", 6, { hoursAgo: 6 }), NOW));
    expect(statuses.chest.state).toBe("worked");
  });

  it("moves it to recovering past the halfway point", () => {
    const statuses = byMuscleGroup(summariseRecovery(sets("chest", 6, { hoursAgo: 30 }), NOW));
    expect(statuses.chest.state).toBe("recovering");
  });

  it("calls it ready once the window has passed", () => {
    const statuses = byMuscleGroup(summariseRecovery(sets("chest", 6, { hoursAgo: 50 }), NOW));
    expect(statuses.chest.state).toBe("ready");
  });

  it("holds a heavy session back longer than a light one", () => {
    // Same 60 hours ago; 20 sets earns 72 hours, 4 sets earns 48.
    const heavy = byMuscleGroup(summariseRecovery(sets("quads", 20, { hoursAgo: 60 }), NOW));
    const light = byMuscleGroup(summariseRecovery(sets("quads", 4, { hoursAgo: 60 }), NOW));
    expect(heavy.quads.state).toBe("recovering");
    expect(light.quads.state).toBe("ready");
  });

  it("ignores warm-up sets — they are neither volume nor fatigue", () => {
    const statuses = byMuscleGroup(
      summariseRecovery(sets("back", 5, { hoursAgo: 2, isWarmup: true }), NOW),
    );
    expect(statuses.back.state).toBe("untrained");
    expect(statuses.back.setsThisWeek).toBe(0);
  });

  it("counts the last session's volume by session, not by clock", () => {
    // A session that runs past midnight is still one session.
    const statuses = byMuscleGroup(
      summariseRecovery(
        [
          ...sets("chest", 4, { hoursAgo: 26, sessionId: "late" }),
          ...sets("chest", 3, { hoursAgo: 24, sessionId: "late" }),
          ...sets("chest", 8, { hoursAgo: 200, sessionId: "old" }),
        ],
        NOW,
      ),
    );
    expect(statuses.chest.setsLastSession).toBe(7);
  });

  it("counts weekly volume across sessions but not beyond the week", () => {
    const statuses = byMuscleGroup(
      summariseRecovery(
        [
          ...sets("delts", 4, { hoursAgo: 20, sessionId: "a" }),
          ...sets("delts", 5, { hoursAgo: 100, sessionId: "b" }),
          ...sets("delts", 9, { hoursAgo: 200, sessionId: "c" }),
        ],
        NOW,
      ),
    );
    expect(statuses.delts.setsThisWeek).toBe(9);
  });

  it("flags a group left far too long", () => {
    const statuses = byMuscleGroup(summariseRecovery(sets("hamstrings", 3, { hoursAgo: 240 }), NOW));
    expect(statuses.hamstrings.isOverdue).toBe(true);
    expect(statuses.hamstrings.daysSince).toBe(10);
  });

  it("does not call a muscle overdue the moment it is recovered", () => {
    const statuses = byMuscleGroup(summariseRecovery(sets("hamstrings", 3, { hoursAgo: 50 }), NOW));
    expect(statuses.hamstrings.state).toBe("ready");
    expect(statuses.hamstrings.isOverdue).toBe(false);
  });

  it("flags low weekly volume separately from recovery", () => {
    // The disagreement worth showing: recovered, and still barely trained.
    const statuses = byMuscleGroup(summariseRecovery(sets("calves", 3, { hoursAgo: 60 }), NOW));
    expect(statuses.calves.state).toBe("ready");
    expect(statuses.calves.isLowVolume).toBe(true);
  });

  it("does not flag a well-trained group as low volume", () => {
    const statuses = byMuscleGroup(
      summariseRecovery(
        [
          ...sets("back", 8, { hoursAgo: 20, sessionId: "a" }),
          ...sets("back", 8, { hoursAgo: 90, sessionId: "b" }),
        ],
        NOW,
      ),
    );
    expect(statuses.back.setsThisWeek).toBe(16);
    expect(statuses.back.isLowVolume).toBe(false);
  });

  it("ignores a muscle group name it does not recognise", () => {
    // Bad data should not invent a twelfth region on the diagram.
    const statuses = summariseRecovery(sets("neck", 4, { hoursAgo: 2 }), NOW);
    expect(statuses).toHaveLength(MUSCLE_GROUPS.length);
    expect(statuses.every((s) => s.state === "untrained")).toBe(true);
  });
});

describe("readyToTrain", () => {
  it("puts the least-trained group first, not just the longest-rested", () => {
    // Volume is the more useful signal: something on two sets a week needs work
    // more than something rested a day longer.
    const statuses = summariseRecovery(
      [
        ...sets("chest", 12, { hoursAgo: 60, sessionId: "a" }),
        ...sets("hamstrings", 2, { hoursAgo: 80, sessionId: "b" }),
      ],
      NOW,
    );
    const ready = readyToTrain(statuses).filter((s) => s.state === "ready");
    expect(ready[0].muscleGroup).toBe("hamstrings");
  });

  it("stays in body order when nothing at all is logged", () => {
    // Every group is untrained, so every comparison is a tie. A comparator that
    // subtracted two Infinities would return NaN here and scramble the list.
    expect(readyToTrain(summariseRecovery([], NOW)).map((s) => s.muscleGroup)).toEqual([
      ...MUSCLE_GROUPS,
    ]);
  });

  it("includes groups with nothing logged", () => {
    const ready = readyToTrain(summariseRecovery(sets("chest", 6, { hoursAgo: 2 }), NOW));
    expect(ready.map((s) => s.muscleGroup)).toContain("calves");
    expect(ready.map((s) => s.muscleGroup)).not.toContain("chest");
  });
});

describe("needsRest", () => {
  it("lists what was worked most recently first", () => {
    const statuses = summariseRecovery(
      [
        ...sets("chest", 6, { hoursAgo: 30, sessionId: "a" }),
        ...sets("quads", 6, { hoursAgo: 4, sessionId: "b" }),
      ],
      NOW,
    );
    expect(needsRest(statuses).map((s) => s.muscleGroup)).toEqual(["quads", "chest"]);
  });

  it("is empty when everything has recovered", () => {
    expect(needsRest(summariseRecovery(sets("chest", 6, { hoursAgo: 100 }), NOW))).toEqual([]);
  });
});
