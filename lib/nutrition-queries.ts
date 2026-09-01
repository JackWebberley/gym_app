import { db } from "./db";
import { calorieTargetFor, remaining, sumTotals, todayKey, type DayType, type Goals } from "./day";
import type { LibraryEntry } from "./nutrition";

/// Read models for the nutrition screens.

const SETTINGS_ID = "singleton";

/** The goals row, created on first read so the app is never in a half-configured state. */
export async function getGoals(): Promise<Goals & { heightCm: number | null }> {
  const existing = await db.settings.findUnique({ where: { id: SETTINGS_ID } });
  if (existing) return existing;
  return db.settings.create({ data: { id: SETTINGS_ID } });
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

  const goals = await getGoals();
  return db.dayLog.create({
    data: {
      date: dayKey,
      dayType: "base",
      calorieTarget: calorieTargetFor("base", goals),
      proteinTarget: goals.proteinTargetG,
    },
  });
}

export type DayScreen = Awaited<ReturnType<typeof getDayScreen>>;

export async function getDayScreen(dayKey: string = todayKey()) {
  // Reading a day must not create it. Browsing back through last month would
  // otherwise stamp today's goals onto days that were never logged — and those
  // snapshots would then look like what you were actually aiming at back then.
  const stored = await db.dayLog.findUnique({ where: { date: dayKey } });
  const goals = await getGoals();
  const day = stored ?? {
    date: dayKey,
    dayType: "base" as const,
    calorieTarget: calorieTargetFor("base", goals),
    proteinTarget: goals.proteinTargetG,
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
    dayType: day.dayType as DayType,
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
