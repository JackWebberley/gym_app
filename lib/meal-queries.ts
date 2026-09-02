import { db } from "./db";
import { todayKey, shiftDayKey } from "./day";
import { buildEnvelopes, normaliseSplits, type HouseholdSettings } from "./meal/envelopes";
import type { IngredientSpec, MealType, PantryStock, RecipeSpec } from "./meal/types";
import { isConfigured } from "./anthropic-config";

/// Read models for the meal screens. Everything that turns database rows into the
/// plain shapes lib/meal works on lives here, so the pure modules never import
/// Prisma and stay testable on fixtures.

const SETTINGS_ID = "singleton";

async function settingsRow() {
  const existing = await db.settings.findUnique({ where: { id: SETTINGS_ID } });
  return existing ?? (await db.settings.create({ data: { id: SETTINGS_ID } }));
}

export async function getHouseholdSettings(): Promise<HouseholdSettings> {
  const settings = await settingsRow();

  // Splits that no longer divide a day would quietly rescale every envelope, so
  // they are normalised on read rather than trusted.
  return normaliseSplits({
    baseCalories: settings.baseCalories,
    proteinTargetG: settings.proteinTargetG,
    partnerCalories: settings.partnerCalories,
    partnerProteinG: settings.partnerProteinG,
    splitBreakfast: settings.splitBreakfast,
    splitLunch: settings.splitLunch,
    splitDinner: settings.splitDinner,
    splitSnack: settings.splitSnack,
  });
}

export async function getCooksForTwo(): Promise<boolean> {
  return (await settingsRow()).cooksForTwo;
}

export async function getIngredientSpecs(): Promise<IngredientSpec[]> {
  const rows = await db.ingredient.findMany({ include: { packs: true }, orderBy: { name: "asc" } });
  return rows.map((i) => ({
    id: i.id,
    name: i.name,
    aisle: i.aisle,
    isStaple: i.isStaple,
    shelfLifeDays: i.shelfLifeDays,
    freezable: i.freezable,
    unitGrams: i.unitGrams,
    kcalPer100g: i.kcalPer100g,
    proteinPer100g: i.proteinPer100g,
    carbsPer100g: i.carbsPer100g,
    fatPer100g: i.fatPer100g,
    packs: i.packs.map((p) => ({
      id: p.id,
      label: p.label,
      grams: p.grams,
      priceGbp: p.priceGbp,
      isDivisible: p.isDivisible,
    })),
  }));
}

export async function getRecipeSpecs(): Promise<RecipeSpec[]> {
  const rows = await db.recipe.findMany({
    where: { isArchived: false },
    include: { items: { orderBy: { order: "asc" } } },
    orderBy: { name: "asc" },
  });
  return rows.map(toRecipeSpec);
}

type RecipeRow = {
  id: string;
  name: string;
  mealType: string;
  prepMinutes: number;
  isFavourite: boolean;
  batchFriendly: boolean;
  leftoversFreeze: boolean;
  keepsDays: number;
  items: {
    ingredientId: string;
    grams: number;
    isScalable: boolean;
    minGrams: number | null;
    maxGrams: number | null;
  }[];
};

export function toRecipeSpec(recipe: RecipeRow): RecipeSpec {
  return {
    id: recipe.id,
    name: recipe.name,
    mealType: recipe.mealType as MealType,
    prepMinutes: recipe.prepMinutes,
    isFavourite: recipe.isFavourite,
    batchFriendly: recipe.batchFriendly,
    leftoversFreeze: recipe.leftoversFreeze,
    keepsDays: recipe.keepsDays,
    lines: recipe.items.map((i) => ({
      ingredientId: i.ingredientId,
      grams: i.grams,
      isScalable: i.isScalable,
      minGrams: i.minGrams,
      maxGrams: i.maxGrams,
    })),
  };
}

export async function getPantryStock(): Promise<PantryStock[]> {
  const rows = await db.pantryItem.findMany({ orderBy: { expiresOn: "asc" } });
  return rows.map((p) => ({ ingredientId: p.ingredientId, grams: p.grams, expiresOn: p.expiresOn }));
}

/** Everything the optimiser needs, in one round trip. */
export async function getPlanningContext() {
  const [settings, cooksForTwo, ingredients, recipes, pantry] = await Promise.all([
    getHouseholdSettings(),
    getCooksForTwo(),
    getIngredientSpecs(),
    getRecipeSpecs(),
    getPantryStock(),
  ]);

  return {
    settings,
    cooksForTwo,
    ingredients,
    recipes,
    pantry,
    envelopes: buildEnvelopes(settings),
  };
}

/* ── The pool ──────────────────────────────────────────────────────────────── */

export type PoolPortion = {
  id: string;
  recipeName: string;
  mealType: MealType;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  scaleFactor: number;
  /** Cooked already and sitting in the fridge, versus still to be cooked. */
  isCooked: boolean;
  expiresOn: string | null;
  /** Days until it expires; negative means it already has. */
  daysLeft: number | null;
  prepMinutes: number;
  cookId: string;
  /** How many of my servings this cook still has left, cooked or not. */
  siblingCount: number;
};

/**
 * What is available to eat right now.
 *
 * This is the screen that replaces the spec's weekly calendar: rather than "it is
 * Tuesday so eat the chilli", it is "here is what exists, and here is what fits
 * what you have left today".
 */
export async function getPool(dayKey: string = todayKey()): Promise<PoolPortion[]> {
  const portions = await db.portion.findMany({
    where: {
      eater: "me",
      status: "planned",
      cook: { menu: { status: { in: ["confirmed", "shopped"] } } },
    },
    include: { cook: { include: { recipe: true } } },
  });

  const remainingByCook = new Map<string, number>();
  for (const p of portions) {
    remainingByCook.set(p.menuCookId, (remainingByCook.get(p.menuCookId) ?? 0) + 1);
  }

  return portions
    .map((p) => {
      const daysLeft = p.expiresOn ? daysBetween(dayKey, p.expiresOn) : null;
      return {
        id: p.id,
        recipeName: p.cook.recipe.name,
        mealType: p.cook.recipe.mealType as MealType,
        calories: p.calories,
        proteinG: p.proteinG,
        carbsG: p.carbsG,
        fatG: p.fatG,
        scaleFactor: p.scaleFactor,
        isCooked: p.cook.cookedAt != null,
        expiresOn: p.expiresOn,
        daysLeft,
        prepMinutes: p.cook.recipe.prepMinutes,
        cookId: p.menuCookId,
        siblingCount: remainingByCook.get(p.menuCookId) ?? 1,
      };
    })
    .sort((a, b) => {
      // Cooked food first — it is about to go off and needs no work.
      if (a.isCooked !== b.isCooked) return a.isCooked ? -1 : 1;
      if (a.daysLeft != null && b.daysLeft != null) return a.daysLeft - b.daysLeft;
      return a.recipeName.localeCompare(b.recipeName);
    });
}

function daysBetween(from: string, to: string): number {
  const parse = (key: string) => {
    const [y, m, d] = key.split("-").map(Number);
    return new Date(y, m - 1, d, 12).getTime();
  };
  return Math.round((parse(to) - parse(from)) / 86_400_000);
}

/* ── Menus ─────────────────────────────────────────────────────────────────── */

/**
 * The plan the hub and the pool read from.
 *
 * Falls back to the most recent when nothing is flagged active — a plan created
 * before plans were switchable, or one left behind by a delete.
 */
export async function getCurrentMenu() {
  const active = await db.menu.findFirst({
    where: { isActive: true },
    select: { id: true, name: true, weekStart: true, status: true },
  });
  if (active) return active;

  return db.menu.findFirst({
    orderBy: [{ createdAt: "desc" }],
    select: { id: true, name: true, weekStart: true, status: true },
  });
}

/**
 * Recipes the last few plans already used.
 *
 * Without this every week re-solves the same question against the same library
 * and converges on the same cheapest handful — the plan is "optimal" and you eat
 * gammon four times running. Feeding recent history back in rotates the library
 * without anyone having to curate it.
 */
export async function getRecentRecipeIds(menus = 3): Promise<string[]> {
  const recent = await db.menu.findMany({
    orderBy: { createdAt: "desc" },
    take: menus,
    select: { cooks: { select: { recipeId: true } } },
  });
  return [...new Set(recent.flatMap((m) => m.cooks.map((c) => c.recipeId)))];
}

export type PlanSummary = Awaited<ReturnType<typeof getMenuList>>[number];

/** Every plan, for the switcher. */
export async function getMenuList() {
  const menus = await db.menu.findMany({
    orderBy: [{ isActive: "desc" }, { createdAt: "desc" }],
    select: {
      id: true,
      name: true,
      weekStart: true,
      status: true,
      isActive: true,
      createdAt: true,
      estimatedCostGbp: true,
      projectedWasteGbp: true,
      _count: { select: { cooks: true } },
    },
  });

  return menus.map((m) => ({
    id: m.id,
    name: m.name ?? `Week of ${m.weekStart}`,
    weekStart: m.weekStart,
    status: m.status as "draft" | "confirmed" | "shopped",
    isActive: m.isActive,
    createdAt: m.createdAt.toISOString(),
    estimatedCostGbp: m.estimatedCostGbp,
    projectedWasteGbp: m.projectedWasteGbp,
    cookCount: m._count.cooks,
  }));
}

export type MenuScreen = NonNullable<Awaited<ReturnType<typeof getMenuScreen>>>;

export async function getMenuScreen(menuId: string) {
  const menu = await db.menu.findUnique({
    where: { id: menuId },
    include: {
      cooks: {
        orderBy: { order: "asc" },
        include: {
          recipe: { include: { items: { include: { ingredient: true }, orderBy: { order: "asc" } } } },
          portions: true,
        },
      },
    },
  });
  if (!menu) return null;

  const brief = safeParseBrief(menu.briefJson);

  // A recipe that does not batch produces one cook per meal, so the same name
  // appears several times. Numbering them ("cook 2 of 3") is the difference
  // between that reading as intentional and reading as a bug.
  const totalByRecipe = new Map<string, number>();
  for (const cook of menu.cooks) {
    totalByRecipe.set(cook.recipeId, (totalByRecipe.get(cook.recipeId) ?? 0) + 1);
  }
  const seenByRecipe = new Map<string, number>();

  return {
    id: menu.id,
    name: menu.name ?? `Week of ${menu.weekStart}`,
    isActive: menu.isActive,
    weekStart: menu.weekStart,
    status: menu.status as "draft" | "confirmed" | "shopped",
    estimatedCostGbp: menu.estimatedCostGbp,
    projectedWasteGbp: menu.projectedWasteGbp,
    brief,
    cooks: menu.cooks.map((cook) => {
      const repeatTotal = totalByRecipe.get(cook.recipeId) ?? 1;
      const repeatIndex = (seenByRecipe.get(cook.recipeId) ?? 0) + 1;
      seenByRecipe.set(cook.recipeId, repeatIndex);
      const mine = cook.portions.filter((p) => p.eater === "me");
      const theirs = cook.portions.filter((p) => p.eater === "partner");
      return {
        id: cook.id,
        recipeId: cook.recipeId,
        name: cook.recipe.name,
        mealType: cook.recipe.mealType as MealType,
        prepMinutes: cook.recipe.prepMinutes,
        batchFriendly: cook.recipe.batchFriendly,
        leftoversFreeze: cook.recipe.leftoversFreeze,
        keepsDays: cook.recipe.keepsDays,
        method: cook.recipe.method,
        isLocked: cook.isLocked,
        cookedAt: cook.cookedAt?.toISOString() ?? null,
        /// Which of several separate cooks of the same dish this is, and how many
        /// there are. Both 1 when the recipe appears once.
        repeatIndex,
        repeatTotal,
        servingsForMe: mine.length,
        servingsForPartner: theirs.length,
        eaten: cook.portions.filter((p) => p.status === "eaten").length,
        myPortion: mine[0]
          ? {
              calories: mine[0].calories,
              proteinG: mine[0].proteinG,
              scaleFactor: mine[0].scaleFactor,
            }
          : null,
        theirPortion: theirs[0]
          ? {
              calories: theirs[0].calories,
              proteinG: theirs[0].proteinG,
              scaleFactor: theirs[0].scaleFactor,
            }
          : null,
        ingredients: cook.recipe.items.map((item) => ({
          name: item.ingredient.name,
          grams: item.grams,
          isScalable: item.isScalable,
          minGrams: item.minGrams,
          maxGrams: item.maxGrams,
          note: item.note,
        })),
      };
    }),
  };
}

export type ShoppingScreen = NonNullable<Awaited<ReturnType<typeof getShoppingList>>>;

export async function getShoppingList(menuId: string) {
  const menu = await db.menu.findUnique({
    where: { id: menuId },
    include: {
      shoppingLines: {
        include: { ingredient: true, packSize: true },
        orderBy: [{ ingredient: { aisle: "asc" } }, { ingredient: { name: "asc" } }],
      },
    },
  });
  if (!menu) return null;

  const toBuy = menu.shoppingLines.filter((l) => !l.ingredient.isStaple && l.gramsBought > 0);
  const fromPantry = menu.shoppingLines.filter((l) => l.gramsFromPantry > 0);
  const staples = menu.shoppingLines.filter((l) => l.ingredient.isStaple);

  const byAisle = new Map<string, typeof toBuy>();
  for (const line of toBuy) {
    const list = byAisle.get(line.ingredient.aisle) ?? [];
    list.push(line);
    byAisle.set(line.ingredient.aisle, list);
  }

  return {
    menuId: menu.id,
    status: menu.status as "draft" | "confirmed" | "shopped",
    weekStart: menu.weekStart,
    estimatedCostGbp: menu.estimatedCostGbp,
    projectedWasteGbp: menu.projectedWasteGbp,
    tickedCount: toBuy.filter((l) => l.isTicked).length,
    totalCount: toBuy.length,
    aisles: [...byAisle.entries()].map(([aisle, lines]) => ({
      aisle,
      lines: lines.map((line) => ({
        id: line.id,
        name: line.ingredient.name,
        unitGrams: line.ingredient.unitGrams,
        packLabel: line.packSize?.label ?? null,
        packCount: line.packCount,
        gramsNeeded: line.gramsNeeded,
        gramsBought: line.gramsBought,
        surplusGrams: line.surplusGrams,
        priceGbp: line.priceGbp,
        wasteCostGbp: line.wasteCostGbp,
        isTicked: line.isTicked,
        needsPackData: line.packSizeId === null && line.priceGbp === null,
        shelfLifeDays: line.ingredient.shelfLifeDays,
      })),
    })),
    fromPantry: fromPantry.map((l) => ({
      name: l.ingredient.name,
      grams: l.gramsFromPantry,
    })),
    staples: staples.map((l) => ({ name: l.ingredient.name, grams: l.gramsNeeded })),
  };
}

/* ── Library and pantry screens ────────────────────────────────────────────── */

export async function getRecipeLibrary() {
  const recipes = await db.recipe.findMany({
    where: { isArchived: false },
    include: { items: { include: { ingredient: true }, orderBy: { order: "asc" } } },
    orderBy: [{ isFavourite: "desc" }, { timesCooked: "desc" }, { name: "asc" }],
  });

  return recipes.map((r) => ({
    id: r.id,
    name: r.name,
    mealType: r.mealType as MealType,
    prepMinutes: r.prepMinutes,
    isFavourite: r.isFavourite,
    batchFriendly: r.batchFriendly,
    leftoversFreeze: r.leftoversFreeze,
    timesCooked: r.timesCooked,
    source: r.source,
    method: r.method,
    ingredients: r.items.map((i) => ({
      name: i.ingredient.name,
      grams: i.grams,
      isScalable: i.isScalable,
      minGrams: i.minGrams,
      maxGrams: i.maxGrams,
      note: i.note,
    })),
  }));
}

export async function getPantryScreen(dayKey: string = todayKey()) {
  const items = await db.pantryItem.findMany({
    include: { ingredient: true },
    orderBy: { expiresOn: "asc" },
  });

  const soon = shiftDayKey(dayKey, 5);

  return items.map((item) => ({
    id: item.id,
    name: item.ingredient.name,
    aisle: item.ingredient.aisle,
    unitGrams: item.ingredient.unitGrams,
    grams: item.grams,
    expiresOn: item.expiresOn,
    daysLeft: daysBetween(dayKey, item.expiresOn),
    isExpired: item.expiresOn < dayKey,
    isExpiringSoon: item.expiresOn >= dayKey && item.expiresOn <= soon,
    source: item.source,
  }));
}

export async function getIngredientsNeedingReview() {
  return db.ingredient.findMany({
    where: { needsReview: true },
    include: { packs: true },
    orderBy: { name: "asc" },
  });
}

export async function countMealLibrary() {
  const [recipes, ingredients, pantry] = await Promise.all([
    db.recipe.count({ where: { isArchived: false } }),
    db.ingredient.count(),
    db.pantryItem.count(),
  ]);
  return { recipes, ingredients, pantry };
}

/** Whether recipe generation is available at all, so the UI can say so up front. */
export function isGenerationConfigured(): boolean {
  return isConfigured();
}

/* ── Brief serialisation ───────────────────────────────────────────────────── */

import type { Brief } from "./meal/types";
import { DEFAULT_BRIEF } from "./meal/types";

export function safeParseBrief(json: string): Brief {
  try {
    const parsed = JSON.parse(json) as Partial<Brief>;
    return {
      ...DEFAULT_BRIEF,
      weekStart: todayKey(),
      ...parsed,
    } as Brief;
  } catch {
    return { ...DEFAULT_BRIEF, weekStart: todayKey() };
  }
}
