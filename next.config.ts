import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Served at jackwebberley.com/gym, so every route, link and asset needs the
  // prefix. Dev matches production: http://localhost:3000/gym.
  basePath: "/gym",

  // pg opens raw TCP sockets and must stay external to the bundler; Workers
  // provides it through nodejs_compat at runtime.
  serverExternalPackages: ["pg"],

  // Next's file tracer follows the root config files (prisma7.config.ts,
  // open-next.config.ts) into devDependencies and copies them into the Worker
  // bundle — the workerd.exe runtime binary, Prisma's schema-engine binary,
  // Prisma Studio, pglite and the wrangler CLI, ~365MB of it. All of it is build
  // or local-dev tooling that never runs in production, and it pushed the Worker
  // past even the paid-plan size limit.
  outputFileTracingExcludes: {
    "*": [
      // Prisma CLI and migration tooling — the app only needs the generated client.
      "node_modules/prisma/**",
      "node_modules/@prisma/engines/**",
      "node_modules/@prisma/engines-version/**",
      "node_modules/@prisma/studio-core/**",
      "node_modules/@prisma/dev/**",
      "node_modules/@electric-sql/pglite/**",
      // Cloudflare build and local-emulation tooling.
      "node_modules/wrangler/**",
      "node_modules/workerd/**",
      "node_modules/@cloudflare/**",
      "node_modules/miniflare/**",
      // Next's OG-image renderer (satori/resvg/yoga + a bundled font). This app
      // has no ImageResponse route, and it costs ~600KiB of the Worker budget.
      "node_modules/next/dist/compiled/@vercel/og/**",
      // pg_dump is Prisma tooling, never used at runtime (~250KiB).
      "**/pg_dump.wasm",
      // Bundlers and test tooling.
      "node_modules/esbuild/**",
      "node_modules/@esbuild/**",
      "node_modules/vitest/**",
      "node_modules/tsx/**",
    ],
  },
};

export default nextConfig;
