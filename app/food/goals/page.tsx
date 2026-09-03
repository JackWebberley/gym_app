import Link from "next/link";
import { getSettings } from "@/lib/nutrition-queries";
import { PageHeader } from "@/components/ui";
import { GoalsForm } from "./goals-form";

export const dynamic = "force-dynamic";

export default async function GoalsPage() {
  const settings = await getSettings();

  return (
    <main>
      <PageHeader
        title="Goals"
        display
        subtitle="A rest-day baseline, plus what each activity is worth on top."
        action={
          <Link href="/food" className="shrink-0 text-caption">
            ← Food log
          </Link>
        }
      />
      <GoalsForm initial={settings} />
    </main>
  );
}
