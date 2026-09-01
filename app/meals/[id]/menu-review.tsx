"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  confirmMenu,
  deleteMenu,
  markCooked,
  markNotCooked,
  rerollMenu,
  swapCook,
  toggleCookLock,
} from "@/lib/meal-actions";
import type { MenuScreen } from "@/lib/meal-queries";
import { formatGrams } from "@/lib/meal/packs";
import {
  Badge,
  Button,
  Card,
  Eyebrow,
  Hint,
  Note,
  SectionHeader,
  Select,
  Tag,
  cx,
} from "@/components/ui";

/// The menu, as a list of cooks rather than a week.
///
/// Every cook has lock, swap and reroll, and locking is a genuine constraint: the
/// optimiser re-solves around it rather than treating it as a hint (spec §8.3).

type Alternative = { id: string; name: string; mealType: string; prepMinutes: number };

export function MenuReview({
  menu,
  alternatives,
}: {
  menu: MenuScreen;
  alternatives: Alternative[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const isDraft = menu.status === "draft";
  const totalServings = menu.cooks.reduce((n, c) => n + c.servingsForMe, 0);

  function run(action: () => Promise<unknown>) {
    setError(null);
    startTransition(async () => {
      try {
        await action();
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "That did not work.");
      }
    });
  }

  return (
    <div className="space-y-5 px-4">
      {/* ── Readout ─────────────────────────────────────────────────────── */}
      <Card tone={isDraft ? "default" : "accent"}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <Eyebrow>{menu.status === "shopped" ? "Shopped" : menu.status}</Eyebrow>
            <p className="mt-1 text-body-md font-medium text-fg-strong">
              {menu.cooks.length} cooks · {totalServings} servings for me
            </p>
          </div>
          {menu.cooks.some((c) => c.isLocked) ? <Badge tone="accent">locked cooks</Badge> : null}
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="rounded-md border border-hairline bg-sunken px-3 py-2.5">
            <p className="text-micro font-medium tracking-caps text-fg-muted uppercase">Shop</p>
            <p className="mt-1 font-mono text-h3 leading-none tabular-nums text-fg-strong">
              £{menu.estimatedCostGbp.toFixed(2)}
            </p>
          </div>
          <div className="rounded-md border border-hairline bg-sunken px-3 py-2.5">
            <p className="text-micro font-medium tracking-caps text-fg-muted uppercase">
              Projected waste
            </p>
            <p className="mt-1 font-mono text-h3 leading-none tabular-nums text-fg-strong">
              £{menu.projectedWasteGbp.toFixed(2)}
            </p>
            <p className="font-mono text-micro text-fg-faint">
              {menu.estimatedCostGbp > 0
                ? `${((menu.projectedWasteGbp / menu.estimatedCostGbp) * 100).toFixed(1)}% of the shop`
                : "—"}
            </p>
          </div>
        </div>

        <Hint>
          Waste is weighted by how fast a thing goes off, not by how much is left over. A spare
          half-bag of potatoes barely counts; a spare bunch of basil counts almost in full.
        </Hint>
      </Card>

      {error ? <Note tone="danger">{error}</Note> : null}

      {/* ── Cooks ───────────────────────────────────────────────────────── */}
      <section>
        <SectionHeader
          title="The cooks"
          action={
            isDraft ? (
              <button
                type="button"
                disabled={isPending}
                onClick={() => run(() => rerollMenu(menu.id))}
                className="text-caption text-fg-accent underline-offset-2 hover:underline disabled:opacity-40"
              >
                Reroll unlocked
              </button>
            ) : undefined
          }
        />

        <ul className="space-y-2">
          {menu.cooks.map((cook) => {
            const isOpen = expanded === cook.id;
            return (
              <li key={cook.id}>
                <Card className={cx("p-4", cook.isLocked && "border-line-accent")}>
                  <div className="flex items-start justify-between gap-3">
                    <button
                      type="button"
                      onClick={() => setExpanded(isOpen ? null : cook.id)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <p className="truncate text-body-sm font-medium text-fg-strong">
                        {cook.name}
                        {cook.repeatTotal > 1 ? (
                          <span className="font-normal text-fg-muted">
                            {" "}
                            — cook {cook.repeatIndex} of {cook.repeatTotal}
                          </span>
                        ) : null}
                      </p>
                      <p className="mt-0.5 font-mono text-micro tracking-wide text-fg-faint">
                        {cook.mealType.toUpperCase()} · {cook.servingsForMe}
                        {cook.servingsForPartner > 0 ? ` + ${cook.servingsForPartner}` : ""} SERVINGS
                        · ~{cook.prepMinutes} MIN
                      </p>
                    </button>
                    <div className="flex shrink-0 items-center gap-1.5">
                      {cook.batchFriendly && cook.servingsForMe > 1 ? <Tag>batch</Tag> : null}
                      {cook.leftoversFreeze ? <Tag>freezes</Tag> : null}
                      {cook.cookedAt ? <Badge tone="success">cooked</Badge> : null}
                    </div>
                  </div>

                  {/* Portions: the two-people bit made visible. */}
                  <div className="mt-3 flex flex-wrap gap-2">
                    {cook.myPortion ? (
                      <span className="rounded-sm border border-hairline bg-sunken px-2 py-1 font-mono text-micro text-fg-muted">
                        ME {cook.myPortion.calories} KCAL · {cook.myPortion.proteinG.toFixed(0)}P
                      </span>
                    ) : null}
                    {cook.theirPortion ? (
                      <span className="rounded-sm border border-hairline bg-sunken px-2 py-1 font-mono text-micro text-fg-muted">
                        HER {cook.theirPortion.calories} KCAL
                      </span>
                    ) : null}
                  </div>

                  {isOpen ? (
                    <div className="mt-3 border-t border-hairline pt-3">
                      <Eyebrow className="mb-2">Per serving</Eyebrow>
                      <ul className="space-y-1">
                        {cook.ingredients.map((item) => (
                          <li
                            key={item.name}
                            className="flex items-baseline justify-between gap-3 font-mono text-micro"
                          >
                            <span className="min-w-0 truncate text-fg-muted">
                              {item.name}
                              {item.note ? (
                                <span className="text-fg-faint"> ({item.note})</span>
                              ) : null}
                            </span>
                            <span className="shrink-0 tabular-nums text-fg">
                              {formatGrams(item.grams)}
                              {item.isScalable && item.minGrams != null && item.maxGrams != null ? (
                                <span className="text-fg-faint">
                                  {" "}
                                  ({formatGrams(item.minGrams)}–{formatGrams(item.maxGrams)})
                                </span>
                              ) : null}
                            </span>
                          </li>
                        ))}
                      </ul>
                      <Hint>
                        Amounts in brackets are adjustable. They are what let one dish cover both
                        of your portions, and get re-tuned again when you log it.
                      </Hint>

                      {cook.method ? (
                        <div className="mt-3">
                          <Eyebrow className="mb-1">Method</Eyebrow>
                          <p className="text-caption whitespace-pre-line text-fg-muted">
                            {cook.method}
                          </p>
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  <div className="mt-3 flex flex-wrap gap-2">
                    {isDraft ? (
                      <>
                        <Button
                          size="sm"
                          variant={cook.isLocked ? "primary" : "secondary"}
                          disabled={isPending}
                          onClick={() => run(() => toggleCookLock(cook.id))}
                        >
                          {cook.isLocked ? "Locked" : "Lock"}
                        </Button>
                        <Select
                          aria-label={`Swap ${cook.name}`}
                          value=""
                          disabled={isPending}
                          className="h-(--control-h-sm) w-auto flex-1 text-caption"
                          onChange={(e) => {
                            if (!e.target.value) return;
                            run(() => swapCook({ cookId: cook.id, recipeId: e.target.value }));
                          }}
                        >
                          <option value="">Swap for…</option>
                          {alternatives
                            .filter((a) => a.mealType === cook.mealType && a.id !== cook.recipeId)
                            .map((a) => (
                              <option key={a.id} value={a.id}>
                                {a.name}
                              </option>
                            ))}
                        </Select>
                      </>
                    ) : (
                      <Button
                        size="sm"
                        variant={cook.cookedAt ? "ghost" : "accent"}
                        disabled={isPending}
                        onClick={() =>
                          run(() => (cook.cookedAt ? markNotCooked(cook.id) : markCooked(cook.id)))
                        }
                      >
                        {cook.cookedAt ? "Not cooked after all" : "Cooked it"}
                      </Button>
                    )}
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>

        {menu.cooks.length === 0 ? (
          <p className="rounded-lg border border-dashed border-line px-4 py-6 text-center text-body-sm text-fg-muted">
            Nothing in this menu. Add recipes to the library and plan again.
          </p>
        ) : null}
      </section>

      {/* ── Actions ─────────────────────────────────────────────────────── */}
      <div className="space-y-2 pb-4">
        {isDraft ? (
          <>
            <Button
              variant="accent"
              size="lg"
              fullWidth
              disabled={isPending || menu.cooks.length === 0}
              onClick={() => run(() => confirmMenu(menu.id))}
            >
              {isPending ? "Working…" : "Confirm and build the shopping list"}
            </Button>
            <Hint>
              Confirming writes the list down. From then on it is what you shopped from, and
              editing a recipe later will not rewrite it.
            </Hint>
            <Button
              variant="danger"
              size="sm"
              fullWidth
              disabled={isPending}
              onClick={() => {
                run(async () => {
                  await deleteMenu(menu.id);
                  router.push("/meals");
                });
              }}
            >
              Discard this menu
            </Button>
          </>
        ) : (
          <Link
            href={`/meals/${menu.id}/shopping`}
            className="block rounded-pill border border-line bg-card py-3 text-center text-body-sm text-fg-strong no-underline transition-colors hover:bg-sunken hover:no-underline"
          >
            Shopping list →
          </Link>
        )}
      </div>
    </div>
  );
}
