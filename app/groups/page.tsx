import Link from "next/link";
import { db } from "@/lib/db";
import { createExerciseGroup } from "@/lib/actions";
import {
  CardLink,
  EmptyState,
  Hint,
  Input,
  Label,
  PageHeader,
  SubmitButton,
  Tag,
} from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function GroupsPage() {
  const groups = await db.exerciseGroup.findMany({
    where: { isArchived: false },
    orderBy: { createdAt: "asc" },
    include: {
      items: { orderBy: { order: "asc" }, include: { exercise: { select: { name: true } } } },
      cycleSlots: { include: { cycle: { select: { name: true, isActive: true } } } },
    },
  });

  return (
    <main>
      <PageHeader
        title="Exercise groups"
        display
        subtitle="A group is a named list of exercises — Push, Legs, Upper A. Build one here, then order your groups in a cycle."
      />

      <div className="px-4 pb-5">
        <form
          action={async (formData: FormData) => {
            "use server";
            await createExerciseGroup(String(formData.get("name") ?? ""));
          }}
        >
          <Label htmlFor="group-name">Create a group from scratch</Label>
          <div className="flex gap-2">
            <Input id="group-name" name="name" placeholder="Push, Legs, Upper A…" required />
            <SubmitButton variant="accent" className="shrink-0">
              Create
            </SubmitButton>
          </div>
          <Hint>You will pick its exercises on the next screen.</Hint>
        </form>
      </div>

      {groups.length === 0 ? (
        <EmptyState title="No exercise groups yet">
          Name one above, then fill it with exercises from the library.
        </EmptyState>
      ) : (
        <div className="space-y-2.5 px-4">
          {groups.map((group) => (
            <CardLink key={group.id} href={`/groups/${group.id}`}>
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="text-h4 font-medium text-fg-strong">{group.name}</h2>
                <span className="font-mono text-micro tracking-wide text-fg-faint">
                  {group.items.length} EXERCISE{group.items.length === 1 ? "" : "S"}
                </span>
              </div>
              <p className="mt-1.5 truncate text-body-sm text-fg-muted">
                {group.items.length > 0
                  ? group.items.map((i) => i.exercise.name).join(" · ")
                  : "Empty — tap to add exercises"}
              </p>
              <div className="mt-3">
                {group.cycleSlots.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {[...new Set(group.cycleSlots.map((s) => s.cycle.name))].map((name) => (
                      <Tag key={name}>{name}</Tag>
                    ))}
                  </div>
                ) : (
                  <Tag>not in a cycle</Tag>
                )}
              </div>
            </CardLink>
          ))}
        </div>
      )}

      <div className="px-4 pt-5">
        <Link
          href="/cycles"
          className="block rounded-lg border border-dashed border-line px-4 py-3 text-center text-body-sm text-fg-muted no-underline transition-colors duration-(--dur-fast) hover:border-line-strong hover:text-fg-strong hover:no-underline"
        >
          Next: order these groups in a cycle →
        </Link>
      </div>
    </main>
  );
}
