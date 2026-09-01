/// The optimiser (spec §8.4).
///
/// Greedy construction, then hill-climbing with random restarts. No solver
/// library: ~30 candidate recipes over ~15 occasions converges in well under a
/// second, and a hand-rolled search is one that can be read and argued with.
///
/// Everything here is deterministic given a seed, which is what makes "reroll" a
/// meaningful button and makes the whole thing testable.

import { buildBasket, wasteWeight, type Basket, DEFAULT_HORIZON_DAYS } from "./basket";
import {
  indexIngredients,
  ingredientNeeds,
  mergeNeeds,
  roundMacros,
  scaleForTarget,
  type IngredientIndex,
  type ScaledPortion,
} from "./portions";
import {
  MEAL_TYPES,
  SLIP_PROBABILITY,
  type Brief,
  type Eater,
  type EnvelopeTable,
  type IngredientSpec,
  type Macros,
  type MealType,
  type PantryStock,
  type RecipeSpec,
} from "./types";

/// Every term is expressed in pounds so the weights are comparable and arguable.
/// A term you cannot state in money is a term you cannot tune.
export const WEIGHTS = {
  /// 100 kcal away from the envelope costs £0.40. Deliberately mild: the week's
  /// average is what matters and the day is noise (spec §5.4).
  gbpPerKcalDeviation: 0.004,
  /// Protein is the whole point of the library, and it is the target that
  /// actually gets missed. Steep for the same reason the variety floor is: at a
  /// gentle rate a cheap low-protein dish simply buys its way past the floor —
  /// a 21g dinner against a 38g floor cost £0.85 to include, which no amount of
  /// being cheap should be able to cover. At this rate it costs £5 and loses.
  gbpPerProteinShortfallG: 0.3,
  /// Each distinct recipe short of what was asked for. Steep on purpose: variety
  /// is the one number the *user* set, and repetition is always cheaper, so a
  /// mild penalty just gets bought out and the control stops meaning anything.
  gbpPerVarietyShortfall: 12,
  /// Per occasion filled by a recipe you have marked a favourite.
  gbpFavouriteBonus: 0.75,
  /// Per minute a cook runs over the requested cap.
  gbpPerPrepMinuteOver: 0.05,
  /// A line with no pack data is a line whose cost is unknown. Mild pressure
  /// towards ingredients we can actually price.
  gbpPerUnknownIngredient: 1.5,
  /// An occasion nothing could fill.
  gbpPerUnfilledOccasion: 12,
};

export type PlannedPortion = {
  eater: Eater;
  scaleFactor: number;
  macros: Macros;
  residualKcal: number;
};

export type PlannedCook = {
  recipeId: string;
  recipeName: string;
  mealType: MealType;
  isLocked: boolean;
  /// How many of my meals this cook covers. Portions is this again for each eater.
  occasions: number;
  portions: PlannedPortion[];
};

export type ScoreBreakdown = {
  total: number;
  macroDeviation: number;
  wasteCost: number;
  shopCost: number;
  pantryRot: number;
  varietyShortfall: number;
  favouriteBonus: number;
  prepOver: number;
  unknownIngredients: number;
  slippageRisk: number;
  unfilled: number;
};

export type Solution = {
  cooks: PlannedCook[];
  basket: Basket;
  breakdown: ScoreBreakdown;
  /// Occasions nothing could fill, by meal type — a thin library rather than a bug.
  gaps: { mealType: MealType; count: number }[];
  seed: number;
};

export type SolveInput = {
  brief: Brief;
  candidates: RecipeSpec[];
  ingredients: IngredientSpec[];
  pantry: PantryStock[];
  envelopes: EnvelopeTable;
  /// Cooks the user pinned. Treated as constraints: never moved, never replaced,
  /// but fully counted in the shop (spec §8.3).
  locked?: LockedCook[];
  seed?: number;
  iterations?: number;
  restarts?: number;
  horizonDayKey?: string;
};

export type LockedCook = {
  recipeId: string;
  occasions: number;
};

/* ── Deterministic RNG ─────────────────────────────────────────────────────── */

/** mulberry32 — small, fast, and reproducible, which is the only requirement. */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ── Precomputation ────────────────────────────────────────────────────────── */

type Prepared = {
  recipe: RecipeSpec;
  /// One scaled portion per eater, fitted to that eater's envelope for this meal
  /// type. Fixed once, because the envelope does not depend on the rest of the plan.
  portionFor: Record<Eater, ScaledPortion>;
  /// Perishable value this recipe puts at risk per occasion, used by the
  /// slippage term.
  perishableGbpPerOccasion: number;
};

function prepare(
  candidates: RecipeSpec[],
  index: IngredientIndex,
  envelopes: EnvelopeTable,
  eaters: Eater[],
  horizonDays: number,
): Map<string, Prepared> {
  const prepared = new Map<string, Prepared>();

  for (const recipe of candidates) {
    const portionFor = {} as Record<Eater, ScaledPortion>;
    for (const eater of eaters) {
      const envelope = envelopes[eater][recipe.mealType];
      portionFor[eater] = scaleForTarget(recipe, index, envelope.targetKcal);
    }

    const needs = ingredientNeeds(
      recipe,
      eaters.map((e) => portionFor[e].scale),
    );
    let perishable = 0;
    for (const [ingredientId, grams] of needs) {
      const ingredient = index.get(ingredientId);
      if (!ingredient || ingredient.isStaple) continue;
      const perGram = cheapestPricePerGram(ingredient);
      if (perGram == null) continue;
      perishable += grams * perGram * wasteWeight(ingredient, horizonDays);
    }

    prepared.set(recipe.id, {
      recipe,
      portionFor,
      // Cooked leftovers that freeze mostly survive a change of plan: you still
      // cook it, you just eat it later.
      perishableGbpPerOccasion: perishable * (recipe.leftoversFreeze ? 0.2 : 1),
    });
  }

  return prepared;
}

function cheapestPricePerGram(ingredient: IngredientSpec): number | null {
  const priced = ingredient.packs.filter((p) => p.priceGbp != null && p.grams > 0);
  if (priced.length === 0) return null;
  return Math.min(...priced.map((p) => p.priceGbp! / p.grams));
}

/* ── Scoring ───────────────────────────────────────────────────────────────── */

type Slot = { mealType: MealType; recipeId: string | null };

type Evaluated = { score: number; breakdown: ScoreBreakdown; basket: Basket };

function evaluate(
  slots: Slot[],
  locked: LockedCook[],
  prepared: Map<string, Prepared>,
  input: SolveInput,
  eaters: Eater[],
): Evaluated {
  const { brief, envelopes, ingredients, pantry } = input;
  const slipProbability = SLIP_PROBABILITY[brief.cookConfidence];

  // Occasions per recipe, locked and searched together — the basket does not care
  // which is which, and neither does the shop.
  const occasionsByRecipe = new Map<string, number>();
  for (const lock of locked) {
    occasionsByRecipe.set(lock.recipeId, (occasionsByRecipe.get(lock.recipeId) ?? 0) + lock.occasions);
  }
  for (const slot of slots) {
    if (!slot.recipeId) continue;
    occasionsByRecipe.set(slot.recipeId, (occasionsByRecipe.get(slot.recipeId) ?? 0) + 1);
  }

  let macroDeviation = 0;
  let favouriteBonus = 0;
  let prepOver = 0;
  let slippageRisk = 0;
  const allNeeds: Map<string, number>[] = [];

  for (const [recipeId, occasions] of occasionsByRecipe) {
    const entry = prepared.get(recipeId);
    if (!entry) continue;
    const { recipe, portionFor } = entry;

    // Scale factors for every portion this recipe produces across the week: one
    // per eater per occasion.
    const scaleFactors: number[] = [];
    for (let i = 0; i < occasions; i++) {
      for (const eater of eaters) {
        const portion = portionFor[eater];
        scaleFactors.push(portion.scale);

        const envelope = envelopes[eater][recipe.mealType];
        macroDeviation += Math.abs(portion.residualKcal) * WEIGHTS.gbpPerKcalDeviation;
        const shortfall = Math.max(0, envelope.minProteinG - portion.macros.proteinG);
        macroDeviation += shortfall * WEIGHTS.gbpPerProteinShortfallG;
      }
    }

    allNeeds.push(ingredientNeeds(recipe, scaleFactors));

    if (recipe.isFavourite) favouriteBonus += occasions * WEIGHTS.gbpFavouriteBonus;
    if (brief.maxPrepMinutes != null && recipe.prepMinutes > brief.maxPrepMinutes) {
      // A batch cook pays the overrun once, not once per serving — that is
      // precisely why batching is worth it.
      const cooks = recipe.batchFriendly ? 1 : occasions;
      prepOver += cooks * (recipe.prepMinutes - brief.maxPrepMinutes) * WEIGHTS.gbpPerPrepMinuteOver;
    }

    // The slippage term. A cook that does not happen strands whatever perishable
    // stock it was going to consume, weighted by how likely the week is to slip.
    const cooks = recipe.batchFriendly ? 1 : occasions;
    slippageRisk += slipProbability * entry.perishableGbpPerOccasion * cooks;
  }

  const basket = buildBasket(mergeNeeds(allNeeds), ingredients, pantry, {
    horizonDays: DEFAULT_HORIZON_DAYS,
    horizonDayKey: input.horizonDayKey,
  });

  // Variety is a floor the user sets, not a goal in itself: fewer distinct
  // recipes is cheaper and less wasteful, so the optimiser is only ever pushed
  // upward towards the number they said they would tolerate (spec §8.6).
  let varietyShortfall = 0;
  for (const mealType of MEAL_TYPES) {
    const wanted = brief.minDistinct[mealType];
    if (!wanted) continue;
    const distinct = new Set(
      slots.filter((s) => s.mealType === mealType && s.recipeId).map((s) => s.recipeId),
    );
    for (const lock of locked) {
      const entry = prepared.get(lock.recipeId);
      if (entry?.recipe.mealType === mealType) distinct.add(lock.recipeId);
    }
    varietyShortfall += Math.max(0, wanted - distinct.size) * WEIGHTS.gbpPerVarietyShortfall;
  }

  const unfilled =
    slots.filter((s) => s.recipeId === null).length * WEIGHTS.gbpPerUnfilledOccasion;
  const unknownIngredients =
    basket.unknownIngredientIds.length * WEIGHTS.gbpPerUnknownIngredient;

  const breakdown: ScoreBreakdown = {
    total: 0,
    macroDeviation,
    wasteCost: basket.totalWasteGbp,
    shopCost: basket.totalCostGbp,
    pantryRot: basket.pantryRotGbp,
    varietyShortfall,
    favouriteBonus,
    prepOver,
    unknownIngredients,
    slippageRisk,
    unfilled,
  };

  breakdown.total =
    breakdown.macroDeviation +
    breakdown.wasteCost +
    breakdown.shopCost +
    breakdown.pantryRot +
    breakdown.varietyShortfall +
    breakdown.prepOver +
    breakdown.unknownIngredients +
    breakdown.slippageRisk +
    breakdown.unfilled -
    breakdown.favouriteBonus;

  return { score: breakdown.total, breakdown, basket };
}

/* ── Search ────────────────────────────────────────────────────────────────── */

export function solve(input: SolveInput): Solution {
  const {
    brief,
    candidates,
    ingredients,
    envelopes,
    locked = [],
    seed = 1,
    iterations = 400,
    restarts = 6,
  } = input;

  const eaters: Eater[] = brief.cooksForTwo ? ["me", "partner"] : ["me"];
  const index = indexIngredients(ingredients);

  // Anything to avoid this week is filtered out rather than penalised: "no fish"
  // means no fish, not fish at a price.
  const avoid = new Set(brief.avoidIngredientIds);
  const usable = candidates.filter((r) => !r.lines.some((l) => avoid.has(l.ingredientId)));

  const prepared = prepare(usable, index, envelopes, eaters, DEFAULT_HORIZON_DAYS);
  // Locked recipes must be scoreable even when the brief would have excluded them.
  for (const lock of locked) {
    if (prepared.has(lock.recipeId)) continue;
    const recipe = candidates.find((r) => r.id === lock.recipeId);
    if (!recipe) continue;
    for (const [id, entry] of prepare([recipe], index, envelopes, eaters, DEFAULT_HORIZON_DAYS)) {
      prepared.set(id, entry);
    }
  }

  const byMealType = new Map<MealType, RecipeSpec[]>();
  for (const recipe of usable) {
    const list = byMealType.get(recipe.mealType) ?? [];
    list.push(recipe);
    byMealType.set(recipe.mealType, list);
  }

  // Locked cooks already cover some of what the brief asked for.
  const lockedByMealType = new Map<MealType, number>();
  for (const lock of locked) {
    const mealType = prepared.get(lock.recipeId)?.recipe.mealType;
    if (!mealType) continue;
    lockedByMealType.set(mealType, (lockedByMealType.get(mealType) ?? 0) + lock.occasions);
  }

  const slots: Slot[] = [];
  const gaps: { mealType: MealType; count: number }[] = [];
  for (const occasion of brief.occasions) {
    const remaining = Math.max(0, occasion.count - (lockedByMealType.get(occasion.mealType) ?? 0));
    const pool = byMealType.get(occasion.mealType) ?? [];
    if (pool.length === 0 && remaining > 0) {
      gaps.push({ mealType: occasion.mealType, count: remaining });
    }
    for (let i = 0; i < remaining; i++) {
      slots.push({ mealType: occasion.mealType, recipeId: null });
    }
  }

  let best: { slots: Slot[]; evaluated: Evaluated } | null = null;

  for (let restart = 0; restart < restarts; restart++) {
    const rng = makeRng(seed + restart * 7919);
    const current = greedy(slots, byMealType, locked, prepared, input, eaters, rng);
    let currentEval = evaluate(current, locked, prepared, input, eaters);

    for (let i = 0; i < iterations; i++) {
      const slotIndex = Math.floor(rng() * current.length);
      if (!Number.isFinite(slotIndex) || current.length === 0) break;
      const slot = current[slotIndex];
      const pool = byMealType.get(slot.mealType) ?? [];
      if (pool.length < 2) continue;

      const replacement = pool[Math.floor(rng() * pool.length)];
      if (replacement.id === slot.recipeId) continue;

      const previous = slot.recipeId;
      slot.recipeId = replacement.id;
      const candidateEval = evaluate(current, locked, prepared, input, eaters);

      if (candidateEval.score < currentEval.score) {
        currentEval = candidateEval;
      } else {
        slot.recipeId = previous;
      }
    }

    if (best === null || currentEval.score < best.evaluated.score) {
      best = { slots: current.map((s) => ({ ...s })), evaluated: currentEval };
    }
  }

  const finalSlots = best?.slots ?? slots;
  const evaluated = best?.evaluated ?? evaluate(finalSlots, locked, prepared, input, eaters);

  return {
    cooks: buildCooks(finalSlots, locked, prepared, eaters),
    basket: evaluated.basket,
    breakdown: evaluated.breakdown,
    gaps,
    seed,
  };
}

/**
 * Greedy construction: fill each occasion with whichever recipe scores best
 * *given what is already in the basket*.
 *
 * This is where ingredient sharing actually happens. By the time the third
 * dinner is chosen, the onions for the first two are already paid for, so a
 * recipe that reuses them is genuinely cheaper at the margin and wins on its own
 * merits. Nothing in the scoring function mentions overlap.
 */
function greedy(
  template: Slot[],
  byMealType: Map<MealType, RecipeSpec[]>,
  locked: LockedCook[],
  prepared: Map<string, Prepared>,
  input: SolveInput,
  eaters: Eater[],
  rng: () => number,
): Slot[] {
  const slots = template.map((s) => ({ ...s }));

  // Shuffled fill order, so restarts explore genuinely different constructions
  // rather than the same one repeatedly.
  const order = slots.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }

  const unfilledByMealType = new Map<MealType, number>();
  for (const slot of slots) {
    unfilledByMealType.set(slot.mealType, (unfilledByMealType.get(slot.mealType) ?? 0) + 1);
  }

  const usedByMealType = new Map<MealType, Set<string>>();
  for (const lock of locked) {
    const mealType = prepared.get(lock.recipeId)?.recipe.mealType;
    if (!mealType) continue;
    const used = usedByMealType.get(mealType) ?? new Set<string>();
    used.add(lock.recipeId);
    usedByMealType.set(mealType, used);
  }

  for (const slotIndex of order) {
    const slot = slots[slotIndex];
    const all = byMealType.get(slot.mealType) ?? [];
    if (all.length === 0) continue;

    const used = usedByMealType.get(slot.mealType) ?? new Set<string>();
    const remaining = unfilledByMealType.get(slot.mealType) ?? 0;
    const stillNeeded = Math.max(0, (input.brief.minDistinct[slot.mealType] ?? 0) - used.size);

    // Repetition is always cheaper at the margin, so a greedy fill left to itself
    // will happily spend the whole week on one dish and pay the variety penalty.
    // Once there are exactly as many slots left as distinct recipes still owed,
    // the choice narrows to ones not yet used — which keeps the construction
    // feasible instead of relying on the penalty to claw it back afterwards.
    let pool = all;
    if (stillNeeded >= remaining) {
      const unused = all.filter((r) => !used.has(r.id));
      if (unused.length > 0) pool = unused;
    }

    let bestRecipeId: string | null = null;
    let bestScore = Number.POSITIVE_INFINITY;

    for (const recipe of pool) {
      slot.recipeId = recipe.id;
      const { score } = evaluate(slots, locked, prepared, input, eaters);
      if (score < bestScore) {
        bestScore = score;
        bestRecipeId = recipe.id;
      }
    }

    slot.recipeId = bestRecipeId;
    if (bestRecipeId) used.add(bestRecipeId);
    usedByMealType.set(slot.mealType, used);
    unfilledByMealType.set(slot.mealType, remaining - 1);
  }

  return slots;
}

function buildCooks(
  slots: Slot[],
  locked: LockedCook[],
  prepared: Map<string, Prepared>,
  eaters: Eater[],
): PlannedCook[] {
  const occasionsByRecipe = new Map<string, { occasions: number; isLocked: boolean }>();

  for (const lock of locked) {
    const existing = occasionsByRecipe.get(lock.recipeId);
    occasionsByRecipe.set(lock.recipeId, {
      occasions: (existing?.occasions ?? 0) + lock.occasions,
      isLocked: true,
    });
  }
  for (const slot of slots) {
    if (!slot.recipeId) continue;
    const existing = occasionsByRecipe.get(slot.recipeId);
    occasionsByRecipe.set(slot.recipeId, {
      occasions: (existing?.occasions ?? 0) + 1,
      isLocked: existing?.isLocked ?? false,
    });
  }

  const cooks: PlannedCook[] = [];
  for (const [recipeId, { occasions, isLocked }] of occasionsByRecipe) {
    const entry = prepared.get(recipeId);
    if (!entry) continue;
    const { recipe, portionFor } = entry;

    // A batch-friendly recipe is one cook filling several servings; anything else
    // is cooked afresh each time (spec §8.6).
    const cookCount = recipe.batchFriendly ? 1 : occasions;
    const perCook = recipe.batchFriendly ? occasions : 1;

    for (let c = 0; c < cookCount; c++) {
      const portions: PlannedPortion[] = [];
      for (let i = 0; i < perCook; i++) {
        for (const eater of eaters) {
          const portion = portionFor[eater];
          portions.push({
            eater,
            scaleFactor: Math.round(portion.scale * 1000) / 1000,
            macros: roundMacros(portion.macros),
            residualKcal: Math.round(portion.residualKcal),
          });
        }
      }
      cooks.push({
        recipeId,
        recipeName: recipe.name,
        mealType: recipe.mealType,
        isLocked,
        occasions: perCook,
        portions,
      });
    }
  }

  // Biggest cooks first: that is the order you would actually work in.
  cooks.sort((a, b) => b.occasions - a.occasions || a.recipeName.localeCompare(b.recipeName));
  return cooks;
}

/**
 * What dropping to fewer distinct recipes would save, so the variety control can
 * make the argument with a number rather than a shrug (spec §8.6).
 */
export function varietyTradeoff(
  input: SolveInput,
  mealType: MealType,
  from: number,
  to: number,
): { savingGbp: number; wasteSavingGbp: number } {
  const at = (distinct: number) =>
    solve({
      ...input,
      brief: { ...input.brief, minDistinct: { ...input.brief.minDistinct, [mealType]: distinct } },
      iterations: 200,
      restarts: 3,
    });

  const before = at(from);
  const after = at(to);
  return {
    savingGbp: round2(before.basket.totalCostGbp - after.basket.totalCostGbp),
    wasteSavingGbp: round2(before.basket.totalWasteGbp - after.basket.totalWasteGbp),
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
