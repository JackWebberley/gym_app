import { describe, expect, it } from "vitest";
import {
  indexIngredients,
  ingredientNeeds,
  mergeNeeds,
  portionMacros,
  scaleBounds,
  scaleForTarget,
} from "../meal/portions";
import { buildEnvelopes, normaliseSplits, splitsAreValid } from "../meal/envelopes";
import type { IngredientSpec, RecipeSpec } from "../meal/types";

function ingredient(partial: Partial<IngredientSpec> & { id: string }): IngredientSpec {
  return {
    name: partial.id,
    aisle: "dry",
    isStaple: false,
    shelfLifeDays: 30,
    freezable: false,
    unitGrams: null,
    kcalPer100g: 100,
    proteinPer100g: 0,
    carbsPer100g: 0,
    fatPer100g: 0,
    packs: [],
    ...partial,
  };
}

const CHICKEN = ingredient({
  id: "chicken",
  kcalPer100g: 106,
  proteinPer100g: 24,
  carbsPer100g: 0,
  fatPer100g: 1.2,
});
const RICE = ingredient({ id: "rice", kcalPer100g: 360, proteinPer100g: 7, carbsPer100g: 78, fatPer100g: 1 });
const VEG = ingredient({ id: "veg", kcalPer100g: 35, proteinPer100g: 2, carbsPer100g: 6, fatPer100g: 0.3 });
const OIL = ingredient({ id: "oil", isStaple: true, kcalPer100g: 884, fatPer100g: 100 });

const INDEX = indexIngredients([CHICKEN, RICE, VEG, OIL]);

/// The spec's own worked example (§8.5): chicken 180g scalable 120–250,
/// rice 75g dry scalable 50–120, veg and oil fixed.
const TRAYBAKE: RecipeSpec = {
  id: "traybake",
  name: "Chicken, rice and roasted veg",
  mealType: "dinner",
  prepMinutes: 35,
  isFavourite: false,
  batchFriendly: true,
  leftoversFreeze: false,
  keepsDays: 3,
  lines: [
    { ingredientId: "chicken", grams: 180, isScalable: true, minGrams: 120, maxGrams: 250 },
    { ingredientId: "rice", grams: 75, isScalable: true, minGrams: 50, maxGrams: 120 },
    { ingredientId: "veg", grams: 200, isScalable: false, minGrams: null, maxGrams: null },
    { ingredientId: "oil", grams: 10, isScalable: false, minGrams: null, maxGrams: null },
  ],
};

describe("scaleBounds", () => {
  it("takes the tightest constraint on each side", () => {
    // chicken allows 0.667–1.389, rice allows 0.667–1.6 → the intersection.
    const bounds = scaleBounds(TRAYBAKE);
    expect(bounds.min).toBeCloseTo(120 / 180, 3);
    expect(bounds.max).toBeCloseTo(250 / 180, 3);
  });

  it("pins a recipe with nothing scalable at exactly 1", () => {
    const fixed: RecipeSpec = {
      ...TRAYBAKE,
      lines: TRAYBAKE.lines.map((l) => ({ ...l, isScalable: false })),
    };
    expect(scaleBounds(fixed)).toEqual({ min: 1, max: 1 });
  });
});

describe("scaleForTarget", () => {
  it("hits a target inside the scalable range", () => {
    const target = 700;
    const scaled = scaleForTarget(TRAYBAKE, INDEX, target);
    expect(scaled.clamped).toBe(false);
    expect(scaled.macros.calories).toBeCloseTo(target, 6);
    expect(Math.abs(scaled.residualKcal)).toBeLessThan(1);
  });

  it("covers both people's dinners from one dish", () => {
    // The whole point of §8.5: 670 for me and 480 for her, same recipe.
    const mine = scaleForTarget(TRAYBAKE, INDEX, 670);
    const hers = scaleForTarget(TRAYBAKE, INDEX, 480);
    expect(mine.clamped).toBe(false);
    expect(hers.clamped).toBe(false);
    expect(hers.scale).toBeLessThan(mine.scale);
    expect(hers.macros.calories).toBeCloseTo(480, 6);
  });

  it("reports a clamp rather than pretending a dish stretches further than it does", () => {
    const scaled = scaleForTarget(TRAYBAKE, INDEX, 3000);
    expect(scaled.clamped).toBe(true);
    expect(scaled.scale).toBeCloseTo(250 / 180, 3);
    expect(scaled.residualKcal).toBeLessThan(0);
  });

  it("cannot go below the fixed components", () => {
    // Veg and oil alone are ~158 kcal, so a 100 kcal envelope is unreachable and
    // the residual has to say so.
    const scaled = scaleForTarget(TRAYBAKE, INDEX, 100);
    expect(scaled.clamped).toBe(true);
    expect(scaled.residualKcal).toBeGreaterThan(0);
  });
});

describe("ingredientNeeds", () => {
  it("multiplies fixed lines per portion and scalable lines by the scale sum", () => {
    // This is the rule that makes cooking for two buy 1.65 portions of chicken
    // but two portions of oil.
    const needs = ingredientNeeds(TRAYBAKE, [1, 0.65]);
    expect(needs.get("chicken")).toBeCloseTo(180 * 1.65, 6);
    expect(needs.get("rice")).toBeCloseTo(75 * 1.65, 6);
    expect(needs.get("veg")).toBeCloseTo(400, 6);
    expect(needs.get("oil")).toBeCloseTo(20, 6);
  });

  it("is empty for no portions", () => {
    expect(ingredientNeeds(TRAYBAKE, []).size).toBe(0);
  });

  it("buys less than two full portions for two unequal eaters", () => {
    const unequal = ingredientNeeds(TRAYBAKE, [1, 0.65]).get("chicken")!;
    const equal = ingredientNeeds(TRAYBAKE, [1, 1]).get("chicken")!;
    expect(unequal).toBeLessThan(equal);
  });
});

describe("mergeNeeds", () => {
  it("sums the same ingredient across cooks — the basis of the shared-pack saving", () => {
    const merged = mergeNeeds([
      new Map([["chicken", 300]]),
      new Map([
        ["chicken", 200],
        ["rice", 150],
      ]),
    ]);
    expect(merged.get("chicken")).toBe(500);
    expect(merged.get("rice")).toBe(150);
  });
});

describe("portionMacros", () => {
  it("scales only the scalable lines", () => {
    const base = portionMacros(TRAYBAKE, INDEX, 1);
    const half = portionMacros(TRAYBAKE, INDEX, 0.5);
    const fixedOnly = 200 * 0.35 + 10 * 8.84;
    expect(half.calories).toBeCloseTo(fixedOnly + (base.calories - fixedOnly) * 0.5, 6);
  });
});

describe("envelopes", () => {
  const settings = {
    baselineCalories: 2400,
    proteinTargetG: 160,
    partnerCalories: 1700,
    partnerProteinG: 110,
    splitBreakfast: 0.2,
    splitLunch: 0.26,
    splitDinner: 0.28,
    splitSnack: 0.26,
  };

  it("gives each eater their own share of their own day", () => {
    const table = buildEnvelopes(settings);
    expect(table.me.dinner.targetKcal).toBeCloseTo(672, 6);
    expect(table.partner.dinner.targetKcal).toBeCloseTo(476, 6);
  });

  it("treats protein as a floor rather than a band", () => {
    const table = buildEnvelopes(settings);
    // Near the full share of the day, not a generous discount — a floor a weak
    // meal can clear is not doing any work.
    expect(table.me.dinner.minProteinG).toBeCloseTo(160 * 0.28 * 0.95, 6);
    expect(table.me.dinner.maxKcal).toBeGreaterThan(table.me.dinner.targetKcal);
  });

  it("catches splits that no longer divide a day", () => {
    expect(splitsAreValid(settings)).toBe(true);
    expect(splitsAreValid({ ...settings, splitSnack: 0.4 })).toBe(false);
  });

  it("normalises drifting splits without changing their ratios", () => {
    const drifted = { ...settings, splitSnack: 0.4 };
    const fixed = normaliseSplits(drifted);
    expect(splitsAreValid(fixed)).toBe(true);
    expect(fixed.splitDinner / fixed.splitLunch).toBeCloseTo(0.28 / 0.26, 6);
  });
});
