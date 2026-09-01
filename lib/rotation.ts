/// The rotation is a cycle, not a weekday schedule: skipping a session never
/// shifts what comes next (spec §4.1).

/**
 * Given the cycle length and the position of the last *completed* session,
 * returns the position that is up next. Wraps at the end.
 */
export function nextPosition(cycleLength: number, lastCompletedPosition: number | null): number {
  if (cycleLength <= 0) return 0;
  if (lastCompletedPosition === null) return 0;
  // Guard against a position left behind by a day that was removed from the cycle.
  if (lastCompletedPosition < 0 || lastCompletedPosition >= cycleLength) return 0;
  return (lastCompletedPosition + 1) % cycleLength;
}

/** Positions in the order they will come up, starting from `from`. Used for the "coming up" list. */
export function upcomingOrder(cycleLength: number, from: number): number[] {
  if (cycleLength <= 0) return [];
  return Array.from({ length: cycleLength }, (_, i) => (from + i) % cycleLength);
}
