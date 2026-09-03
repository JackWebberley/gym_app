"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { markActivitiesSeen } from "@/lib/strava-actions";
import type { ActivityCard } from "@/lib/strava-queries";
import { ActivityRow } from "@/app/strava/activity-list";
import { Button, Eyebrow } from "@/components/ui";

/// "You did this, and here is what it did to your target."
///
/// Shown once, on the first app open after an activity syncs, then dismissed for
/// good. A sheet rather than a modal dialog: it slides up over the dashboard,
/// the page behind stays readable, and tapping the backdrop is enough to make it
/// go away — this is a notification, not a decision.

export function NewActivityPopup({ activities }: { activities: ActivityCard[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(true);
  const [isPending, startTransition] = useTransition();

  if (activities.length === 0 || !open) return null;

  function dismiss() {
    setOpen(false);
    startTransition(async () => {
      try {
        await markActivitiesSeen(activities.map((a) => a.id));
        router.refresh();
      } catch {
        // Marking it seen is a nicety; failing to should not put the sheet back
        // up in the user's face. It will reappear next open, which is honest.
      }
    });
  }

  const many = activities.length > 1;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <button
        type="button"
        aria-label="Dismiss"
        onClick={dismiss}
        className="absolute inset-0 bg-ink-1/40 backdrop-blur-[2px]"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={many ? "New activities from Strava" : "New activity from Strava"}
        className="relative max-h-[85dvh] w-full max-w-2xl overflow-y-auto rounded-t-xl border-t border-hairline bg-page px-4 pt-3 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-lg"
      >
        {/* The grab handle is doing no work, but its absence makes a sheet look
            like a page that has gone wrong. */}
        <div aria-hidden className="mx-auto mb-3 h-1 w-9 rounded-pill bg-line" />

        <div className="mb-3 flex items-baseline justify-between gap-3">
          <Eyebrow>{many ? `${activities.length} new activities` : "New activity"}</Eyebrow>
          <Link href="/strava" className="text-caption" onClick={dismiss}>
            All activities →
          </Link>
        </div>

        <div className="space-y-2">
          {activities.map((activity) => (
            <ActivityRow key={activity.id} activity={activity} showDay />
          ))}
        </div>

        <Button
          variant="primary"
          size="lg"
          fullWidth
          className="mt-4"
          disabled={isPending}
          onClick={dismiss}
        >
          Got it
        </Button>
      </div>
    </div>
  );
}
