import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { authorizeUrl, isConfigured } from "@/lib/strava/api";
import { BASE_PATH } from "@/lib/auth";

/// Starts the OAuth dance.
///
/// A route rather than a link so the redirect URI is built from the request's
/// own origin — the app runs on localhost and on the real domain, and Strava
/// insists the URI matches what it sends you back to.

export const dynamic = "force-dynamic";

export const STATE_COOKIE = "strava_oauth_state";

export function callbackUrl(request: NextRequest): string {
  return `${request.nextUrl.origin}${BASE_PATH}/api/strava/callback`;
}

export async function GET(request: NextRequest) {
  if (!isConfigured()) {
    return NextResponse.redirect(new URL(`${BASE_PATH}/strava?error=unconfigured`, request.nextUrl.origin));
  }

  // Guards the callback against being replayed from somewhere else. Read once
  // and deleted, so a stale tab cannot complete a connection later.
  const state = crypto.randomUUID();
  (await cookies()).set(STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: BASE_PATH,
    maxAge: 600,
  });

  return NextResponse.redirect(authorizeUrl(callbackUrl(request), state));
}
