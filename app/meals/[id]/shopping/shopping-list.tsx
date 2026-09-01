"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { markShopped, tickShoppingLine } from "@/lib/meal-actions";
import type { ShoppingScreen } from "@/lib/meal-queries";
import { describeQuantity, formatGrams } from "@/lib/meal/packs";
import { WORTH_KEEPING_GRAMS } from "@/lib/meal/basket";
import { Badge, Button, Card, Eyebrow, Hint, Note, SectionHeader, cx } from "@/components/ui";

/// The shop, grouped by aisle, in pack units, with the leftover made explicit
/// (spec §8.7). The projected-waste line at the bottom is the whole feature in
/// one number — watch it fall as the pantry fills up.

const AISLE_LABELS: Record<string, string> = {
  produce: "Produce",
  meat: "Meat",
  fish: "Fish",
  dairy: "Dairy & eggs",
  bakery: "Bakery",
  dry: "Dry goods",
  tinned: "Tinned & jars",
  frozen: "Frozen",
  condiment: "Cupboard",
};

export function ShoppingList({ list }: { list: ShoppingScreen }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const allTicked = list.totalCount > 0 && list.tickedCount === list.totalCount;
  const isShopped = list.status === "shopped";

  function tick(lineId: string, isTicked: boolean) {
    startTransition(async () => {
      await tickShoppingLine({ lineId, isTicked });
      router.refresh();
    });
  }

  return (
    <div className="space-y-5 px-4">
      <Card>
        <div className="flex items-baseline justify-between gap-3">
          <Eyebrow>{isShopped ? "Shopped" : `${list.tickedCount} of ${list.totalCount} in the trolley`}</Eyebrow>
          {isShopped ? <Badge tone="success">done</Badge> : null}
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-pill bg-sunken">
          <div
            className="h-full rounded-pill bg-accent transition-[width] duration-(--dur-base)"
            style={{
              width: `${list.totalCount > 0 ? (list.tickedCount / list.totalCount) * 100 : 0}%`,
            }}
          />
        </div>
      </Card>

      {error ? <Note tone="danger">{error}</Note> : null}

      {list.aisles.map((aisle) => (
        <section key={aisle.aisle}>
          <SectionHeader title={AISLE_LABELS[aisle.aisle] ?? aisle.aisle} />
          <ul className="divide-y divide-hairline overflow-hidden rounded-lg border border-hairline bg-card">
            {aisle.lines.map((line) => (
              <li key={line.id} className="px-4 py-3">
                <label className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={line.isTicked}
                    disabled={isPending || isShopped}
                    onChange={(e) => tick(line.id, e.target.checked)}
                    className="mt-1 h-4 w-4 shrink-0 accent-[var(--accent)]"
                  />
                  <span className="min-w-0 flex-1">
                    <span
                      className={cx(
                        "block text-body-sm",
                        line.isTicked ? "text-fg-faint line-through" : "text-fg-strong",
                      )}
                    >
                      {line.name}
                      {line.packLabel ? (
                        <span className="text-fg-muted">
                          {" "}
                          — {line.packCount > 1 ? `${line.packCount} × ` : ""}
                          {line.packLabel}
                        </span>
                      ) : null}
                    </span>
                    <span className="mt-0.5 block font-mono text-micro tracking-wide text-fg-faint">
                      NEED {describeQuantity(line.gramsNeeded, line.unitGrams)}
                      {line.priceGbp != null ? ` · £${line.priceGbp.toFixed(2)}` : ""}
                    </span>
                    {line.surplusGrams >= WORTH_KEEPING_GRAMS ? (
                      <span className="mt-1 flex flex-wrap items-center gap-1.5">
                        <Badge tone={line.wasteCostGbp > 0.3 ? "warning" : "neutral"}>
                          {formatGrams(line.surplusGrams)} spare
                        </Badge>
                        <span className="font-mono text-micro text-fg-faint">
                          {line.shelfLifeDays >= 7
                            ? "→ pantry"
                            : `keeps ${line.shelfLifeDays}d · waste £${line.wasteCostGbp.toFixed(2)}`}
                        </span>
                      </span>
                    ) : null}
                    {line.needsPackData ? (
                      <span className="mt-1 block text-caption text-warning">
                        No pack size on file — costed as an exact quantity. Add its packs and the
                        next plan will be more honest.
                      </span>
                    ) : null}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </section>
      ))}

      {list.fromPantry.length > 0 ? (
        <section>
          <SectionHeader title="Already have (from the pantry)" />
          <Card tone="sunken" className="p-4">
            <p className="font-mono text-micro tracking-wide text-fg-muted">
              {list.fromPantry
                .map((item) => `${item.name} ${formatGrams(item.grams)}`)
                .join(" · ")}
            </p>
          </Card>
        </section>
      ) : null}

      {list.staples.length > 0 ? (
        <section>
          <SectionHeader title="Check the cupboard" />
          <Card tone="sunken" className="p-4">
            <p className="font-mono text-micro tracking-wide text-fg-muted">
              {list.staples.map((item) => item.name).join(" · ")}
            </p>
            <Hint>Staples are never costed or shopped for — just make sure you have them.</Hint>
          </Card>
        </section>
      ) : null}

      {/* ── The number the whole feature exists for ─────────────────────── */}
      <Card tone="accent">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-body-sm font-medium text-fg-strong">Estimated</span>
          <span className="font-mono text-h3 tabular-nums text-fg-strong">
            £{list.estimatedCostGbp.toFixed(2)}
          </span>
        </div>
        <div className="mt-2 flex items-baseline justify-between gap-3 border-t border-pine-2 pt-2">
          <span className="text-body-sm text-fg-muted">Projected waste</span>
          <span className="font-mono text-body-md tabular-nums text-fg">
            £{list.projectedWasteGbp.toFixed(2)}
            {list.estimatedCostGbp > 0
              ? ` (${((list.projectedWasteGbp / list.estimatedCostGbp) * 100).toFixed(1)}%)`
              : ""}
          </span>
        </div>
        <Hint>Watch this fall over the first month as the pantry fills up.</Hint>
      </Card>

      {!isShopped ? (
        <div className="pb-4">
          <Button
            variant="accent"
            size="lg"
            fullWidth
            disabled={isPending}
            onClick={() => {
              setError(null);
              startTransition(async () => {
                try {
                  await markShopped(list.menuId);
                  router.refresh();
                } catch (e) {
                  setError(e instanceof Error ? e.message : "Could not mark that shopped.");
                }
              });
            }}
          >
            {isPending ? "Filing the leftovers…" : allTicked ? "Shopped" : "Mark as shopped"}
          </Button>
          <Hint>
            This files every leftover into the pantry with an expiry date, and deducts what the
            plan took out of it. Next week&rsquo;s shop starts from what is already here.
          </Hint>
        </div>
      ) : (
        <div className="pb-4">
          <Note>
            Leftovers are in the pantry. Cook whenever you like — the servings are waiting on the
            Food screen.
          </Note>
        </div>
      )}
    </div>
  );
}
