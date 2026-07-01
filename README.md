# Lynia

On-demand motorbike courier for Zimbabwe — an inDrive-style "offer loop" (customer names a
price, riders accept or counter, customer selects). See [`docs/`](docs/) for the full plan:
[CONCEPT](docs/CONCEPT.md) · [ARCHITECTURE](docs/ARCHITECTURE.md) (system diagrams + data model) ·
review logs: [CEO](docs/CEO-REVIEW.md) · [Eng](docs/ENG-REVIEW.md) ·
[Design](docs/DESIGN-REVIEW.md) · [Design system](docs/DESIGN.md).

**Status:** the API is **live and CI-deployed on GCP** at
[`https://lyniago.lyniafinance.com`](https://lyniago.lyniafinance.com) (`/health` →
`{"status":"ok","db":true,"redis":true}`). Where the build stands + what the founder wires next →
[`docs/PILOT-READINESS.md`](docs/PILOT-READINESS.md).

## Monorepo

pnpm + Turborepo. Backend is an own NestJS API on PostgreSQL (no BaaS) on **Google Cloud**
(chosen 2026-06-27, provisioned + deployed 2026-06-29 — Cloud Run + Cloud SQL + Memorystore + Cloud
Storage + Secret Manager in `africa-south1`, fronted by an external HTTPS load balancer). The infra is
Terraform ([`infra/terraform/`](infra/terraform/)) with keyless CI auth (Workload Identity Federation),
deployed by [`.github/workflows/release.yml`](.github/workflows/release.yml). Cloud-specific code lives
behind adapters (`apps/api/src/adapters`), and the Azure impl is kept as the portability proof — so the
cloud is a `CLOUD_PROVIDER` switch, not a rewrite.

```
packages/shared   @lynia/shared  — enums, API contracts (zod), design tokens (shared by all apps)
apps/api          @lynia/api     — NestJS: config, Prisma, health, cloud adapters, OpenTelemetry
apps/mobile       @lynia/mobile  — Expo (React Native), Android-first
apps/admin        @lynia/admin   — Next.js monitor/support console
```

## Develop

```bash
pnpm install
pnpm --filter @lynia/shared build         # build shared types first
pnpm --filter @lynia/api prisma:generate  # generate the Prisma client
pnpm run typecheck                        # all workspaces
pnpm run build                            # all workspaces
```

Local services: PostgreSQL **with PostGIS** + Redis (set `DATABASE_URL`, `REDIS_URL` — see
`.env.example`). Apply the schema with `pnpm --filter @lynia/api migrate:deploy`.

CI (`.github/workflows/ci.yml`) typechecks/builds/tests every workspace and runs the migration
against a real PostGIS service, asserting the offer-loop constraints (`one_active_ride`, the GiST
geo index, hashed delivery OTP).
