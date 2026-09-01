import type { WorkingSet } from "./progression";

/// Prefill (spec §4.2): weight and reps default to the previous session's values
/// for that set number, so most sets are logged with zero typing.

export type PrefillRow = { setNumber: number; weightKg: number | null; reps: number | null };

/**
 * Builds `targetSets` rows for an exercise from its last session's working sets.
 * Set 4 with no set-4 history falls back to the last set that does exist, which is
 * almost always what you'd have typed anyway.
 */
export function buildPrefill(lastSets: WorkingSet[], targetSets: number): PrefillRow[] {
  const count = Math.max(targetSets, lastSets.length);
  return Array.from({ length: count }, (_, i) => {
    const source = lastSets[i] ?? lastSets[lastSets.length - 1];
    return {
      setNumber: i + 1,
      weightKg: source?.weightKg ?? null,
      reps: source?.reps ?? null,
    };
  });
}
