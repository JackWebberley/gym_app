"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { activateMenu, deleteMenu, renameMenu } from "@/lib/meal-actions";
import type { PlanSummary } from "@/lib/meal-queries";
import { Badge, Button, Card, Input, Note, SectionHeader, Tag, cx } from "@/components/ui";

/// Plans accumulate rather than being consumed.
///
/// One is active — that is the one the hub shows and the one "Plan a week"
/// replaces as current — but the others stay put, so last week's shop is still
/// there to look at and a plan you liked can be switched back to.

export function PlanSwitcher({ plans }: { plans: PlanSummary[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [renaming, setRenaming] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (plans.length === 0) return null;

  function run(action: () => Promise<unknown>) {
    setError(null);
    startTransition(async () => {
      try {
        await action();
        setRenaming(null);
        setConfirmingDelete(null);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "That did not work.");
      }
    });
  }

  return (
    <section>
      <SectionHeader
        title={`Plans (${plans.length})`}
        action={
          <Link href="/meals/plan" className="text-caption">
            New plan →
          </Link>
        }
      />

      {error ? (
        <div className="mb-2">
          <Note tone="danger">{error}</Note>
        </div>
      ) : null}

      <ul className="space-y-2">
        {plans.map((plan) => (
          <li key={plan.id}>
            <Card className={cx("p-4", plan.isActive && "border-line-accent")}>
              {renaming === plan.id ? (
                <div className="flex gap-2">
                  <Input
                    value={draftName}
                    autoFocus
                    onChange={(e) => setDraftName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && draftName.trim()) {
                        run(() => renameMenu({ menuId: plan.id, name: draftName }));
                      }
                      if (e.key === "Escape") setRenaming(null);
                    }}
                    className="flex-1"
                  />
                  <Button
                    size="sm"
                    variant="accent"
                    disabled={isPending || !draftName.trim()}
                    onClick={() => run(() => renameMenu({ menuId: plan.id, name: draftName }))}
                  >
                    Save
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setRenaming(null)}>
                    Cancel
                  </Button>
                </div>
              ) : (
                <>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-body-sm font-medium text-fg-strong">
                        {plan.name}
                      </p>
                      <p className="mt-0.5 font-mono text-micro tracking-wide text-fg-faint">
                        {plan.cookCount} {plan.cookCount === 1 ? "COOK" : "COOKS"}
                        {plan.estimatedCostGbp > 0
                          ? ` · £${plan.estimatedCostGbp.toFixed(2)}`
                          : ""}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <Tag>{plan.status}</Tag>
                      {plan.isActive ? <Badge tone="accent">active</Badge> : null}
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {!plan.isActive ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={isPending}
                        onClick={() => run(() => activateMenu(plan.id))}
                      >
                        Switch to this
                      </Button>
                    ) : null}
                    <Link
                      href={`/meals/${plan.id}`}
                      className="inline-flex h-(--control-h-sm) items-center rounded-pill border border-line bg-card px-3 text-caption text-fg-strong no-underline transition-colors hover:bg-sunken hover:no-underline"
                    >
                      Open
                    </Link>
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => {
                        setRenaming(plan.id);
                        setDraftName(plan.name);
                      }}
                      className="text-caption text-fg-muted underline-offset-2 hover:text-fg-strong hover:underline disabled:opacity-40"
                    >
                      Rename
                    </button>

                    {confirmingDelete === plan.id ? (
                      <span className="ml-auto flex items-center gap-2">
                        <span className="text-caption text-danger">Delete for good?</span>
                        <Button
                          size="sm"
                          variant="danger"
                          disabled={isPending}
                          onClick={() => run(() => deleteMenu(plan.id))}
                        >
                          Yes
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setConfirmingDelete(null)}>
                          No
                        </Button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={() => setConfirmingDelete(plan.id)}
                        className="ml-auto text-caption text-fg-faint underline-offset-2 transition-colors hover:text-danger hover:underline disabled:opacity-40"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </>
              )}
            </Card>
          </li>
        ))}
      </ul>
    </section>
  );
}
