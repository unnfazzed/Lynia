# Lynia

LyniaGo: on-demand motorbike delivery for Zimbabwe. Customers send parcels with an inDrive-style "offer
loop" (the customer names a price, bikers accept or counter, the customer picks one), and order from
restaurants, shops and pharmacies (cash only). See [`docs/`](docs/README.md):
[CONCEPT](docs/CONCEPT.md) · [ARCHITECTURE](docs/ARCHITECTURE.md) · [Design system](docs/DESIGN.md).

**Status (2026-10-12):**

- **API** live at [`https://api.lyniago.com`](https://api.lyniago.com) on **Azure Container Apps**
  (South Africa North), deployed by [`release-azure.yml`](.github/workflows/release-azure.yml) on every
  merge to `main`, with a 10% → 50% → 100% canary and automatic rollback.
- **Android app** on Google Play's **Closed testing** track: v0.51.0, versionCode 45 (2026-10-06), plus
  OTA updates. Not public yet. → [`docs/PLAY-STORE-SUBMISSION.md`](docs/PLAY-STORE-SUBMISSION.md)
- **iPhone users** use the customer web app at `app.lyniago.com` until the App Store release
  ([`docs/CUSTOMER-WEB.md`](docs/CUSTOMER-WEB.md)).
- **Merchants** use `merchant.lyniago.com`; operators use the admin console at `admin.lyniago.com`.
- **Marketing site** at `lyniago.com` ([`docs/WEBSITE.md`](docs/WEBSITE.md)).

How releases work → [`docs/LAUNCH-DEPLOYMENT-STRATEGY.md`](docs/LAUNCH-DEPLOYMENT-STRATEGY.md).
Founder and ops commands → [`docs/AZURE-OWNER-RUNBOOK.md`](docs/AZURE-OWNER-RUNBOOK.md).

## Monorepo

pnpm + Turborepo. The backend is our own NestJS API on PostgreSQL (PostGIS) and Redis, no BaaS.
Cloud-specific code sits behind adapters (`apps/api/src/adapters`), selected by `CLOUD_PROVIDER`.

```
apps/api           @lynia/api       NestJS API: Prisma/PostGIS, Redis, BullMQ, Socket.IO, cloud adapters
apps/mobile        @lynia/mobile    Expo (React Native) app, customer + biker; Android first
apps/admin         @lynia/admin     Next.js operator console (admin.lyniago.com, Azure)
apps/merchant      @lynia/merchant  Next.js merchant web app, static export (merchant.lyniago.com, Cloudflare)
apps/customer-web  —                Cloudflare Worker serving apps/mobile's web export (app.lyniago.com)
apps/website       —                lyniago.com, the design handoff shipped as-is (Cloudflare)
packages/shared    @lynia/shared    enums, API contracts (zod), policy, design tokens
packages/design    @lynia/design    the vendored LyniaGo design system: tokens, components, handoffs
infra/azure                          Terraform + owner scripts for the Azure production stack
```

`infra/terraform/` and the GCP workflows (`release.yml`, `rollback.yml`, `deploy-staging.yml`,
`deploy-admin.yml`, `gcp-*.yml`, `terraform-apply.yml`) are left over from the suspended GCP project and
deploy nothing.

## Develop

```bash
pnpm install
pnpm --filter @lynia/shared build         # build shared types first
pnpm --filter @lynia/api prisma:generate  # generate the Prisma client
pnpm db:up && pnpm db:migrate             # local PostGIS + Redis (docker compose), then the schema
pnpm dev                                  # all workspaces
pnpm typecheck && pnpm test               # the local gate
```

Full setup and the PR flow: [`CONTRIBUTING.md`](CONTRIBUTING.md). CI
([`.github/workflows/ci.yml`](.github/workflows/ci.yml)) typechecks, builds and tests every workspace,
runs the migrations against a real PostGIS service, and asserts the offer-loop constraints.
