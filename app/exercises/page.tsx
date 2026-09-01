import { getExerciseLibrary } from "@/lib/queries";
import { PageHeader } from "@/components/ui";
import { ExerciseLibrary } from "./exercise-library";

export const dynamic = "force-dynamic";

export default async function ExercisesPage() {
  const exercises = await getExerciseLibrary();

  return (
    <main>
      <PageHeader
        title="Exercises"
        display
        subtitle={`${exercises.length} movements. Tap one to add setup notes or change its rest timer.`}
      />
      <ExerciseLibrary
        exercises={exercises.map((e) => ({
          id: e.id,
          name: e.name,
          muscleGroup: e.muscleGroup,
          equipment: e.equipment,
          notes: e.notes,
          restSeconds: e.restSeconds,
          isCustom: e.isCustom,
          setCount: e._count.sets,
        }))}
      />
    </main>
  );
}
