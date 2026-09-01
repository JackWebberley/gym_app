import Link from "next/link";
import { db } from "@/lib/db";
import { getPantryScreen } from "@/lib/meal-queries";
import { PageHeader } from "@/components/ui";
import { PantryView } from "./pantry-view";

export const dynamic = "force-dynamic";

export default async function PantryPage() {
  const [items, ingredients] = await Promise.all([
    getPantryScreen(),
    db.ingredient.findMany({
      where: { isStaple: false },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <main>
      <PageHeader
        title="Pantry"
        display
        subtitle="What is already in the house. Next week's plan reaches for these first."
        action={
          <Link href="/meals" className="shrink-0 text-caption text-fg-muted no-underline">
            Meals
          </Link>
        }
      />
      <PantryView items={items} ingredients={ingredients} />
    </main>
  );
}
