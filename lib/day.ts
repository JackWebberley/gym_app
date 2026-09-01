/// Day keys and targets. A DayLog is keyed by a local calendar date string, never
/// a timestamp: a 23:40 snack belongs to that day, not the next one in UTC (spec §11).

export type DayType = "base" | "golf";

/** "YYYY-MM-DD" for a Date, read in *local* time. */
export function toDayKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Today's key in local time. */
export function todayKey(now: Date = new Date()): string {
  return toDayKey(now);
}

/** Shifts a day key by whole days without going near timezone arithmetic. */
export function shiftDayKey(key: string, days: number): string {
  const [y, m, d] = key.split("-").map(Number);
  // Midday avoids any chance of a DST transition moving the calendar date.
  const date = new Date(y, m - 1, d, 12, 0, 0);
  date.setDate(date.getDate() + days);
  return toDayKey(date);
}

/** "Monday 1 Sep" — the heading on the daily view. */
export function formatDayKey(key: string, locale = "en-GB"): string {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d, 12).toLocaleDateString(locale, {
    weekday: "long",
    day: "numeric",
    month: "short",
  });
}

export function isValidDayKey(key: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return false;
  const [y, m, d] = key.split("-").map(Number);
  const date = new Date(y, m - 1, d, 12);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
}

export type Goals = {
  baseCalories: number;
  golfDayCalories: number;
  proteinTargetG: number;
};

/** The calorie target a given day type earns. Golf days get their own figure (spec §7). */
export function calorieTargetFor(dayType: DayType, goals: Goals): number {
  return dayType === "golf" ? goals.golfDayCalories : goals.baseCalories;
}

export type Totals = { calories: number; proteinG: number; carbsG: number; fatG: number };

export const ZERO_TOTALS: Totals = { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 };

export function sumTotals(entries: Totals[]): Totals {
  return entries.reduce(
    (acc, e) => ({
      calories: acc.calories + e.calories,
      proteinG: acc.proteinG + e.proteinG,
      carbsG: acc.carbsG + e.carbsG,
      fatG: acc.fatG + e.fatG,
    }),
    { ...ZERO_TOTALS },
  );
}

export type Remaining = {
  consumed: number;
  target: number;
  left: number;
  /** 0–1, clamped, for the progress bar. */
  fraction: number;
  isOver: boolean;
};

export function remaining(consumed: number, target: number): Remaining {
  const left = target - consumed;
  return {
    consumed,
    target,
    left,
    fraction: target > 0 ? Math.min(1, Math.max(0, consumed / target)) : 0,
    isOver: left < 0,
  };
}
