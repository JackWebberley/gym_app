import { db } from "../db";
import { targetFor, type ActivityLog } from "../activity";
import { activitiesOf, getActivityConfig, getOrCreateDay } from "../nutrition-queries";
import { ActivityGone, fetchActivity, fetchRecentActivities, getAccount } from "./api";
import { mapActivity, mergeStravaTicks, parseStravaTicks, ticksForDay } from "./map";
import type { StravaActivityDetail } from "./api";

/// Turning Strava events into a re-priced day.
///
/// The order matters: an activity is written down first, then the whole day is
/// re-derived from every activity it holds. Nothing incremental — recomputing
/// the day from scratch is the only version that stays right when an activity is
/// edited or deleted, and it costs one small query.

/**
 * The local calendar day an activity belongs to.
 *
 * Strava's `start_date_local` is the wall-clock time where you were, dressed up
 * with a Z it does not mean. Taking the date off the front of that string is
 * exactly right and involves no timezone arithmetic; using `start_date` instead
 * would push an evening run into tomorrow.
 */
export function dayKeyOf(detail: StravaActivityDetail): string {
  return detail.start_date_local.slice(0, 10);
}

/** Writes one activity down, with what it maps to at today's settings. */
export async function recordActivity(detail: StravaActivityDetail) {
  const config = await getActivityConfig();
  const mapped = mapActivity(
    { sportType: detail.sport_type ?? detail.type ?? "Workout", distanceM: detail.distance ?? 0 },
    config,
  );

  const data = {
    dayKey: dayKeyOf(detail),
    name: detail.name,
    sportType: detail.sport_type ?? detail.type ?? "Workout",
    startedAt: new Date(detail.start_date),
    distanceM: detail.distance ?? 0,
    movingSeconds: Math.round(detail.moving_time ?? 0),
    elapsedSeconds: Math.round(detail.elapsed_time ?? 0),
    elevationM: detail.total_elevation_gain ?? null,
    stravaCalories: detail.calories ?? null,
    averageHeartRate: detail.average_heartrate ?? null,
    maxHeartRate: detail.max_heartrate ?? null,
    mappedKind: mapped.kind,
    mappedBand: mapped.band,
  };

  return db.stravaActivity.upsert({
    where: { id: String(detail.id) },
    // An edit on Strava — a renamed run, a corrected distance — updates in
    // place. seenAt is left alone so an activity already dismissed does not pop
    // up again because its title changed.
    update: data,
    create: { id: String(detail.id), ...data },
  });
}

export type DayResync = {
  dayKey: string;
  targetBefore: number;
  targetAfter: number;
  ticks: ActivityLog;
};

/**
 * Re-derives one day's ticks from every Strava activity on it, and re-prices it.
 *
 * What Strava concluded is written to `stravaTicks` so the next sync can tell
 * its own ticks from yours (see mergeStravaTicks).
 */
export async function resyncDay(dayKey: string): Promise<DayResync> {
  const [config, activities] = await Promise.all([
    getActivityConfig(),
    db.stravaActivity.findMany({
      where: { dayKey },
      select: { sportType: true, distanceM: true },
    }),
  ]);

  const day = await getOrCreateDay(dayKey);
  const targetBefore = day.calorieTarget;

  const nextStrava = ticksForDay(activities, config);
  const ticks = mergeStravaTicks(activitiesOf(day), parseStravaTicks(day.stravaTicks), nextStrava);
  const breakdown = targetFor(ticks, config);

  await db.dayLog.update({
    where: { date: dayKey },
    data: {
      ...ticks,
      calorieTarget: breakdown.total,
      targetParts: JSON.stringify(breakdown.parts),
      stravaTicks: JSON.stringify(nextStrava),
    },
  });

  return { dayKey, targetBefore, targetAfter: breakdown.total, ticks };
}

/** One webhook event, start to finish. Throws so the caller can record why. */
export async function processEvent(event: {
  objectType: string;
  objectId: string;
  aspectType: string;
}): Promise<string | null> {
  // Athlete events are deauthorisations and profile edits; only the first
  // matters, and it arrives as an update with authorized:false.
  if (event.objectType !== "activity") return null;

  if (event.aspectType === "delete") {
    const existing = await db.stravaActivity.findUnique({ where: { id: event.objectId } });
    if (!existing) return null;
    await db.stravaActivity.delete({ where: { id: event.objectId } });
    await resyncDay(existing.dayKey);
    return existing.dayKey;
  }

  try {
    const detail = await fetchActivity(event.objectId);
    const activity = await recordActivity(detail);
    await resyncDay(activity.dayKey);
    return activity.dayKey;
  } catch (error) {
    // Deleted between the event firing and us reading it: not a failure, just a
    // race. Tidy up as though we had been told about the delete.
    if (error instanceof ActivityGone) {
      const existing = await db.stravaActivity.findUnique({ where: { id: event.objectId } });
      if (existing) {
        await db.stravaActivity.delete({ where: { id: event.objectId } });
        await resyncDay(existing.dayKey);
        return existing.dayKey;
      }
      return null;
    }
    throw error;
  }
}

/**
 * Works through the inbox.
 *
 * Each event is marked done or marked with its error independently, so one bad
 * activity cannot block the rest — and the row stays, so it can be retried.
 */
export async function processPendingEvents(limit = 25): Promise<{ done: number; failed: number }> {
  const pending = await db.stravaEvent.findMany({
    where: { processedAt: null },
    orderBy: { eventTime: "asc" },
    take: limit,
  });

  let done = 0;
  let failed = 0;

  for (const event of pending) {
    try {
      await processEvent(event);
      await db.stravaEvent.update({
        where: { id: event.id },
        data: { processedAt: new Date(), error: null },
      });
      done++;
    } catch (error) {
      await db.stravaEvent.update({
        where: { id: event.id },
        data: { error: error instanceof Error ? error.message : String(error) },
      });
      failed++;
    }
  }

  if (done > 0) {
    await db.stravaAccount
      .update({ where: { id: "singleton" }, data: { lastSyncedAt: new Date() } })
      .catch(() => {});
  }

  return { done, failed };
}

/**
 * Pulls in recent activities directly, for the moment just after connecting —
 * and as the manual way out when a webhook has been missed.
 */
export async function backfillRecent(perPage = 20): Promise<{ imported: number; days: string[] }> {
  if (!(await getAccount())) return { imported: 0, days: [] };

  const details = await fetchRecentActivities(perPage);
  const days = new Set<string>();

  for (const detail of details) {
    const activity = await recordActivity(detail);
    days.add(activity.dayKey);
  }

  for (const dayKey of days) await resyncDay(dayKey);

  await db.stravaAccount
    .update({ where: { id: "singleton" }, data: { lastSyncedAt: new Date() } })
    .catch(() => {});

  return { imported: details.length, days: [...days] };
}
