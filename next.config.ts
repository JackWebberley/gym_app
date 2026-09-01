import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pg opens raw TCP sockets and must stay external to the bundler; Workers
  // provides it through nodejs_compat at runtime.
  serverExternalPackages: ["pg"],
};

export default nextConfig;
