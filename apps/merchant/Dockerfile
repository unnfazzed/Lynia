# Merchant dashboard (Next.js) image for GCP Cloud Run (plan docs/plans/2026-merchant-console-
# deployment.md). Mirrors apps/admin/Dockerfile's workspace-aware, multi-stage shape. `output:
# "standalone"` (apps/merchant/next.config.js) emits a self-contained server that traces only the
# node_modules it needs, so the runtime stage carries no pnpm and no dev dependencies.
#
# NOTE: the repo-root .dockerignore is tuned for the API image and EXCLUDES apps/merchant. BuildKit
# honors a Dockerfile-specific ignore file, so this image's context filter lives in
# apps/merchant/Dockerfile.dockerignore (buildx picks it up automatically). Build with buildx
# (deploy-merchant.yml does) so that file takes effect.
FROM node:22-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
WORKDIR /repo

# --- deps (workspace-aware, pruned to shared + merchant) ---
FROM base AS deps
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
COPY packages/shared/package.json packages/shared/
COPY apps/merchant/package.json apps/merchant/
# Root-declared patchedDependencies (package.json → pnpm.patchedDependencies) are applied during
# install, so the patch files must exist. The patch targets a mobile-only dependency absent from this
# pruned workspace, so scope --config.allow-unused-patches to this install (same caveat as the API/
# admin images) rather than hard-failing on ERR_PNPM_UNUSED_PATCH.
COPY patches/ patches/
RUN pnpm install --frozen-lockfile=false --config.allow-unused-patches=true

# --- build ---
FROM deps AS build
# NEXT_PUBLIC_ vars are inlined into the browser bundle at BUILD time (app/lib/config.ts throws if
# this is unset during a production build) — it must be supplied here via --build-arg, not at
# `gcloud run deploy` time, unlike apps/admin's server-only API_BASE_URL.
ARG NEXT_PUBLIC_API_BASE_URL
ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL
COPY . .
RUN pnpm --filter @lynia/shared build \
 && pnpm --filter @lynia/merchant build

# --- runtime (slim; standalone server only) ---
FROM node:22-slim AS runtime
ENV NODE_ENV=production
# Next standalone binds HOSTNAME:PORT. Pin PORT=8080 so the image listens on the same port EXPOSE
# advertises and the boot-smoke curls — Next standalone otherwise defaults to 3000. Cloud Run injects
# its own PORT (also 8080) at runtime, which harmlessly matches. Bind all interfaces.
ENV HOSTNAME=0.0.0.0
ENV PORT=8080
WORKDIR /repo
# The standalone bundle mirrors the monorepo from the trace root (outputFileTracingRoot = repo root):
# apps/merchant/server.js + the traced node_modules live under .next/standalone/.
COPY --from=build /repo/apps/merchant/.next/standalone ./
# Static assets and public/ are NOT part of the standalone trace — place them where the traced app
# expects them (getting this wrong yields a server that boots and 404s every asset).
COPY --from=build /repo/apps/merchant/.next/static ./apps/merchant/.next/static
COPY --from=build /repo/apps/merchant/public ./apps/merchant/public
EXPOSE 8080
CMD ["node", "apps/merchant/server.js"]
