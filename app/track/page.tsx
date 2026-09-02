import Link from "next/link";
import { getTrackScreen, RECOVERY_LOOKBACK_DAYS } from "@/lib/track-queries";
import { formatDayKey, todayKey } from "@/lib/day";
import { MAINTENANCE_WINDOW_DAYS, type Maintenance, type Trend } from "@/lib/body";
import { needsRest, readyToTrain, type MuscleStatus } from "@/lib/recovery";
import { relativeDay } from "@/lib/relative-day";
import { Badge, Card, Eyebrow, Hint, Note, PageHeader, SectionHeader } from "@/components/ui";
import { WeightForm } from "./weight-form";
import { WeightChart } from "./weight-chart";
import { BodyMap, MuscleList } from "./body-map";

export const dynamic = "force-dynamic";

/// Tracking: the two things the app was recording but never showing back.
///
/// Weight, because a food log with no bodyweight beside it cannot tell you
/// whether any of it is working — and once both exist, maintenance stops being a
/// formula and becomes a measurement (spec §6). And recovery, because the set
/// logs already know which muscle groups you hit and when; nothing was asking
/// them.

export default async function TrackPage() {
  const today = todayKey();
  const screen = await getTrackScreen(today);

  const resting = needsRest(screen.recovery);
  const ready = readyToTrain(screen.recovery).filter((s) => s.isOverdue || s.isLowVolume);

  return (
    <main>
      <PageHeader
        title="Tracking"
        display
        subtitle="What the scales say, and what is still sore."
      />

      {/* ── Where the weight is ───────────────────────────────────────────────
          The trailing average leads, never this morning's figure: one reading
          moves further overnight than a good week of dieting does (spec §6). */}
      <section className="px-4 pb-7">
        <SectionHeader
          title="Weight"
          action={
            screen.trend.samples > 0 ? (
              <span className="font-mono text-micro tracking-wide text-fg-faint">
                {screen.weighInsThisWeek}/7 THIS WEEK
              </span>
            ) : null
          }
        />

        <Card>
          <TrendHeadline trend={screen.trend} targetKg={screen.weeklyLossTargetKg} />

          {screen.stepsAverage != null ? (
            <p className="mt-4 border-t border-hairline pt-3 font-mono text-micro tracking-wide text-fg-faint">
              {screen.stepsAverage.toLocaleString("en-GB")} STEPS/DAY over{" "}
              {screen.stepsDays} day{screen.stepsDays === 1 ? "" : "s"}
            </p>
          ) : null}
        </Card>

        <div className="mt-3">
          <WeightForm
            dayKey={today}
            weightKg={screen.todayWeightKg}
            steps={screen.todaySteps}
            dayLabel={formatDayKey(today)}
          />
        </div>

        {screen.trend.samples > 0 ? (
          <Card className="mt-3">
            <WeightChart series={screen.series} />
          </Card>
        ) : null}
      </section>

      {/* ── Maintenance ──────────────────────────────────────────────────────
          Measured from your own intake and your own weight change, which beats
          every BMR formula and every watch estimate (spec §6). */}
      <section className="px-4 pb-7">
        <SectionHeader title="Maintenance" />
        <MaintenanceCard maintenance={screen.maintenance} />
      </section>

      {/* ── Recovery ─────────────────────────────────────────────────────────── */}
      <section id="recovery" className="scroll-mt-4 px-4 pb-10">
        <SectionHeader
          title="Recovery"
          action={
            screen.lastSessionAt ? (
              <Link href="/history" className="text-caption">
                Last session {relativeDay(screen.lastSessionAt)} →
              </Link>
            ) : null
          }
        />

        <RecoverySummary resting={resting} attention={ready} />

        <div className="mt-3">
          <BodyMap recovery={screen.recovery} />
        </div>

        <div className="mt-3">
          <MuscleList recovery={screen.recovery} />
        </div>

        <Hint>
          Recovery is 48 hours for a normal amount of direct work, stretching towards 72 after a
          big session. A rule of thumb to argue with, not a verdict. Anything untouched for longer
          than {RECOVERY_LOOKBACK_DAYS} days reads as not logged.
        </Hint>
      </section>
    </main>
  );
}

function TrendHeadline({ trend, targetKg }: { trend: Trend; targetKg: number }) {
  if (trend.averageKg == null) {
    return (
      <div>
        <Eyebrow>7-day average</Eyebrow>
        <p className="mt-1.5 text-body-sm text-fg-muted">
          Nothing logged yet. Weigh in a few mornings running and the trend starts here — the
          average is worth reading from about the fourth reading.
        </p>
      </div>
    );
  }

  const change = trend.weeklyChangeKg;
  const losing = change != null && change < 0;
  // Within 0.2kg/week of the target is the band the spec treats as on-plan; past
  // it for two weeks running is what would justify moving calories (spec §6).
  const onTarget = change != null && Math.abs(Math.abs(change) - targetKg) <= 0.2;

  return (
    <div>
      <Eyebrow>7-day average</Eyebrow>
      <div className="mt-1 flex items-end gap-3">
        <p className="font-mono text-h1 leading-none tracking-tight text-fg-strong tabular-nums">
          {trend.averageKg.toFixed(1)}
          <span className="text-body-md text-fg-faint">kg</span>
        </p>
        {change != null ? (
          <Badge tone={onTarget ? "success" : losing ? "accent" : "warning"}>
            {losing ? "↓" : "↑"} {Math.abs(change).toFixed(2)} kg/wk
          </Badge>
        ) : null}
      </div>

      <p className="mt-2.5 text-caption text-fg-muted">
        {change == null
          ? `From ${trend.samples} reading${trend.samples === 1 ? "" : "s"}. A week of them and this starts showing a direction.`
          : onTarget
            ? `On target — you are aiming to lose ${targetKg.toFixed(2)}kg a week.`
            : losing
              ? `Aiming for ${targetKg.toFixed(2)}kg a week. ${
                  Math.abs(change) > targetKg ? "Faster than planned." : "Slower than planned."
                }`
              : `Aiming to lose ${targetKg.toFixed(2)}kg a week, and the trend is up.`}
      </p>

      {trend.latestKg != null && trend.latestDate != null ? (
        <p className="mt-1 font-mono text-micro tracking-wide text-fg-faint">
          LAST READING {trend.latestKg.toFixed(1)}KG · {formatDayKey(trend.latestDate).toUpperCase()}
        </p>
      ) : null}
    </div>
  );
}

function MaintenanceCard({ maintenance }: { maintenance: Maintenance }) {
  if (maintenance.kind === "waiting") {
    const missing: string[] = [];
    if (maintenance.weighIns < maintenance.weighInsNeeded) {
      missing.push(`${maintenance.weighIns} of ${maintenance.weighInsNeeded} weigh-ins`);
    }
    if (maintenance.intakeDays < maintenance.intakeDaysNeeded) {
      missing.push(`${maintenance.intakeDays} of ${maintenance.intakeDaysNeeded} days of food logged`);
    }
    if (
      maintenance.spanDays < maintenance.spanDaysNeeded &&
      maintenance.weighIns >= maintenance.weighInsNeeded
    ) {
      missing.push(`${maintenance.spanDays} of ${maintenance.spanDaysNeeded} days between the first and last weigh-in`);
    }

    return (
      <Card tone="sunken">
        <Eyebrow>Not yet</Eyebrow>
        <p className="mt-2 text-body-sm text-fg">
          After three weeks of weighing in and logging food, this becomes your real maintenance
          figure — measured from your own data rather than guessed by a formula or a watch.
        </p>
        <p className="mt-2.5 font-mono text-micro tracking-wide text-fg-faint uppercase">
          {missing.length ? missing.join(" · ") : "Ready shortly"}
        </p>
        <Hint>
          Shown only once there is enough to be worth trusting: below {MAINTENANCE_WINDOW_DAYS} days
          the noise makes it worse than useless.
        </Hint>
      </Card>
    );
  }

  const { kcal, averageIntake, weeklyChangeKg, intakeDays, weighIns, spanDays } = maintenance;
  const deficit = kcal - averageIntake;

  return (
    <Card>
      <Eyebrow>Measured maintenance</Eyebrow>
      <p className="mt-1 font-mono text-h1 leading-none tracking-tight text-fg-strong tabular-nums">
        {kcal.toLocaleString("en-GB")}
        <span className="text-body-md text-fg-faint">kcal/day</span>
      </p>
      <p className="mt-2.5 text-caption text-fg-muted">
        You averaged{" "}
        <span className="font-mono text-fg-strong">{averageIntake.toLocaleString("en-GB")}</span> kcal
        a day and{" "}
        {Math.abs(weeklyChangeKg) < 0.05
          ? "held steady"
          : `${weeklyChangeKg < 0 ? "lost" : "gained"} ${Math.abs(weeklyChangeKg).toFixed(2)}kg a week`}
        , which puts maintenance{" "}
        {Math.abs(deficit) < 25
          ? "right about where you are eating"
          : `${Math.abs(deficit).toLocaleString("en-GB")} kcal ${deficit > 0 ? "above" : "below"} that`}
        .
      </p>
      <p className="mt-2 font-mono text-micro tracking-wide text-fg-faint uppercase">
        From {weighIns} weigh-ins over {spanDays} days · {intakeDays} days of food logged
      </p>
      <Hint>
        No BMR formula involved, and it sharpens every week you keep logging. Nothing here changes
        your goals on its own — that is still your call on the Goals screen.
      </Hint>
    </Card>
  );
}

function RecoverySummary({
  resting,
  attention,
}: {
  resting: MuscleStatus[];
  attention: MuscleStatus[];
}) {
  if (resting.length === 0 && attention.length === 0) {
    return (
      <Note>
        Nothing logged recently enough to need rest. Everything below is fair game.
      </Note>
    );
  }

  return (
    <div className="space-y-2">
      {resting.length > 0 ? (
        <Note>
          <span className="font-medium text-fg-strong">Leave alone:</span>{" "}
          {resting.map((s) => s.label.toLowerCase()).join(", ")}.
        </Note>
      ) : null}
      {attention.length > 0 ? (
        <Note>
          <span className="font-medium text-fg-strong">Due some work:</span>{" "}
          {attention
            .slice(0, 4)
            .map((s) => s.label.toLowerCase())
            .join(", ")}
          .
        </Note>
      ) : null}
    </div>
  );
}
