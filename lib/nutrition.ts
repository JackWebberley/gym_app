import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import {
  MODEL,
  MissingApiKeyError,
  createClient,
  isConfigured,
  withFriendlyErrors,
} from "./anthropic";

/// Macro estimation from natural language (spec §5.2). One of exactly two modules
/// allowed to call the Anthropic API — the client itself lives in lib/anthropic.ts,
/// which is how §11's "one place owns the API" survives a second, genuinely
/// different use of it in lib/meal/generate.ts. Everything else goes through
/// `estimateMacros`.

export { MissingApiKeyError };

/// Portion size is where nearly all the estimation error lives, so the schema
/// forces an explicit assumption and confidence for every item rather than
/// letting them be buried in prose.
const ItemSchema = z.object({
  name: z.string().describe("Canonical name including the portion, e.g. 'Banana (medium, ~118g)'"),
  quantity: z.string().describe("The quantity as described, or as assumed"),
  calories: z.number().int(),
  protein_g: z.number(),
  carbs_g: z.number(),
  fat_g: z.number(),
  assumption: z
    .string()
    .nullable()
    .describe("What you assumed if it was unstated, else null"),
  confidence: z.enum(["high", "medium", "low"]),
});

const EstimateSchema = z.object({
  items: z.array(ItemSchema),
  clarification_needed: z
    .string()
    .nullable()
    .describe("A single question, or null. Only when the ambiguity is worth >150 kcal."),
});

export type EstimatedItem = z.infer<typeof ItemSchema>;
export type MacroEstimate = z.infer<typeof EstimateSchema>;

export type SavedFoodForPrompt = {
  name: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
};

const SYSTEM_PROMPT = `You estimate nutritional macros from natural language food descriptions.

Rules:
- UK products and portion conventions unless stated otherwise.
- If a portion is unstated, assume a typical serving and record exactly what you assumed in "assumption". If the portion was stated, "assumption" is null.
- Only set clarification_needed when the ambiguity is worth more than ~150 kcal (e.g. "a curry", "some chicken"). Otherwise assume and move on.
- Round calories to the nearest 5.
- Split a description into one item per distinct food. "Two weetabix with a protein shake" is two items, not one.
- Set confidence to "low" when the description names a composite or restaurant dish whose recipe you cannot know.`;

/**
 * Renders the user's personal library into the prompt so recurring items resolve
 * to their own corrected values rather than being re-guessed (spec §5.2).
 * Capped by the caller at the ~40 most-logged entries to keep the prompt small.
 */
function libraryBlock(savedFoods: SavedFoodForPrompt[]): string {
  if (savedFoods.length === 0) return "";
  const lines = savedFoods.map(
    (f) => `- ${f.name}: ${f.calories} kcal, ${f.proteinG}p, ${f.carbsG}c, ${f.fatG}f`,
  );
  return `\n\nThis user has corrected values for the foods below. When the description refers to one of these, use these exact numbers and set confidence to "high" — they are measured, not estimated.\n${lines.join("\n")}`;
}

export type SystemBlock = { type: "text"; text: string; cache_control?: { type: "ephemeral" } };

/**
 * The system prompt, plus the personal library when there is one.
 *
 * The library block is omitted entirely when empty rather than sent as an empty
 * string — the API rejects an empty text block with a 400, and on a fresh install
 * the library is always empty, so that path is the *first* one a user hits.
 */
export function buildSystemBlocks(savedFoods: SavedFoodForPrompt[]): SystemBlock[] {
  const blocks: SystemBlock[] = [
    // Stable prefix first, so the library and the description are the only parts
    // that vary between requests and the cache keeps hitting.
    { type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
  ];

  const library = libraryBlock(savedFoods);
  if (library) blocks.push({ type: "text", text: library });

  return blocks;
}

/**
 * Estimates macros for a free-text meal description.
 *
 * Callers should try `resolveFromLibrary` first — a match there costs nothing and
 * is exactly right, so the model only ever sees genuinely novel meals (spec §5.3).
 */
export async function estimateMacros(
  description: string,
  savedFoods: SavedFoodForPrompt[] = [],
): Promise<MacroEstimate> {
  if (!isConfigured()) {
    throw new MissingApiKeyError("manual entry and your saved library still work without it.");
  }

  const client = createClient();

  const response = await withFriendlyErrors(() => client.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    // Low effort: this is a short extraction, and the app's first principle is
    // that logging must be faster than not logging (spec §1).
    output_config: {
      effort: "low",
      format: zodOutputFormat(EstimateSchema),
    },
    system: buildSystemBlocks(savedFoods),
    messages: [{ role: "user", content: description }],
  }));

  if (response.stop_reason === "refusal") {
    throw new Error("The model declined to estimate that. Try rephrasing, or log it manually.");
  }

  const parsed = response.parsed_output;
  if (!parsed) throw new Error("Could not read the estimate. Try again, or log it manually.");

  return parsed;
}

/** Normalised form used for library matching: case, punctuation and spacing insensitive. */
export function normaliseFoodName(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export type LibraryEntry = SavedFoodForPrompt & { id: string; aliases: string[] };

/**
 * Deterministic resolution against the personal library — no API call, instant,
 * free, and exactly right (spec §5.3). Matches the whole description against a
 * saved food's canonical name or any of its recorded phrasings.
 */
export function resolveFromLibrary(
  description: string,
  library: LibraryEntry[],
): LibraryEntry | null {
  const needle = normaliseFoodName(description);
  if (!needle) return null;

  for (const food of library) {
    if (normaliseFoodName(food.name) === needle) return food;
    if (food.aliases.some((alias) => normaliseFoodName(alias) === needle)) return food;
  }
  return null;
}

/** Calories rounded to the nearest 5, matching the estimation contract. */
export function roundCalories(kcal: number): number {
  return Math.round(kcal / 5) * 5;
}
