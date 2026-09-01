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
