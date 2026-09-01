"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { activateCycle, deleteCycle, saveCycle } from "@/lib/actions";
import { Badge, Button, Card, Eyebrow, Hint, Input, Label, cx } from "@/components/ui";

type GroupOption = { id: string; name: string; itemCount: number };

type Slot = { key: string; exerciseGroupId: string };

export function CycleEditor({
  cycle,
  groups,
}: {
  cycle: { id: string; name: string; isActive: boolean; exerciseGroupIds: string[] };
  groups: GroupOption[];
}) {
  const router = useRouter();
  const [name, setName] = useState(cycle.name);
  const [slots, setSlots] = useState<Slot[]>(() =>
    cycle.exerciseGroupIds.map((exerciseGroupId, i) => ({
      key: `${exerciseGroupId}-${i}`,
      exerciseGroupId,
    })),
  );
  const [status, setStatus] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const byId = new Map(groups.map((g) => [g.id, g]));

  function move(index: number, delta: number) {
    setSlots((prev) => {
      const next = [...prev];
      const target = index + delta;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function save() {
    setStatus(null);
    startTransition(async () => {
      try {
        await saveCycle({
          id: cycle.id,
          name,
          exerciseGroupIds: slots.map((s) => s.exerciseGroupId),
        });
        setStatus("Saved");
        router.refresh();
      } catch (e) {
        setStatus(e instanceof Error ? e.message : "Could not save.");
      }
    });
  }

  return (
    <div className="space-y-5 px-4">
      <Card>
        <Label htmlFor="cycle-name">Name</Label>
        <Input id="cycle-name" value={name} onChange={(e) => setName(e.target.value)} />
        {cycle.isActive ? (
          <div className="mt-4">
            <Badge tone="success" dot>
              Active cycle
            </Badge>
          </div>
        ) : (
          <Button
            variant="secondary"
            fullWidth
            className="mt-4"
            disabled={isPending}
            onClick={() =>
              startTransition(async () => {
                await activateCycle(cycle.id);
                router.refresh();
              })
            }
          >
            Make this the active cycle
          </Button>
        )}
      </Card>

      <section>
        <Eyebrow className="mb-2.5">
          Rotation ({slots.length} group{slots.length === 1 ? "" : "s"})
        </Eyebrow>
        {slots.length === 0 ? (
          <p className="rounded-lg border border-dashed border-line px-4 py-6 text-center text-body-sm text-fg-muted">
            Add exercise groups below. The order here is the order you train them in.
          </p>
        ) : (
          <ol className="space-y-2">
            {slots.map((slot, index) => {
              const group = byId.get(slot.exerciseGroupId);
              return (
                <li key={slot.key}>
                  <Card className="flex items-center gap-3 p-4">
                    <span className="w-5 shrink-0 text-center font-mono text-micro text-fg-faint">
                      {index + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-fg-strong">
                        {group?.name ?? "Deleted group"}
                      </p>
                      <p className="font-mono text-micro tracking-wide text-fg-faint">
                        {group?.itemCount ?? 0} exercises
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <IconButton label="↑" onClick={() => move(index, -1)} disabled={index === 0} />
                      <IconButton
                        label="↓"
                        onClick={() => move(index, 1)}
                        disabled={index === slots.length - 1}
                      />
                      <IconButton
                        label="✕"
                        onClick={() => setSlots((prev) => prev.filter((s) => s.key !== slot.key))}
                      />
                    </div>
                  </Card>
                </li>
              );
            })}
          </ol>
        )}
        <Hint>
          A group can appear more than once — useful for rotations like Push, Pull, Legs, Push, Pull.
        </Hint>
      </section>

      <section>
        <Eyebrow className="mb-2.5">Add a group</Eyebrow>
        <div className="flex flex-wrap gap-2">
          {groups.map((group) => (
            <Button
              key={group.id}
              variant="secondary"
              size="sm"
              onClick={() =>
                setSlots((prev) => [
                  ...prev,
                  { key: `${group.id}-${Date.now()}`, exerciseGroupId: group.id },
                ])
              }
            >
              + {group.name}
            </Button>
          ))}
          {groups.length === 0 ? (
            <p className="text-body-sm text-fg-muted">
              No groups yet — <Link href="/groups">create one first</Link>.
            </p>
          ) : null}
        </div>
      </section>

      <div className="flex items-center gap-2">
        <Button variant="accent" size="lg" onClick={save} disabled={isPending} className="flex-1">
          {isPending ? "Saving…" : "Save cycle"}
        </Button>
        <Button
          variant="danger"
          size="lg"
          onClick={() => {
            if (confirm(`Delete "${cycle.name}"?`)) {
              startTransition(async () => {
                await deleteCycle(cycle.id);
              });
            }
          }}
        >
          Delete
        </Button>
      </div>

      {status ? <p className="pb-2 text-body-sm text-fg-muted">{status}</p> : null}
    </div>
  );
}

function IconButton({
  label,
  onClick,
  disabled,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className={cx(
        "h-(--control-h-sm) w-(--control-h-sm) rounded-pill border border-hairline text-body-sm text-fg-muted transition-colors duration-(--dur-fast) hover:bg-sunken hover:text-fg-strong",
        disabled && "pointer-events-none opacity-30",
      )}
    >
      {label}
    </button>
  );
}
