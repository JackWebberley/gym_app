"use client";

import { useMemo, useRef, useState } from "react";
import {
  groupByMuscle,
  mostUsed,
  searchExercises,
  type Searchable,
} from "@/lib/exercise-search";
import { Button, Card, Eyebrow, Tag, cx } from "@/components/ui";

/// Picking an exercise mid-session.
///
/// This was a `<select>` of every movement in the library, which is fine at ten
/// and unusable at eighty — you know exactly what you want and still have to
/// scroll past sixty things to reach it. Typing three letters is faster than any
/// amount of scrolling, so the field is the interface and the list is the
/// fallback.
///
/// Three states, in the order you need them: what you do most, then a browsable
/// list grouped by muscle, then ranked matches once you start typing.

export type PickerExercise = Searchable & { restSeconds: number };

export function ExercisePicker({
  library,
  addedIds,
  onPick,
  onCancel,
}: {
  library: PickerExercise[];
  /** Already in this session — shown, but not addable twice. */
  addedIds: Set<string>;
  onPick: (exercise: PickerExercise) => void;
  onCancel: () => void;
}) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const results = useMemo(() => searchExercises(library, query), [library, query]);
  const sections = useMemo(() => groupByMuscle(library), [library]);
  const popular = useMemo(() => mostUsed(library), [library]);

  const searching = query.trim() !== "";
  // Enter takes the top match, which is the whole point of ranking them.
  const top = results.find((e) => !addedIds.has(e.id)) ?? null;

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <Eyebrow>Add an exercise</Eyebrow>
        <button
          type="button"
          onClick={onCancel}
          className="text-caption text-fg-faint underline-offset-2 hover:text-fg-strong hover:underline"
        >
          Cancel
        </button>
      </div>

      <div className="relative">
        <input
          ref={inputRef}
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              query === "" ? onCancel() : setQuery("");
            }
            if (e.key === "Enter" && top) {
              e.preventDefault();
              onPick(top);
            }
          }}
          type="search"
          enterKeyHint="done"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          placeholder={`Search ${library.length} exercises…`}
          aria-label="Search exercises"
          // The native search clear button would sit on top of ours.
          className="h-(--control-h-lg) w-full rounded-md border border-line bg-card pr-9 pl-3 text-body-md text-fg-strong outline-none transition-colors duration-(--dur-fast) placeholder:text-fg-faint focus:border-line-accent [&::-webkit-search-cancel-button]:hidden"
        />
        {query ? (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => {
              setQuery("");
              inputRef.current?.focus();
            }}
            className="absolute inset-y-0 right-0 flex w-9 items-center justify-center text-fg-faint hover:text-fg-strong"
          >
            ✕
          </button>
        ) : null}
      </div>

      <div className="mt-3 max-h-[46vh] overflow-y-auto overscroll-contain">
        {searching ? (
          results.length === 0 ? (
            <p className="px-1 py-6 text-center text-body-sm text-fg-muted">
              Nothing matches “{query.trim()}”.{" "}
              <span className="text-fg-faint">Try the muscle group, or the equipment.</span>
            </p>
          ) : (
            <ul className="space-y-1">
              {results.map((exercise) => (
                <Row
                  key={exercise.id}
                  exercise={exercise}
                  added={addedIds.has(exercise.id)}
                  onPick={onPick}
                />
              ))}
            </ul>
          )
        ) : (
          <>
            {popular.length > 0 ? (
              <section className="mb-3">
                <Eyebrow className="mb-1.5">Most used</Eyebrow>
                <ul className="space-y-1">
                  {popular.map((exercise) => (
                    <Row
                      key={exercise.id}
                      exercise={exercise}
                      added={addedIds.has(exercise.id)}
                      onPick={onPick}
                    />
                  ))}
                </ul>
              </section>
            ) : null}

            {sections.map((section) => (
              <section key={section.key} className="mb-3">
                {/* Sticky, because by the time you have scrolled into the middle
                    of a group the heading that told you what it was is gone. */}
                <Eyebrow className="sticky top-0 z-10 mb-1.5 bg-card py-1">{section.label}</Eyebrow>
                <ul className="space-y-1">
                  {section.items.map((exercise) => (
                    <Row
                      key={exercise.id}
                      exercise={exercise}
                      added={addedIds.has(exercise.id)}
                      onPick={onPick}
                    />
                  ))}
                </ul>
              </section>
            ))}
          </>
        )}
      </div>
    </Card>
  );
}

function Row({
  exercise,
  added,
  onPick,
}: {
  exercise: PickerExercise;
  added: boolean;
  onPick: (exercise: PickerExercise) => void;
}) {
  return (
    <li>
      <button
        type="button"
        disabled={added}
        onClick={() => onPick(exercise)}
        className={cx(
          "flex w-full items-center gap-3 rounded-md px-2 py-2 text-left transition-colors duration-(--dur-fast)",
          added ? "cursor-default opacity-45" : "hover:bg-sunken active:bg-sunken",
        )}
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate text-body-sm font-medium text-fg-strong">
            {exercise.name}
          </span>
          <span className="mt-0.5 block font-mono text-micro tracking-wide text-fg-faint uppercase">
            {exercise.muscleGroup}
            {exercise.equipment ? ` · ${exercise.equipment}` : ""}
          </span>
        </span>
        {added ? <Tag>added</Tag> : <span className="shrink-0 text-fg-faint">+</span>}
      </button>
    </li>
  );
}
