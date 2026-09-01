import Link from "next/link";
import { activateCycle, createCycle, moveCycleSlot } from "@/lib/actions";
import { getCycles } from "@/lib/queries";
import {
  Badge,
  Card,
  EmptyState,
  Input,
  Label,
  PageHeader,
  SubmitButton,
  cx,
} from "@/components/ui";

export const dynamic = "force-dynamic";

/** Arrow that persists a reorder immediately — no save button to forget. */
function MoveButton({
  cycleSlotId,
  direction,
  disabled,
}: {
  cycleSlotId: string;
  direction: "up" | "down";
  disabled: boolean;
}) {
  return (
    <form
      action={async () => {
        "use server";
        await moveCycleSlot({ cycleSlotId, direction });
      }}
    >
      <button
        type="submit"
        disabled={disabled}
        aria-label={`Move ${direction}`}
        className={cx(
          "h-(--control-h-sm) w-(--control-h-sm) rounded-pill border border-hairline text-body-sm text-fg-muted transition-colors duration-(--dur-fast) hover:bg-sunken hover:text-fg-strong",
          disabled && "pointer-events-none opacity-25",
        )}
      >
        {direction === "up" ? "↑" : "↓"}
      </button>
    </form>
  );
}

export default async function CyclesPage() {
  const cycles = await getCycles();

  return (
    <main>
      <PageHeader
        title="Cycles"
        display
        subtitle="The order your exercise groups come round in. Skipping a session never shifts what is next."
      />

      <div className="px-4 pb-5">
        <form
          action={async (formData: FormData) => {
            "use server";
            await createCycle(String(formData.get("name") ?? ""));
          }}
        >
          <Label htmlFor="cycle-name">Create a cycle</Label>
          <div className="flex gap-2">
            <Input id="cycle-name" name="name" placeholder="PPL, Upper/Lower…" required />
            <SubmitButton variant="accent" className="shrink-0">
              Create
            </SubmitButton>
          </div>
        </form>
      </div>

      {cycles.length === 0 ? (
        <EmptyState title="No cycles yet">
          Create one above, then add your <Link href="/groups">exercise groups</Link> to it.
        </EmptyState>
      ) : (
        <div className="space-y-4 px-4">
          {cycles.map((cycle) => (
            <Card key={cycle.id} tone={cycle.isActive ? "accent" : "default"}>
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-h4 font-medium text-fg-strong">{cycle.name}</h2>
                {cycle.isActive ? (
                  <Badge tone="success" dot>
                    Active
                  </Badge>
                ) : (
                  <form
                    action={async () => {
                      "use server";
                      await activateCycle(cycle.id);
                    }}
                  >
                    <SubmitButton variant="ghost" size="sm">
                      Make active
                    </SubmitButton>
                  </form>
                )}
              </div>

              {cycle.slots.length === 0 ? (
                <p className="mt-3 text-body-sm text-fg-muted">
                  No groups in this cycle yet — add some below.
                </p>
              ) : (
                <ol className="mt-4 space-y-2">
                  {cycle.slots.map((slot, index) => (
                    <li
                      key={slot.id}
                      className="flex items-center gap-3 rounded-md border border-hairline bg-card px-3 py-2"
                    >
                      <span className="w-4 shrink-0 text-center font-mono text-micro text-fg-faint">
                        {index + 1}
                      </span>
                      <Link
                        href={`/groups/${slot.exerciseGroupId}`}
                        className="min-w-0 flex-1 truncate text-body-sm text-fg-strong no-underline hover:underline"
                      >
                        {slot.group.name}
                      </Link>
                      <div className="flex shrink-0 gap-1">
                        <MoveButton cycleSlotId={slot.id} direction="up" disabled={index === 0} />
                        <MoveButton
                          cycleSlotId={slot.id}
                          direction="down"
                          disabled={index === cycle.slots.length - 1}
                        />
                      </div>
                    </li>
                  ))}
                </ol>
              )}

              <Link
                href={`/cycles/${cycle.id}`}
                className="mt-4 block rounded-pill border border-line bg-card py-2.5 text-center text-body-sm text-fg-strong no-underline transition-colors duration-(--dur-fast) hover:bg-sunken hover:no-underline"
              >
                Add or remove groups
              </Link>
            </Card>
          ))}
        </div>
      )}
    </main>
  );
}
