import Link from "next/link";
import { redirect } from "next/navigation";
import { formatDayKey, isValidDayKey, shiftDayKey, todayKey } from "@/lib/day";
import { getDayScreen, isEstimationConfigured } from "@/lib/nutrition-queries";
import { PageHeader } from "@/components/ui";
import { DayView } from "./day-view";

export const dynamic = "force-dynamic";

export default async function FoodPage({
  searchParams,
}: {
  searchParams: Promise<{ d?: string }>;
}) {
  const { d } = await searchParams;
  const today = todayKey();

  // A hand-typed or stale ?d= must not create a junk DayLog row.
  if (d && !isValidDayKey(d)) redirect("/food");

  const dayKey = d ?? today;
  const day = await getDayScreen(dayKey);

  const prev = shiftDayKey(dayKey, -1);
  const next = shiftDayKey(dayKey, 1);
  const isToday = dayKey === today;

  return (
    <main>
      <PageHeader
        title={isToday ? "Today" : formatDayKey(dayKey)}
        display
        subtitle={isToday ? formatDayKey(dayKey) : undefined}
        action={
          <div className="flex shrink-0 items-center gap-1">
            <Link
              href={`/food?d=${prev}`}
              aria-label="Previous day"
              className="flex h-(--control-h-md) w-(--control-h-md) items-center justify-center rounded-pill border border-hairline text-fg-muted no-underline transition-colors hover:bg-sunken hover:text-fg-strong hover:no-underline"
            >
              ←
            </Link>
            <Link
              href={next > today ? "/food" : `/food?d=${next}`}
              aria-label="Next day"
              aria-disabled={isToday}
              className={`flex h-(--control-h-md) w-(--control-h-md) items-center justify-center rounded-pill border border-hairline no-underline transition-colors hover:bg-sunken hover:text-fg-strong hover:no-underline ${
                isToday ? "pointer-events-none text-fg-faint opacity-40" : "text-fg-muted"
              }`}
            >
              →
            </Link>
          </div>
        }
      />

      <DayView day={day} canEstimate={isEstimationConfigured()} />

      <div className="grid grid-cols-2 gap-2 px-4 pt-5">
        <Link
          href="/food/goals"
          className="rounded-pill border border-line bg-card py-2.5 text-center text-body-sm text-fg-strong no-underline transition-colors hover:bg-sunken hover:no-underline"
        >
          Goals
        </Link>
        <Link
          href="/food/library"
          className="rounded-pill border border-line bg-card py-2.5 text-center text-body-sm text-fg-strong no-underline transition-colors hover:bg-sunken hover:no-underline"
        >
          Food library
        </Link>
      </div>
    </main>
  );
}
