"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createExercise, updateExercise } from "@/lib/actions";
import { Button, Card, Eyebrow, Hint, Input, Note, Select, Tag } from "@/components/ui";

type Exercise = {
  id: string;
  name: string;
  muscleGroup: string;
  equipment: string;
  notes: string | null;
  restSeconds: number;
  isCustom: boolean;
  setCount: number;
};

const MUSCLE_GROUPS = [
  "chest",
  "back",
  "quads",
  "hamstrings",
  "glutes",
  "delts",
  "biceps",
  "triceps",
  "calves",
  "core",
  "forearms",
];

const EQUIPMENT = ["barbell", "dumbbell", "cable", "machine", "bodyweight", "smith"];

export function ExerciseLibrary({ exercises }: { exercises: Exercise[] }) {
  const router = useRouter();
  const [filter, setFilter] = useState("");
  const [muscle, setMuscle] = useState("all");
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const visible = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    return exercises.filter(
      (e) =>
        (muscle === "all" || e.muscleGroup === muscle) &&
        (needle === "" || e.name.toLowerCase().includes(needle)),
    );
  }, [exercises, filter, muscle]);

  const byMuscle = useMemo(() => {
    const map = new Map<string, Exercise[]>();
    for (const e of visible) {
      const list = map.get(e.muscleGroup) ?? [];
      list.push(e);
      map.set(e.muscleGroup, list);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [visible]);

  return (
    <div className="space-y-5 px-4">
      <div className="flex gap-2">
        <Input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Search"
          className="flex-1"
        />
        <Select
          value={muscle}
          onChange={(e) => setMuscle(e.target.value)}
          className="w-auto shrink-0"
        >
          <option value="all">All</option>
          {MUSCLE_GROUPS.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </Select>
      </div>

      {creating ? (
        <Card>
          <form
            action={(formData: FormData) => {
              setError(null);
              startTransition(async () => {
                try {
                  await createExercise({
                    name: String(formData.get("name") ?? ""),
                    muscleGroup: String(formData.get("muscleGroup") ?? "chest"),
                    equipment: String(formData.get("equipment") ?? "barbell"),
                    restSeconds: Number(formData.get("restSeconds") ?? 120),
                  });
                  setCreating(false);
                  router.refresh();
                } catch (e) {
                  setError(e instanceof Error ? e.message : "Could not add that exercise.");
                }
              });
            }}
            className="space-y-3"
          >
            <Input name="name" placeholder="Exercise name" required autoFocus />
            <div className="grid grid-cols-2 gap-2">
              <Select name="muscleGroup" defaultValue="chest">
                {MUSCLE_GROUPS.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </Select>
              <Select name="equipment" defaultValue="barbell">
                {EQUIPMENT.map((eq) => (
                  <option key={eq} value={eq}>
                    {eq}
                  </option>
                ))}
              </Select>
            </div>
            <Input name="restSeconds" type="number" defaultValue={120} min={15} step={15} />
            {error ? <Note tone="danger">{error}</Note> : null}
            <div className="flex gap-2">
              <Button type="submit" variant="accent" className="flex-1" disabled={isPending}>
                Add
              </Button>
              <Button type="button" variant="ghost" onClick={() => setCreating(false)}>
                Cancel
              </Button>
            </div>
          </form>
        </Card>
      ) : (
        <Button variant="secondary" fullWidth onClick={() => setCreating(true)}>
          + Add a custom exercise
        </Button>
      )}

      {byMuscle.map(([groupName, list]) => (
        <section key={groupName}>
          <Eyebrow className="mb-2.5">{groupName}</Eyebrow>
          <ul className="divide-y divide-hairline overflow-hidden rounded-lg border border-hairline bg-card">
            {list.map((exercise) => (
              <li key={exercise.id} className="px-4 py-3">
                <button
                  type="button"
                  onClick={() => setEditing(editing === exercise.id ? null : exercise.id)}
                  className="flex w-full items-center justify-between gap-3 text-left"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-body-sm text-fg-strong">
                      {exercise.name}
                    </span>
                    {exercise.notes ? (
                      <span className="block truncate text-caption text-fg-muted">
                        {exercise.notes}
                      </span>
                    ) : null}
                  </span>
                  <span className="shrink-0 font-mono text-micro tracking-wide text-fg-faint">
                    {exercise.equipment} · {exercise.restSeconds}s
                  </span>
                </button>

                {editing === exercise.id ? (
                  <form
                    action={(formData: FormData) => {
                      startTransition(async () => {
                        await updateExercise({
                          id: exercise.id,
                          notes: String(formData.get("notes") ?? ""),
                          restSeconds: Number(formData.get("restSeconds") ?? exercise.restSeconds),
                        });
                        setEditing(null);
                        router.refresh();
                      });
                    }}
                    className="mt-3 space-y-2"
                  >
                    <Input
                      name="notes"
                      defaultValue={exercise.notes ?? ""}
                      placeholder="Setup notes — seat 4, handle wide"
                    />
                    <div className="flex gap-2">
                      <Input
                        name="restSeconds"
                        type="number"
                        defaultValue={exercise.restSeconds}
                        min={15}
                        step={15}
                        className="w-28 shrink-0"
                      />
                      <Button type="submit" variant="accent" className="flex-1" disabled={isPending}>
                        Save
                      </Button>
                    </div>
                    <div className="flex items-center gap-2 pt-1">
                      <Tag>{exercise.isCustom ? "custom" : "library"}</Tag>
                      <Hint className="mt-0">
                        {exercise.setCount} set{exercise.setCount === 1 ? "" : "s"} logged all time
                      </Hint>
                    </div>
                  </form>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ))}

      {visible.length === 0 ? (
        <p className="py-8 text-center text-body-sm text-fg-muted">Nothing matches that search.</p>
      ) : null}
    </div>
  );
}
