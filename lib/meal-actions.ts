"use server";

import { revalidatePath } from "next/cache";
import { db } from "./db";
import { formatDayKey, isValidDayKey, shiftDayKey, todayKey } from "./day";
import { getOrCreateDay } from "./nutrition-queries";
import {
  getCooksForTwo,
  getHouseholdSettings,
  getPantryStock,
  getPlanningContext,
  getRecentRecipeIds,
  safeParseBrief,
  toRecipeSpec,
} from "./meal-queries";
import { buildEnvelopes } from "./meal/envelopes";
import { canonicaliseSteps, parseFullMethod } from "./meal/method";
import { solve, type LockedCook } from "./meal/optimiser";
import { WORTH_KEEPING_GRAMS, buildBasket } from "./meal/basket";
import { ingredientNeeds, mergeNeeds, roundMacros, scaleForTarget, indexIngredients } from "./meal/portions";
import { cheapestPacks } from "./meal/packs";
import {
  generateRecipes,
  normaliseIngredientName,
  resolveIngredientName,
  writeFullMethod,
  type GenerationRequest,
} from "./meal/generate";
import { MissingApiKeyError } from "./anthropic-config";
import type { Brief, Eater, FullMethod, IngredientSpec, MealType, RecipeSpec } from "./meal/types";

/// Every meal-planning mutation. The optimiser itself is pure and lives in
/// lib/meal; this file is the part that talks to the database and to Next.

/// Revalidation is not free. On Workers the whole server action — the queries,
/// the writes, the revalidation and the re-render it triggers — runs inside one
/// CPU budget, and re-rendering three routes when one changed is most of that
/// budget spent on nothing. Marking a meal cooked does not move a single calorie,
/// so it has no business re-rendering the dashboard.
/// The menu and shopping screens are where most of these actions are invoked
/// from, and they were not being revalidated at all — the write landed, the page
/// kept rendering the old tree, and the button looked dead.
///
/// Concrete paths, not `revalidatePath("/meals/[id]", "page")`. The dynamic form
/// needs the route's cache entry to exist, and this app configures no incremental
/// cache (every route is force-dynamic), so on Workers that call throws and the
/// whole action returns a 500 — which the client shows as React error 441.
function revalidateMeals(menuId?: string) {
  revalidatePath("/meals");
  if (menuId) {
    revalidatePath(`/meals/${menuId}`);
    revalidatePath(`/meals/${menuId}/shopping`);
  }
}

/// The pool is visible on Food as well as Meals.
function revalidatePool(menuId?: string) {
  revalidateMeals(menuId);
  revalidatePath("/food");
}

/// Something was actually eaten, so the day's totals and the dashboard moved.
function revalidateLog(menuId?: string) {
  revalidatePool(menuId);
  revalidatePath("/");
}

/* ── Planning ──────────────────────────────────────────────────────────────── */

export type PlanResult =
  | { kind: "ok"; menuId: string; generated: number; gaps: { mealType: MealType; count: number }[] }
  | { kind: "error"; message: string };

/**
 * Builds a menu.
 *
 * Two tiers, in order (spec §8.3): the recipe library first, and the model only
 * for what the library genuinely could not cover. A well-stocked library reaches
 * the API zero times, which is the normal case after a few weeks rather than a
 * degraded one.
 */
export async function planMenu(input: {
  brief: Brief;
  allowGeneration: boolean;
  seed?: number;
  /** What to call this plan. Defaults to the week it was built for. */
  name?: string;
}): Promise<PlanResult> {
  const brief = input.brief;
  if (!isValidDayKey(brief.weekStart)) return { kind: "error", message: "Invalid week start." };

  try {
    let context = await getPlanningContext();
    let generated = 0;

    if (input.allowGeneration) {
      const shortfall = shortfallByMealType(brief, context.recipes);
      if (shortfall.length > 0) {
        // Generation is a top-up, not a prerequisite. The plan screen no longer
        // offers a switch for it, so a missing API key — or any failure reaching
        // the model — must fall back to planning from the library rather than
        // taking the whole week down with it.
        try {
          generated = await topUpLibrary(brief, shortfall, context);
          if (generated > 0) context = await getPlanningContext();
        } catch (e) {
          console.error(
            "Recipe generation failed; planning from the library only:",
            e instanceof Error ? e.message : String(e),
          );
        }
      }
    }

    const seed = input.seed ?? Math.floor(Math.random() * 1_000_000);
    const recentRecipeIds = await getRecentRecipeIds();
    const solution = solve({
      brief: { ...brief, cooksForTwo: context.cooksForTwo },
      candidates: context.recipes,
      ingredients: context.ingredients,
      pantry: context.pantry,
      envelopes: context.envelopes,
      recentRecipeIds,
      seed,
      horizonDayKey: shiftDayKey(brief.weekStart, 7),
    });

    // Plans are kept, not consumed. Creating one makes it the active plan and
    // leaves every earlier plan intact to switch back to — an unshopped draft is
    // still worth keeping, and a shopped one is a record of what you bought.
    await db.menu.updateMany({ where: { isActive: true }, data: { isActive: false } });

    const menu = await db.menu.create({
      data: {
        name: input.name?.trim() || `Week of ${formatDayKey(brief.weekStart)}`,
        weekStart: brief.weekStart,
        isActive: true,
        status: "draft",
        briefJson: JSON.stringify({ ...brief, seed }),
        estimatedCostGbp: solution.basket.totalCostGbp,
        projectedWasteGbp: solution.basket.totalWasteGbp,
        cooks: {
          create: solution.cooks.map((cook, order) => ({
            recipeId: cook.recipeId,
            order,
            isLocked: cook.isLocked,
            portions: {
              create: cook.portions.map((portion) => ({
                eater: portion.eater,
                scaleFactor: portion.scaleFactor,
                calories: portion.macros.calories,
                proteinG: portion.macros.proteinG,
                carbsG: portion.macros.carbsG,
                fatG: portion.macros.fatG,
              })),
            },
          })),
        },
      },
    });

    revalidatePool(menu.id);
    return { kind: "ok", menuId: menu.id, generated, gaps: solution.gaps };
  } catch (e) {
    if (e instanceof MissingApiKeyError) return { kind: "error", message: e.message };
    return { kind: "error", message: e instanceof Error ? e.message : "Could not build a menu." };
  }
}

/**
 * What the library cannot cover.
 *
 * Only counts distinct recipes, not occasions: five dinners from three recipes is
 * fine and cheaper, so the shortfall is measured against the variety floor rather
 * than the meal count (spec §8.6).
 */
function shortfallByMealType(
  brief: Brief,
  recipes: RecipeSpec[],
): { mealType: MealType; count: number }[] {
  const shortfall: { mealType: MealType; count: number }[] = [];
  for (const occasion of brief.occasions) {
    if (occasion.count <= 0) continue;
    const available = recipes.filter((r) => r.mealType === occasion.mealType).length;
    const wanted = Math.max(brief.minDistinct[occasion.mealType] ?? 1, 1);
    if (available < wanted) shortfall.push({ mealType: occasion.mealType, count: wanted - available });
  }
  return shortfall;
}

/** Asks for the missing recipes, biased at the basket we are already buying. */
async function topUpLibrary(
  brief: Brief,
  shortfall: { mealType: MealType; count: number }[],
  context: Awaited<ReturnType<typeof getPlanningContext>>,
): Promise<number> {
  const committed = new Set<string>();
  for (const recipe of context.recipes) {
    for (const line of recipe.lines) committed.add(line.ingredientId);
  }

  const avoidNames = context.ingredients
    .filter((i) => brief.avoidIngredientIds.includes(i.id))
    .map((i) => i.name);

  const request: GenerationRequest = {
    need: shortfall.map((s) => {
      const envelope = context.envelopes.me[s.mealType];
      return {
        mealType: s.mealType,
        count: s.count,
        targetKcal: envelope.targetKcal,
        minProteinG: envelope.minProteinG,
      };
    }),
    known: context.ingredients,
    committedIngredientIds: [...committed],
    pantryIngredientIds: context.pantry.map((p) => p.ingredientId),
    avoidIngredientNames: avoidNames,
    maxPrepMinutes: brief.maxPrepMinutes,
  };

  const generation = await generateRecipes(request);

  // New ingredients first, so the recipes that reference them resolve. They are
  // flagged for review: the model's pack guess is a starting point, not a fact
  // (spec §8.9).
  const known = [...context.ingredients];
  for (const fresh of generation.new_ingredients) {
    if (resolveIngredientName(fresh.name, known)) continue;
    const created = await db.ingredient.create({
      data: {
        name: fresh.name,
        aisle: fresh.aisle,
        isStaple: fresh.is_staple,
        shelfLifeDays: fresh.shelf_life_days,
        freezable: fresh.freezable,
        unitGrams: fresh.unit_grams,
        kcalPer100g: fresh.kcal_per_100g,
        proteinPer100g: fresh.protein_per_100g,
        carbsPer100g: fresh.carbs_per_100g,
        fatPer100g: fresh.fat_per_100g,
        needsReview: true,
        packs: {
          create: [
            {
              label: fresh.typical_pack.label,
              grams: fresh.typical_pack.grams,
              priceGbp: fresh.typical_pack.price_gbp,
              isDivisible: fresh.typical_pack.is_divisible,
            },
          ],
        },
      },
      include: { packs: true },
    });
    known.push({
      id: created.id,
      name: created.name,
      aisle: created.aisle,
      isStaple: created.isStaple,
      shelfLifeDays: created.shelfLifeDays,
      freezable: created.freezable,
      unitGrams: created.unitGrams,
      kcalPer100g: created.kcalPer100g,
      proteinPer100g: created.proteinPer100g,
      carbsPer100g: created.carbsPer100g,
      fatPer100g: created.fatPer100g,
      packs: created.packs.map((p) => ({
        id: p.id,
        label: p.label,
        grams: p.grams,
        priceGbp: p.priceGbp,
        isDivisible: p.isDivisible,
      })),
    });
  }

  let saved = 0;
  for (const recipe of generation.recipes) {
    if (await db.recipe.findUnique({ where: { name: recipe.name } })) continue;

    const lines = recipe.ingredients
      .map((line) => ({ line, ingredient: resolveIngredientName(line.ingredient, known) }))
      .filter((entry): entry is { line: typeof entry.line; ingredient: IngredientSpec } =>
        entry.ingredient !== null,
      );

    // A recipe we cannot fully resolve would be costed on partial ingredients,
    // which is worse than not having it. Drop it rather than plan around a lie.
    if (lines.length !== recipe.ingredients.length || lines.length === 0) continue;

    await db.recipe.create({
      data: {
        name: recipe.name,
        mealType: recipe.meal_type,
        prepMinutes: recipe.prep_minutes,
        method: recipe.method,
        batchFriendly: recipe.batch_friendly,
        leftoversFreeze: recipe.leftovers_freeze,
        keepsDays: recipe.keeps_days,
        source: "llm",
        items: {
          create: lines.map(({ line, ingredient }, order) => ({
            ingredientId: ingredient.id,
            order,
            grams: line.grams,
            isScalable: line.is_scalable,
            minGrams: line.is_scalable ? line.min_grams : null,
            maxGrams: line.is_scalable ? line.max_grams : null,
            note: line.note,
          })),
        },
      },
    });
    saved++;
  }

  return saved;
}

/** Re-solves the same brief with a new seed, keeping locked cooks in place. */
export async function rerollMenu(menuId: string): Promise<PlanResult> {
  const menu = await db.menu.findUnique({
    where: { id: menuId },
    include: { cooks: { include: { portions: true } } },
  });
  if (!menu) return { kind: "error", message: "That menu no longer exists." };
  if (menu.status !== "draft") {
    return { kind: "error", message: "Only a draft menu can be rerolled." };
  }

  const brief = safeParseBrief(menu.briefJson);
  const locked: LockedCook[] = menu.cooks
    .filter((c) => c.isLocked)
    .map((c) => ({
      recipeId: c.recipeId,
      occasions: c.portions.filter((p) => p.eater === "me").length,
    }));

  const context = await getPlanningContext();
  const seed = Math.floor(Math.random() * 1_000_000);
  // Skip the most recent plan: it is the one being rerolled, and counting its own
  // recipes as "recent" would just penalise everything currently on screen.
  const recentRecipeIds = (await getRecentRecipeIds(4)).filter(
    (id) => !menu.cooks.some((c) => c.recipeId === id),
  );

  const solution = solve({
    brief: { ...brief, cooksForTwo: context.cooksForTwo },
    candidates: context.recipes,
    ingredients: context.ingredients,
    pantry: context.pantry,
    envelopes: context.envelopes,
    recentRecipeIds,
    locked,
    seed,
    horizonDayKey: shiftDayKey(brief.weekStart, 7),
  });

  await db.$transaction([
    db.menuCook.deleteMany({ where: { menuId, isLocked: false } }),
    db.menu.update({
      where: { id: menuId },
      data: {
        briefJson: JSON.stringify({ ...brief, seed }),
        estimatedCostGbp: solution.basket.totalCostGbp,
        projectedWasteGbp: solution.basket.totalWasteGbp,
      },
    }),
  ]);

  // Locked cooks survived the delete, so only the unlocked ones are re-created.
  const fresh = solution.cooks.filter((c) => !c.isLocked);
  for (const [order, cook] of fresh.entries()) {
    await db.menuCook.create({
      data: {
        menuId,
        recipeId: cook.recipeId,
        order: order + locked.length,
        isLocked: false,
        portions: {
          create: cook.portions.map((p) => ({
            eater: p.eater,
            scaleFactor: p.scaleFactor,
            calories: p.macros.calories,
            proteinG: p.macros.proteinG,
            carbsG: p.macros.carbsG,
            fatG: p.macros.fatG,
          })),
        },
      },
    });
  }

  revalidatePool(menuId);
  return { kind: "ok", menuId, generated: 0, gaps: solution.gaps };
}

export async function toggleCookLock(cookId: string) {
  const cook = await db.menuCook.findUnique({ where: { id: cookId } });
  if (!cook) return;
  await db.menuCook.update({ where: { id: cookId }, data: { isLocked: !cook.isLocked } });
  revalidateMeals(cook.menuId);
}

/** Swaps one cook for a different recipe, keeping its serving count. */
export async function swapCook(input: { cookId: string; recipeId: string }) {
  const cook = await db.menuCook.findUnique({
    where: { id: input.cookId },
    include: { portions: true },
  });
  if (!cook) throw new Error("That cook is no longer in the menu.");

  const recipe = await db.recipe.findUnique({
    where: { id: input.recipeId },
    include: { items: { orderBy: { order: "asc" } } },
  });
  if (!recipe) throw new Error("That recipe no longer exists.");

  // Only the incoming recipe's own ingredients are needed to scale it — not the
  // whole library, which is what this used to load to swap a single dish.
  const [settings, cooksForTwo, rows] = await Promise.all([
    getHouseholdSettings(),
    getCooksForTwo(),
    db.ingredient.findMany({
      where: { id: { in: recipe.items.map((i) => i.ingredientId) } },
    }),
  ]);

  const envelopes = buildEnvelopes(settings);
  const index = indexIngredients(
    rows.map((i) => ({
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
      packs: [],
    })),
  );
  const spec = toRecipeSpec(recipe);

  const occasions = cook.portions.filter((p) => p.eater === "me").length;
  const eaters: Eater[] = cooksForTwo ? ["me", "partner"] : ["me"];

  await db.$transaction([
    db.portion.deleteMany({ where: { menuCookId: cook.id } }),
    db.menuCook.update({ where: { id: cook.id }, data: { recipeId: recipe.id } }),
  ]);

  const fresh = [];
  for (let i = 0; i < occasions; i++) {
    for (const eater of eaters) {
      const envelope = envelopes[eater][spec.mealType];
      const scaled = scaleForTarget(spec, index, envelope.targetKcal);
      const macros = roundMacros(scaled.macros);
      fresh.push({
        menuCookId: cook.id,
        eater,
        scaleFactor: Math.round(scaled.scale * 1000) / 1000,
        calories: macros.calories,
        proteinG: macros.proteinG,
        carbsG: macros.carbsG,
        fatG: macros.fatG,
      });
    }
  }
  // One insert, not one per portion: each round trip is a serialised hop to the
  // database from the Worker.
  if (fresh.length > 0) await db.portion.createMany({ data: fresh });

  await recostMenu(cook.menuId);
  revalidatePool(cook.menuId);
}

export async function deleteMenu(menuId: string) {
  const menu = await db.menu.findUnique({ where: { id: menuId } });
  await db.menu.delete({ where: { id: menuId } }).catch(() => {});

  // Never leave the app with no active plan while others still exist, or the hub
  // shows an empty state next to a list of perfectly good plans.
  if (menu?.isActive) {
    const next = await db.menu.findFirst({ orderBy: { createdAt: "desc" } });
    if (next) await db.menu.update({ where: { id: next.id }, data: { isActive: true } });
  }
  revalidatePool();
}

/** Switches which plan the hub and the pool read from. */
export async function activateMenu(menuId: string) {
  const menu = await db.menu.findUnique({ where: { id: menuId } });
  if (!menu) throw new Error("That plan no longer exists.");

  await db.$transaction([
    db.menu.updateMany({ where: { isActive: true }, data: { isActive: false } }),
    db.menu.update({ where: { id: menuId }, data: { isActive: true } }),
  ]);
  revalidatePool(menuId);
}

export async function renameMenu(input: { menuId: string; name: string }) {
  const name = input.name.trim();
  if (!name) throw new Error("Give the plan a name.");
  await db.menu.update({ where: { id: input.menuId }, data: { name } });
  revalidatePool(input.menuId);
}

/**
 * Removes one cook from a plan, and its servings with it.
 *
 * The shop is left as it was on purpose: once a plan is confirmed, the list is
 * what you actually shopped from, and silently rewriting it would misrepresent
 * what you bought. Re-confirm to rebuild it around the change.
 */
export async function deleteCook(cookId: string) {
  try {
    return await deleteCookInner(cookId);
  } catch (e) {
    // Server action failures reach the browser as an opaque digest, so the only
    // way to see what actually broke is to put it in the Worker's logs.
    console.error("deleteCook failed:", e instanceof Error ? `${e.name}: ${e.message}` : String(e));
    console.error("deleteCook stack:", e instanceof Error ? (e.stack || "").slice(0, 900) : "");
    throw e;
  }
}

async function deleteCookInner(cookId: string) {
  const cook = await db.menuCook.findUnique({ where: { id: cookId } });
  if (!cook) return;
  await db.menuCook.delete({ where: { id: cookId } });
  if (cook.menuId) await recostMenu(cook.menuId);
  revalidatePool(cook.menuId);
}

/**
 * Group-level actions.
 *
 * The menu screen folds repeats of the same dish into one row, so its buttons
 * act on the dish rather than on one of three identical cards. Doing that by
 * looping the per-cook actions from the client would be N round trips against a
 * database in Frankfurt; these are one each.
 */
export async function deleteCookGroup(input: { menuId: string; recipeId: string }) {
  const { count } = await db.menuCook.deleteMany({
    where: { menuId: input.menuId, recipeId: input.recipeId },
  });
  if (count === 0) return;
  await recostMenu(input.menuId);
  revalidatePool(input.menuId);
}

/**
 * Takes one serving off a dish, leaving the rest — the "×5 → ×4" case.
 *
 * What "one" means depends on how the dish is cooked, and getting that wrong is
 * destructive. Several separate cooks of the same recipe: drop one cook. A single
 * batch cook covering five servings: drop one *serving*, because deleting the
 * cook would take all five with it — which is exactly what this did before.
 */
export async function deleteOneOfGroup(input: { menuId: string; recipeId: string }) {
  const cooks = await db.menuCook.findMany({
    where: { menuId: input.menuId, recipeId: input.recipeId },
    include: { portions: true },
    // Uncooked first: cooked food exists, and should not vanish from the plan
    // just because the count came down.
    orderBy: [{ cookedAt: { sort: "asc", nulls: "first" } }, { order: "desc" }],
  });
  if (cooks.length === 0) return;

  if (cooks.length > 1) {
    await db.menuCook.delete({ where: { id: cooks[0].id } }).catch(() => {});
  } else {
    const cook = cooks[0];
    const mine = cook.portions.filter((p) => p.eater === "me" && p.status === "planned");
    const theirs = cook.portions.filter((p) => p.eater === "partner" && p.status === "planned");

    if (mine.length <= 1) {
      // Last serving standing: the cook itself is what is being removed.
      await db.menuCook.delete({ where: { id: cook.id } }).catch(() => {});
    } else {
      // One serving is one meal for each of us, so both portions go.
      const ids = [mine[0].id, ...(theirs[0] ? [theirs[0].id] : [])];
      await db.portion.deleteMany({ where: { id: { in: ids } } });
    }
  }

  await recostMenu(input.menuId);
  revalidatePool(input.menuId);
}

export async function toggleCookGroupLock(input: { menuId: string; recipeId: string }) {
  const cooks = await db.menuCook.findMany({
    where: { menuId: input.menuId, recipeId: input.recipeId },
    select: { isLocked: true },
  });
  if (cooks.length === 0) return;
  const locked = cooks.every((c) => c.isLocked);
  await db.menuCook.updateMany({
    where: { menuId: input.menuId, recipeId: input.recipeId },
    data: { isLocked: !locked },
  });
  revalidateMeals(input.menuId);
}

/** Marks the next uncooked one of a dish as cooked. */
export async function cookOneOfGroup(input: { menuId: string; recipeId: string }) {
  const next = await db.menuCook.findFirst({
    where: { menuId: input.menuId, recipeId: input.recipeId, cookedAt: null },
    orderBy: { order: "asc" },
  });
  if (!next) return;
  await markCooked(next.id);
}

/** Un-cooks the most recently cooked one of a dish. */
export async function uncookOneOfGroup(input: { menuId: string; recipeId: string }) {
  const last = await db.menuCook.findFirst({
    where: { menuId: input.menuId, recipeId: input.recipeId, cookedAt: { not: null } },
    orderBy: { cookedAt: "desc" },
  });
  if (!last) return;
  await markNotCooked(last.id);
}

/** Swaps every cook of one dish for another, keeping the serving count. */
export async function swapCookGroup(input: {
  menuId: string;
  recipeId: string;
  replacementId: string;
}) {
  const cooks = await db.menuCook.findMany({
    where: { menuId: input.menuId, recipeId: input.recipeId },
    select: { id: true },
  });
  for (const cook of cooks) {
    await swapCook({ cookId: cook.id, recipeId: input.replacementId });
  }
}

/** Empties a plan of every cook, leaving the plan itself to build back up. */
export async function clearMenuCooks(menuId: string) {
  await db.menuCook.deleteMany({ where: { menuId } });
  await recostMenu(menuId);
  revalidatePool(menuId);
}

/* ── Costing and the shopping list ─────────────────────────────────────────── */

/** Recomputes the basket for a menu from its current cooks. */
async function recostMenu(menuId: string) {
  const { needs, ingredients, pantry } = await menuNeeds(menuId);
  const menu = await db.menu.findUnique({ where: { id: menuId } });
  if (!menu) return;

  const basket = buildBasket(needs, ingredients, pantry, {
    horizonDayKey: shiftDayKey(menu.weekStart, 7),
  });

  await db.menu.update({
    where: { id: menuId },
    data: {
      estimatedCostGbp: basket.totalCostGbp,
      projectedWasteGbp: basket.totalWasteGbp,
    },
  });
}

/**
 * Everything needed to price one menu — and nothing else.
 *
 * This used to call `getPlanningContext()`, which loads the entire library so
 * the optimiser can search it. That is right for planning and badly wrong for
 * recosting: removing a single cook was pulling 118 recipes, 206 ingredients and
 * their packs — about 1,300 rows — to recompute a basket that touches perhaps
 * thirty of them. On Workers, where the connection pool is one per request and
 * the queries therefore run end to end, that was enough to make delete and swap
 * appear to do nothing and then quietly succeed a while later.
 *
 * Ingredients are loaded for what the menu actually uses, plus whatever is in the
 * pantry — the pantry ones matter because expiring stock the menu ignores is
 * still charged as waste, and dropping them would silently understate it.
 */
async function menuNeeds(menuId: string) {
  const [cooks, pantry] = await Promise.all([
    db.menuCook.findMany({
      where: { menuId },
      include: {
        recipe: { include: { items: { orderBy: { order: "asc" } } } },
        portions: true,
      },
    }),
    getPantryStock(),
  ]);

  const needs = mergeNeeds(
    cooks.map((cook) =>
      ingredientNeeds(
        toRecipeSpec(cook.recipe),
        cook.portions.map((p) => p.scaleFactor),
      ),
    ),
  );

  const wanted = new Set<string>([...needs.keys(), ...pantry.map((p) => p.ingredientId)]);
  const rows = wanted.size
    ? await db.ingredient.findMany({ where: { id: { in: [...wanted] } }, include: { packs: true } })
    : [];

  const ingredients: IngredientSpec[] = rows.map((i) => ({
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

  return { needs, ingredients, pantry, cooks };
}

/**
 * Turns a draft into a shop.
 *
 * The shopping lines are written down rather than derived on read, because from
 * this point the plan is a commitment: editing a recipe next week must not
 * silently rewrite the list you shopped from.
 */
export async function confirmMenu(menuId: string) {
  const menu = await db.menu.findUnique({ where: { id: menuId } });
  if (!menu) throw new Error("That menu no longer exists.");

  const { needs, ingredients, pantry } = await menuNeeds(menuId);
  const basket = buildBasket(needs, ingredients, pantry, {
    horizonDayKey: shiftDayKey(menu.weekStart, 7),
  });

  const packIdByIngredient = new Map<string, string | null>();
  for (const line of basket.lines) {
    const ingredient = ingredients.find((i) => i.id === line.ingredientId);
    const choice = ingredient ? cheapestPacks(ingredient.packs, line.gramsToBuy) : null;
    packIdByIngredient.set(line.ingredientId, choice?.packId ?? null);
  }

  await db.$transaction([
    db.shoppingLine.deleteMany({ where: { menuId } }),
    db.menu.update({
      where: { id: menuId },
      data: {
        status: "confirmed",
        confirmedAt: new Date(),
        estimatedCostGbp: basket.totalCostGbp,
        projectedWasteGbp: basket.totalWasteGbp,
      },
    }),
  ]);

  // One insert for the whole list. A shop runs to thirty-odd lines and each
  // `create` is a separate serialised round trip from the Worker, which is most
  // of what made confirming a menu feel like it had hung.
  if (basket.lines.length > 0) {
    await db.shoppingLine.createMany({
      data: basket.lines.map((line) => ({
        menuId,
        ingredientId: line.ingredientId,
        packSizeId: packIdByIngredient.get(line.ingredientId) ?? null,
        packCount: line.pack?.count ?? 0,
        gramsNeeded: line.gramsNeeded,
        gramsFromPantry: line.gramsFromPantry,
        gramsBought: line.gramsBought,
        surplusGrams: line.surplusGrams,
        priceGbp: line.priceGbp,
        wasteCostGbp: line.wasteCostGbp,
      })),
    });
  }

  revalidatePool(menuId);
}

export async function tickShoppingLine(input: { lineId: string; isTicked: boolean }) {
  await db.shoppingLine.update({
    where: { id: input.lineId },
    data: { isTicked: input.isTicked },
  });
  revalidatePath("/meals");
}

/**
 * Marks the shop done, and writes what is left over into the pantry.
 *
 * This is the step that makes week three cheaper than week one (spec §8.2): the
 * surplus from every pack becomes stock the next plan can see, and the stock the
 * plan consumed is deducted.
 */
export async function markShopped(menuId: string) {
  const menu = await db.menu.findUnique({
    where: { id: menuId },
    include: { shoppingLines: { include: { ingredient: true } } },
  });
  if (!menu) throw new Error("That menu no longer exists.");

  const today = todayKey();

  for (const line of menu.shoppingLines) {
    // Spend what the plan drew from the pantry, oldest first so the thing about
    // to expire is the thing that gets used.
    let toSpend = line.gramsFromPantry;
    if (toSpend > 0) {
      const items = await db.pantryItem.findMany({
        where: { ingredientId: line.ingredientId },
        orderBy: { expiresOn: "asc" },
      });
      for (const item of items) {
        if (toSpend <= 0) break;
        const take = Math.min(item.grams, toSpend);
        toSpend -= take;
        if (item.grams - take <= 0.5) {
          await db.pantryItem.delete({ where: { id: item.id } });
        } else {
          await db.pantryItem.update({
            where: { id: item.id },
            data: { grams: Math.round((item.grams - take) * 10) / 10 },
          });
        }
      }
    }

    if (line.surplusGrams >= WORTH_KEEPING_GRAMS && !line.ingredient.isStaple) {
      await db.pantryItem.create({
        data: {
          ingredientId: line.ingredientId,
          grams: Math.round(line.surplusGrams * 10) / 10,
          expiresOn: shiftDayKey(today, line.ingredient.shelfLifeDays),
          source: "surplus",
        },
      });
    }
  }

  await db.menu.update({
    where: { id: menuId },
    data: { status: "shopped", shoppedAt: new Date() },
  });

  revalidatePool(menuId);
}

/* ── Cooking and eating ────────────────────────────────────────────────────── */

/** Cooking starts the clock: only now does a portion begin to perish. */
export async function markCooked(cookId: string) {
  const cook = await db.menuCook.findUnique({
    where: { id: cookId },
    include: { recipe: true },
  });
  if (!cook) throw new Error("That cook is no longer in the menu.");

  const expiresOn = shiftDayKey(todayKey(), cook.recipe.keepsDays);

  await db.$transaction([
    db.menuCook.update({ where: { id: cookId }, data: { cookedAt: new Date() } }),
    db.portion.updateMany({
      where: { menuCookId: cookId, status: "planned" },
      data: { expiresOn },
    }),
    db.recipe.update({
      where: { id: cook.recipeId },
      data: { timesCooked: { increment: 1 }, lastCookedAt: new Date() },
    }),
  ]);

  revalidatePool(cook.menuId);
}

export async function markNotCooked(cookId: string) {
  const cook = await db.menuCook.findUnique({ where: { id: cookId }, select: { menuId: true } });
  await db.$transaction([
    db.menuCook.update({ where: { id: cookId }, data: { cookedAt: null } }),
    db.portion.updateMany({
      where: { menuCookId: cookId, status: "planned" },
      data: { expiresOn: null },
    }),
  ]);
  revalidatePool(cook?.menuId);
}

/**
 * Eats a portion, and logs it.
 *
 * A planned meal is the most accurately logged meal there is (spec §8.8): the
 * macros come from the recipe, so there is no estimation error and no API call.
 * `scaleTo` re-tunes the scalable components against what is actually left in the
 * day, which is where the pool model gets its day-level precision back.
 */
export async function eatPortion(input: {
  portionId: string;
  dayKey: string;
  scaleTo?: number | null;
}) {
  if (!isValidDayKey(input.dayKey)) throw new Error("Invalid day.");

  const portion = await db.portion.findUnique({
    where: { id: input.portionId },
    include: { cook: { include: { recipe: { include: { items: { orderBy: { order: "asc" } } } } } } },
  });
  if (!portion) throw new Error("That serving is no longer in the pool.");
  if (portion.status !== "planned") throw new Error("That serving has already been eaten.");

  let macros = {
    calories: portion.calories,
    proteinG: portion.proteinG,
    carbsG: portion.carbsG,
    fatG: portion.fatG,
  };
  let scaleFactor = portion.scaleFactor;
  let assumption: string | null = null;

  if (input.scaleTo != null && Number.isFinite(input.scaleTo) && input.scaleTo > 0) {
    const ingredients = await db.ingredient.findMany({
      where: { id: { in: portion.cook.recipe.items.map((i) => i.ingredientId) } },
    });
    const index = indexIngredients(
      ingredients.map((i) => ({
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
        packs: [],
      })),
    );
    const scaled = scaleForTarget(toRecipeSpec(portion.cook.recipe), index, input.scaleTo);
    macros = roundMacros(scaled.macros);
    scaleFactor = Math.round(scaled.scale * 1000) / 1000;
    assumption = describeScale(portion.cook.recipe.items, scaled.scale);
  }

  await getOrCreateDay(input.dayKey);

  const entry = await db.foodEntry.create({
    data: {
      dayLogDate: input.dayKey,
      description: portion.cook.recipe.name,
      calories: Math.round(macros.calories),
      proteinG: macros.proteinG,
      carbsG: macros.carbsG,
      fatG: macros.fatG,
      // Cooked from a known recipe: the most accurate source in the app, and
      // deliberately not "llm" or "manual".
      source: "recipe",
      confidence: "high",
      assumptions: assumption,
    },
  });

  await db.portion.update({
    where: { id: portion.id },
    data: {
      status: "eaten",
      eatenOn: input.dayKey,
      foodEntryId: entry.id,
      scaleFactor,
      calories: Math.round(macros.calories),
      proteinG: macros.proteinG,
      carbsG: macros.carbsG,
      fatG: macros.fatG,
    },
  });

  revalidateLog();
}

function describeScale(
  items: { grams: number; isScalable: boolean }[],
  scale: number,
): string | null {
  if (Math.abs(scale - 1) < 0.02) return null;
  const scalable = items.filter((i) => i.isScalable).length;
  if (scalable === 0) return null;
  return `Scaled to ${Math.round(scale * 100)}% on the adjustable components to fit the day.`;
}

/** Puts an eaten portion back, and removes the entry it wrote. */
export async function uneatPortion(portionId: string) {
  const portion = await db.portion.findUnique({ where: { id: portionId } });
  if (!portion) return;

  if (portion.foodEntryId) {
    await db.foodEntry.delete({ where: { id: portion.foodEntryId } }).catch(() => {});
  }
  await db.portion.update({
    where: { id: portionId },
    data: { status: "planned", eatenOn: null, foodEntryId: null },
  });

  revalidateLog();
}

/**
 * Bins a portion. Not a failure state — it is how the app learns what actually
 * gets wasted, which is the number the whole feature exists to reduce.
 */
export async function binPortion(portionId: string) {
  await db.portion.update({ where: { id: portionId }, data: { status: "binned" } });
  revalidatePool();
}

/* ── Pantry ────────────────────────────────────────────────────────────────── */

export async function addPantryItem(input: {
  ingredientId: string;
  grams: number;
  expiresOn?: string;
}) {
  if (!Number.isFinite(input.grams) || input.grams <= 0) throw new Error("Enter a weight.");

  const ingredient = await db.ingredient.findUnique({ where: { id: input.ingredientId } });
  if (!ingredient) throw new Error("Unknown ingredient.");

  const expiresOn =
    input.expiresOn && isValidDayKey(input.expiresOn)
      ? input.expiresOn
      : shiftDayKey(todayKey(), ingredient.shelfLifeDays);

  await db.pantryItem.create({
    data: { ingredientId: input.ingredientId, grams: input.grams, expiresOn, source: "manual" },
  });
  revalidateMeals();
}

export async function updatePantryItem(input: { id: string; grams?: number; expiresOn?: string }) {
  const data: { grams?: number; expiresOn?: string } = {};
  if (input.grams != null && Number.isFinite(input.grams) && input.grams >= 0) {
    data.grams = input.grams;
  }
  if (input.expiresOn && isValidDayKey(input.expiresOn)) data.expiresOn = input.expiresOn;
  if (Object.keys(data).length === 0) return;

  if (data.grams === 0) {
    await db.pantryItem.delete({ where: { id: input.id } }).catch(() => {});
  } else {
    await db.pantryItem.update({ where: { id: input.id }, data });
  }
  revalidateMeals();
}

export async function deletePantryItem(id: string) {
  await db.pantryItem.delete({ where: { id } }).catch(() => {});
  revalidateMeals();
}

/* ── Recipes and ingredients ───────────────────────────────────────────────── */

export async function toggleFavouriteRecipe(recipeId: string) {
  const recipe = await db.recipe.findUnique({ where: { id: recipeId } });
  if (!recipe) return;
  await db.recipe.update({
    where: { id: recipeId },
    data: { isFavourite: !recipe.isFavourite },
  });
  revalidateMeals();
}

export async function archiveRecipe(recipeId: string) {
  await db.recipe.update({ where: { id: recipeId }, data: { isArchived: true } }).catch(() => {});
  revalidateMeals();
}

export type MethodResult =
  | { kind: "ok"; method: FullMethod }
  | { kind: "error"; message: string };

/**
 * Writes the full cooking method for one dish, once.
 *
 * The library's seeded methods are summaries — enough to recognise a dish, not
 * enough to cook it — so the first time a cook is opened the rest gets written
 * and saved on the recipe. Every later open, on any menu, reads it back for
 * nothing. Same bargain as `SavedFood` (spec §5.3): the API is asked once per
 * dish and then never again.
 *
 * A union rather than a thrown error, like `planMenu`: the failures here are all
 * ones the user needs to read — no key, a rejected key, a rate limit — and Next
 * masks the message of anything thrown out of a server action in production.
 *
 * Nothing is revalidated. The method is returned and rendered directly, and every
 * route in this app is force-dynamic, so the next navigation reads it back from
 * the database anyway. Revalidating three routes to change one paragraph would
 * spend most of a Worker's CPU budget on nothing.
 */
export async function writeCookMethod(recipeId: string, rewrite = false): Promise<MethodResult> {
  const recipe = await db.recipe.findUnique({
    where: { id: recipeId },
    include: { items: { include: { ingredient: true }, orderBy: { order: "asc" } } },
  });
  if (!recipe) return { kind: "error", message: "That recipe is no longer in the library." };

  // Two screens open on the same dish would otherwise both pay for it.
  const existing = parseFullMethod(recipe.methodFullJson);
  if (existing && !rewrite) return { kind: "ok", method: existing };

  try {
    const written = await writeFullMethod({
      name: recipe.name,
      mealType: recipe.mealType as MealType,
      prepMinutes: recipe.prepMinutes,
      summary: recipe.method,
      lines: recipe.items.map((item) => ({
        name: item.ingredient.name,
        grams: item.grams,
        note: item.note,
      })),
    });

    // Canonicalise the ingredient names the steps refer to, so the screen can
    // print a quantity beside a step by matching on the name it holds. Anything
    // that does not resolve is dropped before it is stored, using the same
    // normalisation a generated ingredient name goes through.
    const canonical = new Map(
      recipe.items.map((item) => [normaliseIngredientName(item.ingredient.name), item.ingredient.name]),
    );
    const method = canonicaliseSteps(
      written,
      (name) => canonical.get(normaliseIngredientName(name)) ?? null,
    );

    await db.recipe.update({
      where: { id: recipeId },
      data: { methodFullJson: JSON.stringify(method) },
    });

    return { kind: "ok", method };
  } catch (e) {
    if (e instanceof MissingApiKeyError) return { kind: "error", message: e.message };
    return {
      kind: "error",
      message: e instanceof Error ? e.message : "Could not write the method.",
    };
  }
}

/** Records the pack sizes for an ingredient the planner had to guess at (§8.9). */
export async function setIngredientPacks(input: {
  ingredientId: string;
  packs: { label: string; grams: number; priceGbp: number | null; isDivisible: boolean }[];
}) {
  const clean = input.packs.filter((p) => p.label.trim() && Number.isFinite(p.grams) && p.grams > 0);
  if (clean.length === 0) throw new Error("Add at least one pack size.");

  await db.$transaction([
    db.packSize.deleteMany({ where: { ingredientId: input.ingredientId } }),
    db.ingredient.update({ where: { id: input.ingredientId }, data: { needsReview: false } }),
  ]);

  for (const pack of clean) {
    await db.packSize.create({
      data: {
        ingredientId: input.ingredientId,
        label: pack.label.trim(),
        grams: pack.grams,
        priceGbp: pack.priceGbp,
        isDivisible: pack.isDivisible,
      },
    });
  }
  revalidateMeals();
}

export async function saveHousehold(input: {
  cooksForTwo: boolean;
  partnerCalories: number;
  partnerProteinG: number;
  splitBreakfast: number;
  splitLunch: number;
  splitDinner: number;
  splitSnack: number;
}) {
  const sum =
    input.splitBreakfast + input.splitLunch + input.splitDinner + input.splitSnack;
  if (!(sum > 0)) throw new Error("Meal splits must add up to something.");
  if (Math.abs(sum - 1) > 0.02) {
    throw new Error(`Meal splits must add up to 100% — they currently total ${Math.round(sum * 100)}%.`);
  }
  if (!Number.isFinite(input.partnerCalories) || input.partnerCalories <= 0) {
    throw new Error("Enter her daily calories.");
  }

  await db.settings.upsert({
    where: { id: "singleton" },
    update: input,
    create: { id: "singleton", ...input },
  });
  revalidateMeals();
}
