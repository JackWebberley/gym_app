/// Folding the serving pool into something readable.
///
/// The pool is a flat list of individual servings, which is the right shape for
/// the database and the wrong one for a person: four identical yoghurts and
/// three identical soups arrive as seven rows that say almost nothing. Grouping
/// them by meal type and folding identical servings into a count is the same
/// treatment the menu screen gets, for the same reason.
///
/// Pure, so both the Meals hub and the Food screen can share it and it can be
/// tested without a database.

import type { MealType } from "./types";
import { MEAL_TYPES } from "./types";

/// The fields of a pooled serving this module needs. Deliberately narrower than
/// the query's row type so the pure module does not depend on the read model.
export type PooledServing = {
  id: string;
  recipeName: string;
  mealType: MealType;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  isCooked: boolean;
  daysLeft: number | null;
  prepMinutes: number;
  cookId: string;
};

export type PoolGroup<T extends PooledServing> = {
  /// Stable across renders: the dish, and whether it is cooked yet. Cooked and
  /// uncooked servings of the same dish are genuinely different things — one is
  /// food, the other is a job — so they never merge into one row.
  key: string;
  recipeName: string;
  mealType: MealType;
  isCooked: boolean;
  count: number;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  prepMinutes: number;
  /// Soonest expiry in the group, which is the one that matters.
  daysLeft: number | null;
  /// The serving to act on when the row is tapped: whatever expires first, so
  /// eating from a group always takes the most urgent one.
  next: T;
  servings: T[];
};

export type PoolSection<T extends PooledServing> = {
  mealType: MealType;
  groups: PoolGroup<T>[];
  count: number;
  cookedCount: number;
};

/** Earliest expiry first; anything without one sorts last. */
function byUrgency(a: PooledServing, b: PooledServing): number {
  if (a.daysLeft == null && b.daysLeft == null) return 0;
  if (a.daysLeft == null) return 1;
  if (b.daysLeft == null) return -1;
  return a.daysLeft - b.daysLeft;
}

export function groupPool<T extends PooledServing>(pool: T[]): PoolSection<T>[] {
  const byMeal = new Map<MealType, Map<string, T[]>>();

  for (const serving of pool) {
    const key = `${serving.recipeName}::${serving.isCooked ? "cooked" : "raw"}`;
    const groups = byMeal.get(serving.mealType) ?? new Map<string, T[]>();
    groups.set(key, [...(groups.get(key) ?? []), serving]);
    byMeal.set(serving.mealType, groups);
  }

  return MEAL_TYPES.filter((t) => byMeal.has(t)).map((mealType) => {
    const groups = [...byMeal.get(mealType)!.entries()].map(([key, servings]) => {
      const ordered = [...servings].sort(byUrgency);
      const first = ordered[0];
      return {
        key,
        recipeName: first.recipeName,
        mealType,
        isCooked: first.isCooked,
        count: ordered.length,
        calories: first.calories,
        proteinG: first.proteinG,
        carbsG: first.carbsG,
        fatG: first.fatG,
        prepMinutes: first.prepMinutes,
        daysLeft: first.daysLeft,
        next: first,
        servings: ordered,
      };
    });

    // Cooked first — it exists, it is going off, and it needs no work. Then by
    // urgency, then alphabetically so the order is stable between renders.
    groups.sort(
      (a, b) =>
        Number(b.isCooked) - Number(a.isCooked) ||
        byUrgency(a.next, b.next) ||
        a.recipeName.localeCompare(b.recipeName),
    );

    return {
      mealType,
      groups,
      count: groups.reduce((n, g) => n + g.count, 0),
      cookedCount: groups.filter((g) => g.isCooked).reduce((n, g) => n + g.count, 0),
    };
  });
}
