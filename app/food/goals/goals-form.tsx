"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveGoals, type ActivitySettingsInput } from "@/lib/nutrition-actions";
import { bandLabel, targetFor, NO_ACTIVITY, type ActivityConfig } from "@/lib/activity";
import { Button, Card, Eyebrow, Hint, Label, Note, SectionHeader } from "@/components/ui";

/// Where the calorie model gets tuned.
///
/// Every number on this screen is an estimate rather than a fact, which is the
/// whole reason it is editable: the weight trend on the tracking screen is the
/// only thing that can say whether 600 for a round of golf is right, and when it
/// says otherwise this is where you argue back.

type Draft = Record<keyof ActivitySettingsInput, string>;

export function GoalsForm({ initial }: { initial: ActivitySettingsInput }) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft>(() => toDraft(initial));
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function set(key: keyof Draft, value: string) {
    setStatus(null);
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  function save() {
    setError(null);
    setStatus(null);
    startTransition(async () => {
      try {
        await saveGoals(fromDraft(draft));
        setStatus("Saved");
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not save.");
      }
    });
  }

  // Priced live off what is in the boxes, so the effect of a change is visible
  // before it is committed.
  const preview = previewConfig(draft);
  const restDay = targetFor(NO_ACTIVITY, preview).total;
  const bigDay = targetFor(
    { gym: true, golf: true, runBand: "long", walkBand: null },
    preview,
  );

  return (
    <div className="space-y-6 px-4">
      <section>
        <SectionHeader title="The day" />
        <Card className="space-y-5">
          <Field
            id="baselineCalories"
            label="Baseline"
            unit="kcal"
            value={draft.baselineCalories}
            onChange={(v) => set("baselineCalories", v)}
            hint="A day with nothing ticked. Everything else is added on top of this."
            large
          />
          <Field
            id="proteinTargetG"
            label="Protein target"
            unit="g"
            value={draft.proteinTargetG}
            onChange={(v) => set("proteinTargetG", v)}
            hint="The same every day — protein does not move with activity."
            large
          />
          <Field
            id="calorieCap"
            label="Daily cap"
            unit="kcal"
            value={draft.calorieCap}
            onChange={(v) => set("calorieCap", v)}
            hint="No day goes above this however much you did. These allowances are guesses, and stacked guesses drift further than a single one."
            large
          />
        </Card>
      </section>

      <section>
        <SectionHeader title="Allowances" />
        <Card className="space-y-5">
          <Field
            id="addOnScalePercent"
            label="Scale every allowance"
            unit="%"
            value={draft.addOnScalePercent}
            onChange={(v) => set("addOnScalePercent", v)}
            hint="One dial for the lot, leaving the baseline alone. Turn it down when the weight trend says the whole model is too generous."
            large
          />

          <div className="grid grid-cols-2 gap-4">
            <Field
              id="gymCalories"
              label="Gym"
              unit="kcal"
              value={draft.gymCalories}
              onChange={(v) => set("gymCalories", v)}
            />
            <Field
              id="golfCalories"
              label="Golf"
              unit="kcal"
              value={draft.golfCalories}
              onChange={(v) => set("golfCalories", v)}
            />
          </div>
          <Hint className="-mt-3">Golf includes the walking, so a golf day ignores the walk tick.</Hint>

          <BandFields
            title="Run"
            config={preview}
            keys={["runShortCalories", "runMediumCalories", "runLongCalories"]}
            draft={draft}
            set={set}
          />
          <BandFields
            title="Walk"
            config={preview}
            keys={["walkShortCalories", "walkMediumCalories", "walkLongCalories"]}
            draft={draft}
            set={set}
          />

          <div className="grid grid-cols-2 gap-4">
            <Field
              id="bandShortMaxKm"
              label="Short band ends"
              unit="km"
              value={draft.bandShortMaxKm}
              onChange={(v) => set("bandShortMaxKm", v)}
              decimal
            />
            <Field
              id="bandMediumMaxKm"
              label="Medium band ends"
              unit="km"
              value={draft.bandMediumMaxKm}
              onChange={(v) => set("bandMediumMaxKm", v)}
              decimal
            />
          </div>
        </Card>
      </section>

      <Card tone="sunken">
        <Eyebrow>With these numbers</Eyebrow>
        <p className="mt-2 text-body-sm text-fg">
          A rest day is{" "}
          <span className="font-mono text-fg-strong">{restDay.toLocaleString("en-GB")}</span>. Gym,
          golf and a long run comes to{" "}
          <span className="font-mono text-fg-strong">
            {bigDay.subtotal.toLocaleString("en-GB")}
          </span>
          {bigDay.capped ? (
            <>
              , held at{" "}
              <span className="font-mono text-fg-strong">
                {bigDay.total.toLocaleString("en-GB")}
              </span>{" "}
              by the cap
            </>
          ) : null}
          .
        </p>
      </Card>

      {error ? <Note tone="danger">{error}</Note> : null}

      <Button variant="accent" size="lg" fullWidth onClick={save} disabled={isPending}>
        {isPending ? "Saving…" : "Save"}
      </Button>

      {status ? <p className="text-body-sm text-fg-muted">{status}</p> : null}

      <Note>
        Saving changes what future days aim at. Days you have already logged keep the target they
        were logged against, so your history stays honest.
      </Note>
    </div>
  );
}

function BandFields({
  title,
  config,
  keys,
  draft,
  set,
}: {
  title: string;
  config: ActivityConfig;
  keys: [keyof Draft, keyof Draft, keyof Draft];
  draft: Draft;
  set: (key: keyof Draft, value: string) => void;
}) {
  const bands = ["short", "medium", "long"] as const;
  return (
    <div>
      <Eyebrow className="mb-2">{title}</Eyebrow>
      <div className="grid grid-cols-3 gap-2">
        {bands.map((band, i) => (
          <Field
            key={band}
            id={String(keys[i])}
            label={bandLabel(band, config)}
            value={draft[keys[i]]}
            onChange={(v) => set(keys[i], v)}
          />
        ))}
      </div>
    </div>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  hint,
  unit,
  large = false,
  decimal = false,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint?: string;
  unit?: string;
  large?: boolean;
  decimal?: boolean;
}) {
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <input
          id={id}
          value={value}
          inputMode={decimal ? "decimal" : "numeric"}
          onChange={(e) =>
            onChange(
              decimal
                ? e.target.value.replace(/[^\d.]/g, "").replace(/(\..*)\./g, "$1")
                : e.target.value.replace(/[^\d]/g, ""),
            )
          }
          className={
            large
              ? "h-(--control-h-lg) w-full rounded-md border border-line bg-card px-3 font-mono text-h3 text-fg-strong outline-none transition-colors duration-(--dur-fast) focus:border-line-accent"
              : "h-(--control-h-md) w-full rounded-md border border-line bg-card px-3 font-mono text-body-sm text-fg-strong outline-none transition-colors duration-(--dur-fast) focus:border-line-accent"
          }
        />
        {unit ? (
          <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center font-mono text-caption text-fg-faint">
            {unit}
          </span>
        ) : null}
      </div>
      {hint ? <Hint>{hint}</Hint> : null}
    </div>
  );
}

const NUMBER_KEYS = [
  "baselineCalories",
  "calorieCap",
  "addOnScalePercent",
  "proteinTargetG",
  "gymCalories",
  "golfCalories",
  "runShortCalories",
  "runMediumCalories",
  "runLongCalories",
  "walkShortCalories",
  "walkMediumCalories",
  "walkLongCalories",
  "bandShortMaxKm",
  "bandMediumMaxKm",
] as const satisfies readonly (keyof ActivitySettingsInput)[];

function toDraft(initial: ActivitySettingsInput): Draft {
  return Object.fromEntries(NUMBER_KEYS.map((key) => [key, String(initial[key])])) as Draft;
}

function fromDraft(draft: Draft): ActivitySettingsInput {
  return Object.fromEntries(
    NUMBER_KEYS.map((key) => [key, Number(draft[key] === "" ? 0 : draft[key])]),
  ) as unknown as ActivitySettingsInput;
}

/** The config as the boxes currently read, for the live preview. */
function previewConfig(draft: Draft): ActivityConfig {
  const n = (key: keyof Draft, fallback: number) => {
    const value = Number(draft[key]);
    return Number.isFinite(value) && draft[key] !== "" ? value : fallback;
  };
  return {
    baselineCalories: n("baselineCalories", 0),
    calorieCap: n("calorieCap", 0),
    addOnScalePercent: n("addOnScalePercent", 100),
    gymCalories: n("gymCalories", 0),
    golfCalories: n("golfCalories", 0),
    runCalories: {
      short: n("runShortCalories", 0),
      medium: n("runMediumCalories", 0),
      long: n("runLongCalories", 0),
    },
    walkCalories: {
      short: n("walkShortCalories", 0),
      medium: n("walkMediumCalories", 0),
      long: n("walkLongCalories", 0),
    },
    // Zero would make the labels nonsense while the box is mid-edit.
    bandShortMaxKm: n("bandShortMaxKm", 5),
    bandMediumMaxKm: n("bandMediumMaxKm", 10),
  };
}
