"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { binPortion, eatPortion, markCooked } from "@/lib/meal-actions";
import type { PoolPortion } from "@/lib/meal-queries";
import { Badge, Button, Card, Eyebrow, Hint, Note, SectionHeader, Tag, cx } from "@/components/ui";

/// The pool, on the screen where you actually eat.
///
/// This is where the plan meets the day. The menu was fitted to a generic meal
/// envelope because a serving could be eaten on any day; here we finally know
/// what is actually left, so the scalable components get re-tuned one last time
/// against the real number (spec §8.5). A planned meal logged this way has no
/// estimation error at all and costs no API call (spec §8.8).

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

  const cooked = pool.filter((p) => p.isCooked);
  const toCook = pool.filter((p) => !p.isCooked);

  return (
    <section>
      <SectionHeader
        title="Ready to eat"
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

      <div className="space-y-2">
        {cooked.map((portion) => (
          <PortionCard
            key={portion.id}
            portion={portion}
            caloriesLeft={caloriesLeft}
            dayKey={dayKey}
            isPending={isPending}
            isFitting={fitting === portion.id}
            onToggleFit={() => setFitting(fitting === portion.id ? null : portion.id)}
            run={run}
          />
        ))}

        {toCook.length > 0 ? (
          <>
            <Eyebrow className="pt-2">Needs cooking</Eyebrow>
            {toCook.map((portion) => (
              <PortionCard
                key={portion.id}
                portion={portion}
                caloriesLeft={caloriesLeft}
                dayKey={dayKey}
                isPending={isPending}
                isFitting={fitting === portion.id}
                onToggleFit={() => setFitting(fitting === portion.id ? null : portion.id)}
                run={run}
              />
            ))}
          </>
        ) : null}
      </div>
    </section>
  );
}

function PortionCard({
  portion,
  caloriesLeft,
  dayKey,
  isPending,
  isFitting,
  onToggleFit,
  run,
}: {
  portion: PoolPortion;
  caloriesLeft: number;
  dayKey: string;
  isPending: boolean;
  isFitting: boolean;
  onToggleFit: () => void;
  run: (action: () => Promise<unknown>) => void;
}) {
  // Only worth offering a resize when the day has room to describe and the gap is
  // big enough to matter. Below that it is noise dressed up as precision.
  const gap = caloriesLeft - portion.calories;
  const worthFitting = caloriesLeft > 150 && Math.abs(gap) >= 60;

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-body-sm font-medium text-fg-strong">{portion.recipeName}</p>
          <p className="mt-0.5 font-mono text-micro tracking-wide text-fg-faint">
            {portion.calories} KCAL · {portion.proteinG.toFixed(0)}P · {portion.carbsG.toFixed(0)}C
            · {portion.fatG.toFixed(0)}F
          </p>
        </div>
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
            Cooked it{portion.siblingCount > 1 ? ` (${portion.siblingCount})` : ""}
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
