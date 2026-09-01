"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { planMenu } from "@/lib/meal-actions";
import type { CookConfidence, MealType } from "@/lib/meal/types";
import {
  Button,
  Card,
  Eyebrow,
  Hint,
  Input,
  Label,
  Note,
  SectionHeader,
  cx,
} from "@/components/ui";

/// The brief.
///
/// The spec asks "how many breakfasts, lunches, dinners" and then pins each to a
/// date. This asks the same counts but never asks *when* — because the honest
/// answer here is "we do not know", and a plan that pretends otherwise is wrong
/// by Tuesday. What it asks instead is how confident the week is, which the
/// optimiser turns into a preference for food that survives a change of plan.

const CONFIDENCE: { value: CookConfidence; label: string; hint: string }[] = [
  {
    value: "flexible",
    label: "Who knows",
    hint: "We will probably eat out once or twice. Lean hard on things that keep and freeze.",
  },
  {
    value: "likely",
    label: "Fairly sure",
    hint: "Most of these will get cooked. Some caution about anything that spoils fast.",
  },
  {
    value: "certain",
    label: "Locked in",
    hint: "We are cooking all of these. Fresh ingredients are fine.",
  },
];

type Counts = Record<"breakfast" | "lunch" | "dinner", { count: number; distinct: number }>;

export function PlanForm({
  weekStart,
  canGenerate,
  libraryByMealType,
  ingredients,
}: {
  weekStart: string;
  canGenerate: boolean;
  libraryByMealType: Record<string, number>;
  ingredients: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [counts, setCounts] = useState<Counts>({
    breakfast: { count: 5, distinct: 2 },
    lunch: { count: 5, distinct: 2 },
    dinner: { count: 4, distinct: 3 },
  });
  const [confidence, setConfidence] = useState<CookConfidence>("flexible");
  const [maxPrep, setMaxPrep] = useState<string>("");
  const [avoid, setAvoid] = useState<string[]>([]);
  const [allowGeneration, setAllowGeneration] = useState(canGenerate);
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
        brief: {
          weekStart,
          occasions,
          minDistinct,
          cookConfidence: confidence,
          maxPrepMinutes: maxPrep.trim() ? Number(maxPrep) : null,
          avoidIngredientIds: avoid,
          cooksForTwo: true,
        },
        allowGeneration,
      });

      if (result.kind === "error") {
        setError(result.message);
        return;
      }
      if (result.gaps.length > 0) {
        setNotice(
          `No recipes for ${result.gaps.map((g) => `${g.count} ${g.mealType}`).join(", ")} — add some to the library, or allow generation.`,
        );
      }
      router.push(`/meals/${result.menuId}`);
    });
  }

  const totalMeals = Object.values(counts).reduce((n, c) => n + c.count, 0);

  return (
    <div className="space-y-5 px-4">
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
          construction. The menu screen shows what each extra recipe actually costs.
        </Hint>
      </Card>

      <Card>
        <Eyebrow className="mb-3">How likely is the week</Eyebrow>
        <div className="grid gap-2">
          {CONFIDENCE.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setConfidence(option.value)}
              className={cx(
                "rounded-md border px-3 py-2.5 text-left transition-colors duration-(--dur-fast)",
                confidence === option.value
                  ? "border-line-accent bg-accent-soft"
                  : "border-hairline bg-card hover:bg-sunken",
              )}
            >
              <span className="block text-body-sm font-medium text-fg-strong">{option.label}</span>
              <span className="mt-0.5 block text-caption text-fg-muted">{option.hint}</span>
            </button>
          ))}
        </div>
        <Hint>
          This is the setting that replaces a calendar. Nothing gets assigned to a day; instead an
          uncertain week is planned with food that keeps, so eating out costs you nothing.
        </Hint>
      </Card>

      <Card>
        <Eyebrow className="mb-3">Constraints</Eyebrow>
        <Label htmlFor="max-prep">Longest you want to spend cooking (minutes)</Label>
        <Input
          id="max-prep"
          value={maxPrep}
          inputMode="numeric"
          placeholder="no limit"
          onChange={(e) => setMaxPrep(e.target.value.replace(/[^\d]/g, ""))}
        />

        <div className="mt-4">
          <Label htmlFor="avoid">Anything to avoid this week</Label>
          <div className="flex flex-wrap gap-1.5">
            {ingredients.slice(0, 40).map((ingredient) => {
              const selected = avoid.includes(ingredient.id);
              return (
                <button
                  key={ingredient.id}
                  type="button"
                  onClick={() =>
                    setAvoid((prev) =>
                      selected ? prev.filter((id) => id !== ingredient.id) : [...prev, ingredient.id],
                    )
                  }
                  className={cx(
                    "inline-flex h-[26px] items-center rounded-sm border px-2.5 font-mono text-micro tracking-wide whitespace-nowrap transition-colors",
                    selected
                      ? "border-inverse bg-inverse text-fg-inverse"
                      : "border-hairline bg-transparent text-fg-muted hover:bg-sunken",
                  )}
                >
                  {ingredient.name}
                </button>
              );
            })}
          </div>
          <Hint>Anything selected is excluded outright, not merely discouraged.</Hint>
        </div>
      </Card>

      <Card>
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={allowGeneration}
            disabled={!canGenerate}
            onChange={(e) => setAllowGeneration(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--accent)]"
          />
          <span className="min-w-0">
            <span className="block text-body-sm font-medium text-fg-strong">
              Write new recipes if the library is short
            </span>
            <span className="mt-0.5 block text-caption text-fg-muted">
              {canGenerate
                ? "Only for what the library cannot cover, and always built around ingredients you are already buying. Anything written is saved, so it is asked less every week."
                : "Needs ANTHROPIC_API_KEY in .env. The planner still works from recipes already in your library."}
            </span>
          </span>
        </label>
      </Card>

      {error ? <Note tone="danger">{error}</Note> : null}
      {notice ? <Note>{notice}</Note> : null}

      <div className="pb-4">
        <Button variant="accent" size="lg" fullWidth onClick={submit} disabled={isPending}>
          {isPending ? "Working out the shop…" : `Plan ${totalMeals} meals`}
        </Button>
        <Hint>
          Every meal is cooked for two, sized differently for each of you. Only your own servings
          reach your calorie log.
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

function StepButton({
  children,
  ...props
}: React.ComponentProps<"button">) {
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
