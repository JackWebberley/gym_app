"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  deleteEntry,
  estimateEntry,
  logItems,
  logSavedFood,
  setDayType,
  type ConfirmedItem,
} from "@/lib/nutrition-actions";
import type { DayScreen } from "@/lib/nutrition-queries";
import type { PoolPortion } from "@/lib/meal-queries";
import { ReadyNow } from "./ready-now";
import {
  Badge,
  Button,
  Card,
  Eyebrow,
  Hint,
  Input,
  Label,
  Meter,
  Note,
  SectionHeader,
  Tag,
  cx,
} from "@/components/ui";

type Draft = ConfirmedItem & { key: string };

export function DayView({
  day,
  canEstimate,
  pool = [],
}: {
  day: DayScreen;
  canEstimate: boolean;
  /// Planned servings waiting to be eaten. Empty unless a menu has been shopped.
  pool?: PoolPortion[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [description, setDescription] = useState("");
  const [drafts, setDrafts] = useState<Draft[] | null>(null);
  const [draftSource, setDraftSource] = useState<"llm" | "saved" | "manual">("llm");
  const [wasEdited, setWasEdited] = useState(false);
  const [clarification, setClarification] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isEstimating, setIsEstimating] = useState(false);

  function resetDraft() {
    setDrafts(null);
    setClarification(null);
    setWasEdited(false);
    setDescription("");
  }

  async function runEstimate() {
    setError(null);
    setClarification(null);
    setIsEstimating(true);
    try {
      const result = await estimateEntry(description);
      if (result.kind === "error") {
        setError(result.message);
        return;
      }
      setDraftSource(result.kind === "library" ? "saved" : "llm");
      setDrafts(
        result.items.map((i, idx) => ({
          key: `${i.name}-${idx}`,
          name: i.name,
          calories: i.calories,
          proteinG: i.protein_g,
          carbsG: i.carbs_g,
          fatG: i.fat_g,
          assumption: i.assumption,
          confidence: i.confidence,
        })),
      );
      if (result.kind === "estimated") setClarification(result.clarification);
      setWasEdited(false);
    } finally {
      setIsEstimating(false);
    }
  }

  function startManual() {
    setError(null);
    setClarification(null);
    setDraftSource("manual");
    setWasEdited(false);
    setDrafts([
      {
        key: `manual-${Date.now()}`,
        name: description.trim(),
        calories: 0,
        proteinG: 0,
        carbsG: 0,
        fatG: 0,
        assumption: null,
        confidence: null,
      },
    ]);
  }

  function patchDraft(key: string, patch: Partial<Draft>) {
    setWasEdited(true);
    setDrafts((prev) => prev?.map((d) => (d.key === key ? { ...d, ...patch } : d)) ?? null);
  }

  function confirm() {
    if (!drafts) return;
    setError(null);
    startTransition(async () => {
      try {
        await logItems({
          dayKey: day.dayKey,
          items: drafts.map(({ key: _key, ...item }) => item),
          source: draftSource,
          // A manual entry is authoritative by definition, not a "correction".
          wasEdited: draftSource === "manual" ? true : wasEdited,
        });
        resetDraft();
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not log that.");
      }
    });
  }

  const draftTotals = (drafts ?? []).reduce(
    (acc, d) => ({
      calories: acc.calories + (Number(d.calories) || 0),
      proteinG: acc.proteinG + (Number(d.proteinG) || 0),
      carbsG: acc.carbsG + (Number(d.carbsG) || 0),
      fatG: acc.fatG + (Number(d.fatG) || 0),
    }),
    { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 },
  );

  return (
    <div className="space-y-5 px-4">
      {/* ── Targets ─────────────────────────────────────────────────────── */}
      <Card>
        <div className="flex items-center justify-between gap-3">
          <Eyebrow>{day.dayType === "golf" ? "Golf day" : "Base day"}</Eyebrow>
          <form
            action={() => {
              startTransition(async () => {
                await setDayType(day.dayKey, day.dayType === "golf" ? "base" : "golf");
                router.refresh();
              });
            }}
          >
            <Button type="submit" variant="ghost" size="sm" disabled={isPending}>
              ⟳ Switch to {day.dayType === "golf" ? "base" : "golf"}
            </Button>
          </form>
        </div>

        {/* Protein first: it is the harder target to hit and the one that matters
            most while cutting (spec §5.4). */}
        <Meter label="Protein" unit="g" overIsGood {...day.protein} />
        <Meter label="Calories" {...day.calories} />

        <p className="mt-4 font-mono text-micro tracking-wide text-fg-faint">
          CARBS {Math.round(day.totals.carbsG)}g · FAT {Math.round(day.totals.fatG)}g
        </p>
        <Hint>
          Targets are snapshotted onto the day. <Link href="/food/goals">Changing your goals</Link>{" "}
          will not rewrite days you have already logged.
        </Hint>
      </Card>

      {/* ── Draft preview, or the input ─────────────────────────────────── */}
      {drafts ? (
        <Card tone="accent">
          <Eyebrow className="mb-3">
            {draftSource === "manual"
              ? "Manual entry"
              : draftSource === "saved"
                ? "From your library"
                : "Estimated"}
          </Eyebrow>

          {clarification ? (
            <div className="mb-3">
              <Note>{clarification} — adjust below if it matters, or just log it.</Note>
            </div>
          ) : null}

          <ul className="space-y-3">
            {drafts.map((draft) => (
              <li key={draft.key} className="rounded-md border border-hairline bg-card p-3">
                <div className="flex items-start justify-between gap-2">
                  <Input
                    value={draft.name}
                    onChange={(e) => patchDraft(draft.key, { name: e.target.value })}
                    className="flex-1"
                  />
                  {drafts.length > 1 ? (
                    <button
                      type="button"
                      aria-label="Remove item"
                      onClick={() =>
                        setDrafts((prev) => prev?.filter((d) => d.key !== draft.key) ?? null)
                      }
                      className="h-(--control-h-md) w-(--control-h-md) shrink-0 rounded-pill border border-hairline text-fg-muted transition-colors hover:bg-sunken hover:text-fg-strong"
                    >
                      ✕
                    </button>
                  ) : null}
                </div>

                <div className="mt-2 grid grid-cols-4 gap-2">
                  <MacroField
                    label="kcal"
                    value={draft.calories}
                    onChange={(v) => patchDraft(draft.key, { calories: v })}
                  />
                  <MacroField
                    label="protein"
                    value={draft.proteinG}
                    onChange={(v) => patchDraft(draft.key, { proteinG: v })}
                  />
                  <MacroField
                    label="carbs"
                    value={draft.carbsG}
                    onChange={(v) => patchDraft(draft.key, { carbsG: v })}
                  />
                  <MacroField
                    label="fat"
                    value={draft.fatG}
                    onChange={(v) => patchDraft(draft.key, { fatG: v })}
                  />
                </div>

                {draft.assumption ? (
                  <p className="mt-2 text-caption text-fg-muted">Assumed: {draft.assumption}</p>
                ) : null}
                {draft.confidence && draft.confidence !== "high" ? (
                  <div className="mt-2">
                    <Badge tone={draft.confidence === "low" ? "warning" : "neutral"}>
                      {draft.confidence} confidence
                    </Badge>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>

          <div className="mt-3 flex items-baseline justify-between border-t border-hairline pt-3">
            <span className="text-body-sm font-medium text-fg-strong">Total</span>
            <span className="font-mono text-body-sm text-fg-strong">
              {Math.round(draftTotals.calories)} kcal · {draftTotals.proteinG.toFixed(1)}p ·{" "}
              {draftTotals.carbsG.toFixed(0)}c · {draftTotals.fatG.toFixed(0)}f
            </span>
          </div>

          {error ? (
            <div className="mt-3">
              <Note tone="danger">{error}</Note>
            </div>
          ) : null}

          <div className="mt-4 flex gap-2">
            <Button variant="accent" size="lg" className="flex-1" onClick={confirm} disabled={isPending}>
              {isPending ? "Logging…" : "Log it"}
            </Button>
            <Button variant="ghost" size="lg" onClick={resetDraft} disabled={isPending}>
              Cancel
            </Button>
          </div>
          {wasEdited && draftSource !== "manual" ? (
            <Hint>Your correction will replace the saved values for this food.</Hint>
          ) : null}
        </Card>
      ) : (
        <Card>
          <Label htmlFor="what-i-ate">What did you eat?</Label>
          <Input
            id="what-i-ate"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && description.trim() && canEstimate) {
                e.preventDefault();
                runEstimate();
              }
            }}
            placeholder="two weetabix with a protein shake and a banana"
          />

          {error ? (
            <div className="mt-3">
              <Note tone="danger">{error}</Note>
            </div>
          ) : null}

          <div className="mt-3 flex gap-2">
            <Button
              variant="accent"
              className="flex-1"
              onClick={runEstimate}
              disabled={!description.trim() || isEstimating || !canEstimate}
            >
              {isEstimating ? "Estimating…" : "Estimate"}
            </Button>
            <Button variant="secondary" onClick={startManual} disabled={!description.trim()}>
              Enter manually
            </Button>
          </div>

          {!canEstimate ? (
            <Hint>
              Chat estimation needs <code>ANTHROPIC_API_KEY</code> in <code>.env</code>. Manual entry
              and your library work without it.
            </Hint>
          ) : (
            <Hint>
              Anything already in your library is matched instantly, with no API call.
            </Hint>
          )}
        </Card>
      )}

      {/* ── Planned servings ────────────────────────────────────────────── */}
      <ReadyNow pool={pool} dayKey={day.dayKey} caloriesLeft={day.calories.left} />

      {/* ── Quick add ───────────────────────────────────────────────────── */}
      {day.quickAdd.length > 0 ? (
        <section>
          <SectionHeader
            title="Quick add"
            action={
              <Link href="/food/library" className="text-caption">
                Library ({day.libraryCount})
              </Link>
            }
          />
          <div className="flex flex-wrap gap-2">
            {day.quickAdd.map((food) => (
              <Button
                key={food.id}
                variant="secondary"
                size="sm"
                disabled={isPending}
                onClick={() =>
                  startTransition(async () => {
                    await logSavedFood({ dayKey: day.dayKey, savedFoodId: food.id });
                    router.refresh();
                  })
                }
              >
                <span className="max-w-[11rem] truncate">{food.name}</span>
                <span className="font-mono text-micro text-fg-faint">{food.calories}</span>
              </Button>
            ))}
          </div>
        </section>
      ) : null}

      {/* ── Today's entries ─────────────────────────────────────────────── */}
      <section>
        <SectionHeader title={`Logged (${day.entries.length})`} />
        {day.entries.length === 0 ? (
          <p className="rounded-lg border border-dashed border-line px-4 py-6 text-center text-body-sm text-fg-muted">
            Nothing logged yet today.
          </p>
        ) : (
          <ul className="divide-y divide-hairline overflow-hidden rounded-lg border border-hairline bg-card">
            {day.entries.map((entry) => (
              <li key={entry.id} className="flex items-start gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-body-sm text-fg-strong">{entry.description}</p>
                  <p className="font-mono text-micro tracking-wide text-fg-faint">
                    {entry.calories} KCAL · {entry.proteinG.toFixed(1)}P ·{" "}
                    {entry.carbsG.toFixed(0)}C · {entry.fatG.toFixed(0)}F
                  </p>
                  {entry.assumptions ? (
                    <p className="mt-1 text-caption text-fg-muted">Assumed: {entry.assumptions}</p>
                  ) : null}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Tag>{entry.source}</Tag>
                  <button
                    type="button"
                    aria-label={`Delete ${entry.description}`}
                    disabled={isPending}
                    onClick={() =>
                      startTransition(async () => {
                        await deleteEntry(entry.id);
                        router.refresh();
                      })
                    }
                    className={cx(
                      "h-8 w-8 rounded-pill border border-hairline text-fg-muted transition-colors hover:bg-sunken hover:text-fg-strong",
                    )}
                  >
                    ✕
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function MacroField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-micro font-medium tracking-caps text-fg-muted uppercase">
        {label}
      </span>
      <input
        value={Number.isFinite(value) ? value : ""}
        inputMode="decimal"
        onChange={(e) => {
          const parsed = Number.parseFloat(e.target.value);
          onChange(Number.isFinite(parsed) ? parsed : 0);
        }}
        className="h-(--control-h-md) w-full rounded-md border border-line bg-card text-center font-mono text-body-sm text-fg-strong outline-none transition-colors duration-(--dur-fast) focus:border-line-accent"
      />
    </label>
  );
}
