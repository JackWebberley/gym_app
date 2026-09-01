import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

/**
 * Builds for Cloudflare Workers.
 *
 * Prisma's query compiler is WebAssembly, and the two runtimes need different
 * builds of the generated client:
 *
 *   nodejs  — loads the WASM from bytes. Works under Node, rejected by Workers
 *             ("Wasm code generation disallowed by embedder").
 *   workerd — imports the WASM as a module. Works on Workers, needs Node's
 *             experimental WASM-module imports to work locally, where it fails.
 *
 * `runtime` cannot be set from an env var, and shipping both clients is not an
 * option — the Worker bundle already sits just under the 3MB free-plan limit. So
 * the schema stays on `nodejs` (dev, seed and scripts all work by default) and
 * this script swaps to `workerd` for the duration of the build, then puts it back
 * whatever happens.
 */

const SCHEMA = "prisma/schema.prisma";
const RUNTIME_LINE = /runtime\s*=\s*"(\w+[-\w]*)"/;

function setRuntime(target) {
  const schema = readFileSync(SCHEMA, "utf8");
  if (!RUNTIME_LINE.test(schema)) {
    throw new Error(`No runtime setting found in ${SCHEMA}; cannot switch to ${target}.`);
  }
  writeFileSync(SCHEMA, schema.replace(RUNTIME_LINE, `runtime  = "${target}"`));
  run("npx", ["prisma", "generate"]);
}

function run(cmd, args) {
  execFileSync(cmd, args, { stdio: "inherit", shell: process.platform === "win32" });
}

/**
 * Refuses to build while `next dev` is running.
 *
 * Both write to `.next`, and they corrupt each other silently rather than
 * failing: the build half-completes, the deploy ships new server HTML against
 * stale client chunks, and every button in the app dies with a minified React
 * error that points nowhere near the cause. The tell is the upload line —
 * "Uploaded 1 file (42 already uploaded)" after changing several components.
 *
 * Failing loudly here costs a restart of the dev server. Not failing cost an
 * afternoon.
 */
function assertNoDevServer() {
  if (process.platform !== "win32") return; // CI and the Cloudflare builders run no dev server.

  let out = "";
  try {
    out = execFileSync(
      "powershell.exe",
      [
        "-NoProfile",
        "-Command",
        "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object { $_.CommandLine -like '*next*dev*' } | Select-Object -ExpandProperty ProcessId",
      ],
      // No `shell: true` here on purpose: cmd.exe would split the PowerShell
      // pipeline on its own `|` and the command would arrive in pieces.
      { encoding: "utf8" },
    );
  } catch (e) {
    // Say so rather than passing quietly. A guard that fails silently is worse
    // than no guard, because it reads as an all-clear.
    console.warn(`⚠ Could not check for a running dev server: ${e instanceof Error ? e.message : e}`);
    return;
  }

  const pids = out.split(/\s+/).filter(Boolean);
  if (pids.length === 0) return;

  console.error(
    `\n✘ A Next dev server is running (PID ${pids.join(", ")}).\n` +
      `  It shares .next with this build and the two corrupt each other, which ships\n` +
      `  a half-built bundle without failing. Stop it, then build again.\n`,
  );
  process.exit(1);
}

assertNoDevServer();

console.log("→ generating the workerd Prisma client");
setRuntime("workerd");

try {
  run("npx", ["opennextjs-cloudflare", "build"]);
} finally {
  // Always restore, so a failed build never leaves the tree unable to run
  // `npm run dev`, `db:seed` or the tests.
  console.log("\n→ restoring the nodejs Prisma client");
  setRuntime("nodejs");
}
