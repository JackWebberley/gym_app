/// The shop for a whole menu, and what it will waste.
///
/// The important thing about this module is the level it works at: a *basket*,
/// never a recipe. Cost one recipe at a time and one onion means buying a pack of
/// three; cost the week at once and a second onion-using recipe is free. That is
/// the entire mechanism by which the optimiser learns to share ingredients — no
/// rule anywhere says "prefer overlap", it just falls out of pricing the shop
/// instead of the dish (spec §8.4).

import { cheapestPacks, type PackChoice } from "./packs";
import type { IngredientSpec, PantryStock } from "./types";

/// How far ahead surplus has to survive to count as usable next week.
export const DEFAULT_HORIZON_DAYS = 7;

export type BasketLine = {
  ingredientId: string;
  name: string;
  aisle: string;
  isStaple: boolean;
  gramsNeeded: number;
  gramsFromPantry: number;
  gramsToBuy: number;
  pack: PackChoice | null;
  gramsBought: number;
  surplusGrams: number;
  priceGbp: number | null;
  wasteCostGbp: number;
  /// True when we hold no pack data at all, so the line is a guess and the user
  /// is asked for pack sizes once (spec §8.9).
  needsPackData: boolean;
};

export type Basket = {
  lines: BasketLine[];
  totalCostGbp: number;
  totalWasteGbp: number;
  /// Value of stock consumed from the pantry — money the shop did not have to spend.
  pantrySavingGbp: number;
  /// Value of pantry stock that will expire unused inside the horizon. Charged, so
  /// a plan that ignores what is already in the fridge scores worse than one that
  /// uses it.
  pantryRotGbp: number;
  /// Lines with no pack data, so the user can be prompted once.
  unknownIngredientIds: string[];
};

/**
 * How much of a surplus is genuinely lost.
 *
 * The nuance the spec insists on (§8.4): waste is about perishability, not pack
 * size. A 2.5kg bag of potatoes carries a large surplus that costs almost
 * nothing, because it keeps for a month and gets eaten. A 100g pack of fresh
 * basil bought for one recipe is a near-total loss. Conflating the two produces
 * bad plans — it makes the optimiser fight the potato bag and ignore the basil.
 */
export function wasteWeight(
  ingredient: Pick<IngredientSpec, "isStaple" | "freezable" | "shelfLifeDays">,
  horizonDays = DEFAULT_HORIZON_DAYS,
): number {
  if (ingredient.isStaple) return 0;
  if (ingredient.freezable) return 0.15;
  if (ingredient.shelfLifeDays >= horizonDays) return 0.3;
  return 1;
}

function pricePerGram(ingredient: IngredientSpec): number | null {
  const priced = ingredient.packs.filter((p) => p.priceGbp != null && p.grams > 0);
  if (priced.length === 0) return null;
  // Cheapest unit price available, which is the rate a surplus is fairly valued at.
  return Math.min(...priced.map((p) => p.priceGbp! / p.grams));
}

export type BasketOptions = {
  horizonDays?: number;
  /** "YYYY-MM-DD" — pantry items expiring on or before this are at risk. */
  horizonDayKey?: string;
};

/**
 * Prices a set of ingredient requirements against the pantry and the shop.
 *
 * Pantry stock is allocated earliest-expiry-first, so a plan that uses the feta
 * about to turn is scored better than one that opens a new block.
 */
export function buildBasket(
  needs: Map<string, number>,
  ingredients: IngredientSpec[],
  pantry: PantryStock[],
  options: BasketOptions = {},
): Basket {
  const horizonDays = options.horizonDays ?? DEFAULT_HORIZON_DAYS;
  const index = new Map(ingredients.map((i) => [i.id, i]));

  const available = new Map<string, number>();
  for (const item of [...pantry].sort((a, b) => a.expiresOn.localeCompare(b.expiresOn))) {
    available.set(item.ingredientId, (available.get(item.ingredientId) ?? 0) + item.grams);
  }

  const lines: BasketLine[] = [];
  let totalCostGbp = 0;
  let totalWasteGbp = 0;
  let pantrySavingGbp = 0;
  const unknownIngredientIds: string[] = [];

  for (const [ingredientId, rawNeeded] of needs) {
    const ingredient = index.get(ingredientId);
    const gramsNeeded = round2(rawNeeded);
    if (!ingredient || gramsNeeded <= 0) continue;

    const stock = available.get(ingredientId) ?? 0;
    const gramsFromPantry = Math.min(gramsNeeded, stock);
    available.set(ingredientId, stock - gramsFromPantry);
    const gramsToBuy = round2(gramsNeeded - gramsFromPantry);

    const perGram = pricePerGram(ingredient);
    if (perGram != null) pantrySavingGbp += gramsFromPantry * perGram;

    // Staples are assumed present and never costed (spec §8.2). They still get a
    // line so the shopping list can list them as a check-your-cupboard reminder.
    if (ingredient.isStaple) {
      lines.push({
        ingredientId,
        name: ingredient.name,
        aisle: ingredient.aisle,
        isStaple: true,
        gramsNeeded,
        gramsFromPantry,
        gramsToBuy,
        pack: null,
        gramsBought: 0,
        surplusGrams: 0,
        priceGbp: null,
        wasteCostGbp: 0,
        needsPackData: false,
      });
      continue;
    }

    const pack = cheapestPacks(ingredient.packs, gramsToBuy);
    const needsPackData = pack === null;
    if (needsPackData) unknownIngredientIds.push(ingredientId);

    const gramsBought = pack?.gramsBought ?? gramsToBuy;
    const surplusGrams = Math.max(0, round2(gramsBought - gramsToBuy));
    const priceGbp = pack?.priceGbp ?? null;

    const wasteCostGbp =
      perGram == null
        ? 0
        : round2(surplusGrams * perGram * wasteWeight(ingredient, horizonDays));

    if (priceGbp != null) totalCostGbp += priceGbp;
    totalWasteGbp += wasteCostGbp;

    lines.push({
      ingredientId,
      name: ingredient.name,
      aisle: ingredient.aisle,
      isStaple: false,
      gramsNeeded,
      gramsFromPantry,
      gramsToBuy,
      pack,
      gramsBought,
      surplusGrams,
      priceGbp,
      wasteCostGbp,
      needsPackData,
    });
  }

  // Anything left in the pantry that expires before the horizon is money about to
  // be thrown away. Charging it is what makes the optimiser reach for stock it
  // already has rather than treating the pantry as free-but-optional.
  let pantryRotGbp = 0;
  if (options.horizonDayKey) {
    const consumed = new Map<string, number>();
    for (const line of lines) {
      consumed.set(line.ingredientId, (consumed.get(line.ingredientId) ?? 0) + line.gramsFromPantry);
    }
    const remainingByIngredient = new Map<string, number>();
    for (const item of pantry) {
      if (item.expiresOn > options.horizonDayKey) continue;
      remainingByIngredient.set(
        item.ingredientId,
        (remainingByIngredient.get(item.ingredientId) ?? 0) + item.grams,
      );
    }
    for (const [ingredientId, grams] of remainingByIngredient) {
      const ingredient = index.get(ingredientId);
      if (!ingredient || ingredient.isStaple) continue;
      const perGram = pricePerGram(ingredient);
      if (perGram == null) continue;
      const unused = Math.max(0, grams - (consumed.get(ingredientId) ?? 0));
      pantryRotGbp += unused * perGram * (ingredient.freezable ? 0.15 : 1);
    }
  }

  lines.sort((a, b) => a.aisle.localeCompare(b.aisle) || a.name.localeCompare(b.name));

  return {
    lines,
    totalCostGbp: round2(totalCostGbp),
    totalWasteGbp: round2(totalWasteGbp),
    pantrySavingGbp: round2(pantrySavingGbp),
    pantryRotGbp: round2(pantryRotGbp),
    unknownIngredientIds,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
