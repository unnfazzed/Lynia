const path = require("node:path");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Compile the shared workspace package (TS source) through Next — same as apps/admin.
  transpilePackages: ["@lynia/shared"],
  // Self-contained server bundle for the future Cloud Run image (deploy wiring lands with P3 —
  // docs/plans/2026-07-26-merchant-verticals-plan.md §2.3). Trace root pinned at the repo root for
  // the same pnpm-workspace reason as apps/admin.
  output: "standalone",
  outputFileTracingRoot: path.join(__dirname, "../../"),
};

module.exports = nextConfig;
