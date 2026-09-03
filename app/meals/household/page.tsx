import Link from "next/link";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui";
import { HouseholdForm } from "./household-form";

export const dynamic = "force-dynamic";

export default async function HouseholdPage() {
  const settings =
    (await db.settings.findUnique({ where: { id: "singleton" } })) ??
    (await db.settings.create({ data: { id: "singleton" } }));

  return (
    <main>
      <PageHeader
        title="Household"
        display
        subtitle="Who is eating, and how a day divides across meals."
        action={
          <Link href="/meals" className="shrink-0 text-caption text-fg-muted no-underline">
            Meals
          </Link>
        }
      />
      <HouseholdForm
        initial={{
          cooksForTwo: settings.cooksForTwo,
          partnerCalories: settings.partnerCalories,
          partnerProteinG: settings.partnerProteinG,
          splitBreakfast: settings.splitBreakfast,
          splitLunch: settings.splitLunch,
          splitDinner: settings.splitDinner,
          splitSnack: settings.splitSnack,
          myCalories: settings.baselineCalories,
          myProtein: settings.proteinTargetG,
        }}
      />
    </main>
  );
}
