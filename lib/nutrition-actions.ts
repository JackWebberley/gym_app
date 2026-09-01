"use server";

import { revalidatePath } from "next/cache";
import { db } from "./db";
import { calorieTargetFor, isValidDayKey, type DayType } from "./day";
import { estimateMacros } from "./nutrition-estimate";
import {
  normaliseFoodName,
  resolveFromLibrary,
  roundCalories,
  type EstimatedItem,
} from "./nutrition";
import { MissingApiKeyError } from "./anthropic-config";
import { getGoals, getLibrary, getOrCreateDay } from "./nutrition-queries";

/// Every nutrition mutation. Single user, so validation here is about catching
/// fat-fingered input, not attacks.

const SETTINGS_ID = "singleton";

function assertDayKey(dayKey: string) {
  if (!isValidDayKey(dayKey)) throw new Error(`"${dayKey}" is not a valid date.`);
}

// ── Goals ─────────────────────────────────────────────────────────────────────

export async function saveGoals(input: {
  baseCalories: number;
  golfDayCalories: number;
  proteinTargetG: number;
}) {
  const baseCalories = Math.round(input.baseCalories);
  const golfDayCalories = Math.round(input.golfDayCalories);
  const proteinTargetG = Math.round(input.proteinTargetG);

  for (const [label, value] of [
    ["Base calories", baseCalories],
    ["Golf day calories", golfDayCalories],
    ["Protein target", proteinTargetG],
  ] as const) {
    if (!Number.isFinite(value) || value <= 0) throw new Error(`${label} must be more than zero.`);
  }

  await db.settings.upsert({
    where: { id: SETTINGS_ID },
    update: { baseCalories, golfDayCalories, proteinTargetG },
    create: { id: SETTINGS_ID, baseCalories, golfDayCalories, proteinTargetG },
  });

  // Deliberately does not touch existing days: their targets are snapshots.
  revalidatePath("/food");
  revalidatePath("/");
  revalidatePath("/food/goals");
}

// ── Day type ──────────────────────────────────────────────────────────────────

/**
 * Flips a day between base and golf, rewriting that day's calorie target (spec §5.4).
 * Only this day changes — every other day keeps the target it was logged against.
 */
export async function setDayType(dayKey: string, dayType: DayType) {
  assertDayKey(dayKey);
  await getOrCreateDay(dayKey);
  const goals = await getGoals();

  await db.dayLog.update({
    where: { date: dayKey },
    data: { dayType, calorieTarget: calorieTargetFor(dayType, goals) },
  });

  revalidatePath("/food");
  revalidatePath("/");
}

// ── Estimation ────────────────────────────────────────────────────────────────

export type EstimateResult =
  | { kind: "library"; savedFoodId: string; items: EstimatedItem[] }
  | { kind: "estimated"; items: EstimatedItem[]; clarification: string | null }
  | { kind: "error"; message: string; canRetry: boolean };

/**
 * Turns a free-text description into an editable breakdown. Nothing is written
 * until the user confirms it — this only reads.
 */
export async function estimateEntry(description: string): Promise<EstimateResult> {
  const text = description.trim();
  if (!text) return { kind: "error", message: "Type what you ate first.", canRetry: false };

  const library = await getLibrary();

  // A library hit costs nothing and is exactly right, so try it before the model.
  const hit = resolveFromLibrary(text, library);
  if (hit) {
    return {
      kind: "library",
      savedFoodId: hit.id,
      items: [
        {
          name: hit.name,
          quantity: "as saved",
          calories: hit.calories,
          protein_g: hit.proteinG,
          carbs_g: hit.carbsG,
          fat_g: hit.fatG,
          assumption: null,
          confidence: "high",
        },
      ],
    };
  }

  try {
    // Cap the prompt library at the 40 most-logged entries (spec §5.2).
    const estimate = await estimateMacros(text, library.slice(0, 40));
    return {
      kind: "estimated",
      items: estimate.items,
      clarification: estimate.clarification_needed,
    };
  } catch (e) {
    if (e instanceof MissingApiKeyError) {
      return { kind: "error", message: e.message, canRetry: false };
    }
    return {
      kind: "error",
      message: e instanceof Error ? e.message : "Could not estimate that.",
      canRetry: true,
    };
  }
}

// ── Logging ───────────────────────────────────────────────────────────────────

export type ConfirmedItem = {
  name: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  assumption?: string | null;
  confidence?: string | null;
};

/**
 * Records an item against a day and files it in the personal library.
 * `wasEdited` marks the entry "corrected" — a correction is the strongest signal
 * about what you actually eat, so it overwrites the saved values (spec §5.3).
 */
async function persistItem(dayKey: string, item: ConfirmedItem, source: string, wasEdited: boolean) {
  const calories = roundCalories(item.calories);
  const values = {
    calories,
    proteinG: round1(item.proteinG),
    carbsG: round1(item.carbsG),
    fatG: round1(item.fatG),
  };

  const name = item.name.trim();
  const existing = await db.savedFood.findUnique({ where: { name } });

  const saved = existing
    ? await db.savedFood.update({
        where: { id: existing.id },
        data: {
          // Only a hand-correction rewrites stored macros; a plain re-log must not
          // let a fresh guess overwrite a value you already fixed.
          ...(wasEdited ? values : {}),
          timesLogged: { increment: 1 },
          lastLoggedAt: new Date(),
        },
      })
    : await db.savedFood.create({
        data: { name, ...values, timesLogged: 1, lastLoggedAt: new Date() },
      });

  await db.foodEntry.create({
    data: {
      dayLogDate: dayKey,
      description: name,
      ...values,
      source: wasEdited ? "corrected" : source,
      confidence: item.confidence ?? null,
      assumptions: item.assumption ?? null,
      savedFoodId: saved.id,
    },
  });
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export async function logItems(input: {
  dayKey: string;
  items: ConfirmedItem[];
  source: "llm" | "saved" | "manual";
  wasEdited: boolean;
}) {
  assertDayKey(input.dayKey);
  if (input.items.length === 0) throw new Error("Nothing to log.");

  for (const item of input.items) {
    if (!item.name.trim()) throw new Error("Every item needs a name.");
    if (!Number.isFinite(item.calories) || item.calories < 0) {
      throw new Error("Calories must be zero or more.");
    }
    for (const [label, value] of [
      ["Protein", item.proteinG],
      ["Carbs", item.carbsG],
      ["Fat", item.fatG],
    ] as const) {
      if (!Number.isFinite(value) || value < 0) throw new Error(`${label} must be zero or more.`);
    }
  }

  await getOrCreateDay(input.dayKey);
  for (const item of input.items) {
    await persistItem(input.dayKey, item, input.source, input.wasEdited);
  }

  revalidatePath("/food");
  revalidatePath("/");
}

/** One tap from the quick-add row or the library — no API call, no estimation error. */
export async function logSavedFood(input: { dayKey: string; savedFoodId: string }) {
  assertDayKey(input.dayKey);
  const food = await db.savedFood.findUnique({ where: { id: input.savedFoodId } });
  if (!food) throw new Error("That food is no longer in your library.");

  await getOrCreateDay(input.dayKey);

  await db.$transaction([
    db.foodEntry.create({
      data: {
        dayLogDate: input.dayKey,
        description: food.name,
        calories: food.calories,
        proteinG: food.proteinG,
        carbsG: food.carbsG,
        fatG: food.fatG,
        source: "saved",
        confidence: "high",
        savedFoodId: food.id,
      },
    }),
    db.savedFood.update({
      where: { id: food.id },
      data: { timesLogged: { increment: 1 }, lastLoggedAt: new Date() },
    }),
  ]);

  revalidatePath("/food");
  revalidatePath("/");
}

/**
 * Removes a logged entry.
 *
 * If the entry came from a planned serving, that serving goes back into the pool
 * rather than vanishing. `Portion.foodEntryId` is a plain column with no foreign
 * key — Portion cannot reference FoodEntry without coupling the nutrition schema
 * to the meal planner — so nothing releases it automatically, and without this
 * the serving ends up neither logged nor available: silently lost.
 */
export async function deleteEntry(entryId: string) {
  const released = await db.portion.updateMany({
    where: { foodEntryId: entryId },
    data: { status: "planned", eatenOn: null, foodEntryId: null },
  });

  await db.foodEntry.delete({ where: { id: entryId } }).catch(() => {});

  revalidatePath("/food");
  revalidatePath("/");
  if (released.count > 0) revalidatePath("/meals");
}

// ── Library ───────────────────────────────────────────────────────────────────

export async function updateSavedFood(input: {
  id: string;
  name?: string;
  calories?: number;
  proteinG?: number;
  carbsG?: number;
  fatG?: number;
}) {
  const data: Record<string, unknown> = {};
  if (input.name !== undefined) {
    const name = input.name.trim();
    if (!name) throw new Error("Give the food a name.");
    data.name = name;
  }
  if (input.calories !== undefined) data.calories = roundCalories(input.calories);
  if (input.proteinG !== undefined) data.proteinG = round1(input.proteinG);
  if (input.carbsG !== undefined) data.carbsG = round1(input.carbsG);
  if (input.fatG !== undefined) data.fatG = round1(input.fatG);

  await db.savedFood.update({ where: { id: input.id }, data });
  revalidatePath("/food/library");
  revalidatePath("/food");
  revalidatePath("/");
}

export async function addAlias(input: { id: string; alias: string }) {
  const alias = input.alias.trim();
  if (!alias) return;

  const food = await db.savedFood.findUnique({ where: { id: input.id } });
  if (!food) return;

  let aliases: string[] = [];
  try {
    const parsed = JSON.parse(food.aliases);
    if (Array.isArray(parsed)) aliases = parsed.filter((a): a is string => typeof a === "string");
  } catch {
    aliases = [];
  }

  const normalised = normaliseFoodName(alias);
  if (aliases.some((a) => normaliseFoodName(a) === normalised)) return;

  await db.savedFood.update({
    where: { id: input.id },
    data: { aliases: JSON.stringify([...aliases, alias]) },
  });
  revalidatePath("/food/library");
}

export async function deleteSavedFood(id: string) {
  await db.savedFood.delete({ where: { id } }).catch(() => {});
  revalidatePath("/food/library");
  revalidatePath("/food");
  revalidatePath("/");
}

