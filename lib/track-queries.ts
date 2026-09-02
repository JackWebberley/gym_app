import { db } from "./db";
import { shiftDayKey, todayKey } from "./day";
import {
  estimateMaintenance,
  rollingSeries,
  summariseTrend,
  type Maintenance,
  type Trend,
  type TrendPoint,
  type WeighIn,
} from "./body";
import { summariseRecovery, type MuscleStatus } from "./recovery";

/// Reads for the tracking screen. Three months of weight, three weeks of intake
/// behind the maintenance figure, and two months of set logs behind the recovery
/// map — all of it one user's data, so the joins are small enough to reduce in
/// JavaScript rather than in SQL.

/// Long enough to see a cut working, short enough that the chart stays readable
/// on a phone.
export const CHART_DAYS = 90;
/// How far back the recovery map looks. A group untrained for longer than this
/// simply reads as untrained, which is the same message.
export const RECOVERY_LOOKBACK_DAYS = 60;

const SETTINGS_ID = "singleton";

export type TrackScreen = {
  today: string;
  /** One point per day for the chart: raw readings plus the trailing average. */
  series: TrendPoint[];
  trend: Trend;
  maintenance: Maintenance;
  /** What the goals say you are aiming to lose per week, for comparison. */
  weeklyLossTargetKg: number;
  /** Today's own figures, so the entry form opens on what is already there. */
  todayWeightKg: number | null;
  todaySteps: number | null;
  /** Mean daily steps over the last week, from the days that have any. */
  stepsAverage: number | null;
  stepsDays: number;
  weighInsThisWeek: number;
  recovery: MuscleStatus[];
  lastSessionAt: Date | null;
};

export type WeightSummary = {
  trend: Trend;
  /** Whether this morning is already on record, which is all the prompt needs. */
  loggedToday: boolean;
};

/**
 * Just the trend, for the dashboard.
 *
 * Deliberately not `getTrackScreen`: the home screen is the most-visited page in
 * the app and has no use for ninety days of chart points, a food-entry groupBy
 * or two months of set logs. Three weeks of one column covers the prompt.
 */
export async function getWeightSummary(today: string = todayKey()): Promise<WeightSummary> {
  const from = shiftDayKey(today, -20);
  const days = await db.dayLog.findMany({
    where: { date: { gte: from, lte: today }, weightKg: { not: null } },
    select: { date: true, weightKg: true },
    orderBy: { date: "asc" },
  });

  const weighIns: WeighIn[] = days.map((d) => ({ date: d.date, weightKg: d.weightKg! }));

  return {
    trend: summariseTrend(rollingSeries(weighIns, { from, to: today })),
    loggedToday: weighIns.some((w) => w.date === today),
  };
}

export async function getTrackScreen(today: string = todayKey()): Promise<TrackScreen> {
  const chartFrom = shiftDayKey(today, -(CHART_DAYS - 1));
  const weekFrom = shiftDayKey(today, -6);
  const setsFrom = new Date(Date.now() - RECOVERY_LOOKBACK_DAYS * 86_400_000);

  const [days, intakeByDayRows, sets, settings, lastSession] = await Promise.all([
    db.dayLog.findMany({
      where: { date: { gte: chartFrom, lte: today } },
      select: { date: true, weightKg: true, steps: true },
      orderBy: { date: "asc" },
    }),
    db.foodEntry.groupBy({
      by: ["dayLogDate"],
      where: { dayLogDate: { gte: chartFrom, lte: today } },
      _sum: { calories: true },
    }),
    db.setLog.findMany({
      where: { loggedAt: { gte: setsFrom } },
      select: {
        sessionId: true,
        loggedAt: true,
        isWarmup: true,
        exercise: { select: { muscleGroup: true } },
      },
    }),
    db.settings.findUnique({
      where: { id: SETTINGS_ID },
      select: { weeklyLossTargetKg: true },
    }),
    db.session.findFirst({
      where: { endedAt: { not: null } },
      orderBy: { endedAt: "desc" },
      select: { endedAt: true },
    }),
  ]);

  const weighIns: WeighIn[] = days
    .filter((d): d is typeof d & { weightKg: number } => d.weightKg != null)
    .map((d) => ({ date: d.date, weightKg: d.weightKg }));

  const series = rollingSeries(weighIns, { from: chartFrom, to: today });

  const intakeByDay = new Map(
    intakeByDayRows.map((row) => [row.dayLogDate, row._sum.calories ?? 0]),
  );

  const stepDays = days.filter(
    (d): d is typeof d & { steps: number } => d.steps != null && d.date >= weekFrom,
  );

  const todayRow = days.find((d) => d.date === today);

  return {
    today,
    series,
    trend: summariseTrend(series),
    maintenance: estimateMaintenance({ weighIns, intakeByDay, today }),
    weeklyLossTargetKg: settings?.weeklyLossTargetKg ?? 0.45,
    todayWeightKg: todayRow?.weightKg ?? null,
    todaySteps: todayRow?.steps ?? null,
    stepsAverage: stepDays.length
      ? Math.round(stepDays.reduce((sum, d) => sum + d.steps, 0) / stepDays.length)
      : null,
    stepsDays: stepDays.length,
    weighInsThisWeek: weighIns.filter((w) => w.date >= weekFrom).length,
    recovery: summariseRecovery(
      sets.map((s) => ({
        muscleGroup: s.exercise.muscleGroup,
        sessionId: s.sessionId,
        loggedAt: s.loggedAt,
        isWarmup: s.isWarmup,
      })),
    ),
    lastSessionAt: lastSession?.endedAt ?? null,
  };
}
