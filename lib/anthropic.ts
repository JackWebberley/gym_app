import Anthropic from "@anthropic-ai/sdk";

/// The Anthropic client itself. **Importing this module pulls 6.6MB of SDK into
/// whatever imports it**, so only the two modules that genuinely make API calls
/// may do so, and both are loaded lazily by their callers:
///
///   lib/nutrition-estimate.ts   §5.2 macro estimation
///   lib/meal/generate.ts        §8.3 recipe generation
///
/// Everything else — checking whether a key exists, catching a missing-key error
/// — wants `./anthropic-config`, which carries no dependency at all.
///
/// This is how spec §11's "one place owns the API" survives two genuinely
/// different uses of it.

export { MODEL, MissingApiKeyError, isConfigured } from "./anthropic-config";

export function createClient(): Anthropic {
  const workspaceId = process.env.ANTHROPIC_WORKSPACE_ID;

  return new Anthropic({
    // An identity-linked API key is not bound to a single workspace, so every
    // request has to say which workspace it acts in. A workspace-scoped key
    // carries that already and needs no header — hence only set it when present.
    ...(workspaceId ? { defaultHeaders: { "anthropic-workspace-id": workspaceId } } : {}),
  });
}

/**
 * Turns the API's own error text into something actionable in the UI. Without
 * this, a key or config problem surfaces to the user as a raw 400 payload.
 */
export async function withFriendlyErrors<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);

    if (/anthropic-workspace-id/i.test(message)) {
      throw new Error(
        "This API key is identity-linked, so it needs a workspace. Add ANTHROPIC_WORKSPACE_ID=wrkspc_… to .env (Console → Settings → Workspaces), or create a workspace-scoped key instead.",
      );
    }
    if (e instanceof Anthropic.AuthenticationError) {
      throw new Error("ANTHROPIC_API_KEY was rejected. Check the key in .env.");
    }
    if (e instanceof Anthropic.RateLimitError) {
      throw new Error("Rate limited by the API. Wait a moment and try again.");
    }
    if (e instanceof Anthropic.APIConnectionError) {
      throw new Error("Could not reach the API. Check your connection.");
    }
    throw e;
  }
}
