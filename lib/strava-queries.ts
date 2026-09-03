import { db } from "./db";
import { targetFor, type ActivityConfig } from "./activity";
import { activitiesOf, getActivityConfig } from "./nutrition-queries";
import { isConfigured } from "./strava/api";
import { formatDistance, formatDuration, formatPace, unmappedReason } from "./strava/map";

/// Read models for the Strava screens.

export type ActivityCard = {
  id: string;
  dayKey: string;
  name: string;
  sportType: string;
  startedAt: string;
  /// "13:43" and "2 Sept", already formatted: the same strings on every screen,
  /// whichever timezone the thing rendering them happens to be in.
  timeLabel: string;
  dateLabel: string;
  /** Pre-formatted, because both the card and the popup want the same strings. */
  distance: string | null;
  duration: string;
  pace: string | null;
  elevationM: number | null;
  stravaCalories: number | null;
  averageHeartRate: number | null;
  mappedKind: string | null;
  mappedBand: string | null;
  /** What this activity's allowance is worth, or null when it earns none. */
  allowanceKcal: number | null;
  /** Why nothing was added, when nothing was. */
  noAllowanceReason: string | null;
  /** The day's target as it now stands, and whether the cap is holding it down. */
  dayTarget: number;
  dayCapped: boolean;
};

type Row = {
  id: string;
  dayKey: string;
  name: string;
  sportType: string;
  startedAt: Date;
  startedLocal: string;
  distanceM: number;
  movingSeconds: number;
  elapsedSeconds: number;
  elevationM: number | null;
  stravaCalories: number | null;
  averageHeartRate: number | null;
  mappedKind: string | null;
  mappedBand: string | null;
};

/**
 * Time and date as they read on the watch.
 *
 * Sliced out of Strava’s local string, not converted from the instant: a
 * conversion lands in the server timezone when a server component renders it and
 * the browser timezone when a client one does, and the popup and the Strava page
 * disagreed by two hours because of exactly that.
 */
function localLabels(row: { startedLocal: string; startedAt: Date }): {
  timeLabel: string;
  dateLabel: string;
} {
  const local = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(row.startedLocal) ? row.startedLocal : null;
  if (!local) {
    // Imported before this was stored; re-syncing fills it in.
    return {
      timeLabel: row.startedAt.toISOString().slice(11, 16),
      dateLabel: row.startedAt.toISOString().slice(0, 10),
    };
  }
  const [y, m, d] = local.slice(0, 10).split("-").map(Number);
  return {
    timeLabel: local.slice(11, 16),
    dateLabel: new Date(y, m - 1, d, 12).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
    }),
  };
}

async function toCards(rows: Row[], config: ActivityConfig): Promise<ActivityCard[]> {
  if (rows.length === 0) return [];

  // One query for every day involved rather than one per activity.
  const days = await db.dayLog.findMany({
    where: { date: { in: [...new Set(rows.map((r) => r.dayKey))] } },
    select: { date: true, calorieTarget: true, gym: true, golf: true, runBand: true, walkBand: true },
  });
  const byDay = new Map(days.map((d) => [d.date, d]));

  return rows.map((row) => {
    const day = byDay.get(row.dayKey);
    const breakdown = day ? targetFor(activitiesOf(day), config) : null;

    // What this activity contributed, read off the day's own sum so a capped
    // day does not claim credit it did not get.
    const part = breakdown?.parts.find((p) => p.kind === row.mappedKind);

    return {
      id: row.id,
      dayKey: row.dayKey,
      name: row.name,
      sportType: row.sportType,
      startedAt: row.startedAt.toISOString(),
      ...localLabels(row),
      distance: formatDistance(row.distanceM),
      duration: formatDuration(row.movingSeconds || row.elapsedSeconds),
      pace: row.mappedKind === "run" || row.mappedKind === "walk"
        ? formatPace(row.distanceM, row.movingSeconds)
        : null,
      elevationM: row.elevationM,
      stravaCalories: row.stravaCalories,
      averageHeartRate: row.averageHeartRate,
      mappedKind: row.mappedKind,
      mappedBand: row.mappedBand,
      allowanceKcal: part?.kcal ?? null,
      noAllowanceReason: row.mappedKind ? null : unmappedReason(row.sportType),
      dayTarget: day?.calorieTarget ?? 0,
      dayCapped: breakdown?.capped ?? false,
    };
  });
}

/** Activities not yet shown on the home screen. Drives the popup. */
export async function getUnseenActivities(): Promise<ActivityCard[]> {
  const rows = await db.stravaActivity.findMany({
    where: { seenAt: null },
    orderBy: { startedAt: "desc" },
    take: 5,
  });
  return toCards(rows, await getActivityConfig());
}

export type StravaScreen = {
  configured: boolean;
  account: {
    athleteName: string | null;
    athleteId: string;
    connectedAt: string;
    lastSyncedAt: string | null;
    subscriptionId: string | null;
    scope: string;
  } | null;
  activities: ActivityCard[];
  pendingEvents: number;
  failedEvents: { id: string; objectId: string; aspectType: string; error: string }[];
};

export async function getStravaScreen(): Promise<StravaScreen> {
  const configured = isConfigured();
  const account = await db.stravaAccount.findUnique({ where: { id: "singleton" } });

  if (!account) {
    return { configured, account: null, activities: [], pendingEvents: 0, failedEvents: [] };
  }

  const [rows, config, pendingEvents, failed] = await Promise.all([
    db.stravaActivity.findMany({ orderBy: { startedAt: "desc" }, take: 25 }),
    getActivityConfig(),
    db.stravaEvent.count({ where: { processedAt: null, error: null } }),
    db.stravaEvent.findMany({
      where: { processedAt: null, error: { not: null } },
      orderBy: { receivedAt: "desc" },
      take: 5,
    }),
  ]);

  return {
    configured,
    account: {
      athleteName: account.athleteName,
      athleteId: account.athleteId,
      connectedAt: account.connectedAt.toISOString(),
      lastSyncedAt: account.lastSyncedAt?.toISOString() ?? null,
      subscriptionId: account.subscriptionId,
      scope: account.scope,
    },
    activities: await toCards(rows, config),
    pendingEvents,
    failedEvents: failed.map((e) => ({
      id: e.id,
      objectId: e.objectId,
      aspectType: e.aspectType,
      error: e.error ?? "Unknown",
    })),
  };
}
