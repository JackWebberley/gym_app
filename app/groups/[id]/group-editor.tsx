"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteExerciseGroup, saveExerciseGroup } from "@/lib/actions";
import { Button, Card, Eyebrow, Input, Label, Select, cx } from "@/components/ui";

type ExerciseOption = { id: string; name: string; muscleGroup: string; equipment: string };

type Item = {
  key: string;
  exerciseId: string;
  name: string;
  muscleGroup: string;
  targetSets: number;
  targetRepMin: number;
  targetRepMax: number;
};

export function GroupEditor({
  group,
  library,
}: {
  group: {
    id: string;
    name: string;
    notes: string | null;
    items: {
      exerciseId: string;
      targetSets: number;
      targetRepMin: number;
      targetRepMax: number;
      exercise: { name: string; muscleGroup: string };
    }[];
  };
  library: ExerciseOption[];
}) {
  const router = useRouter();
  const [name, setName] = useState(group.name);
  const [notes, setNotes] = useState(group.notes ?? "");
  const [items, setItems] = useState<Item[]>(() =>
    group.items.map((i, idx) => ({
      key: `${i.exerciseId}-${idx}`,
      exerciseId: i.exerciseId,
      name: i.exercise.name,
      muscleGroup: i.exercise.muscleGroup,
      targetSets: i.targetSets,
      targetRepMin: i.targetRepMin,
      targetRepMax: i.targetRepMax,
    })),
  );
  const [filter, setFilter] = useState("");
  const [muscle, setMuscle] = useState("all");
  const [status, setStatus] = useState<string | null>(null);
  const [isSaving, startSaving] = useTransition();

  const muscles = useMemo(() => [...new Set(library.map((e) => e.muscleGroup))].sort(), [library]);

  const candidates = useMemo(() => {
    const chosen = new Set(items.map((i) => i.exerciseId));
    const needle = filter.trim().toLowerCase();
    return library.filter(
      (e) =>
        !chosen.has(e.id) &&
        (muscle === "all" || e.muscleGroup === muscle) &&
        (needle === "" || e.name.toLowerCase().includes(needle)),
    );
  }, [library, filter, muscle, items]);

  function add(option: ExerciseOption) {
    setItems((prev) => [
      ...prev,
      {
        key: `${option.id}-${Date.now()}`,
        exerciseId: option.id,
        name: option.name,
        muscleGroup: option.muscleGroup,
        targetSets: 3,
        targetRepMin: 8,
        targetRepMax: 12,
      },
    ]);
    setStatus(null);
  }

  function move(index: number, delta: number) {
    setItems((prev) => {
      const next = [...prev];
      const target = index + delta;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function patch(key: string, changes: Partial<Item>) {
    setItems((prev) => prev.map((i) => (i.key === key ? { ...i, ...changes } : i)));
  }

  function save() {
    setStatus(null);
    startSaving(async () => {
      try {
        await saveExerciseGroup({
          id: group.id,
          name,
          notes: notes || null,
          items: items.map((i) => ({
            exerciseId: i.exerciseId,
            targetSets: i.targetSets,
            targetRepMin: i.targetRepMin,
            targetRepMax: i.targetRepMax,
          })),
        });
        setStatus("Saved");
        router.refresh();
      } catch (e) {
        setStatus(e instanceof Error ? e.message : "Could not save.");
      }
    });
  }

  return (
    <div className="space-y-5 px-4">
      <Card className="space-y-4">
        <div>
          <Label htmlFor="name">Name</Label>
          <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="notes">Notes</Label>
          <Input
            id="notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional"
          />
        </div>
      </Card>

      <section>
        <Eyebrow className="mb-2.5">In this group ({items.length})</Eyebrow>
        {items.length === 0 ? (
          <p className="rounded-lg border border-dashed border-line px-4 py-6 text-center text-body-sm text-fg-muted">
            Nothing here yet. Pick from the library below.
          </p>
        ) : (
          <ul className="space-y-2">
            {items.map((item, index) => (
              <li key={item.key}>
                <Card className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-fg-strong">{item.name}</p>
                      <p className="font-mono text-micro tracking-wide text-fg-faint">
                        {item.muscleGroup}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <IconButton onClick={() => move(index, -1)} disabled={index === 0} label="↑" />
                      <IconButton
                        onClick={() => move(index, 1)}
                        disabled={index === items.length - 1}
                        label="↓"
                      />
                      <IconButton
                        onClick={() => setItems((prev) => prev.filter((i) => i.key !== item.key))}
                        label="✕"
                      />
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-3 gap-2">
                    <NumberField
                      label="sets"
                      value={item.targetSets}
                      onChange={(v) => patch(item.key, { targetSets: v })}
                    />
                    <NumberField
                      label="min reps"
                      value={item.targetRepMin}
                      onChange={(v) => patch(item.key, { targetRepMin: v })}
                    />
                    <NumberField
                      label="max reps"
                      value={item.targetRepMax}
                      onChange={(v) => patch(item.key, { targetRepMax: v })}
                    />
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <Eyebrow className="mb-2.5">Add from the library</Eyebrow>
        <div className="mb-2 flex gap-2">
          <Input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Search exercises"
            className="flex-1"
          />
          <Select
            value={muscle}
            onChange={(e) => setMuscle(e.target.value)}
            className="w-auto shrink-0"
          >
            <option value="all">All</option>
            {muscles.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </Select>
        </div>

        <ul className="max-h-72 divide-y divide-hairline overflow-y-auto rounded-lg border border-hairline bg-card">
          {candidates.map((option) => (
            <li key={option.id}>
              <button
                type="button"
                onClick={() => add(option)}
                className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-body-sm text-fg transition-colors duration-(--dur-fast) hover:bg-sunken"
              >
                <span>{option.name}</span>
                <span className="shrink-0 font-mono text-micro tracking-wide text-fg-faint">
                  {option.muscleGroup} · {option.equipment}
                </span>
              </button>
            </li>
          ))}
          {candidates.length === 0 ? (
            <li className="px-4 py-6 text-center text-body-sm text-fg-muted">Nothing matches.</li>
          ) : null}
        </ul>
      </section>

      <div className="flex items-center gap-2">
        <Button variant="accent" size="lg" onClick={save} disabled={isSaving} className="flex-1">
          {isSaving ? "Saving…" : "Save group"}
        </Button>
        <Button
          variant="danger"
          size="lg"
          onClick={() => {
            if (confirm(`Delete "${group.name}"?`)) {
              startSaving(async () => {
                await deleteExerciseGroup(group.id);
              });
            }
          }}
        >
          Delete
        </Button>
      </div>

      {status ? <p className="pb-2 text-body-sm text-fg-muted">{status}</p> : null}
    </div>
  );
}

function IconButton({
  label,
  onClick,
  disabled,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className={cx(
        "h-(--control-h-sm) w-(--control-h-sm) rounded-pill border border-hairline text-body-sm text-fg-muted transition-colors duration-(--dur-fast) hover:bg-sunken hover:text-fg-strong",
        disabled && "pointer-events-none opacity-30",
      )}
    >
      {label}
    </button>
  );
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-micro font-medium tracking-caps text-fg-muted uppercase">
        {label}
      </span>
      <input
        value={value}
        inputMode="numeric"
        onChange={(e) => {
          const parsed = Number.parseInt(e.target.value, 10);
          onChange(Number.isFinite(parsed) ? parsed : 0);
        }}
        className="h-(--control-h-md) w-full rounded-md border border-line bg-card text-center font-mono text-body-sm text-fg-strong outline-none transition-colors duration-(--dur-fast) focus:border-line-accent"
      />
    </label>
  );
}
