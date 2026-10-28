import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Self-contained server for the Docker image; ignored by Vercel.
  output: "standalone",
  // Trace files from the monorepo root so that @empreinte/core is included.
  outputFileTracingRoot: fileURLToPath(new URL("../../", import.meta.url)),
  // undici and the engine run as plain Node.js modules on the server.
  serverExternalPackages: ["undici"],
  experimental: {
    agentFeedback: true,
  },
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
