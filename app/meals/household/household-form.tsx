"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveHousehold } from "@/lib/meal-actions";
import { Button, Card, Eyebrow, Hint, Input, Label, Note } from "@/components/ui";

/// Two people, one calorie log.
///
/// Her figures do two jobs: they size the shop, and they scale her half of each
/// dish. They never write to a DayLog — the tracker stays single-user, which is
/// what the rest of the app assumes.

type Initial = {
  cooksForTwo: boolean;
  partnerCalories: number;
  partnerProteinG: number;
  splitBreakfast: number;
  splitLunch: number;
  splitDinner: number;
  splitSnack: number;
  myCalories: number;
  myProtein: number;
};

export function HouseholdForm({ initial }: { initial: Initial }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [cooksForTwo, setCooksForTwo] = useState(initial.cooksForTwo);
  const [partnerCalories, setPartnerCalories] = useState(String(initial.partnerCalories));
  const [partnerProteinG, setPartnerProteinG] = useState(String(initial.partnerProteinG));
  const [splits, setSplits] = useState({
    breakfast: Math.round(initial.splitBreakfast * 100),
    lunch: Math.round(initial.splitLunch * 100),
    dinner: Math.round(initial.splitDinner * 100),
    snack: Math.round(initial.splitSnack * 100),
  });
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const total = splits.breakfast + splits.lunch + splits.dinner + splits.snack;
  const hers = Number(partnerCalories) || 0;
  const ratio = initial.myCalories > 0 ? hers / initial.myCalories : 0;

  function save() {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      try {
        await saveHousehold({
          cooksForTwo,
          partnerCalories: Number(partnerCalories),
          partnerProteinG: Number(partnerProteinG),
          splitBreakfast: splits.breakfast / 100,
          splitLunch: splits.lunch / 100,
          splitDinner: splits.dinner / 100,
          splitSnack: splits.snack / 100,
        });
        setSaved(true);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not save that.");
      }
    });
  }

  return (
    <div className="space-y-5 px-4">
      <Card>
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={cooksForTwo}
            onChange={(e) => setCooksForTwo(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--accent)]"
          />
          <span className="min-w-0">
            <span className="block text-body-sm font-medium text-fg-strong">
              Cook for two
            </span>
            <span className="mt-0.5 block text-caption text-fg-muted">
              Every cook makes a serving for each of you. Only yours is logged.
            </span>
          </span>
        </label>
      </Card>

      <Card>
        <Eyebrow className="mb-3">Her targets</Eyebrow>
        <Label htmlFor="partner-calories">Daily calories</Label>
        <Input
          id="partner-calories"
          value={partnerCalories}
          inputMode="numeric"
          onChange={(e) => setPartnerCalories(e.target.value.replace(/[^\d]/g, ""))}
        />

        <div className="mt-3">
          <Label htmlFor="partner-protein">Daily protein (g)</Label>
          <Input
            id="partner-protein"
            value={partnerProteinG}
            inputMode="numeric"
            onChange={(e) => setPartnerProteinG(e.target.value.replace(/[^\d]/g, ""))}
          />
        </div>

        <Hint>
          Yours is {initial.myCalories.toLocaleString("en-GB")} kcal
          {ratio > 0 ? ` — you eat about ${(1 / ratio).toFixed(2)}× what she does` : ""}. The same
          dish gets a different scale factor for each of you, so the shopping list buys one and a
          bit portions rather than two.
        </Hint>
      </Card>

      <Card>
        <Eyebrow className="mb-1">How a day divides</Eyebrow>
        <p className="mb-3 text-caption text-fg-muted">
          Recipes are fitted to the share a meal earns, not to a particular day — a serving in the
          pool could be eaten on any of them.
        </p>

        {(["breakfast", "lunch", "dinner", "snack"] as const).map((mealType) => (
          <div key={mealType} className="mb-3">
            <div className="flex items-baseline justify-between gap-3">
              <Label htmlFor={`split-${mealType}`} className="mb-1 capitalize">
                {mealType}
              </Label>
              <span className="font-mono text-micro text-fg-faint tabular-nums">
                me {Math.round((initial.myCalories * splits[mealType]) / 100)} · her{" "}
                {Math.round((hers * splits[mealType]) / 100)} kcal
              </span>
            </div>
            <div className="flex items-center gap-2">
              <input
                id={`split-${mealType}`}
                type="range"
                min={0}
                max={60}
                value={splits[mealType]}
                onChange={(e) =>
                  setSplits((prev) => ({ ...prev, [mealType]: Number(e.target.value) }))
                }
                className="h-2 flex-1 accent-[var(--accent)]"
              />
              <span className="w-10 text-right font-mono text-body-sm tabular-nums text-fg-strong">
                {splits[mealType]}%
              </span>
            </div>
          </div>
        ))}

        <div
          className={`mt-2 rounded-md border px-3 py-2 font-mono text-micro tracking-wide ${
            total === 100
              ? "border-hairline bg-sunken text-fg-muted"
              : "border-tint-warning-border bg-tint-warning text-warning"
          }`}
        >
          TOTAL {total}%{total === 100 ? "" : " — must be 100 to save"}
        </div>
      </Card>

      {error ? <Note tone="danger">{error}</Note> : null}
      {saved ? <Note>Saved. Future menus use these; menus already planned keep their numbers.</Note> : null}

      <div className="pb-4">
        <Button
          variant="accent"
          size="lg"
          fullWidth
          disabled={isPending || total !== 100}
          onClick={save}
        >
          {isPending ? "Saving…" : "Save"}
        </Button>
      </div>
    </div>
  );
}
