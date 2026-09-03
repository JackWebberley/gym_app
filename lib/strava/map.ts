/// Turning what Strava recorded into what the calorie model understands.
///
/// Strava has around forty sport types; this app's model has four allowances.
/// Most of the mapping is therefore about being honest that something does not
/// map: a swim is a real workout and deserves to appear, but inventing an
/// allowance for it would be making up a number, so it appears and moves
/// nothing.
///
/// Pure, so the rules that quietly change your calorie target can be tested
/// without a network or a database.

import {
  bandForKm,
  NO_ACTIVITY,
  type ActivityConfig,
  type ActivityKind,
  type ActivityLog,
  type DistanceBand,
} from "../activity";

/// Sport types that earn each allowance. Anything absent maps to nothing, which
/// is deliberate — see the note above.
const SPORT_KIND: Record<string, ActivityKind> = {
  Run: "run",
  TrailRun: "run",
  VirtualRun: "run",

  Walk: "walk",
  Hike: "walk",

  WeightTraining: "gym",
  Workout: "gym",
  Crossfit: "gym",
  HighIntensityIntervalTraining: "gym",

  Golf: "golf",
};

/** What allowance a Strava sport earns, or null when the model has none for it. */
export function kindForSport(sportType: string): ActivityKind | null {
  return SPORT_KIND[sportType] ?? null;
}

/** Human wording for a sport the model has no allowance for. */
export function unmappedReason(sportType: string): string {
  return `No allowance for ${sportType.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase()} yet`;
}

export type StravaActivityLike = {
  sportType: string;
  distanceM: number;
};

export type MappedActivity = {
  kind: ActivityKind | null;
  /** Only meaningful for run and walk. */
  band: DistanceBand | null;
};

/**
 * One activity's mapping.
 *
 * The band comes from that single activity, which is what the card on the home
 * screen should show. The day's actual band comes from `ticksForDay`, because
 * two 4km runs are an 8km day.
 */
export function mapActivity(
  activity: StravaActivityLike,
  config: ActivityConfig,
): MappedActivity {
  const kind = kindForSport(activity.sportType);
  if (kind === null) return { kind: null, band: null };
  if (kind === "gym" || kind === "golf") return { kind, band: null };
  return { kind, band: bandForKm(activity.distanceM / 1000, config) };
}

/**
 * What a day's worth of Strava activities says the ticks should be.
 *
 * Distances are summed per kind before banding: two 4km runs is an 8km day, and
 * banding each separately would call it two short runs and pay the smaller
 * allowance twice over.
 */
export function ticksForDay(
  activities: StravaActivityLike[],
  config: ActivityConfig,
): ActivityLog {
  let runM = 0;
  let walkM = 0;
  let gym = false;
  let golf = false;

  for (const activity of activities) {
    switch (kindForSport(activity.sportType)) {
      case "run":
        runM += activity.distanceM;
        break;
      case "walk":
        walkM += activity.distanceM;
        break;
      case "gym":
        gym = true;
        break;
      case "golf":
        golf = true;
        break;
      default:
        break;
    }
  }

  return {
    gym,
    golf,
    // A recorded run of zero distance is still a run; band it rather than
    // dropping it, but nothing at all stays null.
    runBand: activities.some((a) => kindForSport(a.sportType) === "run")
      ? bandForKm(runM / 1000, config)
      : null,
    walkBand: activities.some((a) => kindForSport(a.sportType) === "walk")
      ? bandForKm(walkM / 1000, config)
      : null,
  };
}

/**
 * Applies Strava's view of a day without trampling what you set by hand.
 *
 * A three-way merge, because two of the obvious rules are both wrong. If Strava
 * simply overwrote, a gym session it cannot see would be wiped the moment a run
 * synced. If it only ever added, deleting an activity on Strava would leave the
 * tick it created behind for ever.
 *
 * So each tick is compared against what Strava last set it to: unchanged since
 * then means nobody has overridden it and Strava may move it, including back to
 * nothing. Changed means you touched it, and it is left alone.
 */
export function mergeStravaTicks(
  current: ActivityLog,
  lastStrava: Partial<ActivityLog>,
  nextStrava: ActivityLog,
): ActivityLog {
  // A field Strava has never set reads as the default, so an untouched day
  // adopts everything rather than looking like a page of overrides.
  const previous: ActivityLog = { ...NO_ACTIVITY, ...lastStrava };

  return {
    gym: current.gym === previous.gym ? nextStrava.gym : current.gym,
    golf: current.golf === previous.golf ? nextStrava.golf : current.golf,
    runBand: current.runBand === previous.runBand ? nextStrava.runBand : current.runBand,
    walkBand: current.walkBand === previous.walkBand ? nextStrava.walkBand : current.walkBand,
  };
}

/** Reads the stored `stravaTicks` JSON, tolerating anything that is not it. */
export function parseStravaTicks(raw: string): Partial<ActivityLog> {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return {};
    const value = parsed as Record<string, unknown>;
    const ticks: Partial<ActivityLog> = {};
    if (typeof value.gym === "boolean") ticks.gym = value.gym;
    if (typeof value.golf === "boolean") ticks.golf = value.golf;
    if (value.runBand === null || typeof value.runBand === "string") {
      ticks.runBand = value.runBand as DistanceBand | null;
    }
    if (value.walkBand === null || typeof value.walkBand === "string") {
      ticks.walkBand = value.walkBand as DistanceBand | null;
    }
    return ticks;
  } catch {
    return {};
  }
}

/** "7.24 km", or null for something not measured by distance. */
export function formatDistance(distanceM: number): string | null {
  if (distanceM <= 0) return null;
  return `${(distanceM / 1000).toFixed(2)} km`;
}

/** "41:03", or "1:12:40" once it runs past the hour. */
export function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.round(seconds % 60);
  const pad = (n: number) => String(n).padStart(2, "0");
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(secs)}` : `${minutes}:${pad(secs)}`;
}

/** "5:41 /km" for something you ran; null when pace is meaningless. */
export function formatPace(distanceM: number, movingSeconds: number): string | null {
  if (distanceM < 100 || movingSeconds <= 0) return null;
  const secondsPerKm = movingSeconds / (distanceM / 1000);
  const minutes = Math.floor(secondsPerKm / 60);
  const seconds = Math.round(secondsPerKm % 60);
  return `${minutes}:${String(seconds).padStart(2, "0")} /km`;
}
