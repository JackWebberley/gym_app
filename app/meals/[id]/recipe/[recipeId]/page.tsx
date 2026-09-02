import Link from "next/link";
import { notFound } from "next/navigation";
import { getDishScreen, isGenerationConfigured } from "@/lib/meal-queries";
import { DishSheet } from "./dish-sheet";

export const dynamic = "force-dynamic";

/// One dish of a menu, in full — the screen you stand in the kitchen with.
///
/// It exists because the menu list can only ever show a summary. The three things
/// you need while cooking are what to weigh out, what order to do it in, and how
/// much of it goes on whose plate, and only the middle one is prose. Every
/// quantity is computed here from the recipe lines and this menu's scale factors,
/// so it is right for a single portion and for a batch of six alike (spec §8.1).
///
/// Keyed by recipe, not by cook, because that is what the menu list is keyed by:
/// three separate cooks of the same dish are one row there and one screen here.

export default async function DishPage({
  params,
}: {
  params: Promise<{ id: string; recipeId: string }>;
}) {
  const { id, recipeId } = await params;

  // Scoped to the menu in the URL rather than looked up by recipe alone: this
  // screen shows the portions *this plan* committed to, so a recipe that is not
  // in this plan is a 404 rather than a page of borrowed numbers.
  const dish = await getDishScreen(id, recipeId);
  if (!dish) notFound();

  return (
    <main>
      <header className="px-4 pt-8 pb-5">
        <Link
          href={`/meals/${dish.menu.id}`}
          className="text-caption text-fg-muted no-underline hover:no-underline"
        >
          ← {dish.menu.name}
        </Link>
        <h1 className="mt-2 font-serif-display text-h1 leading-tight font-normal tracking-display text-fg-strong">
          {dish.name}
        </h1>
        <p className="mt-1.5 font-mono text-micro tracking-wide text-fg-faint">
          {dish.mealType.toUpperCase()} · ~{dish.prepMinutes} MIN · KEEPS {dish.keepsDays}{" "}
          {dish.keepsDays === 1 ? "DAY" : "DAYS"}
          {dish.timesCooked > 0 ? ` · COOKED ${dish.timesCooked}×` : ""}
        </p>
      </header>

      <DishSheet dish={dish} canWrite={isGenerationConfigured()} />
    </main>
  );
}
