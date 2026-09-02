/// What you have trained lately, and what is still sore.
///
/// Two questions, answered from the same set logs. "What needs to rest" is about
/// hours since the last hard work on a muscle; "what am I neglecting" is about
/// how many working sets it got this week. They disagree often enough to be
/// worth showing side by side — chest can be perfectly recovered and still be on
/// twenty sets a week while hamstrings sit on three.
///
/// The recovery model is deliberately simple and stated in the open rather than
/// dressed up as science: 48 hours for a normal amount of work, stretching
/// towards 72 as the session gets bigger. It is a prompt for judgement, not a
/// verdict.
///
/// Pure, so it can be tested without a database.

/// Every muscle group the exercise library uses, in the order a body reads
/// top-to-bottom. Anything unrecognised in the data is ignored rather than
/// silently lumped in with something else.
export const MUSCLE_GROUPS = [
  "chest",
  "back",
  "delts",
  "biceps",
  "triceps",
  "forearms",
  "core",
  "glutes",
  "quads",
  "hamstrings",
  "calves",
] as const;

export type MuscleGroup = (typeof MUSCLE_GROUPS)[number];

export const MUSCLE_LABEL: Record<MuscleGroup, string> = {
  chest: "Chest",
  back: "Back",
  delts: "Shoulders",
  biceps: "Biceps",
  triceps: "Triceps",
  forearms: "Forearms",
  core: "Core",
  glutes: "Glutes",
  quads: "Quads",
  hamstrings: "Hamstrings",
  calves: "Calves",
};

export function isMuscleGroup(value: string): value is MuscleGroup {
  return (MUSCLE_GROUPS as readonly string[]).includes(value);
}

/// A normal amount of direct work needs about two days.
export const BASE_RECOVERY_HOURS = 48;
/// Past this many working sets in one session, the muscle earns extra time.
export const REFERENCE_SETS = 6;
export const HOURS_PER_EXTRA_SET = 2;
/// Nothing here is ever more than three days, whatever the volume. Beyond that
/// the model would be inventing precision it does not have.
export const MAX_RECOVERY_HOURS = 72;

/// Weekly working sets below this get flagged. A rough floor drawn from the
/// usual 10-20 sets/week hypertrophy guidance, not a rule — the point is to make
/// a muscle group getting three sets a week visible, not to police the number.
export const LOW_WEEKLY_SETS = 6;

/// How far past a muscle's recovery window counts as leaving it too long. Scales
/// with the window, so a heavy session earns more slack than a light one.
export const OVERDUE_MULTIPLE = 2;

export const WEEK_DAYS = 7;

/** One working or warm-up set, as far as this module is concerned. */
export type SetRecord = {
  muscleGroup: string;
  sessionId: string;
  loggedAt: Date;
  isWarmup: boolean;
};

export type RecoveryState =
  /** Worked so recently it should be left alone. */
  | "worked"
  /** Inside its recovery window — trainable if you must, better not to. */
  | "recovering"
  /** Recovered. Fair game. */
  | "ready"
  /** Nothing logged for this group in the period looked at. */
  | "untrained";

export type MuscleStatus = {
  muscleGroup: MuscleGroup;
  label: string;
  lastWorkedAt: Date | null;
  /** Null when nothing was logged. */
  hoursSince: number | null;
  daysSince: number | null;
  /** Working sets in the most recent session that hit this group. */
  setsLastSession: number;
  /** Working sets in the last 7 days — the volume question (spec §4.4). */
  setsThisWeek: number;
  /** The window this group earned, given how hard it was last hit. */
  recoveryHours: number;
  state: RecoveryState;
  /** Recovered a long time ago. Not a problem on its own; a problem with low volume. */
  isOverdue: boolean;
  isLowVolume: boolean;
};

/** Hours a group needs after a session of `sets` working sets. */
export function recoveryHoursFor(sets: number): number {
  const extra = Math.max(0, sets - REFERENCE_SETS) * HOURS_PER_EXTRA_SET;
  return Math.min(MAX_RECOVERY_HOURS, BASE_RECOVERY_HOURS + extra);
}

function stateFor(hoursSince: number | null, recoveryHours: number): RecoveryState {
  if (hoursSince == null) return "untrained";
  // The first half of the window is the part where training it again is a
  // genuinely bad idea; the second half is a preference.
  if (hoursSince < recoveryHours / 2) return "worked";
  if (hoursSince < recoveryHours) return "recovering";
  return "ready";
}

/**
 * Every muscle group's status, in body order, whether or not it appears in the
 * data — a group with nothing logged is exactly the thing worth seeing.
 *
 * Warm-up sets count towards nothing: they are neither volume nor fatigue.
 */
export function summariseRecovery(sets: SetRecord[], now: Date = new Date()): MuscleStatus[] {
  const working = sets.filter((s) => !s.isWarmup && isMuscleGroup(s.muscleGroup));
  const weekAgo = new Date(now.getTime() - WEEK_DAYS * 86_400_000);

  return MUSCLE_GROUPS.map((muscleGroup) => {
    const mine = working
      .filter((s) => s.muscleGroup === muscleGroup)
      .sort((a, b) => b.loggedAt.getTime() - a.loggedAt.getTime());

    const latest = mine[0] ?? null;
    const lastWorkedAt = latest?.loggedAt ?? null;
    // Volume from the session, not from a rolling 24 hours: a session that
    // straddles midnight is still one session.
    const setsLastSession = latest ? mine.filter((s) => s.sessionId === latest.sessionId).length : 0;
    const setsThisWeek = mine.filter((s) => s.loggedAt >= weekAgo).length;

    const hoursSince =
      lastWorkedAt == null ? null : (now.getTime() - lastWorkedAt.getTime()) / 3_600_000;
    const recoveryHours = recoveryHoursFor(setsLastSession);

    return {
      muscleGroup,
      label: MUSCLE_LABEL[muscleGroup],
      lastWorkedAt,
      hoursSince,
      daysSince: hoursSince == null ? null : Math.floor(hoursSince / 24),
      setsLastSession,
      setsThisWeek,
      recoveryHours,
      state: stateFor(hoursSince, recoveryHours),
      isOverdue: hoursSince != null && hoursSince >= recoveryHours * OVERDUE_MULTIPLE,
      isLowVolume: setsThisWeek < LOW_WEEKLY_SETS,
    };
  });
}

/** Quick lookup for the diagram, which draws by group rather than by list order. */
export function byMuscleGroup(statuses: MuscleStatus[]): Record<MuscleGroup, MuscleStatus> {
  return Object.fromEntries(statuses.map((s) => [s.muscleGroup, s])) as Record<
    MuscleGroup,
    MuscleStatus
  >;
}

function longestAgo(status: MuscleStatus): number {
  return status.hoursSince ?? Number.MAX_SAFE_INTEGER;
}

/**
 * The one-line answer: what is ready to train, worst-recovered first among the
 * things you have been leaving alone. Used for the summary above the diagram.
 */
export function readyToTrain(statuses: MuscleStatus[]): MuscleStatus[] {
  return statuses
    .filter((s) => s.state === "ready" || s.state === "untrained")
    .sort((a, b) => {
      // Neglected volume first, then longest since trained.
      const volume = a.setsThisWeek - b.setsThisWeek;
      if (volume !== 0) return volume;
      // Never logged sorts as "longest ago", but as a finite number: two
      // Infinities subtract to NaN, and a NaN comparator makes the whole sort
      // undefined — which is exactly the case where nothing is logged at all.
      return longestAgo(b) - longestAgo(a);
    });
}

export function needsRest(statuses: MuscleStatus[]): MuscleStatus[] {
  return statuses
    .filter((s) => s.state === "worked" || s.state === "recovering")
    .sort((a, b) => (a.hoursSince ?? 0) - (b.hoursSince ?? 0));
}
