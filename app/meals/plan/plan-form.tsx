"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { planMenu } from "@/lib/meal-actions";
import type { MealType } from "@/lib/meal/types";
import { Button, Card, Eyebrow, Hint, Input, Label, Note } from "@/components/ui";

/// The brief: a name, and how many of each meal.
///
/// The spec asks "how many breakfasts, lunches, dinners" and then pins each to a
/// date. This asks the same counts but never asks *when* — because the honest
/// answer here is "we do not know", and a plan that pretends otherwise is wrong
/// by Tuesday.
///
/// Everything else the optimiser accepts is assumed rather than asked. A form
/// with five sections is a form you stop filling in, and the answers were the
/// same every week: the cooking schedule is unreliable, there is no prep-time
/// limit worth enforcing, nothing is off the menu, and yes — write new recipes
/// if the library runs short. Those inputs still exist and are still honoured;
/// they are just no longer questions.

/// Unreliable, which is the truthful setting for this house. The optimiser reads
/// it as "prefer food that keeps", so being wrong about a night costs nothing.
const ASSUMED_CONFIDENCE = "flexible" as const;

type Counts = Record<"breakfast" | "lunch" | "dinner", { count: number; distinct: number }>;

export function PlanForm({
  weekStart,
  libraryByMealType,
}: {
  weekStart: string;
  libraryByMealType: Record<string, number>;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [name, setName] = useState("");
  // Distinct counts default high rather than low. Repetition is always cheaper,
  // so a permissive floor plus a cheap dish produces the same breakfast four
  // days running — technically optimal, and the first thing anyone complains
  // about. Turn them down to save money, rather than up to avoid boredom.
  const [counts, setCounts] = useState<Counts>({
    breakfast: { count: 5, distinct: 3 },
    lunch: { count: 5, distinct: 4 },
    dinner: { count: 4, distinct: 4 },
  });
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function patch(mealType: keyof Counts, patchValue: Partial<Counts[keyof Counts]>) {
    setCounts((prev) => {
      const next = { ...prev[mealType], ...patchValue };
      next.count = clamp(next.count, 0, 21);
      // Asking for more distinct recipes than meals is not a thing you can have.
      next.distinct = clamp(next.distinct, 1, Math.max(1, next.count));
      return { ...prev, [mealType]: next };
    });
  }

  function submit() {
    setError(null);
    setNotice(null);

    const occasions = (Object.keys(counts) as (keyof Counts)[])
      .map((mealType) => ({ mealType: mealType as MealType, count: counts[mealType].count }))
      .filter((o) => o.count > 0);

    if (occasions.length === 0) {
      setError("Ask for at least one meal.");
      return;
    }

    const minDistinct: Partial<Record<MealType, number>> = {};
    for (const mealType of Object.keys(counts) as (keyof Counts)[]) {
      if (counts[mealType].count > 0) {
        minDistinct[mealType as MealType] = counts[mealType].distinct;
      }
    }

    startTransition(async () => {
      const result = await planMenu({
        name,
        brief: {
          weekStart,
          occasions,
          minDistinct,
          cookConfidence: ASSUMED_CONFIDENCE,
          maxPrepMinutes: null,
          avoidIngredientIds: [],
          cooksForTwo: true,
        },
        // Always on. There is no longer a switch, so a missing API key must
        // degrade to planning from the library rather than failing the week.
        allowGeneration: true,
      });

      if (result.kind === "error") {
        setError(result.message);
        return;
      }
      if (result.gaps.length > 0) {
        setNotice(
          `No recipes for ${result.gaps.map((g) => `${g.count} ${g.mealType}`).join(", ")} — add some to the library.`,
        );
      }
      router.push(`/meals/${result.menuId}`);
    });
  }

  const totalMeals = Object.values(counts).reduce((n, c) => n + c.count, 0);

  return (
    <div className="space-y-5 px-4">
      <Card>
        <Label htmlFor="plan-name">Call this plan</Label>
        <Input
          id="plan-name"
          value={name}
          placeholder={`Week of ${weekStart}`}
          onChange={(e) => setName(e.target.value)}
        />
        <Hint>
          Plans are kept, not replaced. This one becomes the active plan and the others stay
          where they are, so you can switch back to any of them.
        </Hint>
      </Card>

      <Card>
        <Eyebrow className="mb-3">How many meals</Eyebrow>
        <div className="space-y-4">
          {(["breakfast", "lunch", "dinner"] as const).map((mealType) => (
            <div key={mealType}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-body-sm font-medium text-fg-strong capitalize">
                  {mealType}
                </span>
                <span className="font-mono text-micro text-fg-faint">
                  {libraryByMealType[mealType] ?? 0} in library
                </span>
              </div>

              <div className="mt-2 grid grid-cols-2 gap-3">
                <Stepper
                  label="meals"
                  value={counts[mealType].count}
                  onChange={(count) => patch(mealType, { count })}
                />
                <Stepper
                  label="different recipes"
                  value={counts[mealType].distinct}
                  max={Math.max(1, counts[mealType].count)}
                  min={1}
                  disabled={counts[mealType].count === 0}
                  onChange={(distinct) => patch(mealType, { distinct })}
                />
              </div>
            </div>
          ))}
        </div>
        <Hint>
          Fewer different recipes is cheaper and wastes less — one cook consumes whole packs by
          construction. Turn these down to save money.
        </Hint>
      </Card>

      {error ? <Note tone="danger">{error}</Note> : null}
      {notice ? <Note>{notice}</Note> : null}

      <div className="pb-4">
        <Button variant="accent" size="lg" fullWidth onClick={submit} disabled={isPending}>
          {isPending ? "Working out the shop…" : `Plan ${totalMeals} meals`}
        </Button>
        <Hint>
          Cooked for two and sized differently for each of you, planned around food that keeps
          so eating out on a whim costs nothing, and topped up with new recipes if the library
          runs short. Only your own servings reach your calorie log.
        </Hint>
      </div>
    </div>
  );
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}

function Stepper({
  label,
  value,
  onChange,
  min = 0,
  max = 21,
  disabled = false,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  disabled?: boolean;
}) {
  return (
    <div>
      <span className="mb-1 block text-micro font-medium tracking-caps text-fg-muted uppercase">
        {label}
      </span>
      <div className="flex items-center gap-1">
        <StepButton
          aria-label={`One fewer ${label}`}
          disabled={disabled || value <= min}
          onClick={() => onChange(value - 1)}
        >
          −
        </StepButton>
        <span className="flex-1 text-center font-mono text-body-md tabular-nums text-fg-strong">
          {value}
        </span>
        <StepButton
          aria-label={`One more ${label}`}
          disabled={disabled || value >= max}
          onClick={() => onChange(value + 1)}
        >
          +
        </StepButton>
      </div>
    </div>
  );
}

function StepButton({ children, ...props }: React.ComponentProps<"button">) {
  return (
    <button
      type="button"
      className="h-(--control-h-md) w-(--control-h-md) shrink-0 rounded-pill border border-line bg-card font-mono text-body-md text-fg-strong transition-colors hover:bg-sunken disabled:pointer-events-none disabled:opacity-40"
      {...props}
    >
      {children}
    </button>
  );
}
