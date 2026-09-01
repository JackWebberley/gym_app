import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { formatDayKey } from "@/lib/day";
import { getMenuScreen } from "@/lib/meal-queries";
import { PageHeader } from "@/components/ui";
import { MenuReview } from "./menu-review";

export const dynamic = "force-dynamic";

export default async function MenuPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [menu, alternatives] = await Promise.all([
    getMenuScreen(id),
    db.recipe.findMany({
      where: { isArchived: false },
      select: { id: true, name: true, mealType: true, prepMinutes: true },
      orderBy: { name: "asc" },
    }),
  ]);

  if (!menu) notFound();

  return (
    <main>
      <PageHeader
        title="The menu"
        display
        subtitle={`Week of ${formatDayKey(menu.weekStart)} — cook these whenever`}
        action={
          <Link href="/meals" className="shrink-0 text-caption text-fg-muted no-underline">
            Back
          </Link>
        }
      />
      <MenuReview menu={menu} alternatives={alternatives} />
    </main>
  );
}
