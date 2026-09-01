import Link from "next/link";
import { todayKey } from "@/lib/day";
import {
  countMealLibrary,
  getCurrentMenu,
  getMenuList,
  getMenuScreen,
  getPantryScreen,
  getPool,
} from "@/lib/meal-queries";
import { PlanSwitcher } from "./plan-switcher";
import { formatGrams } from "@/lib/meal/packs";
import {
  Badge,
  Card,
  CardLink,
  Eyebrow,
  EmptyState,
  LinkButton,
  PageHeader,
  SectionHeader,
  Tag,
} from "@/components/ui";

export const dynamic = "force-dynamic";

/// The meals hub.
///
/// Notice what is not here: a week grid. Cooking in this house is shared and
/// irregular, so a menu is a set of cooks and a pool of servings, and nothing is
/// pinned to a day. Eating out costs the plan nothing — the serving simply keeps.

export default async function MealsPage() {
  const today = todayKey();
  const [menuRef, pool, pantry, counts, plans] = await Promise.all([
    getCurrentMenu(),
    getPool(today),
    getPantryScreen(today),
    countMealLibrary(),
    getMenuList(),
  ]);

  const menu = menuRef ? await getMenuScreen(menuRef.id) : null;
  const expiring = pantry.filter((p) => p.isExpiringSoon || p.isExpired);
  const cooked = pool.filter((p) => p.isCooked);
  const toCook = pool.filter((p) => !p.isCooked);

  return (
    <main>
      <PageHeader
        title="Meals"
        display
        subtitle="A shop and a set of cooks. When you eat them is up to you."
        action={
          <LinkButton href="/meals/plan" variant="accent" size="sm" className="shrink-0">
            Plan a week
          </LinkButton>
        }
      />

      <div className="space-y-6 px-4">
        {menu ? (
          <Card>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <Eyebrow>{menu.name}</Eyebrow>
                <p className="mt-1 text-body-md font-medium text-fg-strong">
                  {menu.cooks.length} {menu.cooks.length === 1 ? "cook" : "cooks"} ·{" "}
                  {menu.cooks.reduce((n, c) => n + c.servingsForMe, 0)} of my servings
                </p>
              </div>
              <Badge tone={menu.status === "shopped" ? "success" : "accent"}>
                {menu.status === "draft" ? "Not confirmed" : menu.status}
              </Badge>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <Figure label="Shop" value={`£${menu.estimatedCostGbp.toFixed(2)}`} />
              <Figure
                label="Projected waste"
                value={`£${menu.projectedWasteGbp.toFixed(2)}`}
                sub={
                  menu.estimatedCostGbp > 0
                    ? `${((menu.projectedWasteGbp / menu.estimatedCostGbp) * 100).toFixed(1)}%`
                    : undefined
                }
              />
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2">
              <Link
                href={`/meals/${menu.id}`}
                className="rounded-pill border border-line bg-card py-2.5 text-center text-body-sm text-fg-strong no-underline transition-colors hover:bg-sunken hover:no-underline"
              >
                {menu.status === "draft" ? "Review menu" : "The menu"}
              </Link>
              <Link
                href={`/meals/${menu.id}/shopping`}
                className="rounded-pill border border-line bg-card py-2.5 text-center text-body-sm text-fg-strong no-underline transition-colors hover:bg-sunken hover:no-underline"
              >
                Shopping list
              </Link>
            </div>
          </Card>
        ) : (
          <EmptyState title="No menu yet">
            <p>
              Plan a week and the optimiser will pick recipes that share ingredients, so the
              shop buys whole packs instead of half of everything.
            </p>
            <div className="mt-4">
              <LinkButton href="/meals/plan" variant="accent">
                Plan a week
              </LinkButton>
            </div>
          </EmptyState>
        )}

        {/* ── The pool ──────────────────────────────────────────────────── */}
        {pool.length > 0 ? (
          <section>
            <SectionHeader
              title={`Servings in the pool (${pool.length})`}
              action={
                <Link href="/food" className="text-caption">
                  Eat one →
                </Link>
              }
            />
            <ul className="divide-y divide-hairline overflow-hidden rounded-lg border border-hairline bg-card">
              {cooked.map((portion) => (
                <PoolRow key={portion.id} portion={portion} />
              ))}
              {toCook.map((portion) => (
                <PoolRow key={portion.id} portion={portion} />
              ))}
            </ul>
            <p className="mt-2 text-caption text-fg-muted">
              Nothing here is tied to a day. Eat out tonight and these keep — the only cost is
              whatever runs out of shelf life, which is what the planner was minimising.
            </p>
          </section>
        ) : null}

        {/* ── Pantry warnings ───────────────────────────────────────────── */}
        {expiring.length > 0 ? (
          <section>
            <SectionHeader
              title="Using up"
              action={
                <Link href="/meals/pantry" className="text-caption">
                  Pantry ({pantry.length})
                </Link>
              }
            />
            <ul className="divide-y divide-hairline overflow-hidden rounded-lg border border-hairline bg-card">
              {expiring.slice(0, 6).map((item) => (
                <li key={item.id} className="flex items-center gap-3 px-4 py-3">
                  <span className="min-w-0 flex-1 truncate text-body-sm text-fg-strong">
                    {item.name}
                  </span>
                  <span className="font-mono text-micro text-fg-faint">
                    {formatGrams(item.grams)}
                  </span>
                  <Badge tone={item.isExpired ? "danger" : "warning"}>
                    {item.isExpired
                      ? "expired"
                      : item.daysLeft === 0
                        ? "today"
                        : `${item.daysLeft}d`}
                  </Badge>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-caption text-fg-muted">
              Next week&rsquo;s plan already knows about these and will reach for them first.
            </p>
          </section>
        ) : null}

        <PlanSwitcher plans={plans} />

        {/* ── Library ───────────────────────────────────────────────────── */}
        <section className="pb-4">
          <SectionHeader title="Library" />
          <div className="grid gap-2">
            <CardLink href="/meals/recipes" className="p-4">
              <div className="flex items-center justify-between gap-3">
                <span className="text-body-sm font-medium text-fg-strong">Recipes</span>
                <Tag>{counts.recipes}</Tag>
              </div>
              <p className="mt-1 text-caption text-fg-muted">
                What the planner picks from first. Generated recipes are saved here, so the
                model gets asked less every week.
              </p>
            </CardLink>
            <CardLink href="/meals/pantry" className="p-4">
              <div className="flex items-center justify-between gap-3">
                <span className="text-body-sm font-medium text-fg-strong">Pantry</span>
                <Tag>{counts.pantry}</Tag>
              </div>
              <p className="mt-1 text-caption text-fg-muted">
                Leftover stock with expiry dates. This is what makes week three cheaper than
                week one.
              </p>
            </CardLink>
            <CardLink href="/meals/household" className="p-4">
              <div className="flex items-center justify-between gap-3">
                <span className="text-body-sm font-medium text-fg-strong">Household</span>
                <Tag>2 eating</Tag>
              </div>
              <p className="mt-1 text-caption text-fg-muted">
                Her daily calories, and how a day divides across meals. Both size the shop; only
                your own servings are logged.
              </p>
            </CardLink>
          </div>
        </section>
      </div>
    </main>
  );
}

function Figure({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-md border border-hairline bg-sunken px-3 py-2.5">
      <p className="text-micro font-medium tracking-caps text-fg-muted uppercase">{label}</p>
      <p className="mt-1 font-mono text-body-md tabular-nums text-fg-strong">{value}</p>
      {sub ? <p className="font-mono text-micro text-fg-faint">{sub}</p> : null}
    </div>
  );
}

function PoolRow({
  portion,
}: {
  portion: Awaited<ReturnType<typeof getPool>>[number];
}) {
  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="truncate text-body-sm text-fg-strong">{portion.recipeName}</p>
        <p className="font-mono text-micro tracking-wide text-fg-faint">
          {portion.calories} KCAL · {portion.proteinG.toFixed(0)}P
          {portion.isCooked ? "" : ` · ~${portion.prepMinutes} MIN TO COOK`}
        </p>
      </div>
      {portion.isCooked ? (
        <Badge tone={portion.daysLeft != null && portion.daysLeft <= 1 ? "warning" : "neutral"}>
          {portion.daysLeft == null
            ? "cooked"
            : portion.daysLeft < 0
              ? "past it"
              : portion.daysLeft === 0
                ? "eat today"
                : `${portion.daysLeft}d left`}
        </Badge>
      ) : (
        <Tag>to cook</Tag>
      )}
    </li>
  );
}
