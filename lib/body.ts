/// Bodyweight, and what it actually means.
///
/// A single morning reading is mostly noise: salt, water and whether you have
/// been to the toilet move it further in a day than a week of dieting does. So
/// nothing outside the entry field ever shows one day's figure on its own — the
/// 7-day trailing average is the number that gets read, and the raw readings are
/// drawn faintly behind it, because seeing the scatter around a steadily falling
/// line is the single most reassuring thing a cutting tracker can show you
/// (spec §6).
///
/// Pure, so the arithmetic that decides whether the cut is working can be tested
/// without a database.

import { shiftDayKey } from "./day";

export const TREND_WINDOW_DAYS = 7;

/// 7,700 kcal ≈ 1kg of body mass. A rough constant — but it is the same rough
/// constant every week, so the *change* it reports is far more trustworthy than
/// any absolute figure derived from it.
export const KCAL_PER_KG = 7700;

/// Under three weeks the weight signal is smaller than the noise around it, and
/// a maintenance figure derived from it is worse than useless (spec §6).
export const MAINTENANCE_WINDOW_DAYS = 21;
/// Unlogged days are not zero-calorie days, so the intake average can only come
/// from days that were actually logged. Below this many, the average is being
/// asked to speak for too much silence.
export const MIN_INTAKE_DAYS = 14;
/// Two 7-day averages need enough readings to be averages rather than opinions.
export const MIN_WEIGH_INS = 10;
/// ...and they have to be far enough apart to describe a trend at all.
export const MIN_WEIGH_IN_SPAN_DAYS = 14;

export type WeighIn = { date: string; weightKg: number };

export type TrendPoint = {
  date: string;
  /** What the scales said. Null on a day with no weigh-in. */
  weightKg: number | null;
  /** Trailing mean over the window, or null while there is nothing to average. */
  averageKg: number | null;
  /** How many readings that average is built from — 1 is not a trend. */
  samples: number;
};

/** Inclusive list of day keys. Empty when `to` is before `from`. */
export function enumerateDays(from: string, to: string): string[] {
  const days: string[] = [];
  // ISO day keys sort lexicographically, so a string compare is a date compare.
  for (let key = from; key <= to; key = shiftDayKey(key, 1)) days.push(key);
  return days;
}

/** Whole days from `from` to `to`. Negative when `to` is earlier. */
export function daysBetween(from: string, to: string): number {
  const at = (key: string) => {
    const [y, m, d] = key.split("-").map(Number);
    // Midday: no DST transition can move the calendar date underneath us.
    return new Date(y, m - 1, d, 12).getTime();
  };
  return Math.round((at(to) - at(from)) / 86_400_000);
}

/**
 * One point per calendar day across the range, whether or not it was weighed.
 *
 * Days with no reading are kept rather than dropped so the chart's x-axis stays
 * a real timeline: a fortnight off the scales should read as a gap, not get
 * quietly compressed into looking like steady progress.
 */
export function rollingSeries(
  entries: WeighIn[],
  opts: { from: string; to: string; windowDays?: number },
): TrendPoint[] {
  const windowDays = opts.windowDays ?? TREND_WINDOW_DAYS;
  const byDate = new Map(entries.map((e) => [e.date, e.weightKg]));

  return enumerateDays(opts.from, opts.to).map((date) => {
    const windowStart = shiftDayKey(date, -(windowDays - 1));
    const inWindow = entries.filter((e) => e.date >= windowStart && e.date <= date);
    const averageKg = inWindow.length
      ? inWindow.reduce((sum, e) => sum + e.weightKg, 0) / inWindow.length
      : null;
    return { date, weightKg: byDate.get(date) ?? null, averageKg, samples: inWindow.length };
  });
}

/**
 * Change in the trailing average, expressed per week, measured across roughly
 * `spanDays`. Negative while losing.
 *
 * Compares the latest average against the newest one at least `spanDays` old, so
 * the two windows do not overlap and share no readings — an overlapping
 * comparison flattens real change towards zero.
 */
export function changePerWeek(series: TrendPoint[], spanDays: number): number | null {
  const withAverage = series.filter((p) => p.averageKg != null);
  if (withAverage.length === 0) return null;

  const last = withAverage[withAverage.length - 1];
  const cutoff = shiftDayKey(last.date, -spanDays);
  const earlier = [...withAverage].reverse().find((p) => p.date <= cutoff);
  if (!earlier) return null;

  const days = daysBetween(earlier.date, last.date);
  if (days < 1) return null;
  return ((last.averageKg! - earlier.averageKg!) / days) * 7;
}

export type Trend = {
  /** The figure to display. Null until something has been logged. */
  averageKg: number | null;
  samples: number;
  latestKg: number | null;
  latestDate: string | null;
  /** kg/week against the previous week, negative while losing. */
  weeklyChangeKg: number | null;
};

export function summariseTrend(series: TrendPoint[]): Trend {
  const withAverage = series.filter((p) => p.averageKg != null);
  const last = withAverage[withAverage.length - 1] ?? null;
  const weighed = series.filter((p) => p.weightKg != null);
  const lastWeighed = weighed[weighed.length - 1] ?? null;

  return {
    averageKg: last?.averageKg ?? null,
    samples: last?.samples ?? 0,
    latestKg: lastWeighed?.weightKg ?? null,
    latestDate: lastWeighed?.date ?? null,
    weeklyChangeKg: changePerWeek(series, TREND_WINDOW_DAYS),
  };
}

export type Maintenance =
  /** Enough data. This is maintenance, measured rather than predicted. */
  | {
      kind: "ready";
      kcal: number;
      weeklyChangeKg: number;
      averageIntake: number;
      intakeDays: number;
      weighIns: number;
      spanDays: number;
    }
  /** Not yet. Says exactly what is missing rather than showing a bad number. */
  | {
      kind: "waiting";
      intakeDays: number;
      intakeDaysNeeded: number;
      weighIns: number;
      weighInsNeeded: number;
      spanDays: number;
      spanDaysNeeded: number;
    };

/**
 * Maintenance calories, derived from your own intake and your own weight change
 * instead of a BMR formula or a watch's guess (spec §6).
 *
 * Energy balance says `intake - maintenance` is the daily surplus, and a surplus
 * of 7,700 kcal is about a kilo, so:
 *
 *   maintenance ≈ average intake - (weekly kg change × 7700 / 7)
 *
 * Note the minus. The spec writes this as a plus, which inverts it: a deficit
 * would come out as a *lower* maintenance than you are eating, which is the
 * opposite of what losing weight on 2,600 kcal tells you. Eating 2,600 and
 * holding steady means maintenance is 2,600; eating 2,600 and losing 0.35kg a
 * week means it is nearer 2,985.
 */
export function estimateMaintenance(input: {
  /** Weigh-ins, any order. Only those inside the window are considered. */
  weighIns: WeighIn[];
  /** Calories per day. Days absent from this map are unlogged, not zero. */
  intakeByDay: Map<string, number>;
  today: string;
  windowDays?: number;
}): Maintenance {
  const windowDays = input.windowDays ?? MAINTENANCE_WINDOW_DAYS;
  const from = shiftDayKey(input.today, -(windowDays - 1));

  const weighIns = input.weighIns
    .filter((w) => w.date >= from && w.date <= input.today)
    .sort((a, b) => a.date.localeCompare(b.date));

  const intake = [...input.intakeByDay.entries()]
    .filter(([date, kcal]) => date >= from && date <= input.today && kcal > 0)
    .map(([, kcal]) => kcal);

  const spanDays =
    weighIns.length >= 2 ? daysBetween(weighIns[0].date, weighIns[weighIns.length - 1].date) : 0;

  if (
    intake.length < MIN_INTAKE_DAYS ||
    weighIns.length < MIN_WEIGH_INS ||
    spanDays < MIN_WEIGH_IN_SPAN_DAYS
  ) {
    return {
      kind: "waiting",
      intakeDays: intake.length,
      intakeDaysNeeded: MIN_INTAKE_DAYS,
      weighIns: weighIns.length,
      weighInsNeeded: MIN_WEIGH_INS,
      spanDays,
      spanDaysNeeded: MIN_WEIGH_IN_SPAN_DAYS,
    };
  }

  const series = rollingSeries(weighIns, { from, to: input.today });
  // Across the whole window rather than week-on-week: three weeks of averaging
  // is the entire point of having waited for three weeks of data.
  const weeklyChangeKg = changePerWeek(series, spanDays - TREND_WINDOW_DAYS) ?? 0;
  const averageIntake = intake.reduce((sum, k) => sum + k, 0) / intake.length;

  return {
    kind: "ready",
    // Rounded to 10: the inputs do not justify a figure to the calorie.
    kcal: Math.round((averageIntake - (weeklyChangeKg * KCAL_PER_KG) / 7) / 10) * 10,
    weeklyChangeKg,
    averageIntake: Math.round(averageIntake),
    intakeDays: intake.length,
    weighIns: weighIns.length,
    spanDays,
  };
}
