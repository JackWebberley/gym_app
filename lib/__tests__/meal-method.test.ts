import { describe, expect, it } from "vitest";
import { canonicaliseSteps, parseFullMethod } from "../meal/method";
import type { FullMethod } from "../meal/types";

/// The stored method is JSON written by an earlier run of the app, so reading it
/// back is the one part of this feature that can fail silently: a half-parsed
/// method would print a step with the wrong weight beside it. Everything here is
/// about the parser refusing rather than guessing.

const GOOD: FullMethod = {
  equipment: ["large non-stick frying pan"],
  preheat: "200°C fan",
  steps: [
    { text: "Season the chicken and sear it skin-side down.", minutes: 6, uses: ["Chicken breast"] },
    { text: "Rest it while the rice finishes.", minutes: null, uses: [] },
  ],
};

describe("parseFullMethod", () => {
  it("round-trips a method it wrote itself", () => {
    expect(parseFullMethod(JSON.stringify(GOOD))).toEqual(GOOD);
  });

  it("treats 'not written yet' as null", () => {
    // The column default. This is the state the screen offers to fill in, and it
    // must never be confused with a method that failed to parse.
    expect(parseFullMethod("")).toBeNull();
  });

  it("returns null rather than throwing on junk", () => {
    expect(parseFullMethod("{oh no")).toBeNull();
    expect(parseFullMethod("null")).toBeNull();
    expect(parseFullMethod('"a string"')).toBeNull();
    expect(parseFullMethod("[]")).toBeNull();
  });

  it("rejects a method with no usable steps", () => {
    // A method is its steps. Equipment alone is not a recipe, and rendering an
    // empty ordered list would read as a bug.
    expect(parseFullMethod(JSON.stringify({ equipment: ["pan"], steps: [] }))).toBeNull();
    expect(parseFullMethod(JSON.stringify({ steps: [{ minutes: 5 }, { text: "   " }] }))).toBeNull();
  });

  it("keeps the good steps and drops the malformed ones", () => {
    const method = parseFullMethod(
      JSON.stringify({
        steps: [{ text: "Boil the kettle." }, { minutes: 3 }, { text: "Pour it over." }],
      }),
    );
    expect(method?.steps.map((s) => s.text)).toEqual(["Boil the kettle.", "Pour it over."]);
  });

  it("defaults the decoration rather than failing on it", () => {
    // minutes and uses are captions. A bad one costs a caption, not the method.
    const method = parseFullMethod(
      JSON.stringify({
        equipment: ["pan", 42, ""],
        preheat: "  ",
        steps: [{ text: "Fry it.", minutes: "eight", uses: ["Butter", 7, null] }],
      }),
    );
    expect(method).toEqual({
      equipment: ["pan"],
      preheat: null,
      steps: [{ text: "Fry it.", minutes: null, uses: ["Butter"] }],
    });
  });

  it("keeps a zero-minute step distinguishable from an untimed one", () => {
    const method = parseFullMethod(
      JSON.stringify({ steps: [{ text: "Plate up.", minutes: 0, uses: [] }] }),
    );
    expect(method?.steps[0].minutes).toBe(0);
  });
});

describe("canonicaliseSteps", () => {
  const resolve = (name: string) =>
    ({ chicken: "Chicken breast", rice: "Basmati rice" })[name.toLowerCase()] ?? null;

  it("rewrites the names a step refers to", () => {
    const method: FullMethod = {
      equipment: [],
      preheat: null,
      steps: [{ text: "Fry it.", minutes: 5, uses: ["chicken", "RICE"] }],
    };
    expect(canonicaliseSteps(method, resolve).steps[0].uses).toEqual([
      "Chicken breast",
      "Basmati rice",
    ]);
  });

  it("drops a name that does not resolve, and keeps the step", () => {
    // The quantity beside a step is computed from the recipe line it names, so an
    // unmatched name would either print nothing or — far worse — be matched
    // loosely to the wrong line. It is dropped before it is ever stored.
    const method: FullMethod = {
      equipment: [],
      preheat: null,
      steps: [{ text: "Add the sriracha.", minutes: null, uses: ["sriracha", "chicken"] }],
    };
    const result = canonicaliseSteps(method, resolve);
    expect(result.steps).toHaveLength(1);
    expect(result.steps[0].uses).toEqual(["Chicken breast"]);
  });

  it("leaves everything else alone", () => {
    const method: FullMethod = {
      equipment: ["wok"],
      preheat: "grill on high",
      steps: [{ text: "Grill it.", minutes: 4, uses: [] }],
    };
    expect(canonicaliseSteps(method, resolve)).toEqual(method);
  });
});
