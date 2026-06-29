# One image, portable across Azure Container Apps and GCP Cloud Run (D7).
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
RUN pnpm install --frozen-lockfile=false

# --- build ---
FROM deps AS build
COPY . .
RUN pnpm --filter @lynia/shared build \
 && pnpm --filter @lynia/api prisma:generate \
 && pnpm --filter @lynia/api build

# --- runtime ---
FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build /repo /repo
WORKDIR /repo/apps/api
EXPOSE 3000
CMD ["node", "dist/main.js"]
