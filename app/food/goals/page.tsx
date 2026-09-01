import Link from "next/link";
import { getGoals } from "@/lib/nutrition-queries";
import { PageHeader } from "@/components/ui";
import { GoalsForm } from "./goals-form";

export const dynamic = "force-dynamic";

export default async function GoalsPage() {
  const goals = await getGoals();

  return (
    <main>
      <PageHeader
        title="Goals"
        display
        subtitle="What each day aims at. Golf days get their own calorie figure."
        action={
          <Link href="/food" className="shrink-0 text-caption">
            Back to today
          </Link>
        }
      />
      <GoalsForm goals={goals} />
    </main>
  );
}
