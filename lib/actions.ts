"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "./db";
import { roundWeight } from "./units";

/// Every mutation in the app. Single user, so there is no authorisation layer —
/// see spec §10. Validation here is about catching fat-fingered input, not attacks.

// ── Sessions ──────────────────────────────────────────────────────────────────

export async function startSession(input: { cycleSlotId?: string; exerciseGroupId?: string }) {
  let exerciseGroupId = input.exerciseGroupId ?? null;
  let cycleId: string | null = null;
  let cycleSlotId: string | null = null;

  if (input.cycleSlotId) {
    const slot = await db.cycleSlot.findUnique({ where: { id: input.cycleSlotId } });
    if (!slot) throw new Error("That group is no longer in the cycle.");
    exerciseGroupId = slot.exerciseGroupId;
    cycleId = slot.cycleId;
    cycleSlotId = slot.id;
  }

  // An abandoned session left open would otherwise shadow the new one on the home screen.
  const open = await db.session.findFirst({ where: { endedAt: null } });
  if (open) {
    const hasSets = (await db.setLog.count({ where: { sessionId: open.id } })) > 0;
    if (hasSets) redirect(`/train/${open.id}`);
    await db.session.delete({ where: { id: open.id } });
  }

  const session = await db.session.create({
    data: { exerciseGroupId, cycleId, cycleSlotId },
  });

  redirect(`/train/${session.id}`);
}

export async function finishSession(sessionId: string) {
  // Finishing and discarding are both idempotent. A session can legitimately be
  // gone by the time the button is pressed — starting another one deletes an open
  // empty session, and the browser may still be showing the old logger from its
  // client-side cache. "Make this session not exist" is then already true, so
  // treat it as done rather than throwing P2025 and blowing up the page.
  const session = await db.session.findUnique({ where: { id: sessionId } });

  if (session) {
    const sets = await db.setLog.count({ where: { sessionId } });
    if (sets === 0) {
      // Nothing was logged; an empty session in the history is noise, not data.
      await db.session.delete({ where: { id: sessionId } });
    } else {
      await db.session.update({ where: { id: sessionId }, data: { endedAt: new Date() } });
    }
  }

  revalidatePath("/");
  revalidatePath("/train");
  redirect("/");
}

export async function discardSession(sessionId: string) {
  // Idempotent for the same reason as finishSession above.
  await db.session.deleteMany({ where: { id: sessionId } });
  revalidatePath("/");
  revalidatePath("/train");
  redirect("/");
}

export async function updateSessionMeta(input: {
  sessionId: string;
  bodyweightKg?: number | null;
  notes?: string | null;
}) {
  await db.session.update({
    where: { id: input.sessionId },
    data: { bodyweightKg: input.bodyweightKg ?? null, notes: input.notes ?? null },
  });
}

// ── Sets ──────────────────────────────────────────────────────────────────────

export async function logSet(input: {
  sessionId: string;
  exerciseId: string;
  setNumber: number;
  weightKg: number;
  reps: number;
  rpe?: number | null;
  isWarmup?: boolean;
  isFailure?: boolean;
}) {
  const weightKg = roundWeight(input.weightKg);
  const reps = Math.round(input.reps);

  if (!Number.isFinite(weightKg) || weightKg < 0) throw new Error("Weight must be zero or more.");
  if (!Number.isFinite(reps) || reps < 1) throw new Error("Reps must be at least 1.");

  const data = {
    weightKg,
    reps,
    rpe: input.rpe ?? null,
    isWarmup: input.isWarmup ?? false,
    isFailure: input.isFailure ?? false,
    loggedAt: new Date(),
  };

  await db.setLog.upsert({
    where: {
      sessionId_exerciseId_setNumber: {
        sessionId: input.sessionId,
        exerciseId: input.exerciseId,
        setNumber: input.setNumber,
      },
    },
    update: data,
    create: {
      sessionId: input.sessionId,
      exerciseId: input.exerciseId,
      setNumber: input.setNumber,
      ...data,
    },
  });
}

export async function unlogSet(input: { sessionId: string; exerciseId: string; setNumber: number }) {
  await db.setLog
    .delete({
      where: {
        sessionId_exerciseId_setNumber: {
          sessionId: input.sessionId,
          exerciseId: input.exerciseId,
          setNumber: input.setNumber,
        },
      },
    })
    .catch(() => {
      // Un-ticking a set that was never saved is a no-op, not an error.
    });
}

// Adding an exercise mid-session is deliberately not an action: the client adds the
// card locally and it persists the moment a real set is ticked. A placeholder row
// would put a fabricated 0kg × 1 set into the exercise's history forever.

// ── Exercise groups ───────────────────────────────────────────────────────────

export async function createExerciseGroup(name: string) {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Give the group a name.");
  const group = await db.exerciseGroup.create({ data: { name: trimmed } });
  revalidatePath("/groups");
  revalidatePath("/");
  revalidatePath("/train");
  redirect(`/groups/${group.id}`);
}

export type ExerciseGroupItemInput = {
  exerciseId: string;
  targetSets: number;
  targetRepMin: number;
  targetRepMax: number;
};

export async function saveExerciseGroup(input: {
  id: string;
  name: string;
  notes: string | null;
  items: ExerciseGroupItemInput[];
}) {
  const name = input.name.trim();
  if (!name) throw new Error("Give the group a name.");

  // Replace the item list wholesale: order is positional, and reconciling
  // per-row edits against a reorderable list is far more code than it is worth.
  await db.$transaction([
    db.exerciseGroupItem.deleteMany({ where: { exerciseGroupId: input.id } }),
    db.exerciseGroup.update({
      where: { id: input.id },
      data: {
        name,
        notes: input.notes?.trim() || null,
        items: {
          create: input.items.map((item, order) => ({
            exerciseId: item.exerciseId,
            order,
            targetSets: Math.max(1, Math.round(item.targetSets)),
            targetRepMin: Math.max(1, Math.round(item.targetRepMin)),
            targetRepMax: Math.max(1, Math.round(item.targetRepMax)),
          })),
        },
      },
    }),
  ]);

  revalidatePath("/groups");
  revalidatePath(`/groups/${input.id}`);
  revalidatePath("/cycles");
  revalidatePath("/");
  revalidatePath("/train");
}

export async function deleteExerciseGroup(id: string) {
  const sessions = await db.session.count({ where: { exerciseGroupId: id } });
  if (sessions > 0) {
    // History references it. Archiving keeps past sessions readable.
    await db.exerciseGroup.update({ where: { id }, data: { isArchived: true } });
    await db.cycleSlot.deleteMany({ where: { exerciseGroupId: id } });
  } else {
    await db.exerciseGroup.delete({ where: { id } });
  }
  revalidatePath("/groups");
  revalidatePath("/cycles");
  revalidatePath("/");
  revalidatePath("/train");
  redirect("/groups");
}

// ── Cycles ────────────────────────────────────────────────────────────────────

export async function createCycle(name: string) {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Give the cycle a name.");
  const isFirst = (await db.cycle.count()) === 0;
  const cycle = await db.cycle.create({ data: { name: trimmed, isActive: isFirst } });
  revalidatePath("/cycles");
  redirect(`/cycles/${cycle.id}`);
}

export async function saveCycle(input: { id: string; name: string; exerciseGroupIds: string[] }) {
  const name = input.name.trim();
  if (!name) throw new Error("Give the cycle a name.");

  // Positions are always rewritten contiguously from zero, so the stored value
  // and the array index never drift apart.
  await db.$transaction([
    db.cycleSlot.deleteMany({ where: { cycleId: input.id } }),
    db.cycle.update({
      where: { id: input.id },
      data: {
        name,
        slots: {
          create: input.exerciseGroupIds.map((exerciseGroupId, position) => ({
            exerciseGroupId,
            position,
          })),
        },
      },
    }),
  ]);

  revalidatePath("/cycles");
  revalidatePath(`/cycles/${input.id}`);
  revalidatePath("/");
  revalidatePath("/train");
}

/**
 * Moves one slot up or down the rotation. Used by the reorder controls on the
 * cycles list, which need to persist immediately rather than via a save button.
 */
export async function moveCycleSlot(input: { cycleSlotId: string; direction: "up" | "down" }) {
  const slot = await db.cycleSlot.findUnique({ where: { id: input.cycleSlotId } });
  if (!slot) return;

  const slots = await db.cycleSlot.findMany({
    where: { cycleId: slot.cycleId },
    orderBy: { position: "asc" },
  });

  const index = slots.findIndex((s) => s.id === slot.id);
  const target = index + (input.direction === "up" ? -1 : 1);
  if (index < 0 || target < 0 || target >= slots.length) return;

  [slots[index], slots[target]] = [slots[target], slots[index]];

  await db.$transaction(
    slots.map((s, position) =>
      db.cycleSlot.update({ where: { id: s.id }, data: { position } }),
    ),
  );

  revalidatePath("/cycles");
  revalidatePath(`/cycles/${slot.cycleId}`);
  revalidatePath("/");
  revalidatePath("/train");
}

export async function activateCycle(id: string) {
  await db.$transaction([
    db.cycle.updateMany({ where: { isActive: true }, data: { isActive: false } }),
    db.cycle.update({ where: { id }, data: { isActive: true } }),
  ]);
  revalidatePath("/cycles");
  revalidatePath("/");
  revalidatePath("/train");
}

export async function deleteCycle(id: string) {
  const cycle = await db.cycle.findUnique({ where: { id } });
  await db.cycle.delete({ where: { id } });
  if (cycle?.isActive) {
    const fallback = await db.cycle.findFirst({ orderBy: { createdAt: "asc" } });
    if (fallback) await db.cycle.update({ where: { id: fallback.id }, data: { isActive: true } });
  }
  revalidatePath("/cycles");
  revalidatePath("/");
  revalidatePath("/train");
  redirect("/cycles");
}

// ── Exercises ─────────────────────────────────────────────────────────────────

export async function createExercise(input: {
  name: string;
  muscleGroup: string;
  equipment: string;
  isUnilateral?: boolean;
  restSeconds?: number;
}) {
  const name = input.name.trim();
  if (!name) throw new Error("Give the exercise a name.");
  const existing = await db.exercise.findUnique({ where: { name } });
  if (existing) throw new Error(`"${name}" is already in the library.`);

  await db.exercise.create({
    data: {
      name,
      muscleGroup: input.muscleGroup,
      equipment: input.equipment,
      isUnilateral: input.isUnilateral ?? false,
      restSeconds: input.restSeconds ?? 120,
      isCustom: true,
    },
  });
  revalidatePath("/exercises");
}

export async function updateExercise(input: {
  id: string;
  notes?: string | null;
  restSeconds?: number;
}) {
  await db.exercise.update({
    where: { id: input.id },
    data: {
      ...(input.notes !== undefined ? { notes: input.notes?.trim() || null } : {}),
      ...(input.restSeconds !== undefined
        ? { restSeconds: Math.max(15, Math.round(input.restSeconds)) }
        : {}),
    },
  });
  revalidatePath("/exercises");
}
