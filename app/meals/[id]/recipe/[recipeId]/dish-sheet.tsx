"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cookOneOfGroup, uncookOneOfGroup, writeCookMethod } from "@/lib/meal-actions";
import type { DishPlate, DishScreen } from "@/lib/meal-queries";
import { describeQuantity, formatGrams } from "@/lib/meal/packs";
import type { FullMethod } from "@/lib/meal/types";
import { formatDayKey } from "@/lib/day";
import {
  Badge,
  Button,
  Card,
  Eyebrow,
  Hint,
  Note,
  SectionHeader,
  Tag,
  cx,
} from "@/components/ui";

/// The cooking sheet.
///
/// Every quantity here is computed from the recipe lines and the portion scale
/// factors — none of it is prose the model wrote. The steps *are* prose, and they
/// deliberately contain no numbers at all: the weight for each step is printed
/// beneath it from `pan`, which is what lets one saved method stay correct for a
/// single portion and for a batch of six (spec §8.1).

export function DishSheet({ dish, canWrite }: { dish: DishScreen; canWrite: boolean }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [method, setMethod] = useState<FullMethod | null>(dish.method);
  const [writing, setWriting] = useState(false);
  const [writeError, setWriteError] = useState<string | null>(null);

  // Written once per dish, ever, on the first open. The ref is what stops a dev
  // double-mount — or a re-render while the request is in flight — paying for it
  // twice; the action is idempotent, but the wait is not free.
  const requested = useRef(dish.method != null);

  useEffect(() => {
    if (requested.current || !canWrite) return;
    requested.current = true;
    write(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canWrite]);

  function write(rewrite: boolean) {
    setWriting(true);
    setWriteError(null);
    writeCookMethod(dish.recipeId, rewrite)
      .then((result) => {
        if (result.kind === "error") setWriteError(result.message);
        else setMethod(result.method);
      })
      .catch((e) => setWriteError(e instanceof Error ? e.message : "Could not write the method."))
      .finally(() => setWriting(false));
  }

  function run(action: () => Promise<unknown>) {
    setError(null);
    startTransition(async () => {
      try {
        await action();
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "That did not work.");
      }
    });
  }

  const target = { menuId: dish.menu.id, recipeId: dish.recipeId };
  const allCooked = dish.cookCount > 0 && dish.cookedCount === dish.cookCount;
  // Fixed lines split evenly and need no instruction; the adjustable ones are the
  // whole reason two people can eat one dish, so they get said out loud.
  const differing = dish.plates.length > 1 ? dish.plates[0].lines.filter((l) => l.isScalable) : [];

  return (
    <div className="space-y-6 px-4 pb-4">
      <div className="flex flex-wrap items-center gap-1.5">
        {dish.batchFriendly && dish.servingsPerCook > 1 ? <Tag>one batch</Tag> : null}
        {dish.cookCount > 1 ? <Tag>{dish.cookCount} separate cooks</Tag> : null}
        {dish.leftoversFreeze ? <Tag>freezes</Tag> : null}
        {dish.isLocked ? <Badge tone="accent">locked</Badge> : null}
        {dish.cookedCount > 0 ? (
          <Badge tone={allCooked ? "success" : "neutral"}>
            {allCooked ? "cooked" : `${dish.cookedCount}/${dish.cookCount} cooked`}
          </Badge>
        ) : null}
        {dish.expiresOn ? (
          <Badge tone="neutral">eat by {formatDayKey(dish.expiresOn)}</Badge>
        ) : null}
      </div>

      {error ? <Note tone="danger">{error}</Note> : null}

      {/* ── The plates ──────────────────────────────────────────────────────
          First, because it is the question the menu list could not answer: what
          does one serving of this actually give each of us. */}
      <section>
        <SectionHeader title="One serving, each" />
        <div className={cx("grid gap-2", dish.plates.length > 1 && "sm:grid-cols-2")}>
          {dish.plates.map((plate) => (
            <PlateCard key={plate.eater} plate={plate} />
          ))}
        </div>
        <Hint>
          These are the numbers written down when the week was planned, and they are what a log
          entry is made from — not a fresh estimate. Logging a serving from the Food screen can
          re-tune the adjustable parts against whatever is left in the day.
        </Hint>
      </section>

      {/* ── The pan ─────────────────────────────────────────────────────── */}
      <section>
        {/* Named for the session, not the week: "2 servings" beside "you: 4
            servings" would read as a contradiction rather than as the pan. */}
        <SectionHeader
          title={
            dish.cookCount > 1
              ? `Weigh out — one cook of ${dish.cookCount} (${dish.servingsPerCook} servings)`
              : `Weigh out — ${dish.servingsPerCook} ${
                  dish.servingsPerCook === 1 ? "serving" : "servings"
                }`
          }
        />
        <ul className="divide-y divide-hairline overflow-hidden rounded-lg border border-hairline bg-card">
          {dish.pan.map((line) => (
            <li key={line.ingredientId} className="flex items-baseline gap-3 px-4 py-2.5">
              <span className="min-w-0 flex-1 text-body-sm text-fg-strong">
                {line.name}
                {line.note ? <span className="text-fg-faint"> ({line.note})</span> : null}
                {line.isStaple ? <span className="text-fg-faint"> · cupboard</span> : null}
              </span>
              <span className="shrink-0 font-mono text-body-sm tabular-nums text-fg">
                {describeQuantity(line.grams, line.unitGrams)}
              </span>
            </li>
          ))}
        </ul>
        <Hint>
          One cooking session, both of you — so this is the list to weigh against.
          {dish.cookCount > 1
            ? ` This dish is cooked ${dish.cookCount} separate times, so these quantities are per time, not for the week.`
            : ""}{" "}
          Adjustable components are summed across the portions rather than doubled, which is why a
          1.0 and a 0.65 serving want 300g of meat and not 360g.
        </Hint>
      </section>

      {/* ── How to cook ─────────────────────────────────────────────────── */}
      <section>
        <SectionHeader
          title="How to cook"
          action={
            method && canWrite ? (
              <button
                type="button"
                disabled={writing}
                onClick={() => write(true)}
                className="text-caption text-fg-faint underline-offset-2 transition-colors hover:text-fg-accent hover:underline disabled:opacity-40"
              >
                {writing ? "Rewriting…" : "Rewrite"}
              </button>
            ) : undefined
          }
        />

        {method ? (
          <div className="space-y-3">
            {method.preheat || method.equipment.length > 0 ? (
              <Card tone="sunken" className="p-4">
                {method.preheat ? (
                  <p className="text-body-sm text-fg-strong">
                    <span className="text-fg-muted">Preheat </span>
                    {method.preheat}
                  </p>
                ) : null}
                {method.equipment.length > 0 ? (
                  <p className={cx("text-caption text-fg-muted", method.preheat && "mt-1")}>
                    {method.equipment.join(" · ")}
                  </p>
                ) : null}
              </Card>
            ) : null}

            <ol className="space-y-2.5">
              {method.steps.map((step, index) => (
                <Step key={index} index={index + 1} step={step} pan={dish.pan} />
              ))}
            </ol>
          </div>
        ) : writing ? (
          <Card>
            <p className="text-body-sm text-fg-muted">Writing the full method…</p>
            <Hint>
              Asked once for this dish and then kept, so every later time you open it — on any
              week&rsquo;s plan — it is already here.
            </Hint>
            {dish.summary ? (
              <p className="mt-3 border-t border-hairline pt-3 text-caption whitespace-pre-line text-fg-faint">
                {dish.summary}
              </p>
            ) : null}
          </Card>
        ) : (
          <Card>
            {dish.summary ? (
              <p className="text-body-sm whitespace-pre-line text-fg">{dish.summary}</p>
            ) : (
              <p className="text-body-sm text-fg-muted">No method recorded for this dish.</p>
            )}
            <Hint>
              {canWrite
                ? "This is the summary the library was seeded with."
                : "This is the summary the library was seeded with. Writing the full method needs ANTHROPIC_API_KEY."}
            </Hint>
            {canWrite ? (
              <div className="mt-3">
                <Button size="sm" variant="accent" disabled={writing} onClick={() => write(false)}>
                  Write the full method
                </Button>
              </div>
            ) : null}
          </Card>
        )}

        {writeError ? (
          <div className="mt-2">
            <Note tone="danger">{writeError}</Note>
          </div>
        ) : null}
      </section>

      {/* ── Serving up ──────────────────────────────────────────────────── */}
      {differing.length > 0 ? (
        <section>
          <SectionHeader title="Dividing it up" />
          <ul className="divide-y divide-hairline overflow-hidden rounded-lg border border-hairline bg-card">
            {differing.map((line) => (
              <li key={line.name} className="flex items-baseline gap-3 px-4 py-2.5">
                <span className="min-w-0 flex-1 text-body-sm text-fg-strong">{line.name}</span>
                {dish.plates.map((plate) => {
                  const share = plate.lines.find((l) => l.name === line.name);
                  return (
                    <span
                      key={plate.eater}
                      className="shrink-0 font-mono text-micro tracking-wide tabular-nums text-fg-muted"
                    >
                      {plate.label.toUpperCase()}{" "}
                      <span className="text-fg-strong">{formatGrams(share?.grams ?? 0)}</span>
                    </span>
                  );
                })}
              </li>
            ))}
          </ul>
          <Hint>
            Per serving, and only the adjustable parts — everything else divides evenly. This is
            the same dish at two sizes, which is how one cook hits two different calorie targets.
          </Hint>
        </section>
      ) : null}

      {/* ── Actions ─────────────────────────────────────────────────────── */}
      {dish.menu.status === "draft" ? (
        <Note>
          This plan is still a draft. Confirm it on the menu screen and these servings join the
          pool, ready to log from the Food screen.
        </Note>
      ) : (
        <div className="pb-2">
          <Button
            variant={allCooked ? "secondary" : "accent"}
            size="lg"
            fullWidth
            disabled={isPending}
            onClick={() => run(() => (allCooked ? uncookOneOfGroup(target) : cookOneOfGroup(target)))}
          >
            {isPending
              ? "Working…"
              : allCooked
                ? "Undo cooked"
                : dish.cookCount > 1
                  ? `Cooked one (${dish.cookedCount}/${dish.cookCount})`
                  : "Cooked it"}
          </Button>
          <Hint>
            Marking it cooked starts the clock: servings only begin to perish once they exist, and
            they show up on the Food screen ready to log in one tap.
          </Hint>
        </div>
      )}
    </div>
  );
}

/** One person's serving: the macros, and what share of their day it is. */
function PlateCard({ plate }: { plate: DishPlate }) {
  const off = plate.macros.calories - plate.targetKcal;

  return (
    <Card className="p-4">
      <div className="flex items-baseline justify-between gap-3">
        <Eyebrow>{plate.label}</Eyebrow>
        <span className="font-mono text-micro tracking-wide text-fg-faint">
          {plate.servings}
          {plate.servings === 1 ? " serving" : " servings"}
          {plate.eaten > 0 ? ` · ${plate.eaten} eaten` : ""}
        </span>
      </div>

      <p className="mt-2 font-mono text-h2 leading-none tracking-tight tabular-nums text-fg-strong">
        {plate.macros.calories.toLocaleString("en-GB")}
        <span className="text-body-sm text-fg-faint"> kcal</span>
      </p>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <Macro label="Protein" grams={plate.macros.proteinG} lead />
        <Macro label="Carbs" grams={plate.macros.carbsG} />
        <Macro label="Fat" grams={plate.macros.fatG} />
      </div>

      <div className="mt-3 space-y-0.5 border-t border-hairline pt-2.5 font-mono text-micro tracking-wide tabular-nums text-fg-faint">
        {plate.shareOfDayKcal != null ? (
          <p>{Math.round(plate.shareOfDayKcal * 100)}% OF THE DAY&rsquo;S CALORIES</p>
        ) : null}
        {plate.shareOfDayProteinG != null ? (
          <p>{Math.round(plate.shareOfDayProteinG * 100)}% OF THE DAY&rsquo;S PROTEIN</p>
        ) : null}
        <p>
          AIMED AT {plate.targetKcal.toLocaleString("en-GB")}
          {Math.abs(off) >= 25 ? (
            <span className={off > 0 ? "text-warning" : undefined}>
              {" "}
              ({off > 0 ? "+" : ""}
              {Math.round(off)})
            </span>
          ) : null}
        </p>
      </div>
    </Card>
  );
}

function Macro({ label, grams, lead = false }: { label: string; grams: number; lead?: boolean }) {
  return (
    <div className="rounded-md border border-hairline bg-sunken px-2 py-1.5">
      <p className="text-micro font-medium tracking-caps text-fg-muted uppercase">{label}</p>
      <p
        className={cx(
          "mt-0.5 font-mono text-body-sm tabular-nums",
          lead ? "text-fg-accent" : "text-fg-strong",
        )}
      >
        {grams.toFixed(grams < 10 ? 1 : 0)}g
      </p>
    </div>
  );
}

/**
 * One step, with the weights it needs printed underneath.
 *
 * The step text names ingredients and never quantifies them; the numbers come
 * from the pan, so they are already right for however many servings this session
 * makes. A name that no longer resolves to a line simply prints nothing, which is
 * the safe failure: a step with no caption still reads, a step captioned with the
 * wrong ingredient does not.
 */
function Step({
  index,
  step,
  pan,
}: {
  index: number;
  step: FullMethod["steps"][number];
  pan: DishScreen["pan"];
}) {
  const quantities = step.uses
    .map((name) => pan.find((line) => line.name.toLowerCase() === name.toLowerCase()))
    .filter((line): line is DishScreen["pan"][number] => line != null);

  return (
    <li className="flex gap-3">
      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-pill border border-hairline bg-sunken font-mono text-micro tabular-nums text-fg-muted">
        {index}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-body-sm text-fg">
          {step.text}
          {step.minutes != null && step.minutes > 0 ? (
            <span className="font-mono text-micro tracking-wide text-fg-faint">
              {" "}
              · {Math.round(step.minutes)} MIN
            </span>
          ) : null}
        </p>
        {quantities.length > 0 ? (
          <p className="mt-1 font-mono text-micro tracking-wide tabular-nums text-fg-muted">
            {quantities
              .map((line) => `${line.name.toLowerCase()} ${formatGrams(line.grams)}`)
              .join(" · ")}
          </p>
        ) : null}
      </div>
    </li>
  );
}
