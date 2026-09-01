import Link from "next/link";
import { startSession } from "@/lib/actions";
import { getHomeData } from "@/lib/queries";
import { relativeDay } from "@/lib/relative-day";
import {
  Badge,
  Card,
  CardLink,
  EmptyState,
  Eyebrow,
  LinkButton,
  PageHeader,
  SectionHeader,
  SubmitButton,
} from "@/components/ui";

export const dynamic = "force-dynamic";

/// The training hub: what is next, what comes after it, and everything you might
/// start instead. The dashboard at "/" surfaces only the next session; this is the
/// screen you open when you want to see or change the whole rotation.

export default async function TrainPage() {
  const home = await getHomeData();

  return (
    <main>
      <PageHeader
        title="Train"
        display
        subtitle={
          home.cycle
            ? `${home.cycle.name} · ${home.cycle.slots.length} group rotation`
            : "No cycle set up yet"
        }
      />

      {home.inProgress ? (
        <Card tone="accent" className="mx-4 mb-4">
          <Badge tone="accent" dot>
            In progress
          </Badge>
          <p className="mt-3 text-h3 font-medium text-fg-strong">
            {home.inProgress.group?.name ?? "Freestyle session"}
          </p>
          <p className="mt-0.5 text-body-sm text-fg-muted">
            {home.inProgress._count.sets} set{home.inProgress._count.sets === 1 ? "" : "s"} logged
          </p>
          <LinkButton
            href={`/train/${home.inProgress.id}`}
            variant="accent"
            size="lg"
            fullWidth
            className="mt-4"
          >
            Resume session
          </LinkButton>
        </Card>
      ) : null}

      {home.next ? (
        <Card className="mx-4 mb-6">
          <div className="flex items-baseline justify-between gap-3">
            <Eyebrow>Next</Eyebrow>
            {home.lastCompletedAt ? (
              <p className="text-caption text-fg-faint">
                last session {relativeDay(home.lastCompletedAt)}
              </p>
            ) : null}
          </div>

          <p className="mt-1 font-serif-display text-[2.75rem] leading-tight tracking-display text-fg-strong">
            {home.next.group.name}
          </p>

          <ul className="mt-4 space-y-1.5 text-body-sm">
            {home.next.group.items.map((item) => (
              <li key={item.id} className="flex justify-between gap-4">
                <span className="truncate text-fg">{item.exercise.name}</span>
                <span className="shrink-0 font-mono text-micro tracking-wide text-fg-faint">
                  {item.targetSets} × {item.targetRepMin}–{item.targetRepMax}
                </span>
              </li>
            ))}
            {home.next.group.items.length === 0 ? (
              <li className="text-fg-muted italic">
                No exercises yet —{" "}
                <Link href={`/groups/${home.next.exerciseGroupId}`}>add some</Link>.
              </li>
            ) : null}
          </ul>

          <form
            action={async () => {
              "use server";
              await startSession({ cycleSlotId: home.next!.id });
            }}
          >
            <SubmitButton variant="accent" size="lg" fullWidth className="mt-5">
              Start {home.next.group.name}
            </SubmitButton>
          </form>

          <div className="mt-4 flex justify-between text-caption">
            <Link href={`/groups/${home.next.exerciseGroupId}`}>Edit this group</Link>
            <Link href="/cycles">Reorder the cycle</Link>
          </div>
        </Card>
      ) : (
        <div className="mb-6">
          <EmptyState title="Nothing queued up">
            {home.cycle ? (
              <>
                <Link href={`/cycles/${home.cycle.id}`}>
                  Add exercise groups to {home.cycle.name}
                </Link>{" "}
                to start the rotation.
              </>
            ) : (
              <>
                Build a group in <Link href="/groups">Groups</Link>, then order them into a{" "}
                <Link href="/cycles">cycle</Link>.
              </>
            )}
          </EmptyState>
        </div>
      )}

      {home.upcoming.length > 1 ? (
        <section className="px-4 pb-7">
          <SectionHeader
            title="Then, in order"
            action={
              <Link href="/cycles" className="text-caption">
                Change the order
              </Link>
            }
          />
          <ol className="divide-y divide-hairline overflow-hidden rounded-lg border border-hairline bg-card">
            {home.upcoming.slice(1).map((slot, index) => (
              <li key={slot.id} className="flex items-center gap-3 px-4 py-2.5">
                <span className="w-4 shrink-0 text-center font-mono text-micro text-fg-faint">
                  {index + 2}
                </span>
                <span className="min-w-0 flex-1 truncate text-body-sm text-fg-strong">
                  {slot.group.name}
                </span>
                <span className="shrink-0 font-mono text-micro tracking-wide text-fg-faint">
                  {slot.group.items.length} EX
                </span>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      <section className="px-4 pb-7">
        <SectionHeader title="Start something else" />
        <div className="flex flex-wrap gap-2">
          {home.groups.map((group) => (
            <form
              key={group.id}
              action={async () => {
                "use server";
                await startSession({ exerciseGroupId: group.id });
              }}
            >
              <SubmitButton variant="secondary" size="sm">
                {group.name}
                <span className="font-mono text-micro text-fg-faint">{group._count.items}</span>
              </SubmitButton>
            </form>
          ))}
          <form
            action={async () => {
              "use server";
              await startSession({});
            }}
          >
            <SubmitButton variant="ghost" size="sm" className="border-dashed border-line">
              Freestyle
            </SubmitButton>
          </form>
        </div>
        <p className="mt-2.5 text-caption text-fg-muted">
          Starting a group out of order does not move the rotation —{" "}
          {home.next?.group.name ?? "the next group"} stays next until you finish it.
        </p>
      </section>

      <section className="grid grid-cols-2 gap-2 px-4 pb-7">
        <LinkButton href="/groups" variant="secondary" fullWidth>
          Build groups
        </LinkButton>
        <LinkButton href="/cycles" variant="secondary" fullWidth>
          Order your cycle
        </LinkButton>
      </section>

      {home.recentSessions.length > 0 ? (
        <section className="px-4">
          <SectionHeader
            title="Recent"
            action={
              <Link href="/history" className="text-caption">
                All history
              </Link>
            }
          />
          <div className="space-y-2">
            {home.recentSessions.map((s) => (
              <CardLink key={s.id} href={`/history/${s.id}`} className="px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-body-sm text-fg-strong">
                    {s.group?.name ?? "Freestyle"}
                  </span>
                  <span className="font-mono text-micro tracking-wide text-fg-faint">
                    {s._count.sets} sets · {s.endedAt ? relativeDay(s.endedAt) : ""}
                  </span>
                </div>
              </CardLink>
            ))}
          </div>
        </section>
      ) : null}
    </main>
  );
}
