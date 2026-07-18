# Admin console (Next.js) image for GCP Cloud Run (plan docs/plans/2026-admin-console-deployment.md).
# Mirrors apps/api/Dockerfile's workspace-aware, multi-stage shape. `output: "standalone"`
# (apps/admin/next.config.js) emits a self-contained server that traces only the node_modules it
# needs, so the runtime stage carries no pnpm and no dev dependencies.
#
# NOTE: the repo-root .dockerignore is tuned for the API image and EXCLUDES apps/admin. BuildKit
# honors a Dockerfile-specific ignore file, so this image's context filter lives in
# apps/admin/Dockerfile.dockerignore (buildx picks it up automatically). Build with buildx
# (deploy-admin.yml does) so that file takes effect.
FROM node:22-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
WORKDIR /repo

# --- deps (workspace-aware, pruned to shared + admin) ---
FROM base AS deps
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
COPY packages/shared/package.json packages/shared/
COPY apps/admin/package.json apps/admin/
# Root-declared patchedDependencies (package.json → pnpm.patchedDependencies) are applied during
# install, so the patch files must exist. The patch targets a mobile-only dependency absent from this
# pruned workspace, so scope --config.allow-unused-patches to this install (same caveat as the API
# image) rather than hard-failing on ERR_PNPM_UNUSED_PATCH.
COPY patches/ patches/
RUN pnpm install --frozen-lockfile=false --config.allow-unused-patches=true

# --- build ---
FROM deps AS build
COPY . .
RUN pnpm --filter @lynia/shared build \
 && pnpm --filter @lynia/admin build

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
# apps/admin/server.js + the traced node_modules live under .next/standalone/.
COPY --from=build /repo/apps/admin/.next/standalone ./
# Static assets and public/ are NOT part of the standalone trace — place them where the traced app
# expects them (getting this wrong yields a server that boots and 404s every asset).
COPY --from=build /repo/apps/admin/.next/static ./apps/admin/.next/static
COPY --from=build /repo/apps/admin/public ./apps/admin/public
EXPOSE 8080
CMD ["node", "apps/admin/server.js"]
