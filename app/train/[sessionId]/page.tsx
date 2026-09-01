import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { discardSession } from "@/lib/actions";
import { getSessionScreen } from "@/lib/queries";
import { PageHeader, SubmitButton } from "@/components/ui";
import { SessionLogger } from "./session-logger";

export const dynamic = "force-dynamic";

export default async function TrainPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  const session = await getSessionScreen(sessionId);
  if (!session) notFound();

  // A finished session is history, not a logging screen.
  if (session.endedAt) redirect(`/history/${sessionId}`);

  const library = await db.exercise.findMany({
    where: { isArchived: false },
    orderBy: [{ muscleGroup: "asc" }, { name: "asc" }],
    select: { id: true, name: true, muscleGroup: true, restSeconds: true },
  });

  const started = new Date(session.startedAt);

  return (
    <main>
      <PageHeader
        title={session.groupName}
        display
        subtitle={`Started ${started.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`}
        action={
          <form
            action={async () => {
              "use server";
              await discardSession(sessionId);
            }}
          >
            <SubmitButton variant="ghost" size="sm">
              Discard
            </SubmitButton>
          </form>
        }
      />

      <SessionLogger session={session} library={library} />
    </main>
  );
}
