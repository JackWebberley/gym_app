import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getAccount, verifyToken } from "@/lib/strava/api";
import { processPendingEvents } from "@/lib/strava/sync";

/// The Strava webhook.
///
/// The one route in the app that is not behind the passcode, because Strava
/// cannot log in. It is safe to leave open because it accepts nothing: the body
/// is an id, and the only thing acted on is what Strava's own API says when
/// asked about that id with our token. An attacker who posts here can, at worst,
/// make the app re-read one of its own activities.
///
/// Strava wants a 200 within two seconds and retries when it does not get one.
/// Fetching an activity and re-pricing a day does not reliably fit in that on a
/// cold Worker, so the event is written down, acknowledged, and processed after
/// the response goes out.

export const dynamic = "force-dynamic";

/**
 * The subscription handshake. Strava GETs this while the create call is still
 * open and expects the challenge echoed back.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const mode = params.get("hub.mode");
  const challenge = params.get("hub.challenge");
  const token = params.get("hub.verify_token");

  if (mode !== "subscribe" || !challenge) {
    return NextResponse.json({ error: "Not a subscription handshake." }, { status: 400 });
  }

  if (token !== (await verifyToken())) {
    // Somebody else trying to point our callback at their subscription.
    return NextResponse.json({ error: "Bad verify token." }, { status: 403 });
  }

  return NextResponse.json({ "hub.challenge": challenge });
}

type StravaEventBody = {
  object_type?: string;
  object_id?: number | string;
  aspect_type?: string;
  owner_id?: number | string;
  subscription_id?: number | string;
  event_time?: number;
};

export async function POST(request: NextRequest) {
  let body: StravaEventBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body was not JSON." }, { status: 400 });
  }

  const objectType = body.object_type;
  const objectId = body.object_id == null ? null : String(body.object_id);
  const aspectType = body.aspect_type;
  const ownerId = body.owner_id == null ? null : String(body.owner_id);

  if (!objectType || !objectId || !aspectType || !ownerId) {
    return NextResponse.json({ error: "Missing fields." }, { status: 400 });
  }

  const account = await getAccount();

  // Somebody else's athlete, or ours before it was connected. Acknowledged
  // rather than rejected: a non-200 makes Strava retry something that will never
  // succeed, and there is nothing here to be told about.
  if (!account || account.athleteId !== ownerId) {
    return NextResponse.json({ ok: true, ignored: "unknown athlete" });
  }

  await db.stravaEvent.create({
    data: {
      objectType,
      objectId,
      aspectType,
      ownerId,
      eventTime: body.event_time ? new Date(body.event_time * 1000) : new Date(),
    },
  });

  // Do the real work after answering. If the platform will not hold the promise
  // open, the event simply stays in the inbox and the next app open or "Sync
  // now" picks it up — which is why it is written down first.
  const response = NextResponse.json({ ok: true });
  await runAfterResponse(processPendingEvents());
  return response;
}

async function runAfterResponse(work: Promise<unknown>) {
  const settled = work.catch(() => {});
  try {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare");
    const { ctx } = await getCloudflareContext({ async: true });
    ctx.waitUntil(settled);
  } catch {
    // Not on Workers (or no context available): just wait for it. Slower than
    // Strava would like, but correct, and this path is only ever local.
    await settled;
  }
}
