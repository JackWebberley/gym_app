import Anthropic from "@anthropic-ai/sdk";

/// Spec §11 asks that one place own the Anthropic API. That was written when
/// estimation was the only use for it; §8.3 adds a second, genuinely different
/// one (generating candidate recipes). Rather than bolt recipes onto
/// `estimateMacros`, the *client* lives here and there are exactly two callers:
/// `lib/nutrition.ts` and `lib/meal/generate.ts`. Nothing else may construct one.

export const MODEL = "claude-opus-5";

/** Thrown when no API key is configured, so the UI can point at the manual path. */
export class MissingApiKeyError extends Error {
  constructor(fallback: string) {
    super(`No ANTHROPIC_API_KEY configured. Add it to .env — ${fallback}`);
    this.name = "MissingApiKeyError";
  }
}

export function isConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

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
