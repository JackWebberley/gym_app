"use server";

import { revalidatePath } from "next/cache";
import { db } from "./db";
import { isValidDayKey } from "./day";
import { getOrCreateDay } from "./nutrition-queries";

/// Writes for the tracking screen. Weight and steps live on the DayLog beside
/// that day's food, because they are all facts about the same day and none of
/// them should be rewritten when goals change later.

/// Wide enough to accept anyone, narrow enough to catch a decimal point typed in
/// the wrong place — 8.4 and 840 are both easy slips at 7am.
const MIN_KG = 25;
const MAX_KG = 350;
const MAX_STEPS = 200_000;

/**
 * Records the morning weigh-in, and steps if you have them.
 *
 * Passing null clears a field rather than leaving a fat-fingered figure to skew
 * the trend for a week — one bad reading moves a 7-day average by a seventh of
 * its error, so being able to take it back matters.
 */
export async function logBodyMetrics(input: {
  dayKey: string;
  weightKg?: number | null;
  steps?: number | null;
}) {
  if (!isValidDayKey(input.dayKey)) throw new Error(`"${input.dayKey}" is not a valid date.`);

  const data: { weightKg?: number | null; steps?: number | null } = {};

  if (input.weightKg !== undefined) {
    if (input.weightKg === null) {
      data.weightKg = null;
    } else {
      // Scales read to 0.1kg at best, and anything finer is noise pretending to
      // be signal.
      const weightKg = Math.round(input.weightKg * 10) / 10;
      if (!Number.isFinite(weightKg) || weightKg < MIN_KG || weightKg > MAX_KG) {
        throw new Error(`Weight should be between ${MIN_KG}kg and ${MAX_KG}kg.`);
      }
      data.weightKg = weightKg;
    }
  }

  if (input.steps !== undefined) {
    if (input.steps === null) {
      data.steps = null;
    } else {
      const steps = Math.round(input.steps);
      if (!Number.isFinite(steps) || steps < 0 || steps > MAX_STEPS) {
        throw new Error(`Steps should be between 0 and ${MAX_STEPS.toLocaleString("en-GB")}.`);
      }
      data.steps = steps;
    }
  }

  if (Object.keys(data).length === 0) return;

  // Creating the day here is right: you are logging something that happened on
  // it, so it earns the targets in force today (spec §3).
  await getOrCreateDay(input.dayKey);
  await db.dayLog.update({ where: { date: input.dayKey }, data });

  revalidatePath("/track");
  revalidatePath("/");
}
