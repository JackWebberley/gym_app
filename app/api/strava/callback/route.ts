import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { connectWithCode } from "@/lib/strava/api";
import { backfillRecent } from "@/lib/strava/sync";
import { BASE_PATH } from "@/lib/auth";
import { STATE_COOKIE } from "../connect/route";

/// Where Strava sends you back to.
///
/// Behind the passcode like everything else: this is a top-level navigation in
/// the browser that just came from the app, and the session cookie is sameSite
/// lax, so it arrives with the request.

export const dynamic = "force-dynamic";

function back(request: NextRequest, params: Record<string, string>): NextResponse {
  const url = new URL(`${BASE_PATH}/strava`, request.nextUrl.origin);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return NextResponse.redirect(url);
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const jar = await cookies();
  const expectedState = jar.get(STATE_COOKIE)?.value;
  jar.delete({ name: STATE_COOKIE, path: BASE_PATH });

  const error = params.get("error");
  // The most likely "error" by far is you pressing Cancel on Strava's screen.
  if (error) return back(request, { error: error === "access_denied" ? "cancelled" : error });

  const code = params.get("code");
  const state = params.get("state");
  if (!code) return back(request, { error: "nocode" });
  if (!state || !expectedState || state !== expectedState) return back(request, { error: "state" });

  const granted = params.get("scope") ?? "";
  if (!granted.includes("activity:read")) {
    // Strava lets you untick the activity boxes on the consent screen, which
    // leaves a connection that can see nothing.
    return back(request, { error: "scope" });
  }

  try {
    await connectWithCode(code, granted);
  } catch (e) {
    return back(request, { error: "exchange", detail: e instanceof Error ? e.message : "unknown" });
  }

  // Pull in what is already there, so the screen has something on it straight
  // away rather than waiting for the next workout.
  try {
    const { imported } = await backfillRecent();
    return back(request, { connected: "1", imported: String(imported) });
  } catch {
    // Connected is connected; the backfill can be retried from the screen.
    return back(request, { connected: "1", imported: "0" });
  }
}
