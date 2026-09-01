"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button, Card, Eyebrow, Note } from "@/components/ui";

/// A recoverable boundary. Without this, one throw in a server component blanks
/// the screen — which is a bad way to find out about a bug halfway through a
/// session at the gym. Retry re-runs the render; the link is the way out if it
/// keeps failing.

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Ends up in the Worker's logs (observability is on), so it is diagnosable
    // after the fact rather than only visible on the phone that hit it.
    console.error("Unhandled error:", error.message, error.digest ?? "");
  }, [error]);

  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <Card className="w-full max-w-sm">
        <Eyebrow>Something broke</Eyebrow>
        <h1 className="mt-2 font-serif-display text-h2 font-normal tracking-display text-fg-strong">
          That did not work
        </h1>
        <p className="mt-3 text-body-sm text-fg-muted">
          Nothing you have already logged is affected — sets are saved as you tick them.
        </p>
        <p className="mt-2 text-caption text-fg-muted">
          If the app was updated while this tab was open, reloading is the fix: the page is
          running older code than the server and every button will keep failing until it
          catches up.
        </p>

        {error.digest ? (
          <div className="mt-4">
            <Note>Reference: {error.digest}</Note>
          </div>
        ) : null}

        {/* Reload first, and deliberately so. `reset` only re-runs the render with
            the same JavaScript already in memory, which cannot recover from the
            most common cause of this screen — a deploy landing under an open tab,
            leaving the client posting server actions the server no longer has.
            Offering only "try again" there is an infinite loop with a button. */}
        <Button
          variant="accent"
          size="lg"
          fullWidth
          className="mt-5"
          onClick={() => window.location.reload()}
        >
          Reload the app
        </Button>
        <Button variant="secondary" size="lg" fullWidth className="mt-3" onClick={reset}>
          Try again without reloading
        </Button>
        <Link
          href="/"
          className="mt-3 block rounded-pill border border-line bg-card py-2.5 text-center text-body-sm text-fg-strong no-underline transition-colors duration-(--dur-fast) hover:bg-sunken hover:no-underline"
        >
          Back to today
        </Link>
      </Card>
    </main>
  );
}
