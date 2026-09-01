/// Every route is `force-dynamic` and queries Postgres in Frankfurt, so a
/// navigation cannot be instant. Without a loading boundary Next has nothing to
/// show while it waits — the old page just sits there for the whole round trip —
/// and it also cannot prefetch a dynamic route, so the wait starts from scratch
/// on click.
///
/// This boundary fixes both: the shell paints immediately, and the links in the
/// bottom nav (always on screen) prefetch up to it.

function Line({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-sm bg-sunken ${className}`} />;
}

export default function Loading() {
  return (
    <main aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading…</span>

      <header className="px-4 pt-8 pb-6">
        <Line className="h-3 w-28" />
        <Line className="mt-3 h-9 w-48" />
      </header>

      <div className="space-y-3 px-4">
        {[0, 1, 2].map((i) => (
          <div key={i} className="rounded-lg border border-hairline bg-card p-5">
            <div className="flex items-baseline justify-between gap-3">
              <Line className="h-4 w-36" />
              <Line className="h-3 w-16" />
            </div>
            <Line className="mt-4 h-3 w-full" />
            <Line className="mt-2 h-3 w-2/3" />
          </div>
        ))}
      </div>
    </main>
  );
}
