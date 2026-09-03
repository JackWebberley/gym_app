import { describe, expect, it } from "vitest";
import {
  allowanceFor,
  bandForKm,
  bandLabel,
  DEFAULT_ACTIVITY_CONFIG,
  describeActivities,
  isRestDay,
  NO_ACTIVITY,
  parseTargetParts,
  targetFor,
  type ActivityConfig,
  type ActivityLog,
} from "../activity";

const CONFIG = DEFAULT_ACTIVITY_CONFIG;

function day(partial: Partial<ActivityLog> = {}): ActivityLog {
  return { ...NO_ACTIVITY, ...partial };
}

const total = (partial: Partial<ActivityLog>, config: ActivityConfig = CONFIG) =>
  targetFor(day(partial), config).total;

describe("targetFor", () => {
  it("is the baseline on a day with nothing ticked", () => {
    expect(total({})).toBe(2200);
  });

  it("adds the gym allowance", () => {
    expect(total({ gym: true })).toBe(2400);
  });

  it("adds the golf allowance", () => {
    expect(total({ golf: true })).toBe(2800);
  });

  it("bands the run", () => {
    expect(total({ runBand: "short" })).toBe(2400);
    expect(total({ runBand: "medium" })).toBe(2550);
    expect(total({ runBand: "long" })).toBe(2700);
  });

  it("bands the walk", () => {
    expect(total({ walkBand: "short" })).toBe(2275);
    expect(total({ walkBand: "medium" })).toBe(2350);
    expect(total({ walkBand: "long" })).toBe(2450);
  });

  it("stacks several activities", () => {
    // 2200 + 200 gym + 200 short run + 75 short walk.
    expect(total({ gym: true, runBand: "short", walkBand: "short" })).toBe(2675);
  });

  it("ignores the walk on a golf day — the round already is the walking", () => {
    // 2200 + 600 golf, with the 250 long walk not counted twice.
    expect(total({ golf: true, walkBand: "long" })).toBe(2800);
    expect(total({ golf: true, walkBand: "long" })).toBe(total({ golf: true }));
  });

  it("still counts a run on a golf day — that is a separate effort", () => {
    expect(total({ golf: true, runBand: "medium" })).toBe(2900);
  });

  it("leaves the walk out of the breakdown entirely on a golf day", () => {
    const parts = targetFor(day({ golf: true, walkBand: "long" }), CONFIG).parts;
    expect(parts.map((p) => p.kind)).toEqual(["baseline", "golf"]);
  });

  it("caps the total however much was done", () => {
    const breakdown = targetFor(
      day({ gym: true, golf: true, runBand: "long", walkBand: "long" }),
      CONFIG,
    );
    // 2200 + 200 + 600 + 500 = 3500 before the cap; the walk never counted.
    expect(breakdown.subtotal).toBe(3500);
    expect(breakdown.total).toBe(2900);
    expect(breakdown.capped).toBe(true);
  });

  it("shows the cap as a deduction that makes the sum add up", () => {
    const breakdown = targetFor(day({ gym: true, golf: true, runBand: "long" }), CONFIG);
    const summed = breakdown.parts.reduce((sum, part) => sum + part.kcal, 0);
    expect(summed).toBe(breakdown.total);
    expect(breakdown.parts.at(-1)).toMatchObject({ kind: "cap", kcal: -600 });
  });

  it("does not add a cap line when the cap does not bite", () => {
    const breakdown = targetFor(day({ gym: true }), CONFIG);
    expect(breakdown.capped).toBe(false);
    expect(breakdown.parts.map((p) => p.kind)).toEqual(["baseline", "gym"]);
  });

  it("caps a baseline that is already over it, rather than going backwards", () => {
    const silly: ActivityConfig = { ...CONFIG, baselineCalories: 3200 };
    expect(total({ gym: true }, silly)).toBe(2900);
  });
});

describe("addOnScalePercent", () => {
  const at = (percent: number): ActivityConfig => ({ ...CONFIG, addOnScalePercent: percent });

  it("leaves the baseline alone", () => {
    expect(total({}, at(50))).toBe(2200);
  });

  it("shrinks every allowance together", () => {
    // Gym 200 -> 100, golf 600 -> 300.
    expect(total({ gym: true }, at(50))).toBe(2300);
    expect(total({ golf: true }, at(50))).toBe(2500);
    expect(total({ gym: true, golf: true }, at(50))).toBe(2600);
  });

  it("can grow them too", () => {
    expect(total({ gym: true }, at(150))).toBe(2500);
  });

  it("takes everything to the baseline at zero", () => {
    expect(total({ gym: true, golf: true, runBand: "long" }, at(0))).toBe(2200);
  });

  it("rounds each allowance to a round number rather than to the calorie", () => {
    // 75 walk at 90% is 67.5, which should present as 70, not 67.5.
    expect(allowanceFor("walk", "short", at(90))).toBe(70);
  });
});

describe("bands", () => {
  it("labels the bands from the configured edges", () => {
    expect(bandLabel("short", CONFIG)).toBe("0–5 km");
    expect(bandLabel("medium", CONFIG)).toBe("5–10 km");
    expect(bandLabel("long", CONFIG)).toBe("10 km+");
  });

  it("relabels when the edges are retuned", () => {
    const config: ActivityConfig = { ...CONFIG, bandShortMaxKm: 4, bandMediumMaxKm: 12 };
    expect(bandLabel("medium", config)).toBe("4–12 km");
  });

  it("maps a distance to a band, boundaries inclusive of the lower band", () => {
    expect(bandForKm(0, CONFIG)).toBe("short");
    expect(bandForKm(5, CONFIG)).toBe("short");
    expect(bandForKm(5.1, CONFIG)).toBe("medium");
    expect(bandForKm(10, CONFIG)).toBe("medium");
    expect(bandForKm(10.1, CONFIG)).toBe("long");
    expect(bandForKm(42.2, CONFIG)).toBe("long");
  });
});

describe("describeActivities", () => {
  it("names a day with nothing on it", () => {
    expect(describeActivities(day({}), CONFIG)).toBe("Rest day");
    expect(isRestDay(day({}))).toBe(true);
  });

  it("lists what was ticked", () => {
    expect(describeActivities(day({ gym: true, runBand: "medium" }), CONFIG)).toBe(
      "Gym · Run 5–10 km",
    );
  });

  it("does not list a walk that golf swallowed", () => {
    expect(describeActivities(day({ golf: true, walkBand: "long" }), CONFIG)).toBe("Golf");
  });

  it("counts a ticked walk as a non-rest day even though it is small", () => {
    expect(isRestDay(day({ walkBand: "short" }))).toBe(false);
  });
});

describe("parseTargetParts", () => {
  it("reads back what was written", () => {
    const parts = targetFor(day({ gym: true }), CONFIG).parts;
    expect(parseTargetParts(JSON.stringify(parts))).toEqual(parts);
  });

  it("returns nothing for the empty default rather than throwing", () => {
    expect(parseTargetParts("[]")).toEqual([]);
  });

  it("survives junk in the column", () => {
    expect(parseTargetParts("not json")).toEqual([]);
    expect(parseTargetParts('{"kind":"baseline"}')).toEqual([]);
    expect(parseTargetParts('[{"nope":1},{"label":"Gym","kcal":200}]')).toEqual([
      { label: "Gym", kcal: 200 },
    ]);
  });
});
