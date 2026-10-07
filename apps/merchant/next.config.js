/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Compile the shared workspace package (TS source) through Next — same as apps/admin.
  transpilePackages: ["@lynia/shared"],
  // A static export: `next build` writes plain files to out/, which Cloudflare serves from its edge
  // (apps/merchant/wrangler.jsonc, docs/MERCHANT-WEB.md), the same way as app.lyniago.com. Nothing runs
  // on a server: every page fetches its data from the API in the browser, a page's id rides in the
  // query string (app/lib/routes.ts) and the sign-in gate runs in the browser (app/components/AccessGate.tsx).
  output: "export",
};

module.exports = nextConfig;
