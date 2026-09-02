import { cache } from "react";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

/// Connection strategy differs by runtime, and getting it wrong on Workers does
/// not fail loudly — it hangs.
///
/// **Cloudflare Workers.** The connection string comes from the Hyperdrive
/// binding: `pg` cannot complete the TLS handshake Supabase wants over the
/// Workers socket shim ("Connection terminated unexpectedly"), and Hyperdrive
/// terminates TLS itself. The client is also built **per request**. Workers
/// forbid sharing I/O objects across requests — a socket opened while serving one
/// request is dead by the next, and a module-level pool handing out that dead
/// socket makes the Worker hang until the runtime cancels it. Hyperdrive does the
/// real pooling upstream, so a fresh client per request is cheap.
///
/// **Everywhere else** — `next dev`, the seed, scripts — DATABASE_URL, with a
/// module-level singleton so dev reloads do not leak a pool each time.

type CloudflareContext = { env?: Record<string, unknown>; ctx?: object };
type HyperdriveBinding = { connectionString?: string };

function cloudflareContext(): CloudflareContext | null {
  try {
    // Only resolvable inside a Worker request; throwing is the signal that we
    // are not on Workers.
    const { getCloudflareContext } = require("@opennextjs/cloudflare") as {
      getCloudflareContext: () => CloudflareContext;
    };
    return getCloudflareContext() ?? null;
  } catch {
    return null;
  }
}

function createClient(connectionString: string, poolMax: number) {
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString, max: poolMax }),
  });
}

/**
 * One client per request, on Workers.
 *
 * This was a WeakMap keyed on `getCloudflareContext().ctx ?? cf`, which looked
 * per-request and was not: when `ctx` is undefined the key falls back to the
 * context object itself, and OpenNext hands out the same one for the life of the
 * isolate. The map then behaves exactly like the module-level singleton the
 * comment above warns against — the first request opens a socket, Workers closes
 * it when that request ends, and every later request on the same isolate gets
 * the dead client back and fails. First action after a page load works, the rest
 * return 500, and a while later a fresh isolate makes it look intermittent.
 *
 * `cache()` is scoped to the React request — a server render or a server action —
 * which is exactly the lifetime a socket may span. It also memoises, so the
 * Proxy below can call this on every property access without opening a
 * connection each time.
 */
const workerClient = cache((connectionString: string) =>
  // One connection per request: Hyperdrive pools on the other side, and a larger
  // pool here would just open sockets this request cannot outlive.
  createClient(connectionString, 1),
);

const globalForPrisma = globalThis as unknown as { prisma?: ReturnType<typeof createClient> };

function client(): ReturnType<typeof createClient> {
  const cf = cloudflareContext();
  const hyperdrive = cf?.env?.HYPERDRIVE as HyperdriveBinding | undefined;

  if (cf && hyperdrive?.connectionString) {
    return workerClient(hyperdrive.connectionString);
  }

  if (!globalForPrisma.prisma) {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error(
        "No database connection available. Locally: copy .env.example to .env and set DATABASE_URL. On Workers: check the HYPERDRIVE binding in wrangler.jsonc.",
      );
    }
    globalForPrisma.prisma = createClient(url, Number(process.env.DATABASE_POOL_MAX ?? 5));
  }
  return globalForPrisma.prisma;
}

/**
 * Resolves on first use rather than at import: `next build` imports every route
 * module to collect page data, and the Hyperdrive binding only exists inside a
 * request, not at module scope.
 */
export const db = new Proxy({} as ReturnType<typeof createClient>, {
  get(_target, property) {
    const instance = client();
    const value = Reflect.get(instance, property, instance);
    return typeof value === "function" ? value.bind(instance) : value;
  },
});
