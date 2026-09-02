"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { logBodyMetrics } from "@/lib/track-actions";
import { Button, Card, Hint, Label, Note } from "@/components/ui";

/// The morning weigh-in. Two fields and one button, because this gets used
/// before coffee.
///
/// This is the one place in the app that shows a single day's raw weight rather
/// than the trailing average (spec §6) — you have to see what you are typing.
/// Everywhere else reads the average.

export function WeightForm({
  dayKey,
  weightKg,
  steps,
  dayLabel,
}: {
  dayKey: string;
  weightKg: number | null;
  steps: number | null;
  dayLabel: string;
}) {
  const router = useRouter();
  const [weight, setWeight] = useState(weightKg == null ? "" : String(weightKg));
  const [stepCount, setStepCount] = useState(steps == null ? "" : String(steps));
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function run(payload: { weightKg?: number | null; steps?: number | null }, message: string) {
    setError(null);
    setStatus(null);
    startTransition(async () => {
      try {
        await logBodyMetrics({ dayKey, ...payload });
        setStatus(message);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not save that.");
      }
    });
  }

  function save() {
    const trimmedWeight = weight.trim();
    const trimmedSteps = stepCount.trim();

    if (trimmedWeight === "" && trimmedSteps === "") {
      setError("Nothing to save yet.");
      return;
    }
    // An empty field means "leave it alone", not "clear it" — clearing is what
    // the Remove button is for, so a typo in one field cannot wipe the other.
    run(
      {
        ...(trimmedWeight === "" ? {} : { weightKg: Number(trimmedWeight) }),
        ...(trimmedSteps === "" ? {} : { steps: Number(trimmedSteps) }),
      },
      "Saved",
    );
  }

  const changed =
    weight.trim() !== (weightKg == null ? "" : String(weightKg)) ||
    stepCount.trim() !== (steps == null ? "" : String(steps));

  return (
    <div className="space-y-3">
      <Card className="space-y-4">
        <div>
          <Label htmlFor="weight">Weight this morning</Label>
          <div className="relative">
            <input
              id="weight"
              value={weight}
              inputMode="decimal"
              placeholder="84.2"
              autoComplete="off"
              // One decimal place, one decimal point. Scales do not read finer
              // than 0.1kg and anything past it is noise dressed as precision.
              onChange={(e) =>
                setWeight(
                  e.target.value
                    .replace(/[^\d.]/g, "")
                    .replace(/(\..*)\./g, "$1")
                    .replace(/(\.\d)\d+/, "$1"),
                )
              }
              className="h-(--control-h-lg) w-full rounded-md border border-line bg-card px-3 pr-10 font-mono text-h3 text-fg-strong outline-none transition-colors duration-(--dur-fast) focus:border-line-accent"
            />
            <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center font-mono text-body-sm text-fg-faint">
              kg
            </span>
          </div>
          <Hint>{dayLabel}. Same time each day matters more than which time.</Hint>
        </div>

        <div>
          <Label htmlFor="steps">Steps</Label>
          <div className="relative">
            <input
              id="steps"
              value={stepCount}
              inputMode="numeric"
              placeholder="Optional"
              autoComplete="off"
              onChange={(e) => setStepCount(e.target.value.replace(/[^\d]/g, ""))}
              className="h-(--control-h-md) w-full rounded-md border border-line bg-card px-3 font-mono text-body-sm text-fg-strong outline-none transition-colors duration-(--dur-fast) focus:border-line-accent"
            />
          </div>
        </div>
      </Card>

      {error ? <Note tone="danger">{error}</Note> : null}

      <div className="flex items-center gap-2">
        <Button
          variant="accent"
          size="lg"
          fullWidth
          onClick={save}
          disabled={isPending || !changed}
        >
          {isPending ? "Saving…" : weightKg == null ? "Log it" : "Update"}
        </Button>
        {weightKg != null ? (
          <Button
            variant="ghost"
            size="lg"
            disabled={isPending}
            onClick={() => {
              setWeight("");
              run({ weightKg: null }, "Removed");
            }}
          >
            Remove
          </Button>
        ) : null}
      </div>

      {status ? <p className="text-body-sm text-fg-muted">{status}</p> : null}
    </div>
  );
}
