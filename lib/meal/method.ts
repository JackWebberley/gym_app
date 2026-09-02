/// Reading a stored cooking method back.
///
/// The method is written once by the model and then kept as JSON on the recipe
/// (see `Recipe.methodFullJson`), so every read of it is a read of data written
/// by an earlier version of this app — possibly one with a different shape. That
/// makes parsing it the kind of quiet, load-bearing rule the pure modules exist
/// to hold: a method that half-parses would print a step with the wrong weight
/// beside it, which is worse than printing no method at all.
///
/// So this is deliberately strict about structure and forgiving about content.
/// Anything it cannot vouch for comes back as null, which the screen reads as
/// "not written yet" and offers to write.

import type { FullMethod } from "./types";

/**
 * Parses a stored method, or returns null.
 *
 * Null covers three cases the screen treats identically: never written (the
 * empty-string default), unparseable, and parsed but the wrong shape. A method
 * with no steps is no method.
 */
export function parseFullMethod(json: string): FullMethod | null {
  if (!json) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== "object") return null;
  const candidate = parsed as Partial<FullMethod>;
  if (!Array.isArray(candidate.steps)) return null;

  const steps = candidate.steps
    .filter(
      (step): step is FullMethod["steps"][number] =>
        Boolean(step) && typeof step === "object" && typeof step.text === "string" && step.text.trim() !== "",
    )
    .map((step) => ({
      text: step.text.trim(),
      // A step's timing is decoration; a bad one is dropped rather than shown.
      minutes: typeof step.minutes === "number" && Number.isFinite(step.minutes) ? step.minutes : null,
      uses: Array.isArray(step.uses) ? step.uses.filter((u): u is string => typeof u === "string") : [],
    }));

  if (steps.length === 0) return null;

  return {
    equipment: Array.isArray(candidate.equipment)
      ? candidate.equipment.filter((e): e is string => typeof e === "string" && e.trim() !== "")
      : [],
    preheat:
      typeof candidate.preheat === "string" && candidate.preheat.trim() !== ""
        ? candidate.preheat.trim()
        : null,
    steps,
  };
}

/**
 * Canonicalises the ingredient names a method's steps refer to.
 *
 * The steps carry names so the screen can print our own gram figures beside
 * them; a name that does not match a recipe line is dropped, because a caption on
 * the wrong ingredient is a wrong quantity and a step with no caption still
 * reads. `resolve` is the caller's matcher — normally the same normalisation
 * used for generated ingredient names.
 */
export function canonicaliseSteps(
  method: FullMethod,
  resolve: (name: string) => string | null,
): FullMethod {
  return {
    ...method,
    steps: method.steps.map((step) => ({
      ...step,
      uses: step.uses.map(resolve).filter((name): name is string => name != null),
    })),
  };
}
