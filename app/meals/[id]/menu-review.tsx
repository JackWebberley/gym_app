"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  clearMenuCooks,
  confirmMenu,
  cookOneOfGroup,
  deleteCookGroup,
  deleteMenu,
  deleteOneOfGroup,
  swapCookGroup,
  toggleCookGroupLock,
  uncookOneOfGroup,
} from "@/lib/meal-actions";
import type { CookGroup, MenuScreen, MenuSection } from "@/lib/meal-queries";
import { formatGrams } from "@/lib/meal/packs";
import { Badge, Button, Card, Eyebrow, Hint, Note, Select, Tag, cx } from "@/components/ui";

/// The menu, as collapsible sections rather than one long list.
///
/// Two things make a week readable. Meals are grouped by the part of the day
/// they belong to, because that is how anyone actually thinks about food. And
/// repeats of a dish fold into one row with a count: a recipe that does not
/// batch produces a separate cook per meal, which surfaced as three
/// near-identical cards in a list of thirteen. The individual cooks still exist
/// and are still addressable — they are just not the unit of attention any more.

type Alternative = { id: string; name: string; mealType: string; prepMinutes: number };

const SECTION_LABEL: Record<string, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  snack: "Snacks",
};

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
  const [openRecipe, setOpenRecipe] = useState<string | null>(null);
  // Open to begin with. A menu you have to unfold three times before you can see
  // your week is worse than the flat list it replaced.
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [confirmingClear, setConfirmingClear] = useState(false);

  const isDraft = menu.status === "draft";
  const totalServings = menu.sections.reduce((n, s) => n + s.servingsForMe, 0);
  const totalCooks = menu.sections.reduce((n, s) => n + s.cookCount, 0);

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

  function toggleSection(mealType: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(mealType)) next.delete(mealType);
      else next.add(mealType);
      return next;
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
              {totalServings} {totalServings === 1 ? "meal" : "meals"} for me
              <span className="text-fg-muted">
                {" "}
                · {totalCooks} {totalCooks === 1 ? "cook" : "cooks"}
              </span>
            </p>
          </div>
          {menu.sections.some((s) => s.groups.some((g) => g.isLocked)) ? (
            <Badge tone="accent">locked</Badge>
          ) : null}
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <Figure label="Shop" value={`£${menu.estimatedCostGbp.toFixed(2)}`} />
          <Figure
            label="Projected waste"
            value={`£${menu.projectedWasteGbp.toFixed(2)}`}
            sub={
              menu.estimatedCostGbp > 0
                ? `${((menu.projectedWasteGbp / menu.estimatedCostGbp) * 100).toFixed(1)}% of the shop`
                : undefined
            }
          />
        </div>

        <Hint>
          Waste is weighted by how fast a thing goes off, not by how much is left over. A spare
          half-bag of potatoes barely counts; a spare bunch of basil counts almost in full.
        </Hint>
      </Card>

      {error ? <Note tone="danger">{error}</Note> : null}

      {/* ── Sections ────────────────────────────────────────────────────── */}
      {menu.sections.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line px-4 py-6 text-center text-body-sm text-fg-muted">
          Nothing in this menu. Add recipes to the library and plan again.
        </p>
      ) : (
        <div className="space-y-3">
          {menu.sections.map((section) => (
            <Section
              key={section.mealType}
              section={section}
              menu={menu}
              alternatives={alternatives}
              isDraft={isDraft}
              isPending={isPending}
              isCollapsed={collapsed.has(section.mealType)}
              onToggle={() => toggleSection(section.mealType)}
              openRecipe={openRecipe}
              setOpenRecipe={setOpenRecipe}
              run={run}
            />
          ))}
        </div>
      )}

      {/* ── Actions ─────────────────────────────────────────────────────── */}
      <div className="space-y-2 pb-4">
        {confirmingClear ? (
          <Note tone="danger">
            <span className="flex flex-wrap items-center gap-2">
              Remove all {totalCooks} cooks from this plan?
              <Button
                size="sm"
                variant="danger"
                disabled={isPending}
                onClick={() => {
                  setConfirmingClear(false);
                  run(() => clearMenuCooks(menu.id));
                }}
              >
                Yes, empty it
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirmingClear(false)}>
                Cancel
              </Button>
            </span>
          </Note>
        ) : null}

        {isDraft ? (
          <>
            <Button
              variant="accent"
              size="lg"
              fullWidth
              disabled={isPending || totalCooks === 0}
              onClick={() => run(() => confirmMenu(menu.id))}
            >
              {isPending ? "Working…" : "Confirm and build the shopping list"}
            </Button>
            <Hint>
              Confirming writes the list down. From then on it is what you shopped from, and
              editing a recipe later will not rewrite it.
            </Hint>
          </>
        ) : (
          <Link
            href={`/meals/${menu.id}/shopping`}
            className="block rounded-pill border border-line bg-card py-3 text-center text-body-sm text-fg-strong no-underline transition-colors hover:bg-sunken hover:no-underline"
          >
            Shopping list →
          </Link>
        )}

        <div className="flex flex-wrap items-center gap-2 pt-2">
          {totalCooks > 0 && !confirmingClear ? (
            <Button size="sm" variant="ghost" onClick={() => setConfirmingClear(true)}>
              Remove all cooks
            </Button>
          ) : null}
          <Button
            size="sm"
            variant="danger"
            className="ml-auto"
            disabled={isPending}
            onClick={() =>
              run(async () => {
                await deleteMenu(menu.id);
                router.push("/meals");
              })
            }
          >
            Delete this plan
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ── A meal-type section ───────────────────────────────────────────────── */

function Section({
  section,
  menu,
  alternatives,
  isDraft,
  isPending,
  isCollapsed,
  onToggle,
  openRecipe,
  setOpenRecipe,
  run,
}: {
  section: MenuSection;
  menu: MenuScreen;
  alternatives: Alternative[];
  isDraft: boolean;
  isPending: boolean;
  isCollapsed: boolean;
  onToggle: () => void;
  openRecipe: string | null;
  setOpenRecipe: (id: string | null) => void;
  run: (action: () => Promise<unknown>) => void;
}) {
  const allCooked = section.cookCount > 0 && section.cookedCount === section.cookCount;

  return (
    <section className="overflow-hidden rounded-lg border border-hairline bg-card">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={!isCollapsed}
        className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-sunken"
      >
        <span
          aria-hidden
          className={cx(
            "shrink-0 text-fg-faint transition-transform duration-(--dur-fast)",
            isCollapsed ? "" : "rotate-90",
          )}
        >
          ›
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-body-sm font-medium text-fg-strong">
            {SECTION_LABEL[section.mealType] ?? section.mealType}
          </span>
          <span className="mt-0.5 block font-mono text-micro tracking-wide text-fg-faint">
            {section.servingsForMe} {section.servingsForMe === 1 ? "MEAL" : "MEALS"} ·{" "}
            {section.groups.length} {section.groups.length === 1 ? "DISH" : "DISHES"}
            {section.cookedCount > 0 ? ` · ${section.cookedCount}/${section.cookCount} COOKED` : ""}
          </span>
        </span>
        {allCooked ? <Badge tone="success">all cooked</Badge> : null}
      </button>

      {!isCollapsed ? (
        <ul className="divide-y divide-hairline border-t border-hairline">
          {section.groups.map((group) => (
            <GroupRow
              key={group.recipeId}
              group={group}
              menu={menu}
              alternatives={alternatives}
              isDraft={isDraft}
              isPending={isPending}
              isOpen={openRecipe === group.recipeId}
              onToggle={() => setOpenRecipe(openRecipe === group.recipeId ? null : group.recipeId)}
              run={run}
            />
          ))}
        </ul>
      ) : null}
    </section>
  );
}

/* ── One dish, however many times it is cooked ─────────────────────────── */

function GroupRow({
  group,
  menu,
  alternatives,
  isDraft,
  isPending,
  isOpen,
  onToggle,
  run,
}: {
  group: CookGroup;
  menu: MenuScreen;
  alternatives: Alternative[];
  isDraft: boolean;
  isPending: boolean;
  isOpen: boolean;
  onToggle: () => void;
  run: (action: () => Promise<unknown>) => void;
}) {
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const many = group.servingsForMe > 1;
  const allCooked = group.cookCount > 0 && group.cookedCount === group.cookCount;
  const target = { menuId: menu.id, recipeId: group.recipeId };

  return (
    <li className={cx("px-4 py-3", group.isLocked && "bg-accent-soft")}>
      <div className="flex items-start justify-between gap-3">
        {/* Tapping the dish opens the full recipe: the method, both portions'
            macros, and the weights for the pan. The chevron keeps the quick look
            at per-serving quantities without leaving the menu. */}
        <Link
          href={`/meals/${menu.id}/recipe/${group.recipeId}`}
          className="min-w-0 flex-1 no-underline hover:no-underline"
        >
          <p className="text-body-sm font-medium text-fg-strong">
            {group.name}
            {many ? (
              <span className="ml-1.5 font-mono text-fg-muted">×{group.servingsForMe}</span>
            ) : null}
          </p>
          <p className="mt-0.5 font-mono text-micro tracking-wide text-fg-faint">
            {group.myPortion
              ? `${group.myPortion.calories} KCAL · ${Math.round(group.myPortion.proteinG)}P`
              : ""}
            {group.theirPortion ? ` · HER ${group.theirPortion.calories}` : ""}
            {` · ~${group.prepMinutes} MIN`}
          </p>
        </Link>

        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={isOpen}
            aria-label={`Quantities for ${group.name}`}
            title="Per-serving quantities"
            className="h-7 w-7 shrink-0 rounded-pill border border-hairline text-fg-faint transition-colors hover:bg-sunken hover:text-fg-strong"
          >
            <span
              aria-hidden
              className={cx(
                "inline-block transition-transform duration-(--dur-fast)",
                isOpen && "rotate-90",
              )}
            >
              ›
            </span>
          </button>
          {group.batchFriendly && many ? <Tag>one batch</Tag> : null}
          {!group.batchFriendly && group.cookCount > 1 ? <Tag>{group.cookCount} cooks</Tag> : null}
          {group.leftoversFreeze ? <Tag>freezes</Tag> : null}
          {group.cookedCount > 0 ? (
            <Badge tone={allCooked ? "success" : "neutral"}>
              {allCooked ? "cooked" : `${group.cookedCount}/${group.cookCount}`}
            </Badge>
          ) : null}
        </div>
      </div>

      {isOpen ? (
        <div className="mt-3 rounded-md border border-hairline bg-sunken p-3">
          <Eyebrow className="mb-2">Per serving</Eyebrow>
          <ul className="space-y-1">
            {group.ingredients.map((item) => (
              <li
                key={item.name}
                className="flex items-baseline justify-between gap-3 font-mono text-micro"
              >
                <span className="min-w-0 truncate text-fg-muted">
                  {item.name}
                  {item.note ? <span className="text-fg-faint"> ({item.note})</span> : null}
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
            Amounts in brackets are adjustable — what lets one dish cover both of your portions,
            and get re-tuned again when you log it.
          </Hint>

          {group.method ? (
            <>
              <Eyebrow className="mt-3 mb-1">Method</Eyebrow>
              <p className="text-caption whitespace-pre-line text-fg-muted">{group.method}</p>
            </>
          ) : null}

          <Link
            href={`/meals/${menu.id}/recipe/${group.recipeId}`}
            className="mt-3 inline-block text-caption"
          >
            Full recipe, timings and both portions →
          </Link>
        </div>
      ) : null}

      {/* ── Row actions ───────────────────────────────────────────────── */}
      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        {!isDraft ? (
          <Button
            size="sm"
            variant={allCooked ? "ghost" : "accent"}
            disabled={isPending}
            onClick={() => run(() => (allCooked ? uncookOneOfGroup(target) : cookOneOfGroup(target)))}
          >
            {allCooked
              ? "Undo cooked"
              : group.cookCount > 1
                ? `Cooked one (${group.cookedCount}/${group.cookCount})`
                : "Cooked it"}
          </Button>
        ) : (
          <>
            <Button
              size="sm"
              variant={group.isLocked ? "primary" : "secondary"}
              disabled={isPending}
              onClick={() => run(() => toggleCookGroupLock(target))}
            >
              {group.isLocked ? "Locked" : "Lock"}
            </Button>
            <Select
              aria-label={`Swap ${group.name}`}
              value=""
              disabled={isPending}
              className="h-(--control-h-sm) w-auto flex-1 text-caption"
              onChange={(e) => {
                if (!e.target.value) return;
                run(() => swapCookGroup({ ...target, replacementId: e.target.value }));
              }}
            >
              <option value="">Swap for…</option>
              {alternatives
                .filter((a) => a.mealType === group.mealType && a.id !== group.recipeId)
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
            </Select>
          </>
        )}

        {/* Dropping one of several is a different intent from dropping the dish,
            so both are offered rather than one being guessed at. */}
        {many ? (
          <button
            type="button"
            disabled={isPending}
            onClick={() => run(() => deleteOneOfGroup(target))}
            className="text-caption text-fg-muted underline-offset-2 transition-colors hover:text-fg-strong hover:underline disabled:opacity-40"
          >
            Remove one
          </button>
        ) : null}

        {confirmingRemove ? (
          <span className="ml-auto flex items-center gap-2">
            <span className="text-caption text-danger">Remove all {group.servingsForMe}?</span>
            <Button
              size="sm"
              variant="danger"
              disabled={isPending}
              onClick={() => {
                setConfirmingRemove(false);
                run(() => deleteCookGroup(target));
              }}
            >
              Yes
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirmingRemove(false)}>
              No
            </Button>
          </span>
        ) : (
          <button
            type="button"
            aria-label={`Remove ${group.name} from this plan`}
            title={many ? `Remove all ${group.servingsForMe}` : "Remove from this plan"}
            disabled={isPending}
            onClick={() => (many ? setConfirmingRemove(true) : run(() => deleteCookGroup(target)))}
            className="ml-auto h-7 w-7 shrink-0 rounded-pill border border-hairline text-fg-faint transition-colors hover:border-tint-danger-border hover:bg-tint-danger hover:text-danger disabled:opacity-40"
          >
            ✕
          </button>
        )}
      </div>
    </li>
  );
}

function Figure({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-md border border-hairline bg-sunken px-3 py-2.5">
      <p className="text-micro font-medium tracking-caps text-fg-muted uppercase">{label}</p>
      <p className="mt-1 font-mono text-h3 leading-none tabular-nums text-fg-strong">{value}</p>
      {sub ? <p className="mt-1 font-mono text-micro text-fg-faint">{sub}</p> : null}
    </div>
  );
}
