"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveGoals } from "@/lib/nutrition-actions";
import { Button, Card, Hint, Label, Note } from "@/components/ui";

export function GoalsForm({
  goals,
}: {
  goals: { baseCalories: number; golfDayCalories: number; proteinTargetG: number };
}) {
  const router = useRouter();
  const [base, setBase] = useState(String(goals.baseCalories));
  const [golf, setGolf] = useState(String(goals.golfDayCalories));
  const [protein, setProtein] = useState(String(goals.proteinTargetG));
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function save() {
    setError(null);
    setStatus(null);
    startTransition(async () => {
      try {
        await saveGoals({
          baseCalories: Number(base),
          golfDayCalories: Number(golf),
          proteinTargetG: Number(protein),
        });
        setStatus("Saved");
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not save.");
      }
    });
  }

  const difference = Number(golf) - Number(base);

  return (
    <div className="space-y-5 px-4">
      <Card className="space-y-5">
        <Field
          id="base"
          label="Base day calories"
          value={base}
          onChange={setBase}
          hint="Your normal target on a day you are not playing golf."
        />
        <Field
          id="golf"
          label="Golf day calories"
          value={golf}
          onChange={setGolf}
          hint={
            Number.isFinite(difference) && difference !== 0
              ? `${difference > 0 ? "+" : ""}${difference} kcal against a base day.`
              : "The target a golf day switches to."
          }
        />
        <Field
          id="protein"
          label="Protein target"
          value={protein}
          onChange={setProtein}
          unit="g"
          hint="The same every day — protein does not move with activity."
        />
      </Card>

      {error ? <Note tone="danger">{error}</Note> : null}

      <Button variant="accent" size="lg" fullWidth onClick={save} disabled={isPending}>
        {isPending ? "Saving…" : "Save goals"}
      </Button>

      {status ? <p className="text-body-sm text-fg-muted">{status}</p> : null}

      <Note>
        Saving changes what future days aim at. Days you have already logged keep the targets they
        were logged against, so your history stays honest.
      </Note>
    </div>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  hint,
  unit,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint: string;
  unit?: string;
}) {
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <input
          id={id}
          value={value}
          inputMode="numeric"
          onChange={(e) => onChange(e.target.value.replace(/[^\d]/g, ""))}
          className="h-(--control-h-lg) w-full rounded-md border border-line bg-card px-3 font-mono text-h3 text-fg-strong outline-none transition-colors duration-(--dur-fast) focus:border-line-accent"
        />
        {unit ? (
          <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center font-mono text-body-sm text-fg-faint">
            {unit}
          </span>
        ) : null}
      </div>
      <Hint>{hint}</Hint>
    </div>
  );
}
