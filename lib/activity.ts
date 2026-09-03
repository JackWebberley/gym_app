/// What a day is worth, built up from what you did.
///
/// The old model had two fixed numbers — 2400 normally, 2800 if you played golf
/// — which forced every day into one of two shapes. A gym session and a golf
/// round are not the same size, and neither is a 3km walk and a 12km one, so the
/// target is now a rest-day baseline with allowances added for the things you
/// actually ticked.
///
/// Every figure is a guess. That is the reason for the cap and the scale dial:
/// stacked guesses drift further than a single one, so no day may exceed the cap
/// however much you did, and one setting shrinks every allowance together when
/// the weight trend says the whole model is too generous.
///
/// Pure, so the arithmetic behind every target can be tested without a database.

export const DISTANCE_BANDS = ["short", "medium", "long"] as const;
export type DistanceBand = (typeof DISTANCE_BANDS)[number];

export const ACTIVITY_KINDS = ["gym", "golf", "run", "walk"] as const;
export type ActivityKind = (typeof ACTIVITY_KINDS)[number];

/** What was ticked for one day. */
export type ActivityLog = {
  gym: boolean;
  golf: boolean;
  /** Null means not ticked at all, which is different from a short one. */
  runBand: DistanceBand | null;
  walkBand: DistanceBand | null;
};

export const NO_ACTIVITY: ActivityLog = {
  gym: false,
  golf: false,
  runBand: null,
  walkBand: null,
};

/**
 * Every tunable number in one object, so the model can be retuned from the
 * settings screen rather than from a deploy.
 */
export type ActivityConfig = {
  baselineCalories: number;
  calorieCap: number;
  /** Applies to allowances only. The baseline is not an allowance. */
  addOnScalePercent: number;
  gymCalories: number;
  golfCalories: number;
  runCalories: Record<DistanceBand, number>;
  walkCalories: Record<DistanceBand, number>;
  /** Band edges in km: short up to the first, medium up to the second. */
  bandShortMaxKm: number;
  bandMediumMaxKm: number;
};

export const DEFAULT_ACTIVITY_CONFIG: ActivityConfig = {
  baselineCalories: 2200,
  calorieCap: 2900,
  addOnScalePercent: 100,
  gymCalories: 200,
  golfCalories: 600,
  runCalories: { short: 200, medium: 350, long: 500 },
  walkCalories: { short: 75, medium: 150, long: 250 },
  bandShortMaxKm: 5,
  bandMediumMaxKm: 10,
};

export const ACTIVITY_LABEL: Record<ActivityKind, string> = {
  gym: "Gym",
  golf: "Golf",
  run: "Run",
  walk: "Walk",
};

/** "0–5 km", "5–10 km", "10 km+" — the labels on the buttons you tick. */
export function bandLabel(band: DistanceBand, config: ActivityConfig): string {
  const short = trimKm(config.bandShortMaxKm);
  const medium = trimKm(config.bandMediumMaxKm);
  switch (band) {
    case "short":
      return `0–${short} km`;
    case "medium":
      return `${short}–${medium} km`;
    case "long":
      return `${medium} km+`;
  }
}

function trimKm(km: number): string {
  return Number.isInteger(km) ? String(km) : km.toFixed(1);
}

/**
 * The band a real distance falls in. Nothing calls this yet — it is what a
 * Strava sync will use to tick the right button from a recorded distance.
 */
export function bandForKm(km: number, config: ActivityConfig): DistanceBand {
  if (km <= config.bandShortMaxKm) return "short";
  if (km <= config.bandMediumMaxKm) return "medium";
  return "long";
}

export function isDistanceBand(value: unknown): value is DistanceBand {
  return typeof value === "string" && (DISTANCE_BANDS as readonly string[]).includes(value);
}

/// Allowances land on a round number of calories. They are estimates to within a
/// couple of hundred; presenting one as 187 would be false precision, and the
/// rest of the app already rounds calories to fives.
const ROUND_TO = 5;

function scaled(kcal: number, config: ActivityConfig): number {
  return Math.round((kcal * config.addOnScalePercent) / 100 / ROUND_TO) * ROUND_TO;
}

/** What one ticked activity is worth, after scaling. */
export function allowanceFor(
  kind: ActivityKind,
  band: DistanceBand | null,
  config: ActivityConfig,
): number {
  switch (kind) {
    case "gym":
      return scaled(config.gymCalories, config);
    case "golf":
      return scaled(config.golfCalories, config);
    case "run":
      return band ? scaled(config.runCalories[band], config) : 0;
    case "walk":
      return band ? scaled(config.walkCalories[band], config) : 0;
  }
}

export type TargetPart = {
  kind: "baseline" | ActivityKind | "cap";
  label: string;
  /** Negative on the cap line, which is a deduction. */
  kcal: number;
};

export type TargetBreakdown = {
  parts: TargetPart[];
  /** Before the cap. */
  subtotal: number;
  total: number;
  capped: boolean;
};

/**
 * A day's calorie target, and the sum that produced it.
 *
 * Golf swallows the walk: a round is four hours of walking already, and counting
 * both would pay twice for the same steps. A run still counts — that is a
 * separate effort, not the same one described twice.
 */
export function targetFor(activities: ActivityLog, config: ActivityConfig): TargetBreakdown {
  const parts: TargetPart[] = [
    { kind: "baseline", label: "Baseline", kcal: config.baselineCalories },
  ];

  if (activities.gym) {
    parts.push({ kind: "gym", label: ACTIVITY_LABEL.gym, kcal: allowanceFor("gym", null, config) });
  }
  if (activities.golf) {
    parts.push({
      kind: "golf",
      label: ACTIVITY_LABEL.golf,
      kcal: allowanceFor("golf", null, config),
    });
  }
  if (activities.runBand) {
    parts.push({
      kind: "run",
      label: `${ACTIVITY_LABEL.run} ${bandLabel(activities.runBand, config)}`,
      kcal: allowanceFor("run", activities.runBand, config),
    });
  }
  if (activities.walkBand && !activities.golf) {
    parts.push({
      kind: "walk",
      label: `${ACTIVITY_LABEL.walk} ${bandLabel(activities.walkBand, config)}`,
      kcal: allowanceFor("walk", activities.walkBand, config),
    });
  }

  const subtotal = parts.reduce((sum, part) => sum + part.kcal, 0);
  const total = Math.min(subtotal, config.calorieCap);
  const capped = subtotal > config.calorieCap;

  if (capped) {
    parts.push({ kind: "cap", label: `Capped at ${config.calorieCap}`, kcal: total - subtotal });
  }

  return { parts, subtotal, total, capped };
}

/** True when the day has nothing ticked — the plain rest day. */
export function isRestDay(activities: ActivityLog): boolean {
  return !activities.gym && !activities.golf && !activities.runBand && !activities.walkBand;
}

/**
 * A short description of the day: "Gym · Golf", or "Rest day". Used wherever the
 * old model printed "Base day" or "Golf day".
 */
export function describeActivities(activities: ActivityLog, config: ActivityConfig): string {
  if (isRestDay(activities)) return "Rest day";

  const names: string[] = [];
  if (activities.gym) names.push(ACTIVITY_LABEL.gym);
  if (activities.golf) names.push(ACTIVITY_LABEL.golf);
  if (activities.runBand) names.push(`${ACTIVITY_LABEL.run} ${bandLabel(activities.runBand, config)}`);
  // Ticked but not counted: say so rather than listing it as if it paid.
  if (activities.walkBand && !activities.golf) {
    names.push(`${ACTIVITY_LABEL.walk} ${bandLabel(activities.walkBand, config)}`);
  }
  return names.join(" · ");
}

/** Reads the stored JSON breakdown back, tolerating anything that is not it. */
export function parseTargetParts(raw: string): TargetPart[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (part): part is TargetPart =>
        typeof part === "object" &&
        part !== null &&
        typeof (part as TargetPart).label === "string" &&
        typeof (part as TargetPart).kcal === "number",
    );
  } catch {
    return [];
  }
}
