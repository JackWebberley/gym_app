/// The parts of the Anthropic integration that do **not** need the SDK.
///
/// This split exists for a specific reason. `@anthropic-ai/sdk` is 6.6MB in the
/// server bundle, and it was reaching the module graph of almost everything:
/// `isConfigured()` — which only reads an environment variable — was pulling the
/// whole HTTP client into every Meals page render, and `MissingApiKeyError` was
/// pulling it into every meal and nutrition mutation. Marking a meal as cooked
/// should not instantiate an API client.
///
/// So: anything that needs the SDK imports `./anthropic`, and everything else
/// imports this. The two API-calling modules load the real client lazily.

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
