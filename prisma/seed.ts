import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.ts";

// Seeding is a batch of writes, so it goes over the direct connection like migrations do.
const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
if (!connectionString) throw new Error("Set DIRECT_URL (or DATABASE_URL) before seeding.");

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

type Seed = {
  name: string;
  muscleGroup: string;
  equipment: string;
  isUnilateral?: boolean;
  restSeconds?: number;
};

// The staple hypertrophy movements. No cardio — this app measures load, not minutes.
// Rest defaults: 180s+ for heavy compounds, 120s for secondary compounds, ~90s for isolation.
const EXERCISES: Seed[] = [
  // ── Chest ────────────────────────────────────────────────────────────────
  { name: "Barbell Bench Press", muscleGroup: "chest", equipment: "barbell", restSeconds: 180 },
  { name: "Incline Barbell Bench Press", muscleGroup: "chest", equipment: "barbell", restSeconds: 180 },
  { name: "Dumbbell Bench Press", muscleGroup: "chest", equipment: "dumbbell", restSeconds: 150 },
  { name: "Incline Dumbbell Press", muscleGroup: "chest", equipment: "dumbbell", restSeconds: 150 },
  { name: "Machine Chest Press", muscleGroup: "chest", equipment: "machine", restSeconds: 120 },
  { name: "Pec Deck", muscleGroup: "chest", equipment: "machine", restSeconds: 90 },
  { name: "Cable Fly (High to Low)", muscleGroup: "chest", equipment: "cable", restSeconds: 90 },
  { name: "Cable Fly (Low to High)", muscleGroup: "chest", equipment: "cable", restSeconds: 90 },
  { name: "Chest Dip", muscleGroup: "chest", equipment: "bodyweight", restSeconds: 150 },
  { name: "Push-Up", muscleGroup: "chest", equipment: "bodyweight", restSeconds: 90 },

  // ── Back ─────────────────────────────────────────────────────────────────
  { name: "Deadlift", muscleGroup: "back", equipment: "barbell", restSeconds: 240 },
  { name: "Barbell Row", muscleGroup: "back", equipment: "barbell", restSeconds: 180 },
  { name: "Pendlay Row", muscleGroup: "back", equipment: "barbell", restSeconds: 180 },
  { name: "T-Bar Row", muscleGroup: "back", equipment: "barbell", restSeconds: 150 },
  { name: "Single-Arm Dumbbell Row", muscleGroup: "back", equipment: "dumbbell", isUnilateral: true, restSeconds: 120 },
  { name: "Chest-Supported Row", muscleGroup: "back", equipment: "machine", restSeconds: 120 },
  { name: "Seated Cable Row", muscleGroup: "back", equipment: "cable", restSeconds: 120 },
  { name: "Lat Pulldown", muscleGroup: "back", equipment: "cable", restSeconds: 120 },
  { name: "Wide-Grip Lat Pulldown", muscleGroup: "back", equipment: "cable", restSeconds: 120 },
  { name: "Pull-Up", muscleGroup: "back", equipment: "bodyweight", restSeconds: 180 },
  { name: "Chin-Up", muscleGroup: "back", equipment: "bodyweight", restSeconds: 180 },
  { name: "Straight-Arm Pulldown", muscleGroup: "back", equipment: "cable", restSeconds: 90 },
  { name: "Machine Row", muscleGroup: "back", equipment: "machine", restSeconds: 120 },
  { name: "Rack Pull", muscleGroup: "back", equipment: "barbell", restSeconds: 180 },

  // ── Quads ────────────────────────────────────────────────────────────────
  { name: "Back Squat", muscleGroup: "quads", equipment: "barbell", restSeconds: 240 },
  { name: "Front Squat", muscleGroup: "quads", equipment: "barbell", restSeconds: 180 },
  { name: "Hack Squat", muscleGroup: "quads", equipment: "machine", restSeconds: 180 },
  { name: "Leg Press", muscleGroup: "quads", equipment: "machine", restSeconds: 180 },
  { name: "Smith Machine Squat", muscleGroup: "quads", equipment: "smith", restSeconds: 180 },
  { name: "Goblet Squat", muscleGroup: "quads", equipment: "dumbbell", restSeconds: 120 },
  { name: "Bulgarian Split Squat", muscleGroup: "quads", equipment: "dumbbell", isUnilateral: true, restSeconds: 150 },
  { name: "Walking Lunge", muscleGroup: "quads", equipment: "dumbbell", isUnilateral: true, restSeconds: 150 },
  { name: "Leg Extension", muscleGroup: "quads", equipment: "machine", restSeconds: 90 },

  // ── Hamstrings ───────────────────────────────────────────────────────────
  { name: "Romanian Deadlift", muscleGroup: "hamstrings", equipment: "barbell", restSeconds: 180 },
  { name: "Dumbbell Romanian Deadlift", muscleGroup: "hamstrings", equipment: "dumbbell", restSeconds: 150 },
  { name: "Stiff-Leg Deadlift", muscleGroup: "hamstrings", equipment: "barbell", restSeconds: 180 },
  { name: "Lying Leg Curl", muscleGroup: "hamstrings", equipment: "machine", restSeconds: 90 },
  { name: "Seated Leg Curl", muscleGroup: "hamstrings", equipment: "machine", restSeconds: 90 },
  { name: "Good Morning", muscleGroup: "hamstrings", equipment: "barbell", restSeconds: 150 },
  { name: "Nordic Curl", muscleGroup: "hamstrings", equipment: "bodyweight", restSeconds: 150 },

  // ── Glutes ───────────────────────────────────────────────────────────────
  { name: "Barbell Hip Thrust", muscleGroup: "glutes", equipment: "barbell", restSeconds: 150 },
  { name: "Glute Bridge", muscleGroup: "glutes", equipment: "barbell", restSeconds: 120 },
  { name: "Cable Glute Kickback", muscleGroup: "glutes", equipment: "cable", isUnilateral: true, restSeconds: 90 },
  { name: "Back Extension", muscleGroup: "glutes", equipment: "bodyweight", restSeconds: 90 },

  // ── Delts ────────────────────────────────────────────────────────────────
  { name: "Overhead Press", muscleGroup: "delts", equipment: "barbell", restSeconds: 180 },
  { name: "Seated Dumbbell Shoulder Press", muscleGroup: "delts", equipment: "dumbbell", restSeconds: 150 },
  { name: "Arnold Press", muscleGroup: "delts", equipment: "dumbbell", restSeconds: 150 },
  { name: "Machine Shoulder Press", muscleGroup: "delts", equipment: "machine", restSeconds: 120 },
  { name: "Dumbbell Lateral Raise", muscleGroup: "delts", equipment: "dumbbell", restSeconds: 75 },
  { name: "Cable Lateral Raise", muscleGroup: "delts", equipment: "cable", isUnilateral: true, restSeconds: 75 },
  { name: "Machine Lateral Raise", muscleGroup: "delts", equipment: "machine", restSeconds: 75 },
  { name: "Rear Delt Fly", muscleGroup: "delts", equipment: "dumbbell", restSeconds: 75 },
  { name: "Reverse Pec Deck", muscleGroup: "delts", equipment: "machine", restSeconds: 75 },
  { name: "Face Pull", muscleGroup: "delts", equipment: "cable", restSeconds: 75 },
  { name: "Upright Row", muscleGroup: "delts", equipment: "barbell", restSeconds: 90 },

  // ── Biceps ───────────────────────────────────────────────────────────────
  { name: "Barbell Curl", muscleGroup: "biceps", equipment: "barbell", restSeconds: 90 },
  { name: "EZ-Bar Curl", muscleGroup: "biceps", equipment: "barbell", restSeconds: 90 },
  { name: "Dumbbell Curl", muscleGroup: "biceps", equipment: "dumbbell", restSeconds: 90 },
  { name: "Incline Dumbbell Curl", muscleGroup: "biceps", equipment: "dumbbell", restSeconds: 90 },
  { name: "Hammer Curl", muscleGroup: "biceps", equipment: "dumbbell", restSeconds: 90 },
  { name: "Preacher Curl", muscleGroup: "biceps", equipment: "barbell", restSeconds: 90 },
  { name: "Cable Curl", muscleGroup: "biceps", equipment: "cable", restSeconds: 75 },
  { name: "Concentration Curl", muscleGroup: "biceps", equipment: "dumbbell", isUnilateral: true, restSeconds: 75 },

  // ── Triceps ──────────────────────────────────────────────────────────────
  { name: "Close-Grip Bench Press", muscleGroup: "triceps", equipment: "barbell", restSeconds: 150 },
  { name: "Triceps Pushdown (Rope)", muscleGroup: "triceps", equipment: "cable", restSeconds: 75 },
  { name: "Triceps Pushdown (Bar)", muscleGroup: "triceps", equipment: "cable", restSeconds: 75 },
  { name: "Overhead Cable Extension", muscleGroup: "triceps", equipment: "cable", restSeconds: 75 },
  { name: "Skull Crusher", muscleGroup: "triceps", equipment: "barbell", restSeconds: 90 },
  { name: "Dumbbell Overhead Extension", muscleGroup: "triceps", equipment: "dumbbell", restSeconds: 90 },
  { name: "Triceps Dip", muscleGroup: "triceps", equipment: "bodyweight", restSeconds: 120 },

  // ── Calves ───────────────────────────────────────────────────────────────
  { name: "Standing Calf Raise", muscleGroup: "calves", equipment: "machine", restSeconds: 75 },
  { name: "Seated Calf Raise", muscleGroup: "calves", equipment: "machine", restSeconds: 75 },
  { name: "Leg Press Calf Raise", muscleGroup: "calves", equipment: "machine", restSeconds: 75 },

  // ── Core ─────────────────────────────────────────────────────────────────
  { name: "Hanging Leg Raise", muscleGroup: "core", equipment: "bodyweight", restSeconds: 90 },
  { name: "Cable Crunch", muscleGroup: "core", equipment: "cable", restSeconds: 75 },
  { name: "Ab Wheel Rollout", muscleGroup: "core", equipment: "bodyweight", restSeconds: 90 },
  { name: "Weighted Decline Sit-Up", muscleGroup: "core", equipment: "bodyweight", restSeconds: 90 },
  { name: "Plank", muscleGroup: "core", equipment: "bodyweight", restSeconds: 60 },

  // ── Forearms ─────────────────────────────────────────────────────────────
  { name: "Barbell Wrist Curl", muscleGroup: "forearms", equipment: "barbell", restSeconds: 60 },
  { name: "Reverse Curl", muscleGroup: "forearms", equipment: "barbell", restSeconds: 75 },
  { name: "Farmers Carry", muscleGroup: "forearms", equipment: "dumbbell", restSeconds: 120 },
];

// A Push / Pull / Legs starter so the app is usable the moment it opens.
// Every part of it is editable — rename, reorder, swap exercises, or delete it.
const STARTER_GROUPS: { name: string; items: [string, number, number, number][] }[] = [
  {
    name: "Push",
    items: [
      ["Barbell Bench Press", 4, 5, 8],
      ["Incline Dumbbell Press", 3, 8, 12],
      ["Seated Dumbbell Shoulder Press", 3, 8, 12],
      ["Cable Fly (High to Low)", 3, 12, 15],
      ["Dumbbell Lateral Raise", 4, 12, 20],
      ["Triceps Pushdown (Rope)", 3, 10, 15],
    ],
  },
  {
    name: "Pull",
    items: [
      ["Barbell Row", 4, 6, 10],
      ["Lat Pulldown", 3, 8, 12],
      ["Seated Cable Row", 3, 10, 12],
      ["Face Pull", 3, 12, 20],
      ["EZ-Bar Curl", 3, 8, 12],
      ["Hammer Curl", 3, 10, 15],
    ],
  },
  {
    name: "Legs",
    items: [
      ["Back Squat", 4, 5, 8],
      ["Romanian Deadlift", 3, 8, 12],
      ["Leg Press", 3, 10, 15],
      ["Lying Leg Curl", 3, 10, 15],
      ["Leg Extension", 3, 12, 15],
      ["Standing Calf Raise", 4, 10, 15],
    ],
  },
];

async function main() {
  for (const e of EXERCISES) {
    await db.exercise.upsert({
      where: { name: e.name },
      // Only refresh fields the user has no reason to have changed. Notes and rest
      // overrides they have set by hand must survive a re-seed.
      update: {
        muscleGroup: e.muscleGroup,
        equipment: e.equipment,
        isUnilateral: e.isUnilateral ?? false,
      },
      create: {
        name: e.name,
        muscleGroup: e.muscleGroup,
        equipment: e.equipment,
        isUnilateral: e.isUnilateral ?? false,
        restSeconds: e.restSeconds ?? 120,
      },
    });
  }
  console.log(`Exercises: ${EXERCISES.length} seeded.`);

  // Starter content only on a genuinely empty database — never clobber real days.
  if ((await db.exerciseGroup.count()) > 0) {
    console.log("Exercise groups already exist — skipping starter cycle.");
    return;
  }

  const cycle = await db.cycle.create({ data: { name: "Push / Pull / Legs", isActive: true } });

  for (const [position, day] of STARTER_GROUPS.entries()) {
    const exercises = await db.exercise.findMany({
      where: { name: { in: day.items.map((i) => i[0]) } },
      select: { id: true, name: true },
    });
    const idByName = new Map(exercises.map((e) => [e.name, e.id]));

    const group = await db.exerciseGroup.create({
      data: {
        name: day.name,
        items: {
          create: day.items.map(([name, targetSets, targetRepMin, targetRepMax], order) => ({
            exerciseId: idByName.get(name)!,
            order,
            targetSets,
            targetRepMin,
            targetRepMax,
          })),
        },
      },
    });

    await db.cycleSlot.create({
      data: { cycleId: cycle.id, exerciseGroupId: group.id, position },
    });
  }
  console.log(`Starter cycle: ${STARTER_GROUPS.map((d) => d.name).join(" -> ")}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
