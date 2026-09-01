/// Cooking quantities in, shop quantities out.
///
/// Recipes consume half a lemon; shops sell lemons in threes. Everything
/// expensive about meal planning lives in that gap (spec §8.1), and this module
/// is the only place that crosses it.

import type { PackSpec } from "./types";

export type PackChoice = {
  packId: string | null;
  label: string;
  count: number;
  gramsBought: number;
  priceGbp: number | null;
  surplusGrams: number;
};

export const NOTHING_TO_BUY: PackChoice = {
  packId: null,
  label: "—",
  count: 0,
  gramsBought: 0,
  priceGbp: 0,
  surplusGrams: 0,
};

/// A single line never needs more than this many packs. Bounds the search and
/// catches a recipe that has asked for an absurd quantity.
const MAX_PACKS_PER_TYPE = 8;
const MAX_PACKS_TOTAL = 10;

function pricePerGram(pack: PackSpec): number | null {
  if (pack.priceGbp == null || pack.grams <= 0) return null;
  return pack.priceGbp / pack.grams;
}

/**
 * Cheapest way to cover `gramsNeeded`.
 *
 * Divisible packs (loose potatoes, deli counter) are the easy case: buy exactly
 * what is needed and there is no surplus at all. Everything else is a small
 * bounded search over combinations, because mixing a 650g pack with a 300g one is
 * often cheaper than two 650s and is what a person would actually do.
 *
 * Ranked on price, then on surplus, then on fewest packs. Surplus is the
 * tie-breaker rather than the objective on purpose: how much a surplus *costs* is
 * a question about perishability, and that is scored separately in basket.ts.
 */
export function cheapestPacks(packs: PackSpec[], gramsNeeded: number): PackChoice | null {
  if (gramsNeeded <= 0) return NOTHING_TO_BUY;
  if (packs.length === 0) return null;

  let best: PackChoice | null = null;

  // Divisible packs short-circuit the search: there is never a reason to buy more
  // than the exact requirement.
  for (const pack of packs) {
    if (!pack.isDivisible) continue;
    const perGram = pricePerGram(pack);
    const candidate: PackChoice = {
      packId: pack.id,
      label: pack.label,
      count: 1,
      gramsBought: gramsNeeded,
      priceGbp: perGram == null ? null : round2(perGram * gramsNeeded),
      surplusGrams: 0,
    };
    if (isBetter(candidate, best)) best = candidate;
  }

  const indivisible = packs.filter((p) => !p.isDivisible && p.grams > 0);
  if (indivisible.length > 0) {
    const combo = searchCombinations(indivisible, gramsNeeded);
    if (combo && isBetter(combo, best)) best = combo;
  }

  return best;
}

type Combination = { counts: number[]; grams: number; price: number | null };

function searchCombinations(packs: PackSpec[], gramsNeeded: number): PackChoice | null {
  let best: Combination | null = null;

  const counts = new Array<number>(packs.length).fill(0);

  const recurse = (index: number, grams: number, price: number | null, used: number) => {
    if (grams >= gramsNeeded) {
      const candidate: Combination = { counts: [...counts], grams, price };
      if (isBetterCombination(candidate, best)) best = candidate;
      return;
    }
    if (index >= packs.length || used >= MAX_PACKS_TOTAL) return;

    const pack = packs[index];
    // Never need more of one pack than covers the whole requirement on its own.
    const ceiling = Math.min(
      MAX_PACKS_PER_TYPE,
      MAX_PACKS_TOTAL - used,
      Math.ceil(gramsNeeded / pack.grams),
    );

    for (let n = 0; n <= ceiling; n++) {
      counts[index] = n;
      const addedPrice =
        pack.priceGbp == null ? null : (price == null ? null : price + pack.priceGbp * n);
      recurse(index + 1, grams + pack.grams * n, n === 0 ? price : addedPrice, used + n);
    }
    counts[index] = 0;
  };

  recurse(0, 0, 0, 0);

  if (best === null) return null;
  const winner = best as Combination;

  const parts: string[] = [];
  let totalCount = 0;
  let singlePackId: string | null = null;
  winner.counts.forEach((n, i) => {
    if (n === 0) return;
    totalCount += n;
    singlePackId = packs[i].id;
    parts.push(n === 1 ? packs[i].label : `${n} × ${packs[i].label}`);
  });

  return {
    // Only meaningful when one pack type was chosen; a mixed line is described by
    // its label instead and the shopping row shows that text.
    packId: parts.length === 1 ? singlePackId : null,
    label: parts.join(" + ") || "—",
    count: totalCount,
    gramsBought: winner.grams,
    priceGbp: winner.price == null ? null : round2(winner.price),
    surplusGrams: round2(winner.grams - gramsNeeded),
  };
}

function isBetterCombination(a: Combination, b: Combination | null): boolean {
  if (b === null) return true;
  // An unpriced combination never displaces a priced one — a missing price is
  // ignorance, not zero.
  if (a.price != null && b.price != null && a.price !== b.price) return a.price < b.price;
  if (a.price != null && b.price == null) return true;
  if (a.price == null && b.price != null) return false;
  if (a.grams !== b.grams) return a.grams < b.grams;
  const aCount = a.counts.reduce((x, y) => x + y, 0);
  const bCount = b.counts.reduce((x, y) => x + y, 0);
  return aCount < bCount;
}

function isBetter(a: PackChoice, b: PackChoice | null): boolean {
  if (b === null) return true;
  if (a.priceGbp != null && b.priceGbp != null && a.priceGbp !== b.priceGbp) {
    return a.priceGbp < b.priceGbp;
  }
  if (a.priceGbp != null && b.priceGbp == null) return true;
  if (a.priceGbp == null && b.priceGbp != null) return false;
  if (a.surplusGrams !== b.surplusGrams) return a.surplusGrams < b.surplusGrams;
  return a.count < b.count;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Human-readable quantity for the shopping list — "6 (~1.1kg)" beats "1080g". */
export function describeQuantity(grams: number, unitGrams: number | null): string {
  if (unitGrams && unitGrams > 0) {
    const units = Math.round(grams / unitGrams);
    if (units >= 1) return `${units} (~${formatGrams(grams)})`;
  }
  return formatGrams(grams);
}

export function formatGrams(grams: number): string {
  if (grams >= 1000) return `${(grams / 1000).toFixed(grams % 1000 === 0 ? 0 : 1)}kg`;
  return `${Math.round(grams)}g`;
}
