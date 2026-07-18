const path = require("node:path");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Compile the shared workspace package (TS source) through Next.
  transpilePackages: ["@lynia/shared"],
  // Self-contained server bundle for the Cloud Run image (plan Phase 1). In a pnpm workspace, Next
  // traces the whole monorepo, so pin the trace root at the repo root — otherwise standalone can miss
  // hoisted node_modules and emit a server that crashes on a missing dependency at boot.
  output: "standalone",
  outputFileTracingRoot: path.join(__dirname, "../../"),
};

module.exports = nextConfig;
