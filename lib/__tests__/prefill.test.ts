import { describe, expect, it } from "vitest";
import { buildPrefill } from "../prefill";

describe("buildPrefill", () => {
  it("fills each set from the matching set number last time", () => {
    const rows = buildPrefill([{ weightKg: 61, reps: 10 }, { weightKg: 61, reps: 9 }], 2);
    expect(rows).toEqual([
      { setNumber: 1, weightKg: 61, reps: 10 },
      { setNumber: 2, weightKg: 61, reps: 9 },
    ]);
  });

  it("falls back to the last logged set when the target adds sets", () => {
    const rows = buildPrefill([{ weightKg: 61, reps: 10 }, { weightKg: 61, reps: 8 }], 4);
    expect(rows[2]).toEqual({ setNumber: 3, weightKg: 61, reps: 8 });
    expect(rows[3]).toEqual({ setNumber: 4, weightKg: 61, reps: 8 });
  });

  it("keeps extra sets from last time even if the target shrank", () => {
    expect(buildPrefill([{ weightKg: 61, reps: 10 }, { weightKg: 61, reps: 8 }], 1)).toHaveLength(2);
  });

  it("returns empty rows with no history", () => {
    expect(buildPrefill([], 3)).toEqual([
      { setNumber: 1, weightKg: null, reps: null },
      { setNumber: 2, weightKg: null, reps: null },
      { setNumber: 3, weightKg: null, reps: null },
    ]);
  });
});
