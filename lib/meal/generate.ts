import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { MODEL, MissingApiKeyError, createClient, isConfigured, withFriendlyErrors } from "../anthropic";
import type { IngredientSpec, MealType } from "./types";

/// Candidate recipe generation (spec §8.3, step 1).
///
/// The division of labour matters more here than anywhere else in the app:
/// **the model writes recipes, and never does arithmetic** (spec §8.1). It
/// returns ingredient names and gram quantities; macros, pack maths, costs and
/// waste are all computed from our own Ingredient table afterwards. Asking a
/// language model to optimise a shop produces plausible numbers that are wrong,
/// and wrong in ways nobody notices until the food arrives.
///
/// It is also only ever asked for what the library could not supply, and it is
/// asked for it from a basket we chose — the pantry, plus whatever the tier-one
/// candidates already commit us to buying. That is what makes generated recipes
/// share ingredients with the rest of the week instead of dragging in a new shop.

const GeneratedLineSchema = z.object({
  ingredient: z
    .string()
    .describe(
      "Ingredient name. Use a name from the provided list wherever one fits, spelled exactly as given.",
    ),
  grams: z.number().describe("Grams for ONE portion of about the stated calorie target"),
  is_scalable: z
    .boolean()
    .describe(
      "True for a component whose amount can be adjusted to tune the portion size — the protein, the carb. False for aromatics, seasoning, and anything where the amount is structural.",
    ),
  min_grams: z.number().nullable().describe("Lower bound if scalable, else null"),
  max_grams: z.number().nullable().describe("Upper bound if scalable, else null"),
  note: z.string().nullable().describe("'dry weight', 'diced' — else null"),
});

const GeneratedRecipeSchema = z.object({
  name: z.string().describe("Short, specific dish name"),
  meal_type: z.enum(["breakfast", "lunch", "dinner", "snack"]),
  prep_minutes: z.number().int(),
  batch_friendly: z
    .boolean()
    .describe("Can be cooked once in a larger quantity and eaten across several meals"),
  leftovers_freeze: z.boolean().describe("Cooked portions freeze and reheat well"),
  keeps_days: z.number().int().describe("Days a cooked portion keeps in the fridge"),
  method: z.string().describe("Markdown, numbered steps, terse"),
  ingredients: z.array(GeneratedLineSchema),
});

const GenerationSchema = z.object({
  recipes: z.array(GeneratedRecipeSchema),
  /// Ingredients the model needed that were not in our table. Surfaced rather
  /// than silently invented, because a missing ingredient means missing pack
  /// data, which means the optimiser is guessing (spec §8.9).
  new_ingredients: z.array(
    z.object({
      name: z.string(),
      aisle: z.enum([
        "produce",
        "meat",
        "fish",
        "dairy",
        "bakery",
        "dry",
        "tinned",
        "frozen",
        "condiment",
      ]),
      is_staple: z.boolean(),
      shelf_life_days: z.number().int(),
      freezable: z.boolean(),
      unit_grams: z.number().nullable().describe("Weight of one typical unit, else null"),
      kcal_per_100g: z.number(),
      protein_per_100g: z.number(),
      carbs_per_100g: z.number(),
      fat_per_100g: z.number(),
      typical_pack: z
        .object({
          label: z.string().describe("UK supermarket pack, e.g. '400g tin'"),
          grams: z.number(),
          price_gbp: z.number().nullable(),
          is_divisible: z.boolean().describe("True for loose produce sold by weight"),
        })
        .describe("The pack size this is usually sold in"),
    }),
  ),
});

export type GeneratedRecipe = z.infer<typeof GeneratedRecipeSchema>;
export type GeneratedIngredient = z.infer<typeof GenerationSchema>["new_ingredients"][number];
export type Generation = z.infer<typeof GenerationSchema>;

const SYSTEM_PROMPT = `You write recipes for a UK household meal planner.

You do NOT plan the week, cost the shop, or compute nutrition. Downstream code
does all of that from its own ingredient database. Your only job is to produce
plausible, genuinely cookable recipes using the ingredients you are given.

Rules:
- UK ingredients, UK supermarket availability, UK portion conventions.
- Reuse the listed ingredients wherever possible, spelled EXACTLY as listed. Every
  ingredient you reuse rather than introduce makes the week cheaper, because its
  pack is already being bought.
- Only add a new ingredient when a dish genuinely needs it, and then declare it in
  new_ingredients with its typical UK pack size.
- Quantities are for ONE portion at roughly the stated calorie target. Do not
  attempt to hit the target precisely — mark the protein and the carbohydrate
  scalable with sensible bounds and the planner will tune them.
- Mark as scalable only what a person would actually adjust: the chicken, the
  rice, the pasta. Never the aromatics, the seasoning, or a binding agent.
- Prefer dishes that batch and reheat. Say so honestly in batch_friendly and
  leftovers_freeze; do not claim a salad freezes.
- Keep methods terse. Numbered steps, no preamble, no serving suggestions.`;

export type GenerationRequest = {
  /** What the library could not fill. */
  need: { mealType: MealType; count: number; targetKcal: number; minProteinG: number }[];
  /** The ingredient table, so the model reuses names we can resolve. */
  known: IngredientSpec[];
  /** Ingredients already committed by the rest of the week, strongly preferred. */
  committedIngredientIds: string[];
  /** In the fridge already, and expiring. The strongest preference of all. */
  pantryIngredientIds: string[];
  avoidIngredientNames: string[];
  maxPrepMinutes: number | null;
};

/**
 * Renders the ingredient basket into the prompt.
 *
 * Committed and pantry ingredients are called out separately rather than mixed
 * into one list, because "prefer these" and "these are already paid for" are
 * different instructions and the second is much stronger.
 */
export function buildGenerationPrompt(request: GenerationRequest): string {
  const byId = new Map(request.known.map((i) => [i.id, i]));
  const nameOf = (id: string) => byId.get(id)?.name;

  const pantryNames = request.pantryIngredientIds.map(nameOf).filter(Boolean);
  const committedNames = request.committedIngredientIds
    .map(nameOf)
    .filter((n): n is string => Boolean(n) && !pantryNames.includes(n));

  const sections: string[] = [];

  sections.push(
    request.need
      .map(
        (n) =>
          `- ${n.count} × ${n.mealType}, about ${Math.round(n.targetKcal)} kcal per portion, at least ${Math.round(n.minProteinG)}g protein`,
      )
      .join("\n"),
  );

  if (pantryNames.length > 0) {
    sections.push(
      `ALREADY IN THE FRIDGE — using these costs nothing and stops them going to waste. Build around them first:\n${pantryNames.join(", ")}`,
    );
  }
  if (committedNames.length > 0) {
    sections.push(
      `ALREADY BEING BOUGHT this week for other meals — reusing these is close to free, because the pack is purchased either way:\n${committedNames.join(", ")}`,
    );
  }

  const otherNames = request.known
    .map((i) => i.name)
    .filter((n) => !pantryNames.includes(n) && !committedNames.includes(n));
  if (otherNames.length > 0) {
    sections.push(`KNOWN INGREDIENTS (safe to use, pack data on file):\n${otherNames.join(", ")}`);
  }

  if (request.avoidIngredientNames.length > 0) {
    sections.push(`DO NOT USE: ${request.avoidIngredientNames.join(", ")}`);
  }
  if (request.maxPrepMinutes != null) {
    sections.push(`Keep prep under ${request.maxPrepMinutes} minutes where you can.`);
  }

  return `Write recipes for:\n${sections.join("\n\n")}`;
}

/**
 * Asks for the recipes the library could not supply.
 *
 * Returns an empty generation rather than throwing when there is nothing to ask
 * for — a well-stocked library should reach the API zero times, and that is the
 * normal case after a few weeks, not an error.
 */
export async function generateRecipes(request: GenerationRequest): Promise<Generation> {
  const wanted = request.need.reduce((n, x) => n + x.count, 0);
  if (wanted <= 0) return { recipes: [], new_ingredients: [] };

  if (!isConfigured()) {
    throw new MissingApiKeyError(
      "the planner can still build a menu from recipes already in your library.",
    );
  }

  const client = createClient();

  const response = await withFriendlyErrors(() =>
    client.messages.parse({
      model: MODEL,
      max_tokens: 32000,
      output_config: {
        // Higher effort than macro estimation: this one is a genuine design task
        // with constraints to satisfy, not a short extraction.
        effort: "medium",
        format: zodOutputFormat(GenerationSchema),
      },
      system: [
        // Stable prefix first so the cache keeps hitting across rerolls, where
        // only the basket and the shortfall change.
        { type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
      ],
      messages: [{ role: "user", content: buildGenerationPrompt(request) }],
    }),
  );

  if (response.stop_reason === "refusal") {
    throw new Error("The model declined to write those recipes. Try a different brief.");
  }

  const parsed = response.parsed_output;
  if (!parsed) throw new Error("Could not read the generated recipes. Try again.");

  return parsed;
}

/** Normalised form for matching a generated ingredient name to the table. */
export function normaliseIngredientName(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Resolves a generated ingredient name against the table.
 *
 * Exact match on the normalised name, then a singular/plural fallback. Nothing
 * fuzzier than that on purpose: a wrong match silently attributes the wrong
 * macros and the wrong pack size to a dish, and a missed match merely asks the
 * user a question.
 */
export function resolveIngredientName(
  name: string,
  known: IngredientSpec[],
): IngredientSpec | null {
  const needle = normaliseIngredientName(name);
  if (!needle) return null;

  for (const ingredient of known) {
    if (normaliseIngredientName(ingredient.name) === needle) return ingredient;
  }

  const depluralised = needle.endsWith("es")
    ? needle.slice(0, -2)
    : needle.endsWith("s")
      ? needle.slice(0, -1)
      : `${needle}s`;

  for (const ingredient of known) {
    const candidate = normaliseIngredientName(ingredient.name);
    if (candidate === depluralised) return ingredient;
  }

  return null;
}
