import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { formatDayKey } from "@/lib/day";
import { getShoppingList } from "@/lib/meal-queries";
import { PageHeader } from "@/components/ui";
import { ShoppingList } from "./shopping-list";

export const dynamic = "force-dynamic";

export default async function ShoppingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const list = await getShoppingList(id);

  if (!list) notFound();
  // A draft has no list yet — the menu has to be confirmed before there is
  // anything to shop from.
  if (list.status === "draft") redirect(`/meals/${id}`);

  return (
    <main>
      <PageHeader
        title="Shopping"
        display
        subtitle={`Week of ${formatDayKey(list.weekStart)}`}
        action={
          <Link href={`/meals/${id}`} className="shrink-0 text-caption text-fg-muted no-underline">
            Menu
          </Link>
        }
      />
      <ShoppingList list={list} />
    </main>
  );
}
