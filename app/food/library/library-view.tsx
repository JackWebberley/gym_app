"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addAlias, deleteSavedFood, updateSavedFood } from "@/lib/nutrition-actions";
import { Button, Card, Eyebrow, Hint, Input, Note, Tag, cx } from "@/components/ui";

type SavedFood = {
  id: string;
  name: string;
  aliases: string[];
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  timesLogged: number;
};

export function LibraryView({ foods }: { foods: SavedFood[] }) {
  const router = useRouter();
  const [filter, setFilter] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const visible = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    if (!needle) return foods;
    return foods.filter(
      (f) =>
        f.name.toLowerCase().includes(needle) ||
        f.aliases.some((a) => a.toLowerCase().includes(needle)),
    );
  }, [foods, filter]);

  return (
    <div className="space-y-5 px-4">
      <Input
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="Search your foods"
      />

      {error ? <Note tone="danger">{error}</Note> : null}

      {foods.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line px-4 py-8 text-center text-body-sm text-fg-muted">
          Nothing saved yet. Everything you log is filed here automatically.
        </p>
      ) : (
        <ul className="space-y-2">
          {visible.map((food) => (
            <li key={food.id}>
              <Card className="p-4">
                <button
                  type="button"
                  onClick={() => setEditing(editing === food.id ? null : food.id)}
                  className="flex w-full items-start justify-between gap-3 text-left"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-body-sm font-medium text-fg-strong">
                      {food.name}
                    </span>
                    <span className="block font-mono text-micro tracking-wide text-fg-faint">
                      {food.calories} KCAL · {food.proteinG.toFixed(1)}P ·{" "}
                      {food.carbsG.toFixed(0)}C · {food.fatG.toFixed(0)}F
                    </span>
                  </span>
                  <Tag>{food.timesLogged}×</Tag>
                </button>

                {food.aliases.length > 0 ? (
                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    {food.aliases.map((alias) => (
                      <Tag key={alias}>{alias}</Tag>
                    ))}
                  </div>
                ) : null}

                {editing === food.id ? (
                  <EditForm
                    food={food}
                    isPending={isPending}
                    onSave={(patch) => {
                      setError(null);
                      startTransition(async () => {
                        try {
                          await updateSavedFood({ id: food.id, ...patch });
                          setEditing(null);
                          router.refresh();
                        } catch (e) {
                          setError(e instanceof Error ? e.message : "Could not save.");
                        }
                      });
                    }}
                    onAddAlias={(alias) => {
                      startTransition(async () => {
                        await addAlias({ id: food.id, alias });
                        router.refresh();
                      });
                    }}
                    onDelete={() => {
                      if (!confirm(`Remove "${food.name}" from your library?`)) return;
                      startTransition(async () => {
                        await deleteSavedFood(food.id);
                        setEditing(null);
                        router.refresh();
                      });
                    }}
                  />
                ) : null}
              </Card>
            </li>
          ))}
        </ul>
      )}

      {foods.length > 0 && visible.length === 0 ? (
        <p className="py-6 text-center text-body-sm text-fg-muted">Nothing matches that search.</p>
      ) : null}
    </div>
  );
}

function EditForm({
  food,
  isPending,
  onSave,
  onAddAlias,
  onDelete,
}: {
  food: SavedFood;
  isPending: boolean;
  onSave: (patch: {
    name: string;
    calories: number;
    proteinG: number;
    carbsG: number;
    fatG: number;
  }) => void;
  onAddAlias: (alias: string) => void;
  onDelete: () => void;
}) {
  const [name, setName] = useState(food.name);
  const [calories, setCalories] = useState(String(food.calories));
  const [protein, setProtein] = useState(String(food.proteinG));
  const [carbs, setCarbs] = useState(String(food.carbsG));
  const [fat, setFat] = useState(String(food.fatG));
  const [alias, setAlias] = useState("");

  return (
    <div className="mt-4 space-y-3 border-t border-hairline pt-4">
      <Input value={name} onChange={(e) => setName(e.target.value)} />

      <div className="grid grid-cols-4 gap-2">
        <NumField label="kcal" value={calories} onChange={setCalories} />
        <NumField label="protein" value={protein} onChange={setProtein} />
        <NumField label="carbs" value={carbs} onChange={setCarbs} />
        <NumField label="fat" value={fat} onChange={setFat} />
      </div>

      <div>
        <Eyebrow className="mb-1.5">Also called</Eyebrow>
        <div className="flex gap-2">
          <Input
            value={alias}
            onChange={(e) => setAlias(e.target.value)}
            placeholder="shake"
            className="flex-1"
          />
          <Button
            variant="secondary"
            disabled={!alias.trim() || isPending}
            onClick={() => {
              onAddAlias(alias);
              setAlias("");
            }}
          >
            Add
          </Button>
        </div>
        <Hint>A phrasing that should resolve here instantly, with no API call.</Hint>
      </div>

      <div className="flex gap-2">
        <Button
          variant="accent"
          className="flex-1"
          disabled={isPending}
          onClick={() =>
            onSave({
              name,
              calories: Number(calories),
              proteinG: Number(protein),
              carbsG: Number(carbs),
              fatG: Number(fat),
            })
          }
        >
          Save
        </Button>
        <Button variant="danger" disabled={isPending} onClick={onDelete}>
          Delete
        </Button>
      </div>
    </div>
  );
}

function NumField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-micro font-medium tracking-caps text-fg-muted uppercase">
        {label}
      </span>
      <input
        value={value}
        inputMode="decimal"
        onChange={(e) => onChange(e.target.value)}
        className={cx(
          "h-(--control-h-md) w-full rounded-md border border-line bg-card text-center font-mono text-body-sm text-fg-strong outline-none transition-colors duration-(--dur-fast) focus:border-line-accent",
        )}
      />
    </label>
  );
}
