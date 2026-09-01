import Link from "next/link";
import { startSession } from "@/lib/actions";
import { logSavedFood } from "@/lib/nutrition-actions";
import { getHomeData } from "@/lib/queries";
import { getDayScreen } from "@/lib/nutrition-queries";
import { formatDayKey, todayKey } from "@/lib/day";
import { relativeDay } from "@/lib/relative-day";
import {
  Badge,
  Card,
  Eyebrow,
  LinkButton,
  Meter,
  SectionHeader,
  SubmitButton,
  Tag,
  cx,
} from "@/components/ui";
import { ThemeToggle } from "@/components/theme-toggle";

export const dynamic = "force-dynamic";

/// The dashboard. Two questions get answered above the fold — how am I doing on
/// food today, and what am I lifting next — and both answers are actionable
/// without leaving the screen. Everything else is one tap away.

export default async function HomePage() {
  const dayKey = todayKey();
  const [home, day] = await Promise.all([getHomeData(), getDayScreen(dayKey)]);

  const session = home.inProgress;
  const next = home.next;
  const lastEntries = day.entries.slice(-3).reverse();

  return (
    <main>
      <header className="flex items-start justify-between gap-4 px-4 pt-8 pb-6">
        <div className="min-w-0">
          <Eyebrow>{formatDayKey(dayKey)}</Eyebrow>
          <h1 className="mt-1.5 font-serif-display text-h1 font-normal tracking-display text-fg-strong">
            Today
          </h1>
        </div>
        <ThemeToggle />
      </header>

      {/* ── Food ─────────────────────────────────────────────────────────
          First, because it is the thing that changes several times a day. */}
      <section className="px-4 pb-7">
        <SectionHeader
          title="Food"
          action={
            <Link href="/food" className="text-caption">
              Open the log
            </Link>
          }
        />

        <Card>
          <div className="flex items-center justify-between gap-3">
            <Badge tone={day.dayType === "golf" ? "accent" : "neutral"}>
              {day.dayType === "golf" ? "Golf day" : "Base day"}
            </Badge>
            <span className="font-mono text-micro tracking-wide text-fg-faint">
              {day.entries.length} ENTR{day.entries.length === 1 ? "Y" : "IES"}
            </span>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-5">
            {/* Protein first: the harder target, and the one that matters most
                while cutting (spec §5.4). */}
            <Meter label="Protein" unit="g" overIsGood prominent {...day.protein} />
            <Meter label="Calories" prominent {...day.calories} />
          </div>

          <p className="mt-5 font-mono text-micro tracking-wide text-fg-faint">
            CARBS {Math.round(day.totals.carbsG)}G · FAT {Math.round(day.totals.fatG)}G
          </p>

          {lastEntries.length > 0 ? (
            <ul className="mt-4 space-y-1.5 border-t border-hairline pt-4 text-body-sm">
              {lastEntries.map((entry) => (
                <li key={entry.id} className="flex justify-between gap-4">
                  <span className="truncate text-fg">{entry.description}</span>
                  <span className="shrink-0 font-mono text-micro tracking-wide text-fg-faint">
                    {entry.calories} · {entry.proteinG.toFixed(0)}P
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 border-t border-hairline pt-4 text-body-sm text-fg-muted">
              Nothing logged yet today.
            </p>
          )}

          <LinkButton href="/food" variant="accent" size="lg" fullWidth className="mt-5">
            Log something
          </LinkButton>
        </Card>

        {/* One tap, straight from the home screen — the fastest path there is
            for the foods you eat every day. */}
        {day.quickAdd.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {day.quickAdd.slice(0, 5).map((food) => (
              <form
                key={food.id}
                action={async () => {
                  "use server";
                  await logSavedFood({ dayKey, savedFoodId: food.id });
                }}
              >
                <SubmitButton variant="secondary" size="sm">
                  <span aria-hidden className="text-fg-faint">
                    +
                  </span>
                  <span className="max-w-[9rem] truncate">{food.name}</span>
                  <span className="font-mono text-micro text-fg-faint">{food.calories}</span>
                </SubmitButton>
              </form>
            ))}
          </div>
        ) : null}
      </section>

      {/* ── Training ─────────────────────────────────────────────────────── */}
      <section className="px-4 pb-7">
        <SectionHeader
          title="Training"
          action={
            <Link href="/train" className="text-caption">
              All training
            </Link>
          }
        />

        {session ? (
          <Card tone="accent">
            <Badge tone="accent" dot>
              In progress
            </Badge>
            <p className="mt-3 text-h3 font-medium text-fg-strong">
              {session.group?.name ?? "Freestyle session"}
            </p>
            <p className="mt-0.5 text-body-sm text-fg-muted">
              {session._count.sets} set{session._count.sets === 1 ? "" : "s"} logged
            </p>
            <LinkButton
              href={`/train/${session.id}`}
              variant="accent"
              size="lg"
              fullWidth
              className="mt-4"
            >
              Resume session
            </LinkButton>
          </Card>
        ) : next ? (
          <Card>
            <div className="flex items-baseline justify-between gap-3">
              <Eyebrow>Next up</Eyebrow>
              {home.lastCompletedAt ? (
                <p className="text-caption text-fg-faint">
                  last session {relativeDay(home.lastCompletedAt)}
                </p>
              ) : null}
            </div>

            <p className="mt-1 font-serif-display text-[2.5rem] leading-tight tracking-display text-fg-strong">
              {next.group.name}
            </p>

            {next.group.items.length > 0 ? (
              <>
                <p className="mt-1 font-mono text-micro tracking-wide text-fg-faint">
                  {next.group.items.length} EXERCISES ·{" "}
                  {next.group.items.reduce((sum, i) => sum + i.targetSets, 0)} SETS
                </p>
                <ul className="mt-4 space-y-1.5 text-body-sm">
                  {next.group.items.map((item) => (
                    <li key={item.id} className="flex justify-between gap-4">
                      <span className="truncate text-fg">{item.exercise.name}</span>
                      <span className="shrink-0 font-mono text-micro tracking-wide text-fg-faint">
                        {item.targetSets} × {item.targetRepMin}–{item.targetRepMax}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="mt-3 text-body-sm text-fg-muted italic">
                No exercises yet —{" "}
                <Link href={`/groups/${next.exerciseGroupId}`}>add some</Link>.
              </p>
            )}

            <form
              action={async () => {
                "use server";
                await startSession({ cycleSlotId: next.id });
              }}
            >
              <SubmitButton variant="accent" size="lg" fullWidth className="mt-5">
                Start {next.group.name}
              </SubmitButton>
            </form>

            {home.upcoming.length > 1 ? (
              <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-hairline pt-4">
                <span className="text-micro font-medium tracking-caps text-fg-muted uppercase">
                  Then
                </span>
                {home.upcoming.slice(1, 4).map((slot) => (
                  <Tag key={slot.id}>{slot.group.name}</Tag>
                ))}
              </div>
            ) : null}
          </Card>
        ) : (
          <Card>
            <p className="font-medium text-fg-strong">No rotation yet</p>
            <p className="mt-1.5 text-body-sm text-fg-muted">
              {home.cycle
                ? `${home.cycle.name} has no exercise groups in it yet.`
                : "Build a group of exercises, then order your groups into a cycle."}
            </p>
            <LinkButton
              href={home.cycle ? `/cycles/${home.cycle.id}` : "/groups"}
              variant="secondary"
              fullWidth
              className="mt-4"
            >
              {home.cycle ? "Add groups to the cycle" : "Set up your training"}
            </LinkButton>
          </Card>
        )}
      </section>

      {/* ── At a glance ──────────────────────────────────────────────────── */}
      <section className="px-4">
        <SectionHeader title="Jump to" />
        <div className="grid grid-cols-2 gap-2">
          {[
            { href: "/food/library", label: "Food library" },
            { href: "/food/goals", label: "Goals" },
            { href: "/history", label: "Session history" },
            { href: "/groups", label: "Exercise groups" },
          ].map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={cx(
                "rounded-lg border border-hairline bg-card px-4 py-3 text-body-sm text-fg-strong no-underline shadow-xs",
                "transition-[transform,box-shadow,border-color] duration-(--dur-base) ease-(--ease-out)",
                "hover:-translate-y-0.5 hover:border-line hover:no-underline hover:shadow-md",
              )}
            >
              {link.label}
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
