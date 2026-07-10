# One image, runs on GCP Cloud Run; no cloud-specific build steps (D7).
FROM node:22-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH="$PNPM_HOME:$PATH"
# openssl + ca-certificates: Prisma's query engine needs libssl present (and
# detectable) or it falls back to the 1.1.x engine, which can't load on bookworm
# (OpenSSL 3) and crashes the container at $connect.
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*
RUN corepack enable
WORKDIR /repo

# --- deps (workspace-aware) ---
FROM base AS deps
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
# pnpm applies root-declared patchedDependencies (package.json → pnpm.patchedDependencies) during
# install, so the patch files must exist in the deps stage. Without this COPY, `pnpm install` fails
# with ENOENT on patches/*.patch the moment any patched dependency is added to the workspace (e.g.
# @expo/cli), breaking the API image build even though the patch only affects the mobile app.
COPY patches/ patches/
# --config.allow-unused-patches: this stage installs a pruned workspace (shared + api only), so a
# patch that targets a mobile-only dependency (e.g. @expo/cli) matches nothing here and pnpm
# hard-fails with ERR_PNPM_UNUSED_PATCH. Scoped to this install so full-workspace installs
# (CI, mobile builds) still error loudly on genuinely stale patches.
RUN pnpm install --frozen-lockfile=false --config.allow-unused-patches=true

# --- build ---
FROM deps AS build
# Generate the Prisma client from just the schema FIRST, so the engine download (native +
# debian-openssl-3.0.x) is cached on the schema rather than re-run on every source change. The
# client is written into node_modules (excluded via .dockerignore), so the later COPY won't clobber it.
COPY apps/api/prisma apps/api/prisma
RUN pnpm --filter @lynia/api prisma:generate
COPY . .
RUN pnpm --filter @lynia/shared build \
 && pnpm --filter @lynia/api build

# --- runtime ---
FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build /repo /repo
WORKDIR /repo/apps/api
EXPOSE 3000
CMD ["node", "dist/main.js"]
