import Link from "next/link";
import { startSession } from "@/lib/actions";
import { getHomeData } from "@/lib/queries";
import {
  Badge,
  Card,
  CardLink,
  Eyebrow,
  EmptyState,
  LinkButton,
  PageHeader,
  SubmitButton,
  Tag,
} from "@/components/ui";
import { ThemeToggle } from "@/components/theme-toggle";

export const dynamic = "force-dynamic";

function relativeDay(date: Date) {
  const days = Math.floor((Date.now() - date.getTime()) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  const weeks = Math.floor(days / 7);
  return weeks === 1 ? "1 week ago" : `${weeks} weeks ago`;
}

export default async function HomePage() {
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
        action={<ThemeToggle />}
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
        <Card className="mx-4 mb-4">
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
      )}

      {home.upcoming.length > 1 ? (
        <section className="px-4 pb-7">
          <div className="mb-2.5 flex items-baseline justify-between">
            <Eyebrow>Then</Eyebrow>
            <Link href="/cycles" className="text-caption">
              Change the order
            </Link>
          </div>
          <ol className="flex flex-wrap gap-2">
            {home.upcoming.slice(1).map((slot) => (
              <li key={slot.id}>
                <Tag>{slot.group.name}</Tag>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      <section className="px-4 pb-7">
        <Eyebrow className="mb-2.5">Start something else</Eyebrow>
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
          <Eyebrow className="mb-2.5">Recent</Eyebrow>
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
