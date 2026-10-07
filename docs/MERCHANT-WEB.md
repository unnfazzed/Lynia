# Merchant web app — merchant.lyniago.com

The merchant app (kitchens, shops, pharmacies) in a browser: `apps/merchant`. Design authority is unchanged
(`packages/design/handoff/merchant-v2/`, ledger D-77). This page is about how it is built and hosted.

## What it is

- A Next.js **static export** (`output: "export"` in `apps/merchant/next.config.js`). `next build` writes
  plain HTML/JS/CSS to `apps/merchant/out/`. Nothing runs on a server: every page loads its data from
  `api.lyniago.com` in the browser, with the merchant's own token.
- Hosting: an assets-only Cloudflare Worker (`apps/merchant/wrangler.jsonc`), like `app.lyniago.com` and
  `lyniago.com`. Static-asset requests are free and served from the Cloudflare location nearest the visitor.
  It replaced the Azure container (`ca-lynia-merchant`, 2026-10-07), which scaled to zero and made the first
  visit after a quiet spell wait for a cold start.
- **Ids in the query string.** A static export can't have a page per id, so the order, prescription-check,
  booking and hand-over pages take their id as a query parameter. Every link is built in
  `app/lib/routes.ts`:

  | Page | Address | Was |
  | --- | --- | --- |
  | One order | `/queue/order?id=<id>` | `/queue/<id>` |
  | Prescription check | `/queue/rx?id=<id>` | `/queue/<id>/rx` |
  | One booking | `/deliveries/booking?id=<id>` | `/deliveries/<id>` |
  | Rider's hand-over link | `/h?t=<token>` | `/h/<token>` |

  An old address gets the 404 page (`app/not-found.tsx`), which forwards it to the new one in the browser.
- **Sign-in gate in the browser.** There is no middleware any more. `app/components/AccessGate.tsx` applies
  the same policy (`app/lib/merchant-access.ts`) before a page renders: no session → `/login?next=…`, a
  signed-in visitor on `/login` → `/queue`. The real boundary is unchanged: every merchant API route checks
  the token.
- `public/_headers`: `nosniff`, `X-Frame-Options: DENY`, HSTS, and a one-year immutable cache for
  `/_next/static/*` (content-hashed names). Pages revalidate on every load, so a deploy shows on the next one.

## Build-time values

Inlined into the browser bundle by `next build`; none is secret. Same repository Variables the Azure image
used.

| Variable | Becomes | Default |
| --- | --- | --- |
| `MERCHANT_API_BASE_URL` | `NEXT_PUBLIC_API_BASE_URL` | `https://api.lyniago.com` |
| `MERCHANT_SUPPORT_WHATSAPP` | `NEXT_PUBLIC_SUPPORT_WHATSAPP` (Help) | unset: Help hidden |
| `MERCHANT_GOOGLE_PLACES_KEY` | `NEXT_PUBLIC_GOOGLE_PLACES_KEY` (address search) | unset: GPS only |

## Deploy

**Deploy merchant web (Cloudflare)** (`.github/workflows/deploy-merchant-web.yml`) runs by itself when a merge
to main changes `apps/merchant`, `@lynia/shared` or the lockfile, after the `production` environment's
approval. It can also be run by hand from Actions. It builds the export, deploys it with wrangler and runs
`apps/merchant/smoke.sh`.

Cloudflare: nothing new. The `CLOUDFLARE_ACCOUNT_ID` Variable and the `CLOUDFLARE_WORKERS_API_TOKEN`
production secret that deploy lyniago.com and app.lyniago.com cover this Worker too.

**The cutover (first deploy).** A Worker Custom Domain can't be attached while the name has a CNAME, and
`merchant.lyniago.com` had a DNS-only CNAME to the Azure container. The workflow's "Release the Azure record"
step deletes that one record (only while it still points at `*.azurecontainerapps.io`) with the DNS token
`CLOUDFLARE_API_TOKEN`, then wrangler attaches the domain. Expect a few minutes of downtime while Cloudflare
issues the certificate; the smoke waits up to ten. On later deploys the step finds nothing to do.

## Verify and roll back

- **Verify:** `bash apps/merchant/smoke.sh https://merchant.lyniago.com`.
- **Roll back a bad deploy:** Cloudflare → **Workers & Pages → lyniago-merchant-web → Deployments →
  Rollback**, or revert the commit on main (the deploy re-runs).
- **Back to Azure (emergency only):** the container app is still there. Remove the Worker's Custom Domain
  in Cloudflare, then run **DNS + bind (Cloudflare → Azure)** from a commit that still offers `merchant`
  (before this change) and redeploy the container image. Prefer a Cloudflare rollback.

## Run it locally

- Dev: `pnpm --filter @lynia/merchant dev` (port 3100), or `node tools/parity/serve-web.mjs merchant`.
- The exported build as Cloudflare serves it:
  `NEXT_PUBLIC_API_BASE_URL=https://api.lyniago.com pnpm --filter @lynia/merchant build`, then
  `apps/website/deploy/node_modules/.bin/wrangler dev --config apps/merchant/wrangler.jsonc`.

## Left to do

- **Decommission the Azure container.** `ca-lynia-merchant` (infra/azure/containerapps.tf, `web` map) still
  exists at min 0 replicas and serves the last image on its `*.azurecontainerapps.io` address. Remove it from
  Terraform once the Worker has run cleanly for a while.
