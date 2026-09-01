import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui";
import { CycleEditor } from "./cycle-editor";

export const dynamic = "force-dynamic";

export default async function CyclePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [cycle, groups] = await Promise.all([
    db.cycle.findUnique({
      where: { id },
      include: { slots: { orderBy: { position: "asc" } } },
    }),
    db.exerciseGroup.findMany({
      where: { isArchived: false },
      orderBy: { createdAt: "asc" },
      include: { _count: { select: { items: true } } },
    }),
  ]);

  if (!cycle) notFound();

  return (
    <main>
      <PageHeader
        title={cycle.name}
        display
        subtitle="The rotation advances one slot each time you finish a session."
      />
      <CycleEditor
        cycle={{
          id: cycle.id,
          name: cycle.name,
          isActive: cycle.isActive,
          exerciseGroupIds: cycle.slots.map((s) => s.exerciseGroupId),
        }}
        groups={groups.map((g) => ({ id: g.id, name: g.name, itemCount: g._count.items }))}
      />
    </main>
  );
}
