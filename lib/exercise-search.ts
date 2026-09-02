/// Finding one exercise among eighty-odd, one-handed, between sets.
///
/// The constraint that shapes this: you are standing in a gym holding a phone in
/// one hand, and you know what the movement is called. So typing two or three
/// letters of it has to be enough, in any order, and the thing you meant has to
/// be at the top — not merely somewhere in a filtered list.
///
/// Ranked rather than filtered, because "press" matches fourteen exercises and
/// alphabetical order among them is no more useful than the full list was.
///
/// Pure, so the ranking can be tested without a browser.

import { isMuscleGroup, MUSCLE_GROUPS, MUSCLE_LABEL, type MuscleGroup } from "./recovery";

export type Searchable = {
  id: string;
  name: string;
  muscleGroup: string;
  equipment: string;
  /// How many sets have ever been logged against it. Breaks ties towards the
  /// movements you actually do.
  setCount?: number;
};

/// Gym shorthand worth expanding, kept deliberately short: every entry here is
/// something unambiguous that people genuinely type. Guessing more widely would
/// start surfacing the wrong movement, which is worse than no match at all.
const ALIASES: Record<string, string> = {
  bb: "barbell",
  db: "dumbbell",
  kb: "kettlebell",
  bw: "bodyweight",
  ohp: "overhead press",
  rdl: "romanian deadlift",
};

/** Lowercase, punctuation out, runs of space collapsed. */
export function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function expand(token: string): string {
  return ALIASES[token] ?? token;
}

function tokenise(query: string): string[] {
  return normalise(query).split(" ").filter(Boolean).flatMap((t) => expand(t).split(" "));
}

/** Everything about an exercise a query is allowed to match against. */
function haystack(item: Searchable): { name: string; all: string } {
  const name = normalise(item.name);
  return { name, all: `${name} ${normalise(item.muscleGroup)} ${normalise(item.equipment)}` };
}

/**
 * How well `item` answers `query`. Zero means it does not, and the caller drops it.
 *
 * The tiers matter more than the numbers: a name that starts with what you typed
 * beats one that merely contains it, and both beat something matched only
 * because of its muscle group — otherwise typing "back" would bury Back Squat
 * under every back exercise in the library.
 */
export function score(item: Searchable, query: string): number {
  const tokens = tokenise(query);
  if (tokens.length === 0) return 0;

  const { name, all } = haystack(item);
  const joined = tokens.join(" ");

  if (name === joined) return 100;
  if (name.startsWith(joined)) return 80;
  // A word inside the name starting with the query: "row" finding "Barbell Row".
  if (name.split(" ").some((word) => word.startsWith(joined))) return 70;
  if (tokens.every((token) => name.split(" ").some((word) => word.startsWith(token)))) return 55;
  if (tokens.every((token) => name.includes(token))) return 40;
  if (tokens.every((token) => all.includes(token))) return 20;
  return 0;
}

/**
 * Matches, best first. Ties break towards what you have actually logged, then
 * alphabetically so the order never wobbles between keystrokes.
 */
export function searchExercises<T extends Searchable>(items: T[], query: string): T[] {
  if (normalise(query) === "") return [];

  return items
    .map((item) => ({ item, score: score(item, query) }))
    .filter((row) => row.score > 0)
    .sort(
      (a, b) =>
        b.score - a.score ||
        (b.item.setCount ?? 0) - (a.item.setCount ?? 0) ||
        a.item.name.localeCompare(b.item.name),
    )
    .map((row) => row.item);
}

export type ExerciseSection<T> = { key: string; label: string; items: T[] };

/**
 * The browse view, for when you are not sure what it is called: grouped by
 * muscle in body order, with anything using an unrecognised group collected at
 * the end rather than dropped.
 */
export function groupByMuscle<T extends Searchable>(items: T[]): ExerciseSection<T>[] {
  const buckets = new Map<string, T[]>();
  for (const item of items) {
    const key = isMuscleGroup(item.muscleGroup) ? item.muscleGroup : "other";
    buckets.set(key, [...(buckets.get(key) ?? []), item]);
  }

  const byName = (a: T, b: T) => a.name.localeCompare(b.name);

  const sections: ExerciseSection<T>[] = MUSCLE_GROUPS.filter((group) => buckets.has(group)).map(
    (group: MuscleGroup) => ({
      key: group,
      label: MUSCLE_LABEL[group],
      items: [...buckets.get(group)!].sort(byName),
    }),
  );

  const other = buckets.get("other");
  if (other) sections.push({ key: "other", label: "Other", items: [...other].sort(byName) });

  return sections;
}

/**
 * The movements you do most, for the top of the empty state. Anything never
 * logged is left out — a list of things you have never done is not a shortcut.
 */
export function mostUsed<T extends Searchable>(items: T[], take = 6): T[] {
  return items
    .filter((item) => (item.setCount ?? 0) > 0)
    .sort((a, b) => (b.setCount ?? 0) - (a.setCount ?? 0) || a.name.localeCompare(b.name))
    .slice(0, take);
}
