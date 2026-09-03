import Link from "next/link";
import { db } from "@/lib/db";
import { getGoals } from "@/lib/nutrition-queries";
import { getWeightSummary } from "@/lib/track-queries";
import { Card, Eyebrow, PageHeader, SectionHeader } from "@/components/ui";
import { ThemeToggle } from "@/components/theme-toggle";

export const dynamic = "force-dynamic";

/// Everything that is not part of the daily loop. These screens used to sit in the
/// tab bar beside Food and Train despite being touched roughly once a month; they
/// are grouped here by what they are for, each with the number that tells you
/// whether it needs your attention.

function Row({
  href,
  label,
  description,
  meta,
}: {
  href: string;
  label: string;
  description: string;
  meta?: string;
}) {
  return (
    <li>
      <Link
        href={href}
        className="flex items-center gap-3 px-4 py-3.5 no-underline transition-colors duration-(--dur-fast) hover:bg-sunken hover:no-underline"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-body-sm font-medium text-fg-strong">{label}</span>
          <span className="mt-0.5 block truncate text-caption text-fg-muted">{description}</span>
        </span>
        {meta ? (
          <span className="shrink-0 font-mono text-micro tracking-wide text-fg-faint">{meta}</span>
        ) : null}
        <span aria-hidden className="shrink-0 text-fg-faint">
          ›
        </span>
      </Link>
    </li>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="px-4 pb-6">
      <SectionHeader title={title} />
      <ul className="divide-y divide-hairline overflow-hidden rounded-lg border border-hairline bg-card">
        {children}
      </ul>
    </section>
  );
}

export default async function MorePage() {
  const [groupCount, cycleCount, exerciseCount, sessionCount, savedFoodCount, goals, body, strava] =
    await Promise.all([
      db.exerciseGroup.count({ where: { isArchived: false } }),
      db.cycle.count(),
      db.exercise.count({ where: { isArchived: false } }),
      db.session.count({ where: { endedAt: { not: null } } }),
      db.savedFood.count(),
      getGoals(),
      getWeightSummary(),
      db.stravaAccount.findUnique({ where: { id: "singleton" }, select: { subscriptionId: true } }),
    ]);

  return (
    <main>
      <PageHeader title="More" display subtitle="Setup, library and history." />

      <Group title="Body">
        <Row
          href="/track"
          label="Tracking"
          description="Weigh-ins, the trend, and which muscles are still sore"
          meta={
            body.trend.averageKg == null
              ? "NOTHING YET"
              : `${body.trend.averageKg.toFixed(1)}KG${body.loggedToday ? "" : " · DUE"}`
          }
        />
        <Row
          href="/strava"
          label="Strava"
          description="Import workouts and tick the day automatically"
          meta={strava ? (strava.subscriptionId ? "LIVE" : "MANUAL") : "OFF"}
        />
      </Group>

      <Group title="Training">
        <Row
          href="/groups"
          label="Exercise groups"
          description="Named lists of exercises — Push, Legs, Upper A"
          meta={`${groupCount}`}
        />
        <Row
          href="/cycles"
          label="Cycles"
          description="The order your groups come round in"
          meta={`${cycleCount}`}
        />
        <Row
          href="/exercises"
          label="Exercise library"
          description="Setup notes and rest timers per movement"
          meta={`${exerciseCount}`}
        />
        <Row
          href="/history"
          label="Session history"
          description="Every completed workout, with volume"
          meta={`${sessionCount}`}
        />
      </Group>

      <Group title="Nutrition">
        <Row
          href="/food/goals"
          label="Goals"
          description="Calorie and protein targets, and the golf-day figure"
          meta={`${goals.baselineCalories} KCAL`}
        />
        <Row
          href="/food/library"
          label="Food library"
          description="Saved foods, corrected once and matched instantly"
          meta={`${savedFoodCount}`}
        />
      </Group>

      {/* Meals has its own tab, so its screens are not repeated here — More is
          the home for what the tab bar does not carry. */}

      <section className="px-4">
        <SectionHeader title="Appearance" />
        <Card className="flex items-center justify-between gap-4 py-4">
          <div className="min-w-0">
            <p className="text-body-sm font-medium text-fg-strong">Theme</p>
            <p className="mt-0.5 text-caption text-fg-muted">
              Follows your device until you pick one here.
            </p>
          </div>
          <ThemeToggle />
        </Card>
        <Eyebrow className="mt-6 text-center">Gym Tracker</Eyebrow>
      </section>
    </main>
  );
}
