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

// Keyed on the per-request ExecutionContext, so the client lives exactly as long
// as the request whose I/O it owns and is collected with it.
const perRequest = new WeakMap<object, ReturnType<typeof createClient>>();

const globalForPrisma = globalThis as unknown as { prisma?: ReturnType<typeof createClient> };

function client(): ReturnType<typeof createClient> {
  const cf = cloudflareContext();
  const hyperdrive = cf?.env?.HYPERDRIVE as HyperdriveBinding | undefined;

  if (cf && hyperdrive?.connectionString) {
    const key = cf.ctx ?? cf;
    const existing = perRequest.get(key);
    if (existing) return existing;

    // One connection per request: Hyperdrive pools on the other side, and a
    // larger pool here would just open sockets this request cannot outlive.
    const fresh = createClient(hyperdrive.connectionString, 1);
    perRequest.set(key, fresh);
    return fresh;
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
