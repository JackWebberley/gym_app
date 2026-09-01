import { db } from "./db";
import { buildPrefill } from "./prefill";
import {
  formatLastPerformance,
  progressionCue,
  type ExerciseSessionHistory,
  type ProgressionCue,
  type WorkingSet,
} from "./progression";
import { nextPosition, upcomingOrder } from "./rotation";

/// Read models for the screens. Everything the UI needs is assembled here so the
/// pages stay declarative and the rotation/prefill rules live in one place.

export type HomeData = Awaited<ReturnType<typeof getHomeData>>;

export async function getHomeData() {
  const [cycle, inProgress, groups, recentSessions] = await Promise.all([
    db.cycle.findFirst({
      where: { isActive: true },
      include: {
        slots: {
          orderBy: { position: "asc" },
          include: {
            group: {
              include: {
                items: {
                  orderBy: { order: "asc" },
                  include: { exercise: { select: { name: true, muscleGroup: true } } },
                },
              },
            },
          },
        },
      },
    }),
    db.session.findFirst({
      where: { endedAt: null },
      orderBy: { startedAt: "desc" },
      include: { group: { select: { name: true } }, _count: { select: { sets: true } } },
    }),
    db.exerciseGroup.findMany({
      where: { isArchived: false },
      orderBy: { createdAt: "asc" },
      include: { _count: { select: { items: true } } },
    }),
    db.session.findMany({
      where: { endedAt: { not: null } },
      orderBy: { endedAt: "desc" },
      take: 5,
      include: { group: { select: { name: true } }, _count: { select: { sets: true } } },
    }),
  ]);

  if (!cycle || cycle.slots.length === 0) {
    return {
      cycle,
      next: null,
      lastCompletedAt: null,
      upcoming: [],
      inProgress,
      groups,
      recentSessions,
    } as const;
  }

  // The last completed session that filled a slot in *this* cycle decides what is next.
  const last = await db.session.findFirst({
    where: { cycleId: cycle.id, endedAt: { not: null }, cycleSlotId: { not: null } },
    orderBy: { endedAt: "desc" },
    select: { cycleSlotId: true, endedAt: true },
  });

  // Resolve by id rather than by stored position, so a group removed mid-cycle
  // cannot leave the rotation pointing at a slot that no longer exists.
  const lastIndex = last?.cycleSlotId
    ? cycle.slots.findIndex((s) => s.id === last.cycleSlotId)
    : -1;
  const nextIndex = nextPosition(cycle.slots.length, lastIndex >= 0 ? lastIndex : null);

  return {
    cycle,
    next: cycle.slots[nextIndex],
    lastCompletedAt: last?.endedAt ?? null,
    upcoming: upcomingOrder(cycle.slots.length, nextIndex).map((i) => cycle.slots[i]),
    inProgress,
    groups,
    recentSessions,
  } as const;
}

/** The three most recent outings for an exercise, most recent first. */
async function recentHistory(
  exerciseId: string,
  excludeSessionId: string,
  take = 3,
): Promise<ExerciseSessionHistory[]> {
  const sessions = await db.session.findMany({
    where: {
      id: { not: excludeSessionId },
      sets: { some: { exerciseId, isWarmup: false } },
    },
    orderBy: { startedAt: "desc" },
    take,
    select: {
      id: true,
      startedAt: true,
      sets: {
        where: { exerciseId, isWarmup: false },
        orderBy: { setNumber: "asc" },
        select: { weightKg: true, reps: true },
      },
    },
  });

  return sessions.map((s) => ({
    sessionId: s.id,
    performedAt: s.startedAt,
    sets: s.sets.map((set) => ({ weightKg: set.weightKg, reps: set.reps }) satisfies WorkingSet),
  }));
}

export type SetRow = {
  setNumber: number;
  weightKg: number | null;
  reps: number | null;
  rpe: number | null;
  isWarmup: boolean;
  /** True once the set is committed to the database. */
  isLogged: boolean;
};

export type SessionExercise = {
  exerciseId: string;
  name: string;
  muscleGroup: string;
  equipment: string;
  notes: string | null;
  restSeconds: number;
  targetSets: number;
  repMin: number;
  repMax: number;
  lastPerformance: string | null;
  lastPerformedAt: string | null;
  cue: ProgressionCue;
  rows: SetRow[];
};

export type SessionScreen = NonNullable<Awaited<ReturnType<typeof getSessionScreen>>>;

export async function getSessionScreen(sessionId: string) {
  const session = await db.session.findUnique({
    where: { id: sessionId },
    include: {
      group: {
        include: {
          items: { orderBy: { order: "asc" }, include: { exercise: true } },
        },
      },
      sets: { orderBy: { setNumber: "asc" }, include: { exercise: true } },
    },
  });

  if (!session) return null;

  // Group exercises first, then anything added ad hoc during the session.
  const planned = session.group?.items ?? [];
  const plannedIds = new Set(planned.map((i) => i.exerciseId));
  const extras = session.sets
    .filter((s) => !plannedIds.has(s.exerciseId))
    .filter((s, i, all) => all.findIndex((o) => o.exerciseId === s.exerciseId) === i)
    .map((s) => s.exercise);

  const specs = [
    ...planned.map((i) => ({
      exercise: i.exercise,
      targetSets: i.targetSets,
      repMin: i.targetRepMin,
      repMax: i.targetRepMax,
    })),
    ...extras.map((e) => ({ exercise: e, targetSets: 3, repMin: 8, repMax: 12 })),
  ];

  const exercises: SessionExercise[] = await Promise.all(
    specs.map(async (spec) => {
      const history = await recentHistory(spec.exercise.id, sessionId);
      const lastWorking = history[0]?.sets ?? [];

      const existing = session.sets
        .filter((s) => s.exerciseId === spec.exercise.id)
        .sort((a, b) => a.setNumber - b.setNumber);

      const prefill = buildPrefill(lastWorking, spec.targetSets);
      const highestLogged = existing.reduce((m, s) => Math.max(m, s.setNumber), 0);
      const rowCount = Math.max(prefill.length, highestLogged);

      const rows: SetRow[] = Array.from({ length: rowCount }, (_, i) => {
        const setNumber = i + 1;
        const logged = existing.find((s) => s.setNumber === setNumber);
        if (logged) {
          return {
            setNumber,
            weightKg: logged.weightKg,
            reps: logged.reps,
            rpe: logged.rpe,
            isWarmup: logged.isWarmup,
            isLogged: true,
          };
        }
        const p = prefill[i];
        return {
          setNumber,
          weightKg: p?.weightKg ?? null,
          reps: p?.reps ?? null,
          rpe: null,
          isWarmup: false,
          isLogged: false,
        };
      });

      return {
        exerciseId: spec.exercise.id,
        name: spec.exercise.name,
        muscleGroup: spec.exercise.muscleGroup,
        equipment: spec.exercise.equipment,
        notes: spec.exercise.notes,
        restSeconds: spec.exercise.restSeconds,
        targetSets: spec.targetSets,
        repMin: spec.repMin,
        repMax: spec.repMax,
        lastPerformance: formatLastPerformance(lastWorking),
        lastPerformedAt: history[0]?.performedAt.toISOString() ?? null,
        cue: progressionCue(history, { min: spec.repMin, max: spec.repMax }),
        rows,
      };
    }),
  );

  return {
    id: session.id,
    startedAt: session.startedAt.toISOString(),
    endedAt: session.endedAt?.toISOString() ?? null,
    bodyweightKg: session.bodyweightKg,
    notes: session.notes,
    groupName: session.group?.name ?? "Freestyle session",
    exercises,
  };
}

export async function getExerciseLibrary() {
  return db.exercise.findMany({
    where: { isArchived: false },
    orderBy: [{ muscleGroup: "asc" }, { name: "asc" }],
    include: { _count: { select: { sets: true } } },
  });
}

export async function getExerciseGroup(id: string) {
  return db.exerciseGroup.findUnique({
    where: { id },
    include: {
      items: { orderBy: { order: "asc" }, include: { exercise: true } },
    },
  });
}

export async function getCycles() {
  return db.cycle.findMany({
    orderBy: [{ isActive: "desc" }, { createdAt: "asc" }],
    include: {
      slots: { orderBy: { position: "asc" }, include: { group: true } },
    },
  });
}

export async function getSessionHistory(take = 40) {
  return db.session.findMany({
    where: { endedAt: { not: null } },
    orderBy: { endedAt: "desc" },
    take,
    include: {
      group: { select: { name: true } },
      sets: { select: { weightKg: true, reps: true, isWarmup: true } },
    },
  });
}

export async function getSessionDetail(id: string) {
  return db.session.findUnique({
    where: { id },
    include: {
      group: { select: { name: true } },
      sets: { orderBy: [{ setNumber: "asc" }], include: { exercise: true } },
    },
  });
}
