import { describe, expect, it } from "vitest";
import { nextPosition, upcomingOrder } from "../rotation";

describe("nextPosition", () => {
  it("starts at the first day when nothing has been completed", () => {
    expect(nextPosition(3, null)).toBe(0);
  });

  it("advances one position", () => {
    expect(nextPosition(3, 0)).toBe(1);
  });

  it("wraps at the end of the cycle", () => {
    expect(nextPosition(3, 2)).toBe(0);
  });

  it("is a cycle, not a schedule: skipped days do not shift the rotation", () => {
    // Completed position 0 three weeks ago; position 1 is still what's next.
    expect(nextPosition(4, 0)).toBe(1);
  });

  it("falls back to the start if a day was removed from the cycle", () => {
    expect(nextPosition(2, 5)).toBe(0);
  });

  it("handles an empty cycle", () => {
    expect(nextPosition(0, null)).toBe(0);
  });
});

describe("upcomingOrder", () => {
  it("lists positions in rotation order from a starting point", () => {
    expect(upcomingOrder(4, 2)).toEqual([2, 3, 0, 1]);
  });

  it("is empty for an empty cycle", () => {
    expect(upcomingOrder(0, 0)).toEqual([]);
  });
});
