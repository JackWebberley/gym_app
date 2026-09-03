import { describe, expect, it } from "vitest";
import {
  formatDistance,
  formatDuration,
  formatPace,
  kindForSport,
  mapActivity,
  mergeStravaTicks,
  parseStravaTicks,
  ticksForDay,
} from "../strava/map";
import { DEFAULT_ACTIVITY_CONFIG, NO_ACTIVITY, targetFor, type ActivityLog } from "../activity";

const CONFIG = DEFAULT_ACTIVITY_CONFIG;

const activity = (sportType: string, km = 0) => ({ sportType, distanceM: km * 1000 });

describe("kindForSport", () => {
  it("maps the running sports", () => {
    expect(kindForSport("Run")).toBe("run");
    expect(kindForSport("TrailRun")).toBe("run");
    expect(kindForSport("VirtualRun")).toBe("run");
  });

  it("counts a hike as a walk", () => {
    expect(kindForSport("Walk")).toBe("walk");
    expect(kindForSport("Hike")).toBe("walk");
  });

  it("maps the lifting sports to the gym allowance", () => {
    expect(kindForSport("WeightTraining")).toBe("gym");
    expect(kindForSport("Crossfit")).toBe("gym");
    expect(kindForSport("HighIntensityIntervalTraining")).toBe("gym");
  });

  it("maps golf", () => {
    expect(kindForSport("Golf")).toBe("golf");
  });

  it("refuses to guess at a sport the model has no allowance for", () => {
    // Inventing a number for these would be worse than showing nothing.
    expect(kindForSport("Swim")).toBeNull();
    expect(kindForSport("Ride")).toBeNull();
    expect(kindForSport("AlpineSki")).toBeNull();
    expect(kindForSport("Anything Strava Adds Later")).toBeNull();
  });
});

describe("mapActivity", () => {
  it("bands a run by its distance", () => {
    expect(mapActivity(activity("Run", 7.2), CONFIG)).toEqual({ kind: "run", band: "medium" });
    expect(mapActivity(activity("Run", 3), CONFIG)).toEqual({ kind: "run", band: "short" });
    expect(mapActivity(activity("TrailRun", 18), CONFIG)).toEqual({ kind: "run", band: "long" });
  });

  it("gives the gym and golf no band, because they do not have one", () => {
    expect(mapActivity(activity("WeightTraining"), CONFIG)).toEqual({ kind: "gym", band: null });
    expect(mapActivity(activity("Golf", 9), CONFIG)).toEqual({ kind: "golf", band: null });
  });

  it("maps an unrecognised sport to nothing at all", () => {
    expect(mapActivity(activity("Swim", 2), CONFIG)).toEqual({ kind: null, band: null });
  });
});

describe("ticksForDay", () => {
  it("is a rest day when nothing was recorded", () => {
    expect(ticksForDay([], CONFIG)).toEqual(NO_ACTIVITY);
  });

  it("sums distance across the day before banding it", () => {
    // Two 4km runs is an 8km day, not two short ones.
    const ticks = ticksForDay([activity("Run", 4), activity("Run", 4)], CONFIG);
    expect(ticks.runBand).toBe("medium");
  });

  it("bands runs and walks separately", () => {
    const ticks = ticksForDay([activity("Run", 6), activity("Walk", 3)], CONFIG);
    expect(ticks.runBand).toBe("medium");
    expect(ticks.walkBand).toBe("short");
  });

  it("ticks the gym once however many sessions there were", () => {
    const ticks = ticksForDay([activity("WeightTraining"), activity("Crossfit")], CONFIG);
    expect(ticks.gym).toBe(true);
  });

  it("keeps a zero-distance run as a run rather than dropping it", () => {
    // A treadmill run with no distance recorded still happened.
    expect(ticksForDay([activity("Run", 0)], CONFIG).runBand).toBe("short");
  });

  it("leaves a kind null when nothing of that kind happened", () => {
    const ticks = ticksForDay([activity("Run", 5)], CONFIG);
    expect(ticks.walkBand).toBeNull();
    expect(ticks.gym).toBe(false);
  });

  it("ignores sports with no allowance", () => {
    expect(ticksForDay([activity("Swim", 2), activity("Ride", 40)], CONFIG)).toEqual(NO_ACTIVITY);
  });

  it("produces ticks that price a day correctly end to end", () => {
    const ticks = ticksForDay([activity("Run", 7), activity("WeightTraining")], CONFIG);
    // 2200 baseline + 350 medium run + 200 gym.
    expect(targetFor(ticks, CONFIG).total).toBe(2750);
  });
});

describe("mergeStravaTicks", () => {
  const strava = (partial: Partial<ActivityLog>): ActivityLog => ({ ...NO_ACTIVITY, ...partial });

  it("adopts everything on a day nobody has touched", () => {
    const merged = mergeStravaTicks(NO_ACTIVITY, {}, strava({ runBand: "medium" }));
    expect(merged.runBand).toBe("medium");
  });

  it("does not wipe a tick you set by hand", () => {
    // A gym session Strava cannot see must survive a run syncing.
    const current = strava({ gym: true });
    const merged = mergeStravaTicks(current, {}, strava({ runBand: "short" }));
    expect(merged).toEqual({ gym: true, golf: false, runBand: "short", walkBand: null });
  });

  it("replaces a tick it set itself when the activity changes", () => {
    const current = strava({ runBand: "short" });
    const merged = mergeStravaTicks(current, { runBand: "short" }, strava({ runBand: "long" }));
    expect(merged.runBand).toBe("long");
  });

  it("clears a tick it set once the activity is deleted", () => {
    // The other obvious rule — only ever add — would strand this for ever.
    const current = strava({ runBand: "medium" });
    const merged = mergeStravaTicks(current, { runBand: "medium" }, NO_ACTIVITY);
    expect(merged.runBand).toBeNull();
  });

  it("leaves your override alone even when Strava changes its mind", () => {
    // Strava said short, you corrected it to long: a re-sync must not undo that.
    const current = strava({ runBand: "long" });
    const merged = mergeStravaTicks(current, { runBand: "short" }, strava({ runBand: "medium" }));
    expect(merged.runBand).toBe("long");
  });

  it("respects you unticking something Strava set", () => {
    const current = strava({ gym: false });
    const merged = mergeStravaTicks(current, { gym: true }, strava({ gym: true }));
    expect(merged.gym).toBe(false);
  });

  it("touches nothing when Strava has nothing to say and never did", () => {
    const current = strava({ gym: true, walkBand: "long" });
    expect(mergeStravaTicks(current, {}, NO_ACTIVITY)).toEqual(current);
  });
});

describe("parseStravaTicks", () => {
  it("reads back what was written", () => {
    const ticks = { gym: true, golf: false, runBand: "medium" as const, walkBand: null };
    expect(parseStravaTicks(JSON.stringify(ticks))).toEqual(ticks);
  });

  it("returns nothing for the empty default", () => {
    expect(parseStravaTicks("{}")).toEqual({});
  });

  it("survives junk rather than throwing mid-sync", () => {
    expect(parseStravaTicks("not json")).toEqual({});
    expect(parseStravaTicks("[1,2]")).toEqual({});
    expect(parseStravaTicks('{"gym":"yes","runBand":3}')).toEqual({});
  });
});

describe("formatting", () => {
  it("shows distance in km, and nothing for something unmeasured", () => {
    expect(formatDistance(7243)).toBe("7.24 km");
    expect(formatDistance(0)).toBeNull();
  });

  it("shows duration, growing an hours field only when needed", () => {
    expect(formatDuration(2463)).toBe("41:03");
    expect(formatDuration(4360)).toBe("1:12:40");
    expect(formatDuration(59)).toBe("0:59");
  });

  it("shows pace per km", () => {
    expect(formatPace(5000, 1500)).toBe("5:00 /km");
  });

  it("gives no pace for a gym session, where it would be nonsense", () => {
    expect(formatPace(0, 3600)).toBeNull();
  });
});
