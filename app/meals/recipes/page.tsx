import Link from "next/link";
import { getRecipeLibrary } from "@/lib/meal-queries";
import { EmptyState, PageHeader } from "@/components/ui";
import { RecipeLibrary } from "./recipe-library";

export const dynamic = "force-dynamic";

export default async function RecipesPage() {
  const recipes = await getRecipeLibrary();

  return (
    <main>
      <PageHeader
        title="Recipes"
        display
        subtitle="What the planner picks from before it asks for anything new."
        action={
          <Link href="/meals" className="shrink-0 text-caption text-fg-muted no-underline">
            Meals
          </Link>
        }
      />
      {recipes.length === 0 ? (
        <EmptyState title="No recipes yet">
          <p>
            Run <code>npm run db:seed:meals</code> for the starter set, or plan a week with
            generation switched on and anything written gets saved here.
          </p>
        </EmptyState>
      ) : (
        <RecipeLibrary recipes={recipes} />
      )}
    </main>
  );
}
