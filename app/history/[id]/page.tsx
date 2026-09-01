import { notFound } from "next/navigation";
import { getSessionDetail } from "@/lib/queries";
import { estimatedOneRepMax } from "@/lib/units";
import { Card, PageHeader, Tag } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function SessionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSessionDetail(id);
  if (!session) notFound();

  const byExercise = new Map<string, { name: string; sets: typeof session.sets }>();
  for (const set of session.sets) {
    const entry = byExercise.get(set.exerciseId) ?? { name: set.exercise.name, sets: [] };
    entry.sets.push(set);
    byExercise.set(set.exerciseId, entry);
  }

  return (
    <main>
      <PageHeader
        title={session.group?.name ?? "Freestyle session"}
        display
        subtitle={session.startedAt.toLocaleDateString("en-GB", {
          weekday: "long",
          day: "numeric",
          month: "long",
        })}
      />

      <div className="space-y-2.5 px-4">
        {[...byExercise.values()].map((entry) => {
          const working = entry.sets.filter((s) => !s.isWarmup);
          const best = working.reduce(
            (max, s) => Math.max(max, estimatedOneRepMax(s.weightKg, s.reps)),
            0,
          );

          return (
            <Card key={entry.name}>
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="text-h4 font-medium text-fg-strong">{entry.name}</h2>
                {best > 0 ? <Tag>e1RM {best.toFixed(1)}kg</Tag> : null}
              </div>
              <ul className="mt-3 space-y-1 font-mono text-body-sm">
                {entry.sets.map((set) => (
                  <li key={set.id} className="flex items-center gap-3">
                    <span className="w-4 text-micro text-fg-faint">{set.setNumber}</span>
                    <span className="text-fg-strong">
                      {set.weightKg}kg × {set.reps}
                    </span>
                    {set.isWarmup ? (
                      <span className="text-micro text-fg-faint">warmup</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </Card>
          );
        })}

        {session.sets.length === 0 ? (
          <p className="py-8 text-center text-body-sm text-fg-muted">No sets were logged.</p>
        ) : null}
      </div>
    </main>
  );
}
