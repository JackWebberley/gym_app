import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getExerciseGroup } from "@/lib/queries";
import { PageHeader } from "@/components/ui";
import { GroupEditor } from "./group-editor";

export const dynamic = "force-dynamic";

export default async function GroupPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [group, library] = await Promise.all([
    getExerciseGroup(id),
    db.exercise.findMany({
      where: { isArchived: false },
      orderBy: [{ muscleGroup: "asc" }, { name: "asc" }],
      select: { id: true, name: true, muscleGroup: true, equipment: true },
    }),
  ]);

  if (!group) notFound();

  return (
    <main>
      <PageHeader
        title={group.name}
        display
        subtitle="Order here is the order you will see at the gym."
        action={
          <Link href="/groups" className="shrink-0 text-caption">
            All groups
          </Link>
        }
      />
      <GroupEditor group={group} library={library} />
    </main>
  );
}
