import { describe, expect, it } from "vitest";
import { makeRng, solve, type SolveInput } from "../meal/optimiser";
import { buildEnvelopes } from "../meal/envelopes";
import type { Brief, IngredientSpec, RecipeSpec } from "../meal/types";

/// Fixtures are deliberately tiny and hand-checkable. The spec warns that an
/// optimiser tuned on seed data "will make choices that look fine and cook badly"
/// (§9) — so these tests assert the *mechanisms*, not the aesthetic quality of a
/// menu.

function ingredient(partial: Partial<IngredientSpec> & { id: string }): IngredientSpec {
  return {
    name: partial.id,
    aisle: "produce",
    isStaple: false,
    shelfLifeDays: 30,
    freezable: false,
    unitGrams: null,
    kcalPer100g: 100,
    proteinPer100g: 5,
    carbsPer100g: 10,
    fatPer100g: 2,
    packs: [],
    ...partial,
  };
}

const CHICKEN = ingredient({
  id: "chicken",
  aisle: "meat",
  shelfLifeDays: 3,
  freezable: true,
  kcalPer100g: 106,
  proteinPer100g: 24,
  carbsPer100g: 0,
  fatPer100g: 1.2,
  packs: [{ id: "chk-650", label: "650g pack", grams: 650, priceGbp: 5.5, isDivisible: false }],
});

const RICE = ingredient({
  id: "rice",
  aisle: "dry",
  shelfLifeDays: 365,
  kcalPer100g: 360,
  proteinPer100g: 7,
  carbsPer100g: 78,
  fatPer100g: 1,
  packs: [{ id: "rice-1k", label: "1kg", grams: 1000, priceGbp: 1.8, isDivisible: false }],
});

const ONION = ingredient({
  id: "onion",
  shelfLifeDays: 30,
  unitGrams: 110,
  kcalPer100g: 40,
  proteinPer100g: 1,
  carbsPer100g: 9,
  fatPer100g: 0.1,
  packs: [{ id: "onion-3", label: "pack of 3", grams: 330, priceGbp: 0.99, isDivisible: false }],
});

const BASIL = ingredient({
  id: "basil",
  shelfLifeDays: 2,
  kcalPer100g: 23,
  proteinPer100g: 3,
  carbsPer100g: 2,
  fatPer100g: 0.6,
  packs: [{ id: "basil-30", label: "30g pack", grams: 30, priceGbp: 1.5, isDivisible: false }],
});

const TOFU = ingredient({
  id: "tofu",
  aisle: "dairy",
  shelfLifeDays: 10,
  kcalPer100g: 120,
  proteinPer100g: 13,
  carbsPer100g: 2,
  fatPer100g: 7,
  packs: [{ id: "tofu-280", label: "280g", grams: 280, priceGbp: 2.2, isDivisible: false }],
});

const INGREDIENTS = [CHICKEN, RICE, ONION, BASIL, TOFU];

function recipe(partial: Partial<RecipeSpec> & { id: string; lines: RecipeSpec["lines"] }): RecipeSpec {
  return {
    name: partial.id,
    mealType: "dinner",
    prepMinutes: 30,
    isFavourite: false,
    batchFriendly: false,
    leftoversFreeze: false,
    keepsDays: 3,
    ...partial,
  };
}

const SETTINGS = {
  baseCalories: 2400,
  proteinTargetG: 160,
  partnerCalories: 1700,
  partnerProteinG: 110,
  splitBreakfast: 0.2,
  splitLunch: 0.26,
  splitDinner: 0.28,
  splitSnack: 0.26,
};

const ENVELOPES = buildEnvelopes(SETTINGS);

function brief(partial: Partial<Brief> = {}): Brief {
  return {
    weekStart: "2026-09-07",
    occasions: [{ mealType: "dinner", count: 4 }],
    minDistinct: {},
    cookConfidence: "likely",
    maxPrepMinutes: null,
    avoidIngredientIds: [],
    cooksForTwo: true,
    ...partial,
  };
}

function input(partial: Partial<SolveInput> = {}): SolveInput {
  return {
    brief: brief(),
    candidates: [],
    ingredients: INGREDIENTS,
    pantry: [],
    envelopes: ENVELOPES,
    seed: 42,
    ...partial,
  };
}

describe("makeRng", () => {
  it("is reproducible for a seed", () => {
    const a = makeRng(7);
    const b = makeRng(7);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });
});

describe("solve", () => {
  const chickenRice = recipe({
    id: "chicken-rice",
    name: "Chicken and rice",
    lines: [
      { ingredientId: "chicken", grams: 180, isScalable: true, minGrams: 120, maxGrams: 250 },
      { ingredientId: "rice", grams: 75, isScalable: true, minGrams: 50, maxGrams: 120 },
      { ingredientId: "onion", grams: 55, isScalable: false, minGrams: null, maxGrams: null },
    ],
  });

  const chickenOnionBake = recipe({
    id: "chicken-onion-bake",
    name: "Chicken and onion bake",
    lines: [
      { ingredientId: "chicken", grams: 170, isScalable: true, minGrams: 120, maxGrams: 250 },
      { ingredientId: "onion", grams: 110, isScalable: false, minGrams: null, maxGrams: null },
      { ingredientId: "rice", grams: 70, isScalable: true, minGrams: 50, maxGrams: 120 },
    ],
  });

  const basilTofu = recipe({
    id: "basil-tofu",
    name: "Basil tofu",
    lines: [
      { ingredientId: "tofu", grams: 200, isScalable: true, minGrams: 140, maxGrams: 280 },
      { ingredientId: "basil", grams: 8, isScalable: false, minGrams: null, maxGrams: null },
      { ingredientId: "rice", grams: 80, isScalable: true, minGrams: 50, maxGrams: 120 },
    ],
  });

  it("fills every occasion it has candidates for", () => {
    const solution = solve(
      input({ candidates: [chickenRice], brief: brief({ occasions: [{ mealType: "dinner", count: 3 }] }) }),
    );
    const occasions = solution.cooks.reduce((n, c) => n + c.occasions, 0);
    expect(occasions).toBe(3);
    expect(solution.gaps).toEqual([]);
  });

  it("reports a gap rather than inventing a meal when the library is empty", () => {
    const solution = solve(
      input({ candidates: [], brief: brief({ occasions: [{ mealType: "dinner", count: 2 }] }) }),
    );
    expect(solution.gaps).toEqual([{ mealType: "dinner", count: 2 }]);
    expect(solution.cooks).toEqual([]);
  });

  it("gives each eater their own portion of every cook", () => {
    const solution = solve(input({ candidates: [chickenRice] }));
    const portions = solution.cooks.flatMap((c) => c.portions);
    expect(portions.filter((p) => p.eater === "me").length).toBe(4);
    expect(portions.filter((p) => p.eater === "partner").length).toBe(4);

    const mine = portions.find((p) => p.eater === "me")!;
    const hers = portions.find((p) => p.eater === "partner")!;
    expect(hers.scaleFactor).toBeLessThan(mine.scaleFactor);
    expect(hers.macros.calories).toBeLessThan(mine.macros.calories);
  });

  it("cooks for one when the household is one", () => {
    const solution = solve(
      input({ candidates: [chickenRice], brief: brief({ cooksForTwo: false }) }),
    );
    expect(solution.cooks.flatMap((c) => c.portions).every((p) => p.eater === "me")).toBe(true);
  });

  it("prefers the recipe that reuses an ingredient already being bought", () => {
    // Both dinners are viable. chicken-onion-bake shares chicken, rice AND onions
    // with what is already in the basket; basil-tofu introduces two new packs, one
    // of them a herb that spoils in two days. Nothing in the scoring function
    // mentions overlap — this has to fall out of costing the basket (spec §8.4).
    const solution = solve(
      input({
        candidates: [chickenRice, chickenOnionBake, basilTofu],
        brief: brief({ occasions: [{ mealType: "dinner", count: 4 }] }),
      }),
    );
    const used = new Set(solution.cooks.map((c) => c.recipeId));
    expect(used.has("basil-tofu")).toBe(false);
  });

  it("will take the perishable recipe once its ingredients are already paid for", () => {
    // Same choice, but with the basil and tofu sitting in the pantry. The recipe
    // that was too expensive a moment ago is now the cheapest thing available,
    // and ignoring it would waste stock that expires this week.
    const solution = solve(
      input({
        candidates: [chickenRice, chickenOnionBake, basilTofu],
        pantry: [
          { ingredientId: "basil", grams: 30, expiresOn: "2026-09-09" },
          { ingredientId: "tofu", grams: 560, expiresOn: "2026-09-10" },
        ],
        horizonDayKey: "2026-09-14",
      }),
    );
    expect(solution.cooks.some((c) => c.recipeId === "basil-tofu")).toBe(true);
  });

  it("honours a variety floor even though repetition is cheaper", () => {
    const repetitive = solve(input({ candidates: [chickenRice, chickenOnionBake] }));
    const varied = solve(
      input({
        candidates: [chickenRice, chickenOnionBake],
        brief: brief({ minDistinct: { dinner: 2 } }),
      }),
    );
    expect(new Set(varied.cooks.map((c) => c.recipeId)).size).toBe(2);
    // And it costs something, which is the trade-off worth showing the user.
    expect(varied.breakdown.total).toBeGreaterThanOrEqual(repetitive.breakdown.total - 1e-9);
  });

  it("never moves or drops a locked cook", () => {
    const solution = solve(
      input({
        candidates: [chickenRice, chickenOnionBake, basilTofu],
        locked: [{ recipeId: "basil-tofu", occasions: 1 }],
        brief: brief({ occasions: [{ mealType: "dinner", count: 4 }] }),
      }),
    );
    const locked = solution.cooks.find((c) => c.recipeId === "basil-tofu");
    expect(locked).toBeDefined();
    expect(locked!.isLocked).toBe(true);
    // The lock consumes one of the four occasions rather than adding a fifth.
    expect(solution.cooks.reduce((n, c) => n + c.occasions, 0)).toBe(4);
  });

  it("excludes anything the week is meant to avoid", () => {
    const solution = solve(
      input({
        candidates: [chickenRice, chickenOnionBake, basilTofu],
        brief: brief({ avoidIngredientIds: ["chicken"] }),
      }),
    );
    expect(solution.cooks.every((c) => c.recipeId === "basil-tofu")).toBe(true);
  });

  it("collapses a batch-friendly recipe into a single cook", () => {
    const batch = recipe({ ...chickenRice, id: "batch", name: "Batch chilli", batchFriendly: true });
    const solution = solve(
      input({ candidates: [batch], brief: brief({ occasions: [{ mealType: "dinner", count: 4 }] }) }),
    );
    expect(solution.cooks).toHaveLength(1);
    expect(solution.cooks[0].occasions).toBe(4);
    expect(solution.cooks[0].portions).toHaveLength(8);
  });

  it("leans harder on recipes that survive a change of plan when the week is uncertain", () => {
    // The adaptation this build makes for irregular cooking: an unreliable week
    // should push the optimiser towards food that keeps, so being wrong is cheap.
    const perishable = recipe({
      id: "perishable",
      name: "Fresh basil dinner",
      lines: [
        { ingredientId: "tofu", grams: 200, isScalable: true, minGrams: 140, maxGrams: 280 },
        { ingredientId: "basil", grams: 20, isScalable: false, minGrams: null, maxGrams: null },
      ],
    });
    const robust = recipe({
      id: "robust",
      name: "Freezer chilli",
      leftoversFreeze: true,
      batchFriendly: true,
      lines: [
        { ingredientId: "tofu", grams: 200, isScalable: true, minGrams: 140, maxGrams: 280 },
        { ingredientId: "basil", grams: 20, isScalable: false, minGrams: null, maxGrams: null },
      ],
    });

    const shared = { candidates: [perishable, robust] };
    const certain = solve(input({ ...shared, brief: brief({ cookConfidence: "certain" }) }));
    const flexible = solve(input({ ...shared, brief: brief({ cookConfidence: "flexible" }) }));

    expect(flexible.breakdown.slippageRisk).toBeGreaterThan(certain.breakdown.slippageRisk);
    expect(flexible.cooks.every((c) => c.recipeId === "robust")).toBe(true);
  });

  it("will not let a cheap dish buy its way under the protein floor", () => {
    // The failure this guards against is real: at a gentle shortfall rate the
    // optimiser picked a 21g-protein curry over a 50g chilli because the curry
    // was cheaper, and quietly dragged a whole week under target.
    const cheapAndWeak = recipe({
      id: "weak",
      name: "Cheap low-protein dinner",
      lines: [
        { ingredientId: "rice", grams: 150, isScalable: true, minGrams: 100, maxGrams: 220 },
        { ingredientId: "onion", grams: 120, isScalable: false, minGrams: null, maxGrams: null },
      ],
    });
    const dearAndStrong = recipe({
      id: "strong",
      name: "Protein-led dinner",
      lines: [
        { ingredientId: "chicken", grams: 200, isScalable: true, minGrams: 140, maxGrams: 280 },
        { ingredientId: "rice", grams: 70, isScalable: true, minGrams: 45, maxGrams: 110 },
      ],
    });

    const solution = solve(input({ candidates: [cheapAndWeak, dearAndStrong] }));
    expect(solution.cooks.every((c) => c.recipeId === "strong")).toBe(true);
  });

  it("is deterministic for a seed and can be rerolled by changing it", () => {
    const a = solve(input({ candidates: [chickenRice, chickenOnionBake, basilTofu], seed: 5 }));
    const b = solve(input({ candidates: [chickenRice, chickenOnionBake, basilTofu], seed: 5 }));
    expect(a.cooks.map((c) => c.recipeId)).toEqual(b.cooks.map((c) => c.recipeId));
    expect(a.breakdown.total).toBe(b.breakdown.total);
  });

  it("solves a realistic week well inside a second", () => {
    const many = Array.from({ length: 24 }, (_, i) =>
      recipe({
        id: `r${i}`,
        name: `Recipe ${i}`,
        mealType: i % 3 === 0 ? "breakfast" : i % 3 === 1 ? "lunch" : "dinner",
        batchFriendly: i % 4 === 0,
        lines: [
          { ingredientId: "chicken", grams: 120 + i, isScalable: true, minGrams: 90, maxGrams: 250 },
          { ingredientId: "rice", grams: 60 + i, isScalable: true, minGrams: 40, maxGrams: 130 },
          { ingredientId: "onion", grams: 40 + (i % 5) * 10, isScalable: false, minGrams: null, maxGrams: null },
        ],
      }),
    );

    const started = Date.now();
    const solution = solve(
      input({
        candidates: many,
        brief: brief({
          occasions: [
            { mealType: "breakfast", count: 5 },
            { mealType: "lunch", count: 5 },
            { mealType: "dinner", count: 5 },
          ],
          minDistinct: { breakfast: 2, lunch: 2, dinner: 3 },
        }),
      }),
    );
    const elapsed = Date.now() - started;

    expect(solution.cooks.reduce((n, c) => n + c.occasions, 0)).toBe(15);
    expect(elapsed).toBeLessThan(1000);
  });
});
