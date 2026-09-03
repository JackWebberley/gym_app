import { describe, expect, it } from "vitest";
import {
  formatDayKey,
  isValidDayKey,
  remaining,
  shiftDayKey,
  sumTotals,
  toDayKey,
  todayKey,
} from "../day";


describe("toDayKey", () => {
  it("formats a date in local time", () => {
    expect(toDayKey(new Date(2026, 8, 1, 9, 30))).toBe("2026-09-01");
  });

  it("keeps a late-night snack on its own day", () => {
    // The spec's §11 trap: 23:40 local is already tomorrow in UTC for UTC+1,
    // and toISOString() would file this under the 2nd.
    const lateSnack = new Date(2026, 8, 1, 23, 40);
    expect(toDayKey(lateSnack)).toBe("2026-09-01");
  });

  it("keeps an early-morning entry on its own day", () => {
    expect(toDayKey(new Date(2026, 8, 1, 0, 20))).toBe("2026-09-01");
  });

  it("pads single-digit months and days", () => {
    expect(toDayKey(new Date(2026, 0, 5, 12))).toBe("2026-01-05");
  });

  it("todayKey agrees with toDayKey", () => {
    const now = new Date(2026, 8, 1, 23, 59);
    expect(todayKey(now)).toBe(toDayKey(now));
  });
});

describe("shiftDayKey", () => {
  it("steps back a day", () => {
    expect(shiftDayKey("2026-09-01", -1)).toBe("2026-08-31");
  });

  it("steps forward across a month boundary", () => {
    expect(shiftDayKey("2026-08-31", 1)).toBe("2026-09-01");
  });

  it("crosses a year boundary", () => {
    expect(shiftDayKey("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("handles a leap day", () => {
    expect(shiftDayKey("2028-02-28", 1)).toBe("2028-02-29");
  });

  it("is stable across a spring DST transition", () => {
    // UK clocks go forward on 29 Mar 2026. Naive +86400000 arithmetic lands at
    // 00:00 BST on the 29th and can read back as the 28th.
    expect(shiftDayKey("2026-03-28", 1)).toBe("2026-03-29");
    expect(shiftDayKey("2026-03-29", 1)).toBe("2026-03-30");
  });

  it("is stable across an autumn DST transition", () => {
    expect(shiftDayKey("2026-10-25", 1)).toBe("2026-10-26");
  });

  it("round-trips", () => {
    expect(shiftDayKey(shiftDayKey("2026-09-01", -7), 7)).toBe("2026-09-01");
  });
});

describe("isValidDayKey", () => {
  it("accepts a real date", () => {
    expect(isValidDayKey("2026-09-01")).toBe(true);
  });

  it("rejects a malformed string", () => {
    expect(isValidDayKey("2026-9-1")).toBe(false);
    expect(isValidDayKey("nonsense")).toBe(false);
  });

  it("rejects a date that does not exist", () => {
    expect(isValidDayKey("2026-02-30")).toBe(false);
    expect(isValidDayKey("2026-13-01")).toBe(false);
  });
});

describe("formatDayKey", () => {
  it("renders the daily heading", () => {
    // en-GB CLDR abbreviates September as "Sept", not "Sep".
    expect(formatDayKey("2026-09-01")).toBe("Tuesday 1 Sept");
    expect(formatDayKey("2026-08-31")).toBe("Monday 31 Aug");
  });
});

describe("sumTotals", () => {
  it("adds up every macro", () => {
    expect(
      sumTotals([
        { calories: 134, proteinG: 4.4, carbsG: 27, fatG: 1 },
        { calories: 240, proteinG: 32, carbsG: 14, fatG: 6 },
      ]),
    ).toEqual({ calories: 374, proteinG: 36.4, carbsG: 41, fatG: 7 });
  });

  it("is zero for an empty day", () => {
    expect(sumTotals([])).toEqual({ calories: 0, proteinG: 0, carbsG: 0, fatG: 0 });
  });
});

describe("remaining", () => {
  it("reports what is left", () => {
    const r = remaining(1840, 2400);
    expect(r.left).toBe(560);
    expect(r.isOver).toBe(false);
    expect(r.fraction).toBeCloseTo(0.766, 2);
  });

  it("goes negative when over target", () => {
    const r = remaining(2600, 2400);
    expect(r.left).toBe(-200);
    expect(r.isOver).toBe(true);
  });

  it("clamps the bar at full when over", () => {
    expect(remaining(3000, 2400).fraction).toBe(1);
  });

  it("does not divide by a zero target", () => {
    expect(remaining(500, 0).fraction).toBe(0);
  });
});
