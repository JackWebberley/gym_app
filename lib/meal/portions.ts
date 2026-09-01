/// Turning a recipe into a portion, and a portion into ingredient grams.
///
/// The one idea here: a recipe is defined per *base portion*, and each portion
/// carries its own scale factor. Scalable lines multiply by that factor, fixed
/// lines do not — so two people eating the same dish in different amounts is one
/// recipe with two scale factors, and the shop is sized off their sum.

import type { IngredientSpec, Macros, RecipeSpec } from "./types";
import { ZERO_MACROS } from "./types";

export type IngredientIndex = Map<string, IngredientSpec>;

export function indexIngredients(ingredients: IngredientSpec[]): IngredientIndex {
  return new Map(ingredients.map((i) => [i.id, i]));
}

/** Macros for a quantity of one ingredient. */
export function macrosForGrams(ingredient: IngredientSpec, grams: number): Macros {
  const hundreds = grams / 100;
  return {
    calories: ingredient.kcalPer100g * hundreds,
    proteinG: ingredient.proteinPer100g * hundreds,
    carbsG: ingredient.carbsPer100g * hundreds,
    fatG: ingredient.fatPer100g * hundreds,
  };
}

export function addMacros(a: Macros, b: Macros): Macros {
  return {
    calories: a.calories + b.calories,
    proteinG: a.proteinG + b.proteinG,
    carbsG: a.carbsG + b.carbsG,
    fatG: a.fatG + b.fatG,
  };
}

/** Grams of one line at a given scale. Fixed lines ignore the scale entirely. */
export function gramsForLine(
  line: { grams: number; isScalable: boolean },
  scale: number,
): number {
  return line.isScalable ? line.grams * scale : line.grams;
}

/** Macros of a single portion of a recipe at a given scale factor. */
export function portionMacros(
  recipe: RecipeSpec,
  index: IngredientIndex,
  scale: number,
): Macros {
  let total = { ...ZERO_MACROS };
  for (const line of recipe.lines) {
    const ingredient = index.get(line.ingredientId);
    if (!ingredient) continue;
    total = addMacros(total, macrosForGrams(ingredient, gramsForLine(line, scale)));
  }
  return total;
}

export type ScaleBounds = { min: number; max: number };

/**
 * How far a recipe can stretch before it stops being the same dish.
 *
 * Every scalable line constrains the factor independently — 50–120g of rice on a
 * 75g base allows 0.67–1.6 — and the tightest constraint on each side wins. A
 * recipe with nothing scalable is pinned at 1.
 */
export function scaleBounds(recipe: RecipeSpec): ScaleBounds {
  const scalable = recipe.lines.filter((l) => l.isScalable && l.grams > 0);
  if (scalable.length === 0) return { min: 1, max: 1 };

  let min = 0.25;
  let max = 4;
  for (const line of scalable) {
    if (line.minGrams != null) min = Math.max(min, line.minGrams / line.grams);
    if (line.maxGrams != null) max = Math.min(max, line.maxGrams / line.grams);
  }
  // A recipe whose bounds contradict each other (a line that can only shrink
  // beside one that can only grow) collapses to the tighter limit rather than
  // producing an inverted range the callers would have to guard against.
  if (max < min) max = min;
  return { min, max };
}

export type ScaledPortion = {
  scale: number;
  macros: Macros;
  /** Signed miss against the target: positive means the portion overshoots. */
  residualKcal: number;
  /** True when the bounds stopped it reaching the target. */
  clamped: boolean;
};

/**
 * Tunes the scalable components to land on a calorie target (spec §8.5).
 *
 * Fixed components set a floor the dish cannot go below, so a 700 kcal recipe
 * whose fixed half is 500 kcal simply cannot serve a 300 kcal envelope. That is
 * reported as a residual rather than hidden — the optimiser scores it, and a
 * recipe that never fits stops being chosen.
 */
export function scaleForTarget(
  recipe: RecipeSpec,
  index: IngredientIndex,
  targetKcal: number,
): ScaledPortion {
  const bounds = scaleBounds(recipe);

  let fixedKcal = 0;
  let scalableKcalAtBase = 0;
  for (const line of recipe.lines) {
    const ingredient = index.get(line.ingredientId);
    if (!ingredient) continue;
    const kcal = macrosForGrams(ingredient, line.grams).calories;
    if (line.isScalable) scalableKcalAtBase += kcal;
    else fixedKcal += kcal;
  }

  let scale: number;
  if (scalableKcalAtBase <= 0) {
    scale = 1;
  } else {
    scale = (targetKcal - fixedKcal) / scalableKcalAtBase;
  }

  const unclamped = scale;
  scale = Math.min(bounds.max, Math.max(bounds.min, scale));

  const macros = portionMacros(recipe, index, scale);
  return {
    scale,
    macros,
    residualKcal: macros.calories - targetKcal,
    clamped: Math.abs(unclamped - scale) > 1e-9,
  };
}

/**
 * Total grams of each ingredient a single cook needs, given one scale factor per
 * portion it serves.
 *
 * Fixed lines multiply by the number of portions — cooking for two takes twice
 * the oil — while scalable lines multiply by the sum of the factors. That
 * distinction is the whole reason a 1.0 + 0.65 cook buys 300g of chicken rather
 * than 360g.
 */
export function ingredientNeeds(
  recipe: RecipeSpec,
  scaleFactors: number[],
): Map<string, number> {
  const needs = new Map<string, number>();
  if (scaleFactors.length === 0) return needs;

  const portionCount = scaleFactors.length;
  const scaleSum = scaleFactors.reduce((a, b) => a + b, 0);

  for (const line of recipe.lines) {
    const grams = line.isScalable ? line.grams * scaleSum : line.grams * portionCount;
    needs.set(line.ingredientId, (needs.get(line.ingredientId) ?? 0) + grams);
  }
  return needs;
}

/** Merges per-cook needs into one basket-wide requirement. */
export function mergeNeeds(all: Map<string, number>[]): Map<string, number> {
  const merged = new Map<string, number>();
  for (const needs of all) {
    for (const [id, grams] of needs) {
      merged.set(id, (merged.get(id) ?? 0) + grams);
    }
  }
  return merged;
}

export function roundMacros(m: Macros): Macros {
  return {
    calories: Math.round(m.calories),
    proteinG: Math.round(m.proteinG * 10) / 10,
    carbsG: Math.round(m.carbsG * 10) / 10,
    fatG: Math.round(m.fatG * 10) / 10,
  };
}
