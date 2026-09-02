import { describe, expect, it } from "vitest";
import {
  groupByMuscle,
  mostUsed,
  normalise,
  score,
  searchExercises,
  type Searchable,
} from "../exercise-search";

function exercise(
  name: string,
  muscleGroup: string,
  equipment: string,
  setCount = 0,
): Searchable {
  return { id: name, name, muscleGroup, equipment, setCount };
}

const LIBRARY: Searchable[] = [
  exercise("Barbell Bench Press", "chest", "barbell", 120),
  exercise("Dumbbell Bench Press", "chest", "dumbbell", 40),
  exercise("Incline Dumbbell Press", "chest", "dumbbell", 30),
  exercise("Overhead Press", "delts", "barbell", 60),
  exercise("Barbell Row", "back", "barbell", 90),
  exercise("Seated Cable Row", "back", "cable", 20),
  exercise("Lat Pulldown", "back", "cable", 50),
  exercise("Back Squat", "quads", "barbell", 110),
  exercise("Romanian Deadlift", "hamstrings", "barbell", 45),
  exercise("Leg Press", "quads", "machine", 25),
  exercise("Bicep Curl", "biceps", "dumbbell", 70),
  exercise("Calf Raise", "calves", "machine"),
];

const find = (query: string) => searchExercises(LIBRARY, query).map((e) => e.name);

describe("normalise", () => {
  it("strips case and punctuation", () => {
    expect(normalise("  Barbell  Bench-Press! ")).toBe("barbell bench press");
  });
});

describe("score", () => {
  it("ranks an exact name above a prefix, and a prefix above a substring", () => {
    const exact = score(exercise("Barbell Row", "back", "barbell"), "barbell row");
    const prefix = score(exercise("Barbell Row Underhand", "back", "barbell"), "barbell row");
    const substring = score(exercise("Pendlay Barbell Row", "back", "barbell"), "barbell row");
    expect(exact).toBeGreaterThan(prefix);
    expect(prefix).toBeGreaterThan(substring);
  });

  it("ranks a name match above a match found only in the muscle group", () => {
    // Typing "back" should not bury Back Squat under every back exercise.
    const named = score(exercise("Back Squat", "quads", "barbell"), "back");
    const viaGroup = score(exercise("Lat Pulldown", "back", "cable"), "back");
    expect(named).toBeGreaterThan(viaGroup);
  });

  it("returns zero for something that does not match at all", () => {
    expect(score(exercise("Calf Raise", "calves", "machine"), "bench")).toBe(0);
  });

  it("returns zero for an empty query rather than matching everything", () => {
    expect(score(exercise("Calf Raise", "calves", "machine"), "   ")).toBe(0);
  });
});

describe("searchExercises", () => {
  it("finds a movement from the middle of its name", () => {
    expect(find("row")).toEqual(["Barbell Row", "Seated Cable Row"]);
  });

  it("matches tokens typed in any order", () => {
    // Nobody types the full name in the right order one-handed.
    expect(find("press bench")).toEqual(["Barbell Bench Press", "Dumbbell Bench Press"]);
  });

  it("puts the exercise you actually do first among equal matches", () => {
    // Both are "* Bench Press"; the one with 120 logged sets is the one meant.
    expect(find("bench press")[0]).toBe("Barbell Bench Press");
  });

  it("expands gym shorthand", () => {
    expect(find("db curl")).toEqual(["Bicep Curl"]);
    expect(find("bb row")).toEqual(["Barbell Row"]);
    expect(find("rdl")).toEqual(["Romanian Deadlift"]);
  });

  it("finds things by equipment and muscle group too", () => {
    // Seated Cable Row leads because "cable" is in its name; Lat Pulldown is
    // only a cable machine, which is the weaker claim.
    expect(find("cable")).toEqual(["Seated Cable Row", "Lat Pulldown"]);
    expect(find("hamstrings")).toEqual(["Romanian Deadlift"]);
  });

  it("returns nothing for an empty query, so the caller can browse instead", () => {
    expect(searchExercises(LIBRARY, "")).toEqual([]);
    expect(searchExercises(LIBRARY, "  ")).toEqual([]);
  });

  it("returns nothing rather than everything when there is no match", () => {
    expect(find("zercher")).toEqual([]);
  });

  it("is stable between keystrokes", () => {
    // "pres" and "press" should not reshuffle what they have in common.
    const before = find("pres").slice(0, 3);
    const after = find("press").slice(0, 3);
    expect(after).toEqual(before);
  });

  it("ignores punctuation in the query", () => {
    expect(find("bench-press")).toEqual(["Barbell Bench Press", "Dumbbell Bench Press"]);
  });
});

describe("groupByMuscle", () => {
  it("groups in body order, not alphabetically", () => {
    expect(groupByMuscle(LIBRARY).map((s) => s.key)).toEqual([
      "chest",
      "back",
      "delts",
      "biceps",
      "quads",
      "hamstrings",
      "calves",
    ]);
  });

  it("sorts within a group by name", () => {
    const chest = groupByMuscle(LIBRARY).find((s) => s.key === "chest")!;
    expect(chest.items.map((e) => e.name)).toEqual([
      "Barbell Bench Press",
      "Dumbbell Bench Press",
      "Incline Dumbbell Press",
    ]);
  });

  it("collects an unrecognised muscle group at the end instead of dropping it", () => {
    // A custom exercise must still be findable.
    const sections = groupByMuscle([...LIBRARY, exercise("Neck Curl", "neck", "bodyweight")]);
    const last = sections[sections.length - 1];
    expect(last.key).toBe("other");
    expect(last.items.map((e) => e.name)).toEqual(["Neck Curl"]);
  });

  it("omits muscle groups with no exercises", () => {
    expect(groupByMuscle(LIBRARY).map((s) => s.key)).not.toContain("triceps");
  });
});

describe("mostUsed", () => {
  it("returns the busiest movements first", () => {
    expect(mostUsed(LIBRARY, 3).map((e) => e.name)).toEqual([
      "Barbell Bench Press",
      "Back Squat",
      "Barbell Row",
    ]);
  });

  it("leaves out anything never logged — that is not a shortcut", () => {
    expect(mostUsed(LIBRARY, 20).map((e) => e.name)).not.toContain("Calf Raise");
  });
});
