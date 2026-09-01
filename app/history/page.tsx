import Link from "next/link";
import { getSessionHistory } from "@/lib/queries";
import { CardLink, EmptyState, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function HistoryPage() {
  const sessions = await getSessionHistory();

  return (
    <main>
      <PageHeader title="History" display subtitle={`${sessions.length} completed sessions`} />

      {sessions.length === 0 ? (
        <EmptyState title="No sessions logged yet">
          Finish a workout and it will show up here.
        </EmptyState>
      ) : (
        <div className="space-y-2.5 px-4">
          {sessions.map((session) => {
            const working = session.sets.filter((s) => !s.isWarmup);
            const tonnage = working.reduce((sum, s) => sum + s.weightKg * s.reps, 0);
            const minutes = session.endedAt
              ? Math.round((session.endedAt.getTime() - session.startedAt.getTime()) / 60_000)
              : null;

            return (
              <CardLink key={session.id} href={`/history/${session.id}`}>
                <div className="flex items-baseline justify-between gap-3">
                  <h2 className="text-h4 font-medium text-fg-strong">
                    {session.group?.name ?? "Freestyle"}
                  </h2>
                  <span className="font-mono text-micro tracking-wide text-fg-faint">
                    {session.endedAt?.toLocaleDateString("en-GB", {
                      weekday: "short",
                      day: "numeric",
                      month: "short",
                    })}
                  </span>
                </div>
                <p className="mt-1.5 font-mono text-caption text-fg-muted">
                  {working.length} sets · {Math.round(tonnage).toLocaleString("en-GB")} kg volume
                  {minutes !== null && minutes > 0 ? ` · ${minutes} min` : ""}
                </p>
              </CardLink>
            );
          })}
        </div>
      )}
    </main>
  );
}
