"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  disableWebhook,
  disconnectStrava,
  enableWebhook,
  refreshWebhookStatus,
  retryFailedEvents,
  syncNow,
} from "@/lib/strava-actions";
import type { StravaScreen } from "@/lib/strava-queries";
import { Badge, Button, Card, Eyebrow, Hint, Note } from "@/components/ui";

/// The connection, and the three things that can go wrong with it: no webhook,
/// a webhook Strava disagrees with, and events that failed to process.

export function StravaControls({ screen }: { screen: StravaScreen }) {
  const router = useRouter();
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [confirmingDisconnect, setConfirmingDisconnect] = useState(false);

  function run(action: () => Promise<string | void>) {
    setError(null);
    setStatus(null);
    startTransition(async () => {
      try {
        const message = await action();
        if (message) setStatus(message);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "That did not work.");
      }
    });
  }

  const account = screen.account!;
  const live = Boolean(account.subscriptionId);

  return (
    <div className="space-y-3">
      <Card>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <Eyebrow>Connected</Eyebrow>
            <p className="mt-1 text-body-sm font-medium text-fg-strong">
              {account.athleteName ?? `Athlete ${account.athleteId}`}
            </p>
            <p className="mt-0.5 font-mono text-micro tracking-wide text-fg-faint uppercase">
              {account.lastSyncedAt
                ? `Last synced ${new Date(account.lastSyncedAt).toLocaleString("en-GB", {
                    day: "numeric",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}`
                : "Not synced yet"}
            </p>
          </div>
          <Badge tone={live ? "success" : "warning"} dot>
            {live ? "Live" : "No webhook"}
          </Badge>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            variant="accent"
            size="sm"
            disabled={isPending}
            onClick={() =>
              run(async () => {
                const result = await syncNow();
                return `Checked ${result.imported} recent activities${
                  result.done ? `, processed ${result.done} event${result.done === 1 ? "" : "s"}` : ""
                }.`;
              })
            }
          >
            {isPending ? "Working…" : "Sync now"}
          </Button>

          {live ? (
            <Button
              variant="secondary"
              size="sm"
              disabled={isPending}
              onClick={() => run(async () => void (await disableWebhook()))}
            >
              Turn off automatic sync
            </Button>
          ) : (
            <Button
              variant="secondary"
              size="sm"
              disabled={isPending}
              onClick={() =>
                run(async () => {
                  const result = await enableWebhook();
                  return `Strava will now push activities to ${result.callbackUrl}`;
                })
              }
            >
              Turn on automatic sync
            </Button>
          )}

          <Button
            variant="ghost"
            size="sm"
            disabled={isPending}
            onClick={() =>
              run(async () => {
                const current = await refreshWebhookStatus();
                return current
                  ? `Strava has one subscription, pointed at ${current.callbackUrl}`
                  : "Strava has no subscription for this app.";
              })
            }
          >
            Check with Strava
          </Button>
        </div>

        {!live ? (
          <Hint>
            Without a webhook nothing arrives on its own — activities only appear when you press
            Sync now. Turning it on registers this app’s callback with Strava, which Strava tests by
            calling it, so it only works against the deployed site.
          </Hint>
        ) : null}
      </Card>

      {screen.pendingEvents > 0 ? (
        <Note>
          {screen.pendingEvents} event{screen.pendingEvents === 1 ? "" : "s"} waiting to be
          processed. Sync now will work through them.
        </Note>
      ) : null}

      {screen.failedEvents.length > 0 ? (
        <Card tone="sunken">
          <Eyebrow>Failed to process</Eyebrow>
          <ul className="mt-2 space-y-1.5">
            {screen.failedEvents.map((event) => (
              <li key={event.id} className="text-caption text-fg-muted">
                <span className="font-mono text-fg">
                  {event.aspectType} {event.objectId}
                </span>{" "}
                — {event.error}
              </li>
            ))}
          </ul>
          <Button
            variant="secondary"
            size="sm"
            className="mt-3"
            disabled={isPending}
            onClick={() =>
              run(async () => {
                const result = await retryFailedEvents();
                return `Retried: ${result.done} succeeded, ${result.failed} still failing.`;
              })
            }
          >
            Retry
          </Button>
        </Card>
      ) : null}

      {error ? <Note tone="danger">{error}</Note> : null}
      {status ? <Note>{status}</Note> : null}

      {confirmingDisconnect ? (
        <Card tone="sunken">
          <p className="text-body-sm text-fg">
            Disconnect Strava? Activities already imported stay, and so do the targets they set —
            they are a record of what you did, not a live view of Strava.
          </p>
          <div className="mt-3 flex gap-2">
            <Button
              variant="danger"
              size="sm"
              disabled={isPending}
              onClick={() => run(async () => void (await disconnectStrava()))}
            >
              Disconnect
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setConfirmingDisconnect(false)}>
              Keep it
            </Button>
          </div>
        </Card>
      ) : (
        <button
          type="button"
          onClick={() => setConfirmingDisconnect(true)}
          className="text-caption text-fg-faint underline-offset-2 hover:text-danger hover:underline"
        >
          Disconnect Strava
        </button>
      )}
    </div>
  );
}
