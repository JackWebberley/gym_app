import { describe, expect, it } from "vitest";
import { INGREDIENTS } from "../../prisma/seed-ingredients";
import { EXTENDED_INGREDIENTS } from "../../prisma/seed-ingredients-extended";
import { HIGH_PROTEIN_RECIPES } from "../../prisma/seed-recipes";
import { buildEnvelopes } from "../meal/envelopes";
import { indexIngredients, portionMacros, scaleBounds } from "../meal/portions";
import type { IngredientSpec, MealType, RecipeSpec } from "../meal/types";

/// The recipe library makes three promises that are easy to break by hand and
/// impossible to spot by eye across 100 entries: the protein is genuinely high,
/// every dinner contains meat, and the numbers are computed from real ingredient
/// data rather than guessed. These check all three against the same macro engine
/// the app uses, so a mistyped gram figure fails here rather than turning up in a
/// week's shopping.

const ALL = [...INGREDIENTS, ...EXTENDED_INGREDIENTS];

const SPECS: IngredientSpec[] = ALL.map((i) => ({
  id: i.name,
  name: i.name,
  aisle: i.aisle,
  isStaple: i.isStaple ?? false,
  shelfLifeDays: i.shelfLifeDays,
  freezable: i.freezable ?? false,
  unitGrams: i.unitGrams ?? null,
  kcalPer100g: i.per100g[0],
  proteinPer100g: i.per100g[1],
  carbsPer100g: i.per100g[2],
  fatPer100g: i.per100g[3],
  packs: i.packs.map((p, n) => ({
    id: `${i.name}-${n}`,
    label: p.label,
    grams: p.grams,
    priceGbp: p.priceGbp ?? null,
    isDivisible: p.isDivisible ?? false,
  })),
}));

const INDEX = indexIngredients(SPECS);
const KNOWN = new Set(SPECS.map((s) => s.name));

/// Land meat. Fish and seafood are deliberately not on this list: the rule is
/// that every dinner contains meat, and fish is what provides variety alongside
/// it rather than in place of it.
const MEAT = new Set([
  "Chicken breast",
  "Chicken thigh (boneless)",
  "Chicken mince",
  "Chicken sausages",
  "Chicken drumsticks",
  "Turkey mince (5% fat)",
  "Turkey breast steak",
  "Beef mince (5% fat)",
  "Beef rump steak",
  "Stewing beef",
  "Pork loin steak",
  "Pork mince (10% fat)",
  "Pork tenderloin",
  "Gammon steak",
  "Lamb mince (10% fat)",
  "Lamb leg steak",
  "Duck breast",
  "Bacon medallions",
  "Chorizo",
  "Sausages",
  "Sliced ham",
  "Pancetta",
]);

/// Well above the envelope floors, which is the point of the library. The
/// envelope floor for a dinner is ~38g; these clear 45g before any scaling.
const PROTEIN_FLOOR: Record<MealType, number> = {
  breakfast: 29,
  lunch: 39,
  dinner: 44,
  snack: 10,
};

const SETTINGS = {
  baselineCalories: 2400,
  proteinTargetG: 160,
  partnerCalories: 1700,
  partnerProteinG: 110,
  splitBreakfast: 0.2,
  splitLunch: 0.26,
  splitDinner: 0.28,
  splitSnack: 0.26,
};

const ENVELOPES = buildEnvelopes(SETTINGS);

function toSpec(recipe: (typeof HIGH_PROTEIN_RECIPES)[number]): RecipeSpec {
  return {
    id: recipe.name,
    name: recipe.name,
    mealType: recipe.mealType,
    prepMinutes: recipe.prepMinutes,
    isFavourite: false,
    batchFriendly: recipe.batchFriendly ?? false,
    leftoversFreeze: recipe.leftoversFreeze ?? false,
    keepsDays: recipe.keepsDays ?? 3,
    lines: recipe.lines.map((l) => ({
      ingredientId: l.n,
      grams: l.g,
      isScalable: Boolean(l.scale),
      minGrams: l.scale?.[0] ?? null,
      maxGrams: l.scale?.[1] ?? null,
    })),
  };
}

describe("the recipe library", () => {
  it("has 100 recipes, split 20 / 30 / 50", () => {
    expect(HIGH_PROTEIN_RECIPES).toHaveLength(100);
    const byType = (t: MealType) => HIGH_PROTEIN_RECIPES.filter((r) => r.mealType === t).length;
    expect(byType("breakfast")).toBe(20);
    expect(byType("lunch")).toBe(30);
    expect(byType("dinner")).toBe(50);
  });

  it("gives every recipe a distinct name", () => {
    const names = HIGH_PROTEIN_RECIPES.map((r) => r.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("names only ingredients that exist", () => {
    // A name that does not resolve is silently dropped at seed time, so the
    // recipe would arrive costed on partial ingredients — worse than absent.
    const unknown: string[] = [];
    for (const recipe of HIGH_PROTEIN_RECIPES) {
      for (const line of recipe.lines) {
        if (!KNOWN.has(line.n)) unknown.push(`${recipe.name} → ${line.n}`);
      }
    }
    expect(unknown).toEqual([]);
  });
});

describe("protein", () => {
  it("clears the floor for its meal type in a single base portion", () => {
    const short: string[] = [];
    for (const recipe of HIGH_PROTEIN_RECIPES) {
      const macros = portionMacros(toSpec(recipe), INDEX, 1);
      const floor = PROTEIN_FLOOR[recipe.mealType];
      if (macros.proteinG < floor) {
        short.push(`${recipe.name} (${recipe.mealType}): ${macros.proteinG.toFixed(1)}g < ${floor}g`);
      }
    }
    expect(short).toEqual([]);
  });

  it("puts at least a quarter of every dinner's calories into protein", () => {
    // 4 kcal per gram, so this is the check that a dish is protein-led rather
    // than just large.
    const weak: string[] = [];
    for (const recipe of HIGH_PROTEIN_RECIPES.filter((r) => r.mealType === "dinner")) {
      const macros = portionMacros(toSpec(recipe), INDEX, 1);
      const share = (macros.proteinG * 4) / macros.calories;
      if (share < 0.25) weak.push(`${recipe.name}: ${(share * 100).toFixed(0)}%`);
    }
    expect(weak).toEqual([]);
  });
});

describe("calories", () => {
  it("sizes a base portion near the envelope it is for", () => {
    // Not a hard requirement — the optimiser scales — but a recipe that is
    // wildly off is usually a typo in a gram figure, and this is the only place
    // that would catch it.
    const off: string[] = [];
    for (const recipe of HIGH_PROTEIN_RECIPES) {
      const macros = portionMacros(toSpec(recipe), INDEX, 1);
      const target = ENVELOPES.me[recipe.mealType].targetKcal;
      const ratio = macros.calories / target;
      if (ratio < 0.7 || ratio > 1.3) {
        off.push(`${recipe.name}: ${Math.round(macros.calories)} vs ${Math.round(target)} target`);
      }
    }
    expect(off).toEqual([]);
  });
});

describe("the meat rule", () => {
  it("puts meat in every single dinner", () => {
    const missing = HIGH_PROTEIN_RECIPES.filter(
      (r) => r.mealType === "dinner" && !r.lines.some((l) => MEAT.has(l.n)),
    ).map((r) => r.name);
    expect(missing).toEqual([]);
  });

  it("puts meat in most lunches, but not all", () => {
    const lunches = HIGH_PROTEIN_RECIPES.filter((r) => r.mealType === "lunch");
    const withMeat = lunches.filter((r) => r.lines.some((l) => MEAT.has(l.n)));
    expect(withMeat.length / lunches.length).toBeGreaterThanOrEqual(0.6);
    // "Rarely" is not "never" — the meat-free lunches are what carry the fish,
    // egg and dairy variety.
    expect(withMeat.length).toBeLessThan(lunches.length);
  });
});

describe("variety", () => {
  it("spreads dinners across many different meats", () => {
    const used = new Set<string>();
    for (const recipe of HIGH_PROTEIN_RECIPES.filter((r) => r.mealType === "dinner")) {
      for (const line of recipe.lines) if (MEAT.has(line.n)) used.add(line.n);
    }
    expect(used.size).toBeGreaterThanOrEqual(12);
  });

  it("gets fish and seafood onto the menu across the week", () => {
    const seafood = new Set([
      "Salmon fillet",
      "Cod fillet",
      "Haddock fillet",
      "Sea bass fillet",
      "Mackerel fillet",
      "Smoked mackerel",
      "Smoked salmon",
      "Tinned tuna",
      "Tinned salmon",
      "Tinned sardines",
      "King prawns",
      "Squid rings",
      "Mussels",
      "Tinned crab meat",
    ]);
    const withFish = HIGH_PROTEIN_RECIPES.filter((r) => r.lines.some((l) => seafood.has(l.n)));
    expect(withFish.length).toBeGreaterThanOrEqual(10);
    // Including dinners, via the meat-and-seafood dishes.
    expect(withFish.filter((r) => r.mealType === "dinner").length).toBeGreaterThanOrEqual(3);
  });

  it("reuses ingredients heavily, which is what the optimiser needs", () => {
    const uses = new Map<string, number>();
    for (const recipe of HIGH_PROTEIN_RECIPES) {
      for (const line of recipe.lines) uses.set(line.n, (uses.get(line.n) ?? 0) + 1);
    }
    // A library of 100 unrelated dishes gives the optimiser no overlap to find.
    const shared = [...uses.values()].filter((n) => n >= 5).length;
    expect(shared).toBeGreaterThanOrEqual(25);
  });
});

describe("scalable components", () => {
  it("gives every scalable line a range that contains its base amount", () => {
    const broken: string[] = [];
    for (const recipe of HIGH_PROTEIN_RECIPES) {
      for (const line of recipe.lines) {
        if (!line.scale) continue;
        const [min, max] = line.scale;
        if (min > line.g || max < line.g || min >= max) {
          broken.push(`${recipe.name} → ${line.n}: ${min}–${max} around ${line.g}`);
        }
      }
    }
    expect(broken).toEqual([]);
  });

  it("leaves every recipe enough room to serve both eaters", () => {
    // Her dinner envelope is ~476 kcal against my ~672. A dish whose bounds
    // cannot reach both is one the planner has to clamp, which shows up as a
    // portion that misses its target.
    const tooRigid: string[] = [];
    for (const recipe of HIGH_PROTEIN_RECIPES) {
      const spec = toSpec(recipe);
      const bounds = scaleBounds(spec);
      const low = portionMacros(spec, INDEX, bounds.min).calories;
      const hers = ENVELOPES.partner[recipe.mealType].targetKcal;
      if (low > hers * 1.15) {
        tooRigid.push(`${recipe.name}: floor ${Math.round(low)} vs her ${Math.round(hers)}`);
      }
    }
    expect(tooRigid).toEqual([]);
  });
});
