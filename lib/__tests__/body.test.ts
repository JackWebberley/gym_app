import { describe, expect, it } from "vitest";
import {
  changePerWeek,
  daysBetween,
  enumerateDays,
  estimateMaintenance,
  rollingSeries,
  summariseTrend,
  type WeighIn,
} from "../body";

/** A steady daily weigh-in starting at `from`, changing by `perDay` kg. */
function ramp(from: string, days: number, startKg: number, perDay: number): WeighIn[] {
  const out: WeighIn[] = [];
  let date = from;
  for (let i = 0; i < days; i++) {
    out.push({ date, weightKg: startKg + perDay * i });
    const [y, m, d] = date.split("-").map(Number);
    const next = new Date(y, m - 1, d, 12);
    next.setDate(next.getDate() + 1);
    date = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-${String(
      next.getDate(),
    ).padStart(2, "0")}`;
  }
  return out;
}

describe("enumerateDays", () => {
  it("is inclusive at both ends", () => {
    expect(enumerateDays("2026-09-01", "2026-09-03")).toEqual([
      "2026-09-01",
      "2026-09-02",
      "2026-09-03",
    ]);
  });

  it("returns nothing when the range is backwards, rather than looping forever", () => {
    expect(enumerateDays("2026-09-03", "2026-09-01")).toEqual([]);
  });

  it("crosses a month boundary", () => {
    expect(enumerateDays("2026-08-30", "2026-09-01")).toEqual([
      "2026-08-30",
      "2026-08-31",
      "2026-09-01",
    ]);
  });
});

describe("daysBetween", () => {
  it("counts whole days forwards and backwards", () => {
    expect(daysBetween("2026-09-01", "2026-09-08")).toBe(7);
    expect(daysBetween("2026-09-08", "2026-09-01")).toBe(-7);
  });

  it("is unmoved by a DST transition", () => {
    // The UK clocks go back on 25 October 2026. A naive millisecond division
    // would report 6.958 days and round to the wrong answer somewhere.
    expect(daysBetween("2026-10-22", "2026-10-29")).toBe(7);
  });
});

describe("rollingSeries", () => {
  it("keeps a point for every day, weighed or not", () => {
    const series = rollingSeries([{ date: "2026-09-02", weightKg: 84 }], {
      from: "2026-09-01",
      to: "2026-09-03",
    });
    // The raw reading exists only on the day it was taken; the average carries.
    expect(series.map((p) => p.weightKg)).toEqual([null, 84, null]);
    expect(series.map((p) => p.averageKg)).toEqual([null, 84, 84]);
  });

  it("averages only over the trailing window", () => {
    // 80 on the 1st has fallen out of a 7-day window by the 9th.
    const series = rollingSeries(
      [
        { date: "2026-09-01", weightKg: 80 },
        { date: "2026-09-09", weightKg: 90 },
      ],
      { from: "2026-09-09", to: "2026-09-09" },
    );
    expect(series[0].averageKg).toBe(90);
    expect(series[0].samples).toBe(1);
  });

  it("carries the average forward across a gap in weigh-ins", () => {
    // Missing the scales for a day should not blank the number you read.
    const series = rollingSeries(
      [
        { date: "2026-09-01", weightKg: 84 },
        { date: "2026-09-02", weightKg: 84.4 },
      ],
      { from: "2026-09-01", to: "2026-09-04" },
    );
    expect(series[3].weightKg).toBeNull();
    expect(series[3].averageKg).toBeCloseTo(84.2, 5);
  });

  it("smooths a spike instead of reporting it", () => {
    // The whole reason the raw figure is never shown on its own.
    const entries = ramp("2026-09-01", 7, 84, 0);
    entries[6] = { date: entries[6].date, weightKg: 86 };
    const series = rollingSeries(entries, { from: "2026-09-07", to: "2026-09-07" });
    expect(series[0].weightKg).toBe(86);
    expect(series[0].averageKg).toBeCloseTo(84.29, 1);
  });
});

describe("changePerWeek", () => {
  it("reports a loss as a negative figure", () => {
    const series = rollingSeries(ramp("2026-09-01", 21, 86, -0.05), {
      from: "2026-09-01",
      to: "2026-09-21",
    });
    // 0.05kg/day is 0.35kg/week off.
    expect(changePerWeek(series, 7)).toBeCloseTo(-0.35, 2);
  });

  it("is null until there is a week either side to compare", () => {
    const series = rollingSeries(ramp("2026-09-01", 3, 84, -0.1), {
      from: "2026-09-01",
      to: "2026-09-03",
    });
    expect(changePerWeek(series, 7)).toBeNull();
  });

  it("compares non-overlapping windows", () => {
    // Two averages seven days apart share no readings, so a real trend is not
    // flattened towards zero by counting the same days on both sides.
    const series = rollingSeries(ramp("2026-09-01", 28, 90, -0.1), {
      from: "2026-09-01",
      to: "2026-09-28",
    });
    expect(changePerWeek(series, 7)).toBeCloseTo(-0.7, 2);
  });
});

describe("summariseTrend", () => {
  it("reports the average and the raw figure separately", () => {
    const series = rollingSeries(
      [
        { date: "2026-09-01", weightKg: 84 },
        { date: "2026-09-02", weightKg: 85 },
      ],
      { from: "2026-09-01", to: "2026-09-02" },
    );
    const trend = summariseTrend(series);
    expect(trend.latestKg).toBe(85);
    expect(trend.averageKg).toBe(84.5);
    expect(trend.latestDate).toBe("2026-09-02");
  });

  it("is empty rather than zero when nothing has been logged", () => {
    const trend = summariseTrend(rollingSeries([], { from: "2026-09-01", to: "2026-09-07" }));
    expect(trend.averageKg).toBeNull();
    expect(trend.latestKg).toBeNull();
    expect(trend.weeklyChangeKg).toBeNull();
  });
});

describe("estimateMaintenance", () => {
  const intake = (days: string[], kcal: number) => new Map(days.map((d) => [d, kcal]));

  it("equals intake when weight is holding steady", () => {
    const days = enumerateDays("2026-08-12", "2026-09-01");
    const result = estimateMaintenance({
      weighIns: ramp("2026-08-12", 21, 84, 0),
      intakeByDay: intake(days, 2600),
      today: "2026-09-01",
    });
    expect(result.kind).toBe("ready");
    if (result.kind !== "ready") return;
    expect(result.kcal).toBe(2600);
    expect(result.weeklyChangeKg).toBeCloseTo(0, 5);
  });

  it("adds the deficit back on when weight is falling", () => {
    // Losing 0.35kg/week on 2,600 means maintenance is about 2,985.
    const days = enumerateDays("2026-08-12", "2026-09-01");
    const result = estimateMaintenance({
      weighIns: ramp("2026-08-12", 21, 86, -0.05),
      intakeByDay: intake(days, 2600),
      today: "2026-09-01",
    });
    expect(result.kind).toBe("ready");
    if (result.kind !== "ready") return;
    expect(result.kcal).toBeGreaterThan(2900);
    expect(result.kcal).toBeLessThan(3060);
  });

  it("subtracts when weight is going up", () => {
    const days = enumerateDays("2026-08-12", "2026-09-01");
    const gaining = estimateMaintenance({
      weighIns: ramp("2026-08-12", 21, 84, 0.05),
      intakeByDay: intake(days, 3000),
      today: "2026-09-01",
    });
    expect(gaining.kind).toBe("ready");
    if (gaining.kind !== "ready") return;
    expect(gaining.kcal).toBeLessThan(3000);
  });

  it("waits rather than showing a figure built on a fortnight", () => {
    const days = enumerateDays("2026-08-19", "2026-09-01");
    const result = estimateMaintenance({
      weighIns: ramp("2026-08-19", 8, 84, -0.05),
      intakeByDay: intake(days, 2600),
      today: "2026-09-01",
    });
    expect(result.kind).toBe("waiting");
    if (result.kind !== "waiting") return;
    expect(result.weighIns).toBe(8);
    expect(result.weighInsNeeded).toBe(10);
  });

  it("does not treat an unlogged day as a zero-calorie day", () => {
    // Three weeks of weigh-ins but only five days of food logged: averaging the
    // silence in would put maintenance hundreds of calories too low.
    const result = estimateMaintenance({
      weighIns: ramp("2026-08-12", 21, 84, 0),
      intakeByDay: intake(enumerateDays("2026-08-28", "2026-09-01"), 2600),
      today: "2026-09-01",
    });
    expect(result.kind).toBe("waiting");
    if (result.kind !== "waiting") return;
    expect(result.intakeDays).toBe(5);
  });

  it("ignores weigh-ins from before the window", () => {
    // Last year's weight says nothing about this month's maintenance.
    const days = enumerateDays("2026-08-12", "2026-09-01");
    const result = estimateMaintenance({
      weighIns: [...ramp("2025-01-01", 30, 95, 0), ...ramp("2026-08-12", 21, 84, 0)],
      intakeByDay: intake(days, 2600),
      today: "2026-09-01",
    });
    expect(result.kind).toBe("ready");
    if (result.kind !== "ready") return;
    expect(result.weighIns).toBe(21);
    expect(result.kcal).toBe(2600);
  });
});
