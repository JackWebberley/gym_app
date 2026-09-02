import type { ReactNode } from "react";
import { byMuscleGroup, LOW_WEEKLY_SETS, type MuscleGroup, type MuscleStatus, type RecoveryState } from "@/lib/recovery";
import { Badge, Card, Eyebrow, cx } from "@/components/ui";

/// What is sore and what is ready, drawn on a body.
///
/// Deliberately schematic rather than an anatomy chart: rounded blocks in
/// roughly the right places read instantly on a phone and, more honestly, do not
/// dress up a 48-hour rule of thumb as physiology. Three colours carry the
/// glance — leave it alone, nearly there, go — and the list underneath carries
/// the detail, because "recovered" and "you have trained it three times this
/// month" are different questions and the diagram can only answer one.
///
/// Every region is an anchor into that list, so tapping a muscle jumps to its
/// numbers with no JavaScript involved.

const STATE_STYLE: Record<RecoveryState, { fill: string; opacity: string; stroke: string; dash?: string }> = {
  worked: { fill: "var(--status-danger)", opacity: "0.85", stroke: "var(--border-hairline)" },
  recovering: { fill: "var(--status-warning)", opacity: "0.8", stroke: "var(--border-hairline)" },
  ready: { fill: "var(--surface-accent)", opacity: "0.9", stroke: "var(--border-hairline)" },
  untrained: { fill: "var(--surface-sunken)", opacity: "1", stroke: "var(--border-default)", dash: "2 2" },
};

const STATE_LABEL: Record<RecoveryState, string> = {
  worked: "Resting",
  recovering: "Recovering",
  ready: "Ready",
  untrained: "Not logged",
};

const STATE_BADGE: Record<RecoveryState, "danger" | "warning" | "success" | "neutral"> = {
  worked: "danger",
  recovering: "warning",
  ready: "success",
  untrained: "neutral",
};

/** "5h ago", "3 days ago" — hours while it still matters, days once it does not. */
function sinceLabel(status: MuscleStatus): string {
  if (status.hoursSince == null) return "nothing logged";
  if (status.hoursSince < 1) return "just now";
  if (status.hoursSince < 24) return `${Math.round(status.hoursSince)}h ago`;
  const days = Math.round(status.hoursSince / 24);
  return days === 1 ? "yesterday" : `${days} days ago`;
}

function describe(status: MuscleStatus): string {
  if (status.state === "untrained") return `${status.label} — nothing logged`;
  return `${status.label} — ${STATE_LABEL[status.state].toLowerCase()}, trained ${sinceLabel(status)}, ${status.setsThisWeek} sets this week`;
}

function Muscle({ status, children }: { status: MuscleStatus; children: ReactNode }) {
  const style = STATE_STYLE[status.state];
  return (
    <a href={`#muscle-${status.muscleGroup}`} aria-label={describe(status)}>
      <g
        fill={style.fill}
        fillOpacity={style.opacity}
        stroke={style.stroke}
        strokeWidth="0.8"
        strokeDasharray={style.dash}
      >
        <title>{describe(status)}</title>
        {children}
      </g>
    </a>
  );
}

/** Head, neck, hips and joints: not muscles, but without them it is not a body. */
function Frame({ hips }: { hips: boolean }) {
  return (
    <g fill="var(--surface-sunken)" stroke="var(--border-hairline)" strokeWidth="0.8">
      <circle cx="55" cy="17" r="11" />
      <rect x="50.5" y="26" width="9" height="9" rx="2" />
      {hips ? <rect x="41" y="91" width="28" height="12" rx="5" /> : null}
      <circle cx="47" cy="144" r="5.5" />
      <circle cx="63" cy="144" r="5.5" />
      <rect x="40.5" y="185" width="13" height="6" rx="2" />
      <rect x="56.5" y="185" width="13" height="6" rx="2" />
    </g>
  );
}

function FrontView({ groups }: { groups: Record<MuscleGroup, MuscleStatus> }) {
  return (
    <svg viewBox="0 0 110 196" width="100%" role="img" aria-label="Front of the body">
      <Frame hips />
      <Muscle status={groups.delts}>
        <ellipse cx="33" cy="44" rx="11" ry="8.5" />
        <ellipse cx="77" cy="44" rx="11" ry="8.5" />
      </Muscle>
      <Muscle status={groups.chest}>
        <rect x="39" y="38" width="15.5" height="19" rx="5" />
        <rect x="55.5" y="38" width="15.5" height="19" rx="5" />
      </Muscle>
      <Muscle status={groups.biceps}>
        <rect x="27" y="52" width="12" height="26" rx="6" />
        <rect x="71" y="52" width="12" height="26" rx="6" />
      </Muscle>
      <Muscle status={groups.core}>
        <rect x="43" y="59" width="24" height="31" rx="5" />
      </Muscle>
      <Muscle status={groups.forearms}>
        <rect x="27.5" y="80" width="11" height="27" rx="5.5" />
        <rect x="71.5" y="80" width="11" height="27" rx="5.5" />
      </Muscle>
      <Muscle status={groups.quads}>
        <rect x="40" y="104" width="14" height="37" rx="7" />
        <rect x="56" y="104" width="14" height="37" rx="7" />
      </Muscle>
      <Muscle status={groups.calves}>
        <rect x="40.5" y="148" width="13" height="36" rx="6.5" />
        <rect x="56.5" y="148" width="13" height="36" rx="6.5" />
      </Muscle>
    </svg>
  );
}

function BackView({ groups }: { groups: Record<MuscleGroup, MuscleStatus> }) {
  return (
    <svg viewBox="0 0 110 196" width="100%" role="img" aria-label="Back of the body">
      <Frame hips={false} />
      <Muscle status={groups.delts}>
        <ellipse cx="33" cy="44" rx="11" ry="8.5" />
        <ellipse cx="77" cy="44" rx="11" ry="8.5" />
      </Muscle>
      {/* One region for the whole back, because the exercise library has one
          "back" group — splitting lats from traps on the diagram would promise a
          distinction the data cannot make. */}
      <Muscle status={groups.back}>
        <rect x="39" y="37" width="32" height="47" rx="8" />
      </Muscle>
      <Muscle status={groups.triceps}>
        <rect x="27" y="52" width="12" height="26" rx="6" />
        <rect x="71" y="52" width="12" height="26" rx="6" />
      </Muscle>
      <Muscle status={groups.forearms}>
        <rect x="27.5" y="80" width="11" height="27" rx="5.5" />
        <rect x="71.5" y="80" width="11" height="27" rx="5.5" />
      </Muscle>
      <Muscle status={groups.glutes}>
        <rect x="40" y="86" width="30" height="21" rx="9" />
      </Muscle>
      <Muscle status={groups.hamstrings}>
        <rect x="40" y="109" width="14" height="33" rx="7" />
        <rect x="56" y="109" width="14" height="33" rx="7" />
      </Muscle>
      <Muscle status={groups.calves}>
        <rect x="40.5" y="148" width="13" height="36" rx="6.5" />
        <rect x="56.5" y="148" width="13" height="36" rx="6.5" />
      </Muscle>
    </svg>
  );
}

export function BodyMap({ recovery }: { recovery: MuscleStatus[] }) {
  const groups = byMuscleGroup(recovery);

  return (
    <Card className="px-3 py-5">
      <div className="flex items-start justify-center gap-2">
        <div className="min-w-0 flex-1">
          <FrontView groups={groups} />
          <p className="mt-1 text-center text-micro tracking-caps text-fg-faint uppercase">Front</p>
        </div>
        <div className="min-w-0 flex-1">
          <BackView groups={groups} />
          <p className="mt-1 text-center text-micro tracking-caps text-fg-faint uppercase">Back</p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap justify-center gap-x-4 gap-y-1.5 border-t border-hairline pt-4">
        {(["worked", "recovering", "ready", "untrained"] as const).map((state) => (
          <span
            key={state}
            className="inline-flex items-center gap-1.5 text-micro tracking-wide text-fg-muted"
          >
            <span
              aria-hidden
              className="h-2.5 w-2.5 rounded-sm border"
              style={{
                background: STATE_STYLE[state].fill,
                opacity: STATE_STYLE[state].opacity,
                borderColor: STATE_STYLE[state].stroke,
                borderStyle: STATE_STYLE[state].dash ? "dashed" : "solid",
              }}
            />
            {STATE_LABEL[state]}
          </span>
        ))}
      </div>
    </Card>
  );
}

/** The numbers behind the colours, and the anchor targets the diagram links to. */
export function MuscleList({ recovery }: { recovery: MuscleStatus[] }) {
  return (
    <div className="overflow-hidden rounded-lg border border-hairline">
      {recovery.map((status, i) => (
        <div
          key={status.muscleGroup}
          id={`muscle-${status.muscleGroup}`}
          className={cx(
            "flex items-center justify-between gap-3 bg-card px-4 py-3 scroll-mt-4",
            i > 0 && "border-t border-hairline",
          )}
        >
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-body-sm font-medium text-fg-strong">{status.label}</p>
              {status.isOverdue ? <Badge tone="accent">due</Badge> : null}
            </div>
            <p className="mt-0.5 font-mono text-micro tracking-wide text-fg-faint">
              {sinceLabel(status).toUpperCase()}
              {status.state === "untrained" ? null : ` · ${status.setsLastSession} SETS THAT SESSION`}
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-2.5">
            <span
              className={cx(
                "font-mono text-caption tabular-nums",
                status.isLowVolume ? "text-warning" : "text-fg",
              )}
              title={`${status.setsThisWeek} working sets in the last 7 days`}
            >
              {status.setsThisWeek}
              <span className="text-fg-faint">/wk</span>
            </span>
            <Badge tone={STATE_BADGE[status.state]}>{STATE_LABEL[status.state]}</Badge>
          </div>
        </div>
      ))}
      <div className="border-t border-hairline bg-sunken px-4 py-2.5">
        <Eyebrow>
          Sets per week counts working sets only. Amber marks fewer than {LOW_WEEKLY_SETS}.
        </Eyebrow>
      </div>
    </div>
  );
}
