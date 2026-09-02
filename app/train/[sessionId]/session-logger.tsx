"use client";

import { useRef, useState, useTransition } from "react";
import { finishSession, logSet, unlogSet } from "@/lib/actions";
import type { SessionScreen } from "@/lib/queries";
import { Badge, Button, Card, Eyebrow, Note, cx } from "@/components/ui";
import type { BadgeTone } from "@/components/ui";
import { RestTimerBar, startRest } from "./rest-timer";
import { ExercisePicker, type PickerExercise } from "./exercise-picker";

type ExerciseOption = PickerExercise;

type Row = {
  setNumber: number;
  weight: string;
  reps: string;
  isWarmup: boolean;
  isLogged: boolean;
};

// `rows` is replaced rather than intersected: the client keeps values as strings so
// a half-typed "6" in the weight field is not coerced into a number mid-keystroke.
type ExerciseState = Omit<SessionScreen["exercises"][number], "rows"> & { rows: Row[] };

const CUE_TONE: Record<string, BadgeTone> = {
  "add-weight": "success",
  stalled: "warning",
  "add-rep": "accent",
  hold: "neutral",
  "first-time": "neutral",
};

function toRows(rows: SessionScreen["exercises"][number]["rows"]): Row[] {
  return rows.map((r) => ({
    setNumber: r.setNumber,
    weight: r.weightKg === null ? "" : String(r.weightKg),
    reps: r.reps === null ? "" : String(r.reps),
    isWarmup: r.isWarmup,
    isLogged: r.isLogged,
  }));
}

export function SessionLogger({
  session,
  library,
}: {
  session: SessionScreen;
  library: ExerciseOption[];
}) {
  const [exercises, setExercises] = useState<ExerciseState[]>(() =>
    session.exercises.map((e) => ({ ...e, rows: toRows(e.rows) })),
  );
  const [addingExercise, setAddingExercise] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isFinishing, startFinishing] = useTransition();

  // Edits to an already-logged set save themselves; one timer per row keeps a
  // burst of stepper taps down to a single write.
  const saveTimers = useRef(new Map<string, number>());

  function patchRow(exerciseId: string, setNumber: number, patch: Partial<Row>) {
    setExercises((prev) =>
      prev.map((e) =>
        e.exerciseId !== exerciseId
          ? e
          : {
              ...e,
              rows: e.rows.map((r) => (r.setNumber === setNumber ? { ...r, ...patch } : r)),
            },
      ),
    );
  }

  function parseRow(row: Row) {
    const weight = Number.parseFloat(row.weight);
    const reps = Number.parseInt(row.reps, 10);
    if (!Number.isFinite(weight) || weight < 0) return null;
    if (!Number.isInteger(reps) || reps < 1) return null;
    return { weight, reps };
  }

  function scheduleSave(exercise: ExerciseState, row: Row) {
    const key = `${exercise.exerciseId}:${row.setNumber}`;
    const timers = saveTimers.current;
    window.clearTimeout(timers.get(key));
    timers.set(
      key,
      window.setTimeout(async () => {
        const parsed = parseRow(row);
        if (!parsed) return;
        try {
          await logSet({
            sessionId: session.id,
            exerciseId: exercise.exerciseId,
            setNumber: row.setNumber,
            weightKg: parsed.weight,
            reps: parsed.reps,
            isWarmup: row.isWarmup,
          });
        } catch (e) {
          setError(e instanceof Error ? e.message : "Could not save that set.");
        }
      }, 500),
    );
  }

  function onFieldChange(exercise: ExerciseState, row: Row, patch: Partial<Row>) {
    const next = { ...row, ...patch };
    patchRow(exercise.exerciseId, row.setNumber, patch);
    if (next.isLogged) scheduleSave(exercise, next);
  }

  function step(exercise: ExerciseState, row: Row, field: "weight" | "reps", delta: number) {
    const current = Number.parseFloat(field === "weight" ? row.weight : row.reps);
    const base = Number.isFinite(current) ? current : 0;
    const value = Math.max(0, base + delta);
    const text = field === "weight" ? String(Math.round(value * 4) / 4) : String(Math.round(value));
    onFieldChange(exercise, row, field === "weight" ? { weight: text } : { reps: text });
  }

  async function toggleLogged(exercise: ExerciseState, row: Row) {
    setError(null);

    if (row.isLogged) {
      patchRow(exercise.exerciseId, row.setNumber, { isLogged: false });
      await unlogSet({
        sessionId: session.id,
        exerciseId: exercise.exerciseId,
        setNumber: row.setNumber,
      });
      return;
    }

    const parsed = parseRow(row);
    if (!parsed) {
      setError("Enter a weight and at least 1 rep before ticking the set.");
      return;
    }

    patchRow(exercise.exerciseId, row.setNumber, { isLogged: true });
    startRest(exercise.restSeconds, exercise.name);

    try {
      await logSet({
        sessionId: session.id,
        exerciseId: exercise.exerciseId,
        setNumber: row.setNumber,
        weightKg: parsed.weight,
        reps: parsed.reps,
        isWarmup: row.isWarmup,
      });
    } catch (e) {
      patchRow(exercise.exerciseId, row.setNumber, { isLogged: false });
      setError(e instanceof Error ? e.message : "Could not save that set.");
    }
  }

  function addSet(exercise: ExerciseState) {
    const last = exercise.rows[exercise.rows.length - 1];
    setExercises((prev) =>
      prev.map((e) =>
        e.exerciseId !== exercise.exerciseId
          ? e
          : {
              ...e,
              rows: [
                ...e.rows,
                {
                  setNumber: (last?.setNumber ?? 0) + 1,
                  weight: last?.weight ?? "",
                  reps: last?.reps ?? "",
                  isWarmup: false,
                  isLogged: false,
                },
              ],
            },
      ),
    );
  }

  async function removeSet(exercise: ExerciseState, row: Row) {
    setExercises((prev) =>
      prev.map((e) =>
        e.exerciseId !== exercise.exerciseId
          ? e
          : { ...e, rows: e.rows.filter((r) => r.setNumber !== row.setNumber) },
      ),
    );
    if (row.isLogged) {
      await unlogSet({
        sessionId: session.id,
        exerciseId: exercise.exerciseId,
        setNumber: row.setNumber,
      });
    }
  }

  function addExercise(option: ExerciseOption) {
    setAddingExercise(false);
    if (exercises.some((e) => e.exerciseId === option.id)) return;
    setExercises((prev) => [
      ...prev,
      {
        exerciseId: option.id,
        name: option.name,
        muscleGroup: option.muscleGroup,
        equipment: option.equipment,
        notes: null,
        restSeconds: option.restSeconds,
        targetSets: 3,
        repMin: 8,
        repMax: 12,
        lastPerformance: null,
        lastPerformedAt: null,
        cue: { kind: "first-time", message: "Added this session" },
        rows: [1, 2, 3].map((setNumber) => ({
          setNumber,
          weight: "",
          reps: "",
          isWarmup: false,
          isLogged: false,
        })),
      },
    ]);
  }

  const loggedCount = exercises.reduce(
    (sum, e) => sum + e.rows.filter((r) => r.isLogged).length,
    0,
  );

  return (
    <>
      {error ? (
        <div className="mx-4 mb-3">
          <Note tone="danger">{error}</Note>
        </div>
      ) : null}

      <div className="space-y-3 px-4">
        {exercises.map((exercise) => (
          <Card key={exercise.exerciseId} className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="truncate text-h4 font-medium text-fg-strong">{exercise.name}</h2>
                <p className="mt-1 font-mono text-micro tracking-wide text-fg-faint">
                  {exercise.lastPerformance
                    ? `LAST ${exercise.lastPerformance}`
                    : "NO HISTORY YET"}
                  {"  ·  "}
                  {exercise.targetSets} × {exercise.repMin}–{exercise.repMax}
                </p>
              </div>
              <Badge tone={CUE_TONE[exercise.cue.kind] ?? "neutral"} className="shrink-0">
                {exercise.cue.message}
              </Badge>
            </div>

            {exercise.notes ? (
              <p className="mt-3 rounded-md bg-sunken px-3 py-2 text-caption text-fg-muted">
                {exercise.notes}
              </p>
            ) : null}

            <ul className="mt-4 space-y-2">
              {exercise.rows.map((row) => (
                <li
                  key={row.setNumber}
                  className="grid grid-cols-[1.25rem_1fr_1fr_3rem] items-center gap-2"
                >
                  <span className="font-mono text-micro text-fg-faint">{row.setNumber}</span>

                  <Stepper
                    value={row.weight}
                    suffix="kg"
                    onDown={() => step(exercise, row, "weight", -2.5)}
                    onUp={() => step(exercise, row, "weight", 2.5)}
                    onChange={(weight) => onFieldChange(exercise, row, { weight })}
                    logged={row.isLogged}
                  />

                  <Stepper
                    value={row.reps}
                    suffix="reps"
                    onDown={() => step(exercise, row, "reps", -1)}
                    onUp={() => step(exercise, row, "reps", 1)}
                    onChange={(reps) => onFieldChange(exercise, row, { reps })}
                    logged={row.isLogged}
                  />

                  <button
                    type="button"
                    onClick={() => toggleLogged(exercise, row)}
                    aria-label={
                      row.isLogged ? `Un-log set ${row.setNumber}` : `Log set ${row.setNumber}`
                    }
                    aria-pressed={row.isLogged}
                    className={cx(
                      "flex h-(--control-h-lg) w-full items-center justify-center rounded-pill border text-body-sm transition-[color,background-color,border-color] duration-(--dur-fast) ease-(--ease-standard) active:translate-y-px",
                      row.isLogged
                        ? "border-accent bg-accent text-paper-0"
                        : "border-line text-fg-faint hover:bg-sunken",
                    )}
                  >
                    ✓
                  </button>
                </li>
              ))}
            </ul>

            <div className="mt-3 flex items-center gap-4">
              <button
                type="button"
                onClick={() => addSet(exercise)}
                className="text-caption text-fg-muted transition-colors duration-(--dur-fast) hover:text-fg-strong"
              >
                + add set
              </button>
              {exercise.rows.length > 1 ? (
                <button
                  type="button"
                  onClick={() => removeSet(exercise, exercise.rows[exercise.rows.length - 1])}
                  className="text-caption text-fg-muted transition-colors duration-(--dur-fast) hover:text-fg-strong"
                >
                  − remove last
                </button>
              ) : null}
            </div>
          </Card>
        ))}
      </div>

      <div className="px-4 pt-4">
        {addingExercise ? (
          <ExercisePicker
            library={library}
            addedIds={new Set(exercises.map((e) => e.exerciseId))}
            onPick={addExercise}
            onCancel={() => setAddingExercise(false)}
          />
        ) : (
          <Button variant="secondary" fullWidth onClick={() => setAddingExercise(true)}>
            + Add an exercise
          </Button>
        )}
      </div>

      <div className="px-4 pt-3">
        <Button
          variant="primary"
          size="lg"
          fullWidth
          disabled={isFinishing}
          onClick={() =>
            startFinishing(async () => {
              await finishSession(session.id);
            })
          }
        >
          {loggedCount === 0 ? "Discard empty session" : `Finish · ${loggedCount} sets`}
        </Button>
      </div>

      <RestTimerBar />
    </>
  );
}

function Stepper({
  value,
  suffix,
  logged,
  onUp,
  onDown,
  onChange,
}: {
  value: string;
  suffix: string;
  logged: boolean;
  onUp: () => void;
  onDown: () => void;
  onChange: (value: string) => void;
}) {
  return (
    <div
      className={cx(
        "flex h-(--control-h-lg) items-stretch overflow-hidden rounded-md border transition-colors duration-(--dur-fast)",
        logged ? "border-line-accent bg-card" : "border-line bg-card",
      )}
    >
      <button
        type="button"
        onClick={onDown}
        aria-label={`decrease ${suffix}`}
        className="w-8 shrink-0 text-fg-faint transition-colors hover:text-fg-strong active:bg-sunken"
      >
        −
      </button>
      <div className="relative min-w-0 flex-1">
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          inputMode="decimal"
          // Prefilled-but-unticked values read as suggestions; ticking makes them real.
          className={cx(
            "h-full w-full bg-transparent text-center font-mono text-body-md outline-none",
            logged ? "text-fg-strong" : "text-fg-faint",
          )}
          placeholder="—"
        />
        <span className="pointer-events-none absolute right-1 bottom-1 font-mono text-[9px] text-fg-faint">
          {suffix}
        </span>
      </div>
      <button
        type="button"
        onClick={onUp}
        aria-label={`increase ${suffix}`}
        className="w-8 shrink-0 text-fg-faint transition-colors hover:text-fg-strong active:bg-sunken"
      >
        +
      </button>
    </div>
  );
}
