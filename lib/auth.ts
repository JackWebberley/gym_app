/// A passphrase gate, not an auth system. Spec §10: one user, a passphrase is
/// enough — so there are no accounts, no sessions table and no password hashing.
/// What this does buy is that the app is not readable by anyone who finds the URL.
///
/// The passcode itself is never in the repo. It comes from APP_PASSCODE, set as a
/// Worker secret in production and in .env locally.

export const AUTH_COOKIE = "gym_auth";

/** Everything lives under this prefix, so the cookie should too. */
export const BASE_PATH = "/gym";

const SESSION_DAYS = 90;

function encoder() {
  return new TextEncoder();
}

async function hmac(payload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder().encode(payload));
  return [...new Uint8Array(signature)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Compares in constant time, so a wrong guess leaks nothing through timing. */
function equals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function isPasscodeCorrect(input: string, expected: string | undefined): boolean {
  if (!expected) return false;
  return equals(input.trim(), expected.trim());
}

/**
 * `<expiry>.<signature>`. The signature covers the expiry, so the cookie cannot
 * be extended by editing it — a tampered expiry fails verification.
 */
export async function createToken(secret: string): Promise<string> {
  const expiresAt = Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000;
  return `${expiresAt}.${await hmac(String(expiresAt), secret)}`;
}

export async function verifyToken(
  token: string | undefined,
  secret: string | undefined,
): Promise<boolean> {
  if (!token || !secret) return false;

  const separator = token.lastIndexOf(".");
  if (separator < 1) return false;

  const expiresAt = token.slice(0, separator);
  const signature = token.slice(separator + 1);

  const expiry = Number(expiresAt);
  if (!Number.isFinite(expiry) || expiry < Date.now()) return false;

  return equals(signature, await hmac(expiresAt, secret));
}

export const COOKIE_MAX_AGE = SESSION_DAYS * 24 * 60 * 60;
