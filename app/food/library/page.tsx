import Link from "next/link";
import { getSavedFoods } from "@/lib/nutrition-queries";
import { PageHeader } from "@/components/ui";
import { LibraryView } from "./library-view";

export const dynamic = "force-dynamic";

function parseAliases(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((a): a is string => typeof a === "string") : [];
  } catch {
    return [];
  }
}

export default async function LibraryPage() {
  const foods = await getSavedFoods();

  return (
    <main>
      <PageHeader
        title="Food library"
        display
        subtitle="Everything you log is saved here. A match resolves instantly, with no API call — correct it once and it stays correct."
        action={
          <Link href="/food" className="shrink-0 text-caption">
            Back to today
          </Link>
        }
      />
      <LibraryView
        foods={foods.map((f) => ({
          id: f.id,
          name: f.name,
          aliases: parseAliases(f.aliases),
          calories: f.calories,
          proteinG: f.proteinG,
          carbsG: f.carbsG,
          fatG: f.fatG,
          timesLogged: f.timesLogged,
        }))}
      />
    </main>
  );
}
