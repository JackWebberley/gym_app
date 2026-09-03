import Link from "next/link";
import { getStravaScreen } from "@/lib/strava-queries";
import { Card, Eyebrow, EmptyState, Hint, LinkButton, Note, PageHeader, SectionHeader } from "@/components/ui";
import { StravaControls } from "./strava-controls";
import { ActivityRow } from "./activity-list";

export const dynamic = "force-dynamic";

/// Strava: the connection, and everything it has brought in.
///
/// The activity list is deliberately the bulk of the page. The connection is a
/// thing you set up once; what you want to look at afterwards is whether the
/// workouts are arriving and what they did to your targets.

const ERRORS: Record<string, string> = {
  cancelled: "You cancelled on Strava’s screen, so nothing was connected.",
  scope: "That connection could not read your activities. Reconnect and leave the activity boxes ticked.",
  state: "That sign-in did not match the one this app started. Try again.",
  nocode: "Strava did not send a code back.",
  exchange: "Strava would not exchange the code for a token.",
  unconfigured: "STRAVA_CLIENT_ID and STRAVA_CLIENT_SECRET are not set on the Worker.",
};

export default async function StravaPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; detail?: string; connected?: string; imported?: string }>;
}) {
  const params = await searchParams;
  const screen = await getStravaScreen();

  return (
    <main>
      <PageHeader
        title="Strava"
        display
        subtitle="Workouts arrive on their own and tick the day for you."
        action={
          <Link href="/more" className="shrink-0 text-caption">
            ← More
          </Link>
        }
      />

      <div className="space-y-3 px-4">
        {params.error ? (
          <Note tone="danger">
            {ERRORS[params.error] ?? params.error}
            {params.detail ? ` (${params.detail})` : ""}
          </Note>
        ) : null}

        {params.connected ? (
          <Note>
            Connected. {params.imported && params.imported !== "0"
              ? `Pulled in your last ${params.imported} activities.`
              : "No recent activities to pull in."}
          </Note>
        ) : null}

        {!screen.configured ? (
          <Note tone="danger">
            STRAVA_CLIENT_ID and STRAVA_CLIENT_SECRET are not set on the Worker, so nothing here can
            connect.
          </Note>
        ) : null}

        {screen.account ? (
          <StravaControls screen={screen} />
        ) : (
          <Card>
            <Eyebrow>Not connected</Eyebrow>
            <p className="mt-2 text-body-sm text-fg">
              Connecting lets the app read your activities. When one appears, it works out what it
              was worth and ticks your day for you — a 7km run sets Run 5–10 km and moves the target
              accordingly.
            </p>
            <LinkButton
              href="/api/strava/connect"
              variant="accent"
              size="lg"
              fullWidth
              className="mt-4"
              prefetch={false}
            >
              Connect Strava
            </LinkButton>
            <Hint>
              Read-only. The app never posts anything to Strava, and asks for no write permission.
            </Hint>
          </Card>
        )}
      </div>

      {screen.account ? (
        <section className="px-4 pt-7">
          <SectionHeader
            title="Activities"
            action={
              screen.activities.length > 0 ? (
                <span className="font-mono text-micro tracking-wide text-fg-faint">
                  {screen.activities.length} MOST RECENT
                </span>
              ) : null
            }
          />
          {screen.activities.length === 0 ? (
            <EmptyState title="Nothing imported yet">
              Record something on Strava, or press Sync now to pull in what is already there.
            </EmptyState>
          ) : (
            <div className="space-y-2">
              {screen.activities.map((activity) => (
                <ActivityRow key={activity.id} activity={activity} showDay />
              ))}
            </div>
          )}
        </section>
      ) : null}
    </main>
  );
}
