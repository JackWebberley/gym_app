import type { ActivityCard } from "@/lib/strava-queries";
import { Badge, Card, Tag, cx } from "@/components/ui";

/// One imported activity, in the shape both the settings screen and the popup
/// use. Shows what Strava recorded, then what the app did with it — including
/// the times it did nothing, which is the interesting case.

const KIND_LABEL: Record<string, string> = {
  gym: "Gym",
  golf: "Golf",
  run: "Run",
  walk: "Walk",
};

const BAND_LABEL: Record<string, string> = {
  short: "short",
  medium: "medium",
  long: "long",
};

export function ActivityRow({ activity, showDay }: { activity: ActivityCard; showDay?: boolean }) {
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-body-sm font-medium text-fg-strong">{activity.name}</p>
          <p className="mt-0.5 font-mono text-micro tracking-wide text-fg-faint uppercase">
            {activity.sportType.replace(/([a-z])([A-Z])/g, "$1 $2")}
            {showDay ? ` · ${activity.dateLabel}` : ""}
            {` · ${activity.timeLabel}`}
          </p>
        </div>
        {activity.mappedKind ? (
          // The day’s band, not this activity’s own: what counted is what the
          // whole day added up to, and two short walks make a medium day.
          <Badge tone="accent">
            {KIND_LABEL[activity.mappedKind] ?? activity.mappedKind}
            {activity.dayBand ?? activity.mappedBand
              ? ` · ${BAND_LABEL[activity.dayBand ?? activity.mappedBand!] ?? ""}`
              : ""}
          </Badge>
        ) : (
          <Badge tone="neutral">No allowance</Badge>
        )}
      </div>

      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {activity.distance ? <Tag>{activity.distance}</Tag> : null}
        <Tag>{activity.duration}</Tag>
        {activity.pace ? <Tag>{activity.pace}</Tag> : null}
        {activity.elevationM != null && activity.elevationM > 0 ? (
          <Tag>{Math.round(activity.elevationM)} m up</Tag>
        ) : null}
        {activity.averageHeartRate ? <Tag>{Math.round(activity.averageHeartRate)} bpm</Tag> : null}
        {activity.stravaCalories ? <Tag>{Math.round(activity.stravaCalories)} kcal (Strava)</Tag> : null}
      </div>

      <p
        className={cx(
          "mt-3 border-t border-hairline pt-2.5 text-caption",
          activity.mappedKind ? "text-fg" : "text-fg-muted",
        )}
      >
        {activity.mappedKind && activity.allowanceKcal != null ? (
          <>
            {activity.sameKindCount > 1 ? (
              <>
                Combined with {activity.sameKindCount - 1} other{" "}
                {KIND_LABEL[activity.mappedKind]?.toLowerCase() ?? activity.mappedKind}
                {activity.sameKindCount > 2 ? "s" : ""} that day
                {activity.sameKindDistance ? ` — ${activity.sameKindDistance} in total` : ""}.
                The day’s allowance is{" "}
              </>
            ) : (
              <>Added </>
            )}
            <span className="font-mono text-fg-strong">
              +{activity.allowanceKcal.toLocaleString("en-GB")}
            </span>{" "}
            kcal. Target for that day is now{" "}
            <span className="font-mono text-fg-strong">
              {activity.dayTarget.toLocaleString("en-GB")}
            </span>
            {activity.dayCapped ? ", held there by the cap" : ""}.
          </>
        ) : activity.mappedKind ? (
          <>
            Ticked {KIND_LABEL[activity.mappedKind] ?? activity.mappedKind}, but the day’s target is
            unchanged at{" "}
            <span className="font-mono text-fg-strong">
              {activity.dayTarget.toLocaleString("en-GB")}
            </span>
            {activity.dayCapped ? " — the cap is holding it down" : ""}.
          </>
        ) : (
          <>
            {activity.noAllowanceReason}, so your target is unchanged at{" "}
            <span className="font-mono text-fg-strong">
              {activity.dayTarget.toLocaleString("en-GB")}
            </span>
            .
          </>
        )}
      </p>
    </Card>
  );
}
