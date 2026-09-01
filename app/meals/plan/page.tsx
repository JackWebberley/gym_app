import Link from "next/link";
import { todayKey, shiftDayKey, formatDayKey } from "@/lib/day";
import { db } from "@/lib/db";
import { isGenerationConfigured } from "@/lib/meal-queries";
import { PageHeader } from "@/components/ui";
import { PlanForm } from "./plan-form";

export const dynamic = "force-dynamic";

/** Monday of the current week — a label for the menu, not a constraint on it. */
function weekStartKey(today: string): string {
  const [y, m, d] = today.split("-").map(Number);
  const date = new Date(y, m - 1, d, 12);
  // getDay(): 0 is Sunday, so Sunday counts back six days rather than none.
  const offset = (date.getDay() + 6) % 7;
  return shiftDayKey(today, -offset);
}

export default async function PlanPage() {
  const today = todayKey();
  const weekStart = weekStartKey(today);

  const [grouped, ingredients] = await Promise.all([
    db.recipe.groupBy({
      by: ["mealType"],
      where: { isArchived: false },
      _count: { _all: true },
    }),
    db.ingredient.findMany({
      where: { isStaple: false },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const libraryByMealType = Object.fromEntries(
    grouped.map((g) => [g.mealType, g._count._all]),
  ) as Record<string, number>;

  return (
    <main>
      <PageHeader
        title="Plan a week"
        display
        subtitle={`Week of ${formatDayKey(weekStart)}`}
        action={
          <Link href="/meals" className="shrink-0 text-caption text-fg-muted no-underline">
            Cancel
          </Link>
        }
      />
      <PlanForm
        weekStart={weekStart}
        canGenerate={isGenerationConfigured()}
        libraryByMealType={libraryByMealType}
        ingredients={ingredients}
      />
    </main>
  );
}
