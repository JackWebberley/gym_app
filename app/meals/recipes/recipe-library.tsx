"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { archiveRecipe, toggleFavouriteRecipe } from "@/lib/meal-actions";
import { formatGrams } from "@/lib/meal/packs";
import { Badge, Button, Card, Eyebrow, Hint, Tag, cx } from "@/components/ui";

type Recipe = {
  id: string;
  name: string;
  mealType: string;
  prepMinutes: number;
  isFavourite: boolean;
  batchFriendly: boolean;
  leftoversFreeze: boolean;
  timesCooked: number;
  source: string;
  method: string;
  ingredients: {
    name: string;
    grams: number;
    isScalable: boolean;
    minGrams: number | null;
    maxGrams: number | null;
    note: string | null;
  }[];
};

const FILTERS = ["all", "breakfast", "lunch", "dinner", "snack"] as const;

export function RecipeLibrary({ recipes }: { recipes: Recipe[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("all");
  const [expanded, setExpanded] = useState<string | null>(null);

  const shown = filter === "all" ? recipes : recipes.filter((r) => r.mealType === filter);

  return (
    <div className="space-y-4 px-4">
      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setFilter(option)}
            className={cx(
              "inline-flex h-[26px] items-center rounded-sm border px-2.5 font-mono text-micro tracking-wide capitalize transition-colors",
              filter === option
                ? "border-inverse bg-inverse text-fg-inverse"
                : "border-hairline text-fg-muted hover:bg-sunken",
            )}
          >
            {option}
            {option !== "all" ? (
              <span className="ml-1.5 text-fg-faint">
                {recipes.filter((r) => r.mealType === option).length}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      <ul className="space-y-2 pb-4">
        {shown.map((recipe) => {
          const isOpen = expanded === recipe.id;
          return (
            <li key={recipe.id}>
              <Card className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => setExpanded(isOpen ? null : recipe.id)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <p className="truncate text-body-sm font-medium text-fg-strong">
                      {recipe.name}
                    </p>
                    <p className="mt-0.5 font-mono text-micro tracking-wide text-fg-faint">
                      {recipe.mealType.toUpperCase()} · ~{recipe.prepMinutes} MIN
                      {recipe.timesCooked > 0 ? ` · COOKED ${recipe.timesCooked}×` : ""}
                    </p>
                  </button>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {recipe.batchFriendly ? <Tag>batch</Tag> : null}
                    {recipe.leftoversFreeze ? <Tag>freezes</Tag> : null}
                    {recipe.source === "llm" ? <Badge tone="neutral">generated</Badge> : null}
                  </div>
                </div>

                {isOpen ? (
                  <div className="mt-3 border-t border-hairline pt-3">
                    <Eyebrow className="mb-2">Per serving</Eyebrow>
                    <ul className="space-y-1">
                      {recipe.ingredients.map((item) => (
                        <li
                          key={item.name}
                          className="flex items-baseline justify-between gap-3 font-mono text-micro"
                        >
                          <span className="min-w-0 truncate text-fg-muted">
                            {item.name}
                            {item.note ? <span className="text-fg-faint"> ({item.note})</span> : null}
                          </span>
                          <span className="shrink-0 tabular-nums text-fg">
                            {formatGrams(item.grams)}
                            {item.isScalable && item.minGrams != null && item.maxGrams != null ? (
                              <span className="text-fg-faint">
                                {" "}
                                ({formatGrams(item.minGrams)}–{formatGrams(item.maxGrams)})
                              </span>
                            ) : null}
                          </span>
                        </li>
                      ))}
                    </ul>
                    {recipe.method ? (
                      <>
                        <Eyebrow className="mt-3 mb-1">Method</Eyebrow>
                        <p className="text-caption whitespace-pre-line text-fg-muted">
                          {recipe.method}
                        </p>
                      </>
                    ) : null}
                  </div>
                ) : null}

                <div className="mt-3 flex gap-2">
                  <Button
                    size="sm"
                    variant={recipe.isFavourite ? "primary" : "secondary"}
                    disabled={isPending}
                    onClick={() =>
                      startTransition(async () => {
                        await toggleFavouriteRecipe(recipe.id);
                        router.refresh();
                      })
                    }
                  >
                    {recipe.isFavourite ? "★ Favourite" : "☆ Favourite"}
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    disabled={isPending}
                    onClick={() =>
                      startTransition(async () => {
                        await archiveRecipe(recipe.id);
                        router.refresh();
                      })
                    }
                  >
                    Archive
                  </Button>
                </div>
              </Card>
            </li>
          );
        })}
      </ul>

      <Hint>
        Favourites get a small bonus in the optimiser, so the week drifts towards things you
        actually like without ever overriding what the shop costs.
      </Hint>
    </div>
  );
}
