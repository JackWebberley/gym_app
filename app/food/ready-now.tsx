"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { binPortion, eatPortion, markCooked } from "@/lib/meal-actions";
import type { PoolPortion } from "@/lib/meal-queries";
import { groupPool, type PoolGroup } from "@/lib/meal/pool";
import { Badge, Button, Card, Eyebrow, Hint, Note, SectionHeader, Tag, cx } from "@/components/ui";

/// The pool, on the screen where you actually eat.
///
/// This is where the plan meets the day. The menu was fitted to a generic meal
/// envelope because a serving could be eaten on any day; here we finally know
/// what is actually left, so the scalable components get re-tuned one last time
/// against the real number (spec §8.5). A planned meal logged this way has no
/// estimation error at all and costs no API call (spec §8.8).
///
/// Servings are grouped by meal and folded by dish, because four identical
/// yoghurts are one decision, not four. Acting on a row takes the serving that
/// expires soonest, so eating from a group is always the right one to eat.

const SECTION_LABEL: Record<string, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  snack: "Snacks",
};

export function ReadyNow({
  pool,
  dayKey,
  caloriesLeft,
}: {
  pool: PoolPortion[];
  dayKey: string;
  caloriesLeft: number;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [fitting, setFitting] = useState<string | null>(null);

  if (pool.length === 0) return null;

  function run(action: () => Promise<unknown>) {
    setError(null);
    startTransition(async () => {
      try {
        await action();
        setFitting(null);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not do that.");
      }
    });
  }

  const sections = groupPool(pool);

  return (
    <section>
      <SectionHeader
        title="Planned meals"
        action={
          <Link href="/meals" className="text-caption">
            The menu →
          </Link>
        }
      />

      {error ? (
        <div className="mb-2">
          <Note tone="danger">{error}</Note>
        </div>
      ) : null}

      <div className="space-y-4">
        {sections.map((section) => (
          <div key={section.mealType}>
            <Eyebrow className="mb-1.5">
              {SECTION_LABEL[section.mealType] ?? section.mealType}
              <span className="ml-1.5 font-mono text-fg-faint">
                {section.count}
                {section.cookedCount > 0 ? ` · ${section.cookedCount} ready` : ""}
              </span>
            </Eyebrow>
            <div className="space-y-2">
              {section.groups.map((group) => (
                <PortionCard
                  key={group.key}
                  group={group}
                  caloriesLeft={caloriesLeft}
                  dayKey={dayKey}
                  isPending={isPending}
                  isFitting={fitting === group.key}
                  onToggleFit={() => setFitting(fitting === group.key ? null : group.key)}
                  run={run}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function PortionCard({
  group,
  caloriesLeft,
  dayKey,
  isPending,
  isFitting,
  onToggleFit,
  run,
}: {
  group: PoolGroup<PoolPortion>;
  caloriesLeft: number;
  dayKey: string;
  isPending: boolean;
  isFitting: boolean;
  onToggleFit: () => void;
  run: (action: () => Promise<unknown>) => void;
}) {
  // Whatever goes off first: eating from a group of four should never leave the
  // oldest one behind.
  const portion = group.next;
  const many = group.count > 1;

  // Only worth offering a resize when the day has room to describe and the gap is
  // big enough to matter. Below that it is noise dressed up as precision.
  const gap = caloriesLeft - portion.calories;
  const worthFitting = caloriesLeft > 150 && Math.abs(gap) >= 60;

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        {/* Something in the pool still to cook needs its method, and this is the
            screen you are on when you decide to cook it. */}
        <Link
          href={`/meals/${portion.menuId}/recipe/${portion.recipeId}`}
          className="min-w-0 flex-1 no-underline hover:no-underline"
        >
          <p className="truncate text-body-sm font-medium text-fg-strong">
            {portion.recipeName}
            {many ? <span className="ml-1.5 font-mono text-fg-muted">×{group.count}</span> : null}
          </p>
          <p className="mt-0.5 font-mono text-micro tracking-wide text-fg-faint">
            {portion.calories} KCAL · {portion.proteinG.toFixed(0)}P · {portion.carbsG.toFixed(0)}C
            · {portion.fatG.toFixed(0)}F
          </p>
        </Link>
        <div className="flex shrink-0 items-center gap-1.5">
          {portion.isCooked ? (
            <Badge
              tone={
                portion.daysLeft != null && portion.daysLeft <= 0
                  ? "danger"
                  : portion.daysLeft != null && portion.daysLeft <= 1
                    ? "warning"
                    : "neutral"
              }
            >
              {portion.daysLeft == null
                ? "cooked"
                : portion.daysLeft < 0
                  ? "past it"
                  : portion.daysLeft === 0
                    ? "eat today"
                    : `${portion.daysLeft}d left`}
            </Badge>
          ) : (
            <Tag>~{portion.prepMinutes} min</Tag>
          )}
        </div>
      </div>

      {isFitting ? (
        <div className="mt-3 rounded-md border border-hairline bg-sunken p-3">
          <p className="text-caption text-fg-muted">
            You have{" "}
            <span className="font-mono text-fg-strong">{Math.round(caloriesLeft)} kcal</span> left
            today. Scaling the adjustable parts of this dish:
          </p>
          <div className="mt-2 flex gap-2">
            <Button
              size="sm"
              variant="accent"
              disabled={isPending}
              onClick={() =>
                run(() => eatPortion({ portionId: portion.id, dayKey, scaleTo: caloriesLeft }))
              }
            >
              Fit to {Math.round(caloriesLeft)}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={isPending}
              onClick={() => run(() => eatPortion({ portionId: portion.id, dayKey }))}
            >
              As planned ({portion.calories})
            </Button>
          </div>
          <Hint>
            Only the scalable components move — the rice, not the olive oil. If the dish cannot
            stretch that far it lands as close as it can.
          </Hint>
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-2">
        {!portion.isCooked ? (
          <Button
            size="sm"
            variant="secondary"
            disabled={isPending}
            onClick={() => run(() => markCooked(portion.cookId))}
          >
            Cook &amp; log one
          </Button>
        ) : null}

        <Button
          size="sm"
          variant="accent"
          disabled={isPending}
          onClick={() => run(() => eatPortion({ portionId: portion.id, dayKey }))}
        >
          Log it
        </Button>

        {worthFitting ? (
          <Button size="sm" variant="ghost" disabled={isPending} onClick={onToggleFit}>
            {isFitting ? "Never mind" : gap > 0 ? "Scale up…" : "Scale down…"}
          </Button>
        ) : null}

        <button
          type="button"
          disabled={isPending}
          onClick={() => run(() => binPortion(portion.id))}
          className={cx(
            "ml-auto text-caption text-fg-faint underline-offset-2 transition-colors hover:text-danger hover:underline disabled:opacity-40",
          )}
        >
          Binned it
        </button>
      </div>
    </Card>
  );
}
