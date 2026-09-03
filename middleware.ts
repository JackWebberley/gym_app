import { NextResponse, type NextRequest } from "next/server";
import { AUTH_COOKIE, verifyToken } from "@/lib/auth";

/// Gates every page and server action behind the passcode. Runs before any route
/// handler, so an unauthenticated request never reaches the database.

export async function middleware(request: NextRequest) {
  const token = request.cookies.get(AUTH_COOKIE)?.value;

  if (await verifyToken(token, process.env.AUTH_SECRET)) {
    return NextResponse.next();
  }

  // Server actions arrive as POSTs to the page they were invoked from. Redirecting
  // those would silently swallow the mutation, so answer plainly instead and let
  // the client surface it.
  if (request.method === "POST") {
    return new NextResponse("Session expired. Reload and enter the passcode again.", {
      status: 401,
    });
  }

  const login = request.nextUrl.clone();
  login.pathname = "/login";
  login.search = "";
  // Send them back where they were heading once they are in.
  const intended = request.nextUrl.pathname + request.nextUrl.search;
  if (intended && intended !== "/") login.searchParams.set("next", intended);

  return NextResponse.redirect(login);
}

export const config = {
  matcher: [
    // The index route is not covered by the catch-all pattern below in Next's
    // matcher semantics, and without this the home screen serves unauthenticated.
    "/",
    /*
     * Everything except:
     *   login            — the gate itself
     *   api/strava/webhook — Strava cannot log in. Safe to leave open: it
     *                      accepts no data, only an activity id, and acts
     *                      solely on what Strava's own API returns for it.
     *                      It checks Strava's verify token on the handshake
     *                      and the athlete id on every event.
     *   _next/static     — hashed build assets, no data in them
     *   _next/image      — image optimiser
     *   favicon, icons, manifest — requested before the cookie exists
     */
    "/((?!login|api/strava/webhook|_next/static|_next/image|favicon|icon|apple-icon|manifest|robots|sitemap).*)",
  ],
};
