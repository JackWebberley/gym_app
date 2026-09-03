"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { db } from "./db";
import { BASE_PATH } from "./auth";
import {
  createSubscription,
  deleteSubscription,
  getAccount,
  listSubscriptions,
  StravaNotConnected,
} from "./strava/api";
import { backfillRecent, processPendingEvents } from "./strava/sync";

/// Mutations for the Strava screen.

const ACCOUNT_ID = "singleton";

function revalidate() {
  revalidatePath("/strava");
  revalidatePath("/food");
  revalidatePath("/");
}

/** Dismisses the new-activity card. */
export async function markActivitiesSeen(ids: string[]) {
  if (ids.length === 0) return;
  await db.stravaActivity.updateMany({
    where: { id: { in: ids }, seenAt: null },
    data: { seenAt: new Date() },
  });
  revalidatePath("/");
}

/** Works the inbox by hand, for when a webhook was missed or failed. */
export async function syncNow() {
  const account = await getAccount();
  if (!account) throw new StravaNotConnected("Strava is not connected.");

  const events = await processPendingEvents();
  // Also pull directly: a webhook that never arrived leaves nothing in the
  // inbox to process, and that is exactly the case this button exists for.
  const backfill = await backfillRecent();

  revalidate();
  return { ...events, imported: backfill.imported };
}

/** Retries the failed events rather than leaving them stuck. */
export async function retryFailedEvents() {
  await db.stravaEvent.updateMany({ where: { processedAt: null }, data: { error: null } });
  const result = await processPendingEvents();
  revalidate();
  return result;
}

/**
 * Registers the webhook with Strava.
 *
 * Strava validates the callback by calling it before this returns, so the app
 * has to be deployed and publicly reachable at that URL first — this cannot work
 * from localhost.
 */
export async function enableWebhook() {
  const account = await getAccount();
  if (!account) throw new StravaNotConnected("Connect Strava first.");

  const host = (await headers()).get("host");
  if (!host) throw new Error("Could not work out this app's public URL.");
  const callbackUrl = `https://${host}${BASE_PATH}/api/strava/webhook`;

  if (host.startsWith("localhost") || host.startsWith("127.")) {
    throw new Error("Strava has to be able to reach the callback, so this only works once deployed.");
  }

  const subscription = await createSubscription(callbackUrl);
  await db.stravaAccount.update({
    where: { id: ACCOUNT_ID },
    data: { subscriptionId: String(subscription.id) },
  });

  revalidate();
  return { id: String(subscription.id), callbackUrl };
}

export async function disableWebhook() {
  const account = await getAccount();
  if (!account?.subscriptionId) return;

  await deleteSubscription(account.subscriptionId);
  await db.stravaAccount.update({ where: { id: ACCOUNT_ID }, data: { subscriptionId: null } });
  revalidate();
}

/**
 * Reconciles what we think the subscription is with what Strava says.
 *
 * Worth having because there is exactly one subscription per application, and
 * it outlives the account row — a disconnect and reconnect leaves an orphan that
 * is still delivering events to a callback we no longer think we registered.
 */
export async function refreshWebhookStatus() {
  const subscriptions = await listSubscriptions();
  const current = subscriptions[0] ?? null;
  await db.stravaAccount.updateMany({
    where: { id: ACCOUNT_ID },
    data: { subscriptionId: current ? String(current.id) : null },
  });
  revalidate();
  return current ? { id: String(current.id), callbackUrl: current.callback_url } : null;
}

/**
 * Forgets the account.
 *
 * Activities already imported stay, and so do the days they re-priced: they are
 * a record of what happened, not a live view of Strava.
 */
export async function disconnectStrava() {
  const account = await getAccount();
  if (!account) return;

  if (account.subscriptionId) {
    // Best effort — a subscription left behind is tidied by the status check.
    await deleteSubscription(account.subscriptionId).catch(() => {});
  }

  await db.stravaAccount.delete({ where: { id: ACCOUNT_ID } });
  revalidate();
}
