import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

/// Supabase gives two connection strings. The app uses the **pooled** one
/// (Supavisor, port 6543) because serverless invocations open and drop
/// connections constantly and would exhaust Postgres directly. Migrations and
/// seeding use the **direct** one (port 5432) — see prisma7.config.ts.

function createClient() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.example to .env and paste your Supabase pooled connection string, then restart.",
    );
  }

  return new PrismaClient({
    adapter: new PrismaPg({
      connectionString,
      // The pooler already multiplexes; a large per-instance pool on top of it
      // just holds Supabase connections open for no benefit.
      max: Number(process.env.DATABASE_POOL_MAX ?? 5),
    }),
  });
}

// Next dev reloads modules on every edit; without the global the process leaks
// a connection pool per reload until Supabase starts refusing connections.
const globalForPrisma = globalThis as unknown as { prisma?: ReturnType<typeof createClient> };

function client(): ReturnType<typeof createClient> {
  if (!globalForPrisma.prisma) globalForPrisma.prisma = createClient();
  return globalForPrisma.prisma;
}

/**
 * Connects on first use rather than at import. `next build` imports every route
 * module to collect page data, so constructing eagerly would make the build fail
 * on a machine with no credentials — and in production a missing variable should
 * surface as one clear failed request, not a server that will not boot.
 */
export const db = new Proxy({} as ReturnType<typeof createClient>, {
  get(_target, property) {
    const instance = client();
    const value = Reflect.get(instance, property, instance);
    return typeof value === "function" ? value.bind(instance) : value;
  },
});
