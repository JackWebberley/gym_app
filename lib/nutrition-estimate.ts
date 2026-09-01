import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { MODEL, createClient, isConfigured, withFriendlyErrors } from "./anthropic";
import { MissingApiKeyError } from "./anthropic-config";
import { EstimateSchema, buildSystemBlocks, type MacroEstimate, type SavedFoodForPrompt } from "./nutrition";

/// The macro estimation API call (spec §5.2), kept in its own module because
/// importing it pulls the Anthropic SDK. `estimateEntry` loads this lazily, so
/// logging a saved food — which never touches the API — does not pay for it.

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
