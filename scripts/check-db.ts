import "dotenv/config";
import { Client } from "pg";

/// `npm run db:check` — run this the moment you paste the Supabase strings in.
/// It proves both connections work and reports what is in the database, so a
/// typo in the password or the wrong port fails here with a readable message
/// rather than as a 500 in the app.

type Check = { label: string; url: string | undefined; expectPooled: boolean };

function redact(url: string): string {
  return url.replace(/:\/\/([^:]+):([^@]+)@/, "://$1:••••@");
}

async function probe({ label, url, expectPooled }: Check): Promise<boolean> {
  if (!url) {
    console.log(`  ✗ ${label}: not set`);
    return false;
  }

  const port = url.match(/:(\d+)\//)?.[1];
  if (expectPooled && port === "5432") {
    console.log(`  ! ${label}: port 5432 is the direct connection — the app wants 6543 (pooled)`);
  }
  if (!expectPooled && port === "6543") {
    console.log(`  ✗ ${label}: port 6543 is the pooled connection; migrations need 5432 (direct)`);
    return false;
  }

  const client = new Client({ connectionString: url });
  try {
    await client.connect();
    const { rows } = await client.query<{ version: string; db: string }>(
      "select version() as version, current_database() as db",
    );
    const version = rows[0].version.split(" ").slice(0, 2).join(" ");
    console.log(`  ✓ ${label}: connected to ${rows[0].db} (${version})`);
    console.log(`      ${redact(url)}`);
    return true;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.log(`  ✗ ${label}: ${message}`);
    if (/password authentication failed/i.test(message)) {
      console.log("      → wrong password, or special characters need percent-encoding");
    }
    if (/ENOTFOUND|EAI_AGAIN|ENETUNREACH/i.test(message)) {
      if (/@db\.[a-z0-9]+\.supabase\.co/.test(url)) {
        // Supabase's "Direct connection" host is IPv6-only without the paid
        // IPv4 add-on, so it does not resolve on most home and CI networks.
        console.log("      → this is the IPv6-only Direct connection host.");
        console.log("        Use the Session pooler string instead (also port 5432).");
      } else {
        console.log("      → host not found; check the project ref and region in the string");
      }
    }
    if (/self.signed|certificate|CERT_/i.test(message)) {
      console.log("      → Supabase signs the pooler certificate with its own CA, which");
      console.log("        pg cannot verify. Use uselibpqcompat=true&sslmode=require");
    }
    return false;
  } finally {
    await client.end().catch(() => {});
  }
}

async function main() {
  console.log("Checking Supabase connections\n");

  const direct = await probe({
    label: "DIRECT_URL  (migrations, seeding)",
    url: process.env.DIRECT_URL,
    expectPooled: false,
  });
  const pooled = await probe({
    label: "DATABASE_URL (the app)",
    url: process.env.DATABASE_URL,
    expectPooled: true,
  });

  if (!direct || !pooled) {
    console.log("\nFix the above, then run `npm run db:check` again.");
    process.exit(1);
  }

  console.log("\nSchema");
  const client = new Client({ connectionString: process.env.DIRECT_URL });
  await client.connect();
  try {
    const { rows: tables } = await client.query<{ table_name: string }>(
      `select table_name from information_schema.tables
       where table_schema = 'public' and table_type = 'BASE TABLE'
       order by table_name`,
    );

    if (tables.length === 0) {
      console.log("  (empty — run `npm run db:deploy` then `npm run db:seed`)");
    } else {
      for (const { table_name } of tables) {
        const { rows } = await client.query<{ count: string }>(
          `select count(*)::text as count from "${table_name}"`,
        );
        console.log(`  ${rows[0].count.padStart(5)}  ${table_name}`);
      }
    }
  } finally {
    await client.end();
  }

  console.log("\nBoth connections are good.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
