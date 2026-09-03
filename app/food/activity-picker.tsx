"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setDayActivities } from "@/lib/nutrition-actions";
import {
  bandLabel,
  describeActivities,
  DISTANCE_BANDS,
  targetFor,
  type ActivityConfig,
  type ActivityLog,
  type DistanceBand,
  type TargetPart,
} from "@/lib/activity";
import { Badge, Eyebrow, Note, cx } from "@/components/ui";

/// What you did today, and what it bought you.
///
/// Collapsed to a single line by default — most days are a tick or two and the
/// meters underneath are what you came to look at. Open it and the whole sum is
/// visible, because a target you cannot see the derivation of is a number you
/// end up not trusting.
///
/// Distances are bands rather than a number to type: standing in a kitchen you
/// know roughly how far you went, and picking one of three buttons is faster and
/// no less accurate than inventing 6.4. When Strava lands it will tick the same
/// buttons from a real distance.

export function ActivityPicker({
  dayKey,
  activities,
  config,
  storedParts,
  storedTarget,
}: {
  dayKey: string;
  activities: ActivityLog;
  config: ActivityConfig;
  /** The sum as snapshotted on the day, which may predate the current settings. */
  storedParts: TargetPart[];
  storedTarget: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  // Optimistic: ticking should feel instant, and the server is only confirming.
  const [local, setLocal] = useState(activities);

  function apply(next: ActivityLog) {
    setLocal(next);
    setError(null);
    startTransition(async () => {
      try {
        await setDayActivities(dayKey, next);
        router.refresh();
      } catch (e) {
        setLocal(activities);
        setError(e instanceof Error ? e.message : "Could not save that.");
      }
    });
  }

  const live = targetFor(local, config);
  // What the day is worth is what is stored on it; the live sum is only allowed
  // to explain that total when it reproduces it exactly. They diverge when the
  // allowances were retuned after the day was last touched, and on days from
  // before this model existed, which carry no breakdown at all.
  const stale = storedTarget !== live.total;
  const parts = !stale ? live.parts : storedParts;

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          className="flex min-w-0 items-center gap-2 text-left"
        >
          <Eyebrow className="truncate">{describeActivities(local, config)}</Eyebrow>
          <span
            aria-hidden
            className={cx(
              "shrink-0 text-fg-faint transition-transform duration-(--dur-fast)",
              open && "rotate-180",
            )}
          >
            ▾
          </span>
        </button>
        <span className="shrink-0 font-mono text-micro tracking-wide text-fg-faint">
          {storedTarget.toLocaleString("en-GB")} KCAL
          {live.capped ? " · CAPPED" : ""}
        </span>
      </div>

      {open ? (
        <div className="mt-3 space-y-3 rounded-md border border-hairline bg-sunken p-3">
          <div className="flex flex-wrap gap-2">
            <Toggle
              label="Gym"
              kcal={live.parts.find((p) => p.kind === "gym")?.kcal ?? config.gymCalories}
              on={local.gym}
              disabled={isPending}
              onClick={() => apply({ ...local, gym: !local.gym })}
            />
            <Toggle
              label="Golf"
              kcal={live.parts.find((p) => p.kind === "golf")?.kcal ?? config.golfCalories}
              on={local.golf}
              disabled={isPending}
              onClick={() => apply({ ...local, golf: !local.golf })}
            />
          </div>

          <BandRow
            label="Run"
            band={local.runBand}
            config={config}
            kind="run"
            disabled={isPending}
            onPick={(runBand) => apply({ ...local, runBand })}
          />

          <BandRow
            label="Walk"
            band={local.walkBand}
            config={config}
            kind="walk"
            disabled={isPending}
            // Golf is four hours of walking already; counting both pays twice
            // for the same steps.
            mutedReason={local.golf ? "included in golf" : null}
            onPick={(walkBand) => apply({ ...local, walkBand })}
          />

          <div className="border-t border-hairline pt-2.5">
            {parts.map((part, i) => (
              <div
                key={`${part.kind}-${i}`}
                className="flex items-baseline justify-between gap-3 py-0.5"
              >
                <span
                  className={cx(
                    "text-caption",
                    part.kind === "cap" ? "text-warning" : "text-fg-muted",
                  )}
                >
                  {part.label}
                </span>
                <span
                  className={cx(
                    "font-mono text-caption tabular-nums",
                    part.kind === "cap" ? "text-warning" : "text-fg",
                  )}
                >
                  {part.kcal < 0 ? "−" : i === 0 ? "" : "+"}
                  {Math.abs(part.kcal).toLocaleString("en-GB")}
                </span>
              </div>
            ))}
            <div className="mt-1 flex items-baseline justify-between gap-3 border-t border-hairline pt-1.5">
              <span className="text-caption font-medium text-fg-strong">Target</span>
              <span className="font-mono text-body-sm font-medium text-fg-strong tabular-nums">
                {storedTarget.toLocaleString("en-GB")}
              </span>
            </div>
          </div>

          {stale ? (
            <Note>
              {parts.length > 0
                ? "This day was priced under different allowances, so the sum above is the one it was stored with."
                : "This day predates the activity model, so there is no breakdown behind its target."}{" "}
              Ticking anything re-prices it at today’s settings.
            </Note>
          ) : null}

          {error ? <Note tone="danger">{error}</Note> : null}
        </div>
      ) : null}
    </div>
  );
}

function Toggle({
  label,
  kcal,
  on,
  disabled,
  onClick,
}: {
  label: string;
  kcal: number;
  on: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={on}
      className={cx(
        "inline-flex items-center gap-2 rounded-pill border px-3 py-1.5 text-caption transition-colors duration-(--dur-fast) disabled:opacity-50",
        on
          ? "border-accent bg-accent text-paper-0"
          : "border-line bg-card text-fg-strong hover:bg-sunken",
      )}
    >
      {label}
      <span className={cx("font-mono text-micro", on ? "text-paper-0/70" : "text-fg-faint")}>
        +{kcal}
      </span>
    </button>
  );
}

function BandRow({
  label,
  band,
  config,
  kind,
  disabled,
  mutedReason,
  onPick,
}: {
  label: string;
  band: DistanceBand | null;
  config: ActivityConfig;
  kind: "run" | "walk";
  disabled: boolean;
  mutedReason?: string | null;
  onPick: (band: DistanceBand | null) => void;
}) {
  const muted = Boolean(mutedReason);
  const allowances = kind === "run" ? config.runCalories : config.walkCalories;

  return (
    <div className={cx(muted && "opacity-50")}>
      <div className="mb-1.5 flex items-baseline gap-2">
        <Eyebrow>{label}</Eyebrow>
        {mutedReason ? <Badge tone="neutral">{mutedReason}</Badge> : null}
      </div>
      <div className="flex flex-wrap gap-1.5">
        <BandButton
          selected={band === null}
          disabled={disabled || muted}
          onClick={() => onPick(null)}
        >
          None
        </BandButton>
        {DISTANCE_BANDS.map((option) => (
          <BandButton
            key={option}
            selected={band === option}
            disabled={disabled || muted}
            // Tapping the one already picked clears it, so an accidental tick
            // takes one tap to undo rather than a hunt for the None button.
            onClick={() => onPick(band === option ? null : option)}
          >
            {bandLabel(option, config)}
            <span className="ml-1.5 font-mono text-micro opacity-70">+{allowances[option]}</span>
          </BandButton>
        ))}
      </div>
    </div>
  );
}

function BandButton({
  selected,
  disabled,
  onClick,
  children,
}: {
  selected: boolean;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={selected}
      className={cx(
        "inline-flex items-center rounded-md border px-2.5 py-1.5 text-caption whitespace-nowrap transition-colors duration-(--dur-fast) disabled:opacity-50",
        selected
          ? "border-accent bg-accent text-paper-0"
          : "border-line bg-card text-fg-strong hover:bg-sunken",
      )}
    >
      {children}
    </button>
  );
}
