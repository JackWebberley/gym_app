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

        {error.digest ? (
          <div className="mt-4">
            <Note>Reference: {error.digest}</Note>
          </div>
        ) : null}

        <Button variant="accent" size="lg" fullWidth className="mt-5" onClick={reset}>
          Try again
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
