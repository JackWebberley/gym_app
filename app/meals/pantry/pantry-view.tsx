"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addPantryItem, deletePantryItem } from "@/lib/meal-actions";
import { formatGrams } from "@/lib/meal/packs";
import {
  Badge,
  Button,
  Card,
  Eyebrow,
  Hint,
  Input,
  Label,
  Note,
  SectionHeader,
  Select,
} from "@/components/ui";

type PantryRow = {
  id: string;
  name: string;
  aisle: string;
  unitGrams: number | null;
  grams: number;
  expiresOn: string;
  daysLeft: number;
  isExpired: boolean;
  isExpiringSoon: boolean;
  source: string;
};

export function PantryView({
  items,
  ingredients,
}: {
  items: PantryRow[];
  ingredients: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [ingredientId, setIngredientId] = useState("");
  const [grams, setGrams] = useState("");
  const [error, setError] = useState<string | null>(null);

  function add() {
    setError(null);
    if (!ingredientId) {
      setError("Pick an ingredient.");
      return;
    }
    const value = Number(grams);
    if (!Number.isFinite(value) || value <= 0) {
      setError("Enter a weight in grams.");
      return;
    }
    startTransition(async () => {
      try {
        await addPantryItem({ ingredientId, grams: value });
        setIngredientId("");
        setGrams("");
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not add that.");
      }
    });
  }

  const expiring = items.filter((i) => i.isExpired || i.isExpiringSoon);
  const rest = items.filter((i) => !i.isExpired && !i.isExpiringSoon);

  return (
    <div className="space-y-5 px-4">
      <Card>
        <Eyebrow className="mb-3">Add stock</Eyebrow>
        <Label htmlFor="pantry-ingredient">Ingredient</Label>
        <Select
          id="pantry-ingredient"
          value={ingredientId}
          onChange={(e) => setIngredientId(e.target.value)}
        >
          <option value="">Choose…</option>
          {ingredients.map((i) => (
            <option key={i.id} value={i.id}>
              {i.name}
            </option>
          ))}
        </Select>

        <div className="mt-3">
          <Label htmlFor="pantry-grams">Grams</Label>
          <Input
            id="pantry-grams"
            value={grams}
            inputMode="numeric"
            placeholder="80"
            onChange={(e) => setGrams(e.target.value.replace(/[^\d.]/g, ""))}
          />
        </div>

        {error ? (
          <div className="mt-3">
            <Note tone="danger">{error}</Note>
          </div>
        ) : null}

        <div className="mt-3">
          <Button variant="accent" fullWidth onClick={add} disabled={isPending}>
            Add to pantry
          </Button>
        </div>
        <Hint>
          Expiry is filled in from the ingredient&rsquo;s shelf life. Most of the pantry fills
          itself when you mark a shop done.
        </Hint>
      </Card>

      {expiring.length > 0 ? (
        <section>
          <SectionHeader title="Use these first" />
          <ItemList items={expiring} isPending={isPending} />
        </section>
      ) : null}

      <section className="pb-4">
        <SectionHeader title={expiring.length > 0 ? "Everything else" : `In the pantry (${items.length})`} />
        {rest.length === 0 && expiring.length === 0 ? (
          <p className="rounded-lg border border-dashed border-line px-4 py-6 text-center text-body-sm text-fg-muted">
            Nothing in the pantry yet. Mark a shop as done and the leftovers land here.
          </p>
        ) : (
          <ItemList items={rest} isPending={isPending} />
        )}
      </section>
    </div>
  );
}

function ItemList({ items, isPending }: { items: PantryRow[]; isPending: boolean }) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  if (items.length === 0) return null;

  return (
    <ul className="divide-y divide-hairline overflow-hidden rounded-lg border border-hairline bg-card">
      {items.map((item) => (
        <li key={item.id} className="flex items-center gap-3 px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-body-sm text-fg-strong">{item.name}</p>
            <p className="font-mono text-micro tracking-wide text-fg-faint">
              {formatGrams(item.grams)} · {item.source.toUpperCase()}
            </p>
          </div>
          <Badge
            tone={item.isExpired ? "danger" : item.isExpiringSoon ? "warning" : "neutral"}
          >
            {item.isExpired
              ? `${Math.abs(item.daysLeft)}d ago`
              : item.daysLeft === 0
                ? "today"
                : `${item.daysLeft}d`}
          </Badge>
          <button
            type="button"
            aria-label={`Remove ${item.name}`}
            disabled={isPending}
            onClick={() =>
              startTransition(async () => {
                await deletePantryItem(item.id);
                router.refresh();
              })
            }
            className="h-8 w-8 shrink-0 rounded-pill border border-hairline text-fg-muted transition-colors hover:bg-sunken hover:text-fg-strong"
          >
            ✕
          </button>
        </li>
      ))}
    </ul>
  );
}
