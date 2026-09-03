import { db } from "../db";

/// Talking to Strava. Plain fetch — the official SDK is a Node-oriented bundle
/// and this is four endpoints on a Worker with a 3MiB ceiling.

const OAUTH_BASE = "https://www.strava.com/oauth";
const API_BASE = "https://www.strava.com/api/v3";

const ACCOUNT_ID = "singleton";

/// Read-only, and the whole history rather than only public activities: a run
/// marked "only you" still moves the calorie target. No write scope — nothing
/// here ever posts to Strava.
export const SCOPE = "read,activity:read_all";

/// Refresh this far before the token actually dies, so a request never loses a
/// race with its own expiry.
const REFRESH_MARGIN_MS = 5 * 60 * 1000;

export class StravaNotConfigured extends Error {}
export class StravaNotConnected extends Error {}

export function credentials(): { clientId: string; clientSecret: string } {
  const clientId = process.env.STRAVA_CLIENT_ID;
  const clientSecret = process.env.STRAVA_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new StravaNotConfigured(
      "STRAVA_CLIENT_ID and STRAVA_CLIENT_SECRET are not set on the Worker.",
    );
  }
  return { clientId, clientSecret };
}

export function isConfigured(): boolean {
  return Boolean(process.env.STRAVA_CLIENT_ID && process.env.STRAVA_CLIENT_SECRET);
}

/**
 * The token Strava sends with the webhook validation handshake, so a stranger
 * who guesses the callback URL cannot register themselves against it.
 *
 * Derived from AUTH_SECRET rather than being another thing to set and keep in
 * step: it has to be stable across deploys, and it already is.
 */
export async function verifyToken(): Promise<string> {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not set; cannot derive the Strava verify token.");
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode("strava-webhook"));
  return [...new Uint8Array(signature)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 32);
}

export function authorizeUrl(redirectUri: string, state: string): string {
  const { clientId } = credentials();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    // Strava will not re-prompt without this once you have approved before,
    // which makes re-connecting with a different scope silently do nothing.
    approval_prompt: "auto",
    scope: SCOPE,
    state,
  });
  return `${OAUTH_BASE}/authorize?${params}`;
}

type TokenResponse = {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  scope?: string;
  athlete?: { id: number; firstname?: string; lastname?: string };
};

async function postToken(body: Record<string, string>): Promise<TokenResponse> {
  const { clientId, clientSecret } = credentials();
  const response = await fetch(`${OAUTH_BASE}/token`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, ...body }),
  });

  if (!response.ok) {
    throw new Error(`Strava rejected the token request (${response.status}): ${await response.text()}`);
  }
  return response.json();
}

/** Exchanges the code from the OAuth redirect and stores the account. */
export async function connectWithCode(code: string, scope: string) {
  const token = await postToken({ code, grant_type: "authorization_code" });

  const athleteId = String(token.athlete?.id ?? "");
  if (!athleteId) throw new Error("Strava did not say which athlete that was.");

  const athleteName =
    [token.athlete?.firstname, token.athlete?.lastname].filter(Boolean).join(" ") || null;

  const data = {
    athleteId,
    athleteName,
    accessToken: token.access_token,
    refreshToken: token.refresh_token,
    expiresAt: new Date(token.expires_at * 1000),
    scope: token.scope ?? scope,
  };

  return db.stravaAccount.upsert({
    where: { id: ACCOUNT_ID },
    // Reconnecting keeps the subscription: it belongs to the application, not
    // to the token, and re-registering one that exists is an error.
    update: data,
    create: { id: ACCOUNT_ID, ...data },
  });
}

export async function getAccount() {
  return db.stravaAccount.findUnique({ where: { id: ACCOUNT_ID } });
}

/**
 * A usable access token, refreshing first if the current one is close to death.
 *
 * Strava rotates the refresh token on some refreshes, so the response is always
 * written back rather than only the access token.
 */
export async function accessToken(): Promise<string> {
  const account = await getAccount();
  if (!account) throw new StravaNotConnected("Strava is not connected.");

  if (account.expiresAt.getTime() - REFRESH_MARGIN_MS > Date.now()) return account.accessToken;

  const token = await postToken({
    grant_type: "refresh_token",
    refresh_token: account.refreshToken,
  });

  const updated = await db.stravaAccount.update({
    where: { id: ACCOUNT_ID },
    data: {
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      expiresAt: new Date(token.expires_at * 1000),
    },
  });

  return updated.accessToken;
}

async function apiGet<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { authorization: `Bearer ${await accessToken()}` },
  });

  if (response.status === 404) {
    throw new ActivityGone(`Strava has no ${path} any more.`);
  }
  if (!response.ok) {
    throw new Error(`Strava GET ${path} failed (${response.status}): ${await response.text()}`);
  }
  return response.json();
}

/** Thrown when Strava no longer has the activity — deleted, or never visible. */
export class ActivityGone extends Error {}

export type StravaActivityDetail = {
  id: number;
  name: string;
  sport_type: string;
  type?: string;
  start_date: string;
  start_date_local: string;
  distance: number;
  moving_time: number;
  elapsed_time: number;
  total_elevation_gain?: number;
  calories?: number;
  average_heartrate?: number;
  max_heartrate?: number;
};

export async function fetchActivity(id: string): Promise<StravaActivityDetail> {
  return apiGet<StravaActivityDetail>(`/activities/${id}`);
}

/** The most recent activities, for the initial backfill after connecting. */
export async function fetchRecentActivities(perPage = 20): Promise<StravaActivityDetail[]> {
  return apiGet<StravaActivityDetail[]>(`/athlete/activities?per_page=${perPage}`);
}

// ── Webhook subscription ──────────────────────────────────────────────────────
//
// Strava allows exactly one per application, and validates the callback by
// GETting it before the create call returns. So the app has to be deployed and
// reachable at that URL before this can succeed.

type Subscription = { id: number; callback_url: string };

export async function listSubscriptions(): Promise<Subscription[]> {
  const { clientId, clientSecret } = credentials();
  const params = new URLSearchParams({ client_id: clientId, client_secret: clientSecret });
  const response = await fetch(`${API_BASE}/push_subscriptions?${params}`);
  if (!response.ok) {
    throw new Error(`Could not list Strava subscriptions (${response.status}): ${await response.text()}`);
  }
  return response.json();
}

export async function createSubscription(callbackUrl: string): Promise<Subscription> {
  const { clientId, clientSecret } = credentials();
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    callback_url: callbackUrl,
    verify_token: await verifyToken(),
  });

  const response = await fetch(`${API_BASE}/push_subscriptions`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!response.ok) {
    const text = await response.text();
    // Much the most common failure, and the message Strava returns for it is
    // not obviously about this.
    if (text.includes("already exists")) {
      throw new Error(
        "Strava already has a subscription for this application. Delete it first, then try again.",
      );
    }
    throw new Error(`Strava refused the subscription (${response.status}): ${text}`);
  }

  return response.json();
}

export async function deleteSubscription(id: string): Promise<void> {
  const { clientId, clientSecret } = credentials();
  const params = new URLSearchParams({ client_id: clientId, client_secret: clientSecret });
  const response = await fetch(`${API_BASE}/push_subscriptions/${id}?${params}`, {
    method: "DELETE",
  });
  // 404 means it is already gone, which is the state we wanted.
  if (!response.ok && response.status !== 404) {
    throw new Error(`Could not delete the subscription (${response.status}): ${await response.text()}`);
  }
}
