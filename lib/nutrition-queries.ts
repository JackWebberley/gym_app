import { db } from "./db";
import { remaining, sumTotals, todayKey, type Goals } from "./day";
import {
  isDistanceBand,
  NO_ACTIVITY,
  parseTargetParts,
  targetFor,
  type ActivityConfig,
  type ActivityLog,
} from "./activity";
import type { LibraryEntry } from "./nutrition";

/// Read models for the nutrition screens.

const SETTINGS_ID = "singleton";

/** The settings row, created on first read so the app is never half-configured. */
async function settingsRow() {
  const existing = await db.settings.findUnique({ where: { id: SETTINGS_ID } });
  if (existing) return existing;
  return db.settings.create({ data: { id: SETTINGS_ID } });
}

export async function getGoals(): Promise<Goals & { heightCm: number | null }> {
  return settingsRow();
}

/**
 * Every tunable number behind a day’s target, in the shape the pure model wants.
 * Read fresh on every compute, and never applied backwards: a day that has
 * already been stored keeps the target it was stored with.
 */
export async function getActivityConfig(): Promise<ActivityConfig> {
  const settings = await settingsRow();
  return {
    baselineCalories: settings.baselineCalories,
    calorieCap: settings.calorieCap,
    addOnScalePercent: settings.addOnScalePercent,
    gymCalories: settings.gymCalories,
    golfCalories: settings.golfCalories,
    runCalories: {
      short: settings.runShortCalories,
      medium: settings.runMediumCalories,
      long: settings.runLongCalories,
    },
    walkCalories: {
      short: settings.walkShortCalories,
      medium: settings.walkMediumCalories,
      long: settings.walkLongCalories,
    },
    bandShortMaxKm: settings.bandShortMaxKm,
    bandMediumMaxKm: settings.bandMediumMaxKm,
  };
}

/** The ticks off a stored row, with the two band columns narrowed to the union. */
export function activitiesOf(row: {
  gym: boolean;
  golf: boolean;
  runBand: string | null;
  walkBand: string | null;
}): ActivityLog {
  return {
    gym: row.gym,
    golf: row.golf,
    runBand: isDistanceBand(row.runBand) ? row.runBand : null,
    walkBand: isDistanceBand(row.walkBand) ? row.walkBand : null,
  };
}

function parseAliases(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((a): a is string => typeof a === "string") : [];
  } catch {
    return [];
  }
}

/**
 * The personal library, most-logged first. Capped for prompt use at 40 entries
 * (spec §5.2); the full list is small enough to hand the client for matching.
 */
export async function getLibrary(take = 200): Promise<LibraryEntry[]> {
  const rows = await db.savedFood.findMany({
    orderBy: [{ timesLogged: "desc" }, { lastLoggedAt: "desc" }],
    take,
  });
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    calories: r.calories,
    proteinG: r.proteinG,
    carbsG: r.carbsG,
    fatG: r.fatG,
    aliases: parseAliases(r.aliases),
  }));
}

/**
 * Loads a day, creating it on first use with the targets snapshotted from the
 * current goals. Never derived at read time — changing your goals later must not
 * rewrite what you were aiming at last Tuesday (spec §3).
 */
export async function getOrCreateDay(dayKey: string) {
  const existing = await db.dayLog.findUnique({ where: { date: dayKey } });
  if (existing) return existing;

  // A day starts as a rest day: the baseline is what you have earned before you
  // have done anything, and ticking is how it goes up.
  const [goals, config] = await Promise.all([getGoals(), getActivityConfig()]);
  const breakdown = targetFor(NO_ACTIVITY, config);

  return db.dayLog.create({
    data: {
      date: dayKey,
      calorieTarget: breakdown.total,
      proteinTarget: goals.proteinTargetG,
      targetParts: JSON.stringify(breakdown.parts),
    },
  });
}

export type DayScreen = Awaited<ReturnType<typeof getDayScreen>>;

export async function getDayScreen(dayKey: string = todayKey()) {
  // Reading a day must not create it. Browsing back through last month would
  // otherwise stamp today's goals onto days that were never logged — and those
  // snapshots would then look like what you were actually aiming at back then.
  const stored = await db.dayLog.findUnique({ where: { date: dayKey } });
  const [goals, config] = await Promise.all([getGoals(), getActivityConfig()]);

  // An unstored day is shown as the rest day it would be created as, priced at
  // today’s settings — nothing is written, so nothing is committed to.
  const unsaved = targetFor(NO_ACTIVITY, config);
  const day = stored ?? {
    date: dayKey,
    calorieTarget: unsaved.total,
    proteinTarget: goals.proteinTargetG,
    targetParts: JSON.stringify(unsaved.parts),
    gym: false,
    golf: false,
    runBand: null,
    walkBand: null,
  };

  const [entries, quickAdd, libraryCount] = await Promise.all([
    db.foodEntry.findMany({
      where: { dayLogDate: dayKey },
      orderBy: { loggedAt: "asc" },
    }),
    // The top six one-tap foods on the daily view (spec §5.3).
    db.savedFood.findMany({
      where: { timesLogged: { gt: 0 } },
      orderBy: [{ timesLogged: "desc" }, { lastLoggedAt: "desc" }],
      take: 6,
    }),
    db.savedFood.count(),
  ]);

  const totals = sumTotals(entries);

  return {
    dayKey,
    activities: activitiesOf(day),
    config,
    /// The sum as it stood when the day was stored, not as it would price today.
    targetParts: parseTargetParts(day.targetParts),
    entries: entries.map((e) => ({
      id: e.id,
      description: e.description,
      calories: e.calories,
      proteinG: e.proteinG,
      carbsG: e.carbsG,
      fatG: e.fatG,
      source: e.source,
      confidence: e.confidence,
      assumptions: e.assumptions,
      loggedAt: e.loggedAt.toISOString(),
    })),
    totals,
    calories: remaining(totals.calories, day.calorieTarget),
    protein: remaining(totals.proteinG, day.proteinTarget),
    quickAdd: quickAdd.map((f) => ({
      id: f.id,
      name: f.name,
      calories: f.calories,
      proteinG: f.proteinG,
      timesLogged: f.timesLogged,
    })),
    libraryCount,
  };
}

/** Every saved food, for the library screen. */
export async function getSavedFoods() {
  return db.savedFood.findMany({
    orderBy: [{ timesLogged: "desc" }, { name: "asc" }],
  });
}

/** Whether chat estimation is available at all, so the UI can say so up front. */
export function isEstimationConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

/** The whole settings row, for the screen that tunes the model. */
export async function getSettings() {
  return settingsRow();
}
