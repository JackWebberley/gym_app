/// All weights are stored in kg and all energy in kcal. Conversion happens at
/// the display layer only — see spec §11.

/** Rounds to the nearest 0.25kg — finer than any plate, coarse enough to avoid float dust. */
export function roundWeight(kg: number): number {
  return Math.round(kg * 4) / 4;
}

/** "61" not "61.0"; "62.5" keeps its decimal. */
export function formatWeight(kg: number): string {
  return Number.isInteger(kg) ? String(kg) : kg.toFixed(kg * 10 % 1 === 0 ? 1 : 2);
}

/** Epley. The cleanest single progress signal when rep ranges vary (§4.4). */
export function estimatedOneRepMax(weightKg: number, reps: number): number {
  if (reps <= 0) return 0;
  if (reps === 1) return weightKg;
  return weightKg * (1 + reps / 30);
}
