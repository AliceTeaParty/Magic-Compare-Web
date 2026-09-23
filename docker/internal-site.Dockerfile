# syntax=docker/dockerfile:1

FROM node:24.13.1-bookworm-slim AS base

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
ENV NEXT_TELEMETRY_DISABLED=1

RUN apt-get update \
  && apt-get install -y --no-install-recommends sqlite3 ca-certificates \
  && rm -rf /var/lib/apt/lists/*

RUN corepack enable

WORKDIR /app

FROM base AS builder

ARG MAGIC_COMPARE_COMMIT_SHA
ENV MAGIC_COMPARE_COMMIT_SHA=$MAGIC_COMPARE_COMMIT_SHA

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/internal-site/package.json ./apps/internal-site/package.json
COPY apps/public-site/package.json ./apps/public-site/package.json
COPY packages/compare-core/package.json ./packages/compare-core/package.json
COPY packages/content-schema/package.json ./packages/content-schema/package.json
COPY packages/shared-utils/package.json ./packages/shared-utils/package.json
COPY packages/ui/package.json ./packages/ui/package.json
COPY patches ./patches
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
  pnpm fetch --frozen-lockfile

COPY . .
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
  pnpm install --offline --frozen-lockfile
RUN --mount=type=cache,id=internal-next-cache,target=/app/apps/internal-site/.next/cache \
  pnpm --filter @magic-compare/internal-site build

FROM base AS production-deps

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/internal-site/package.json ./apps/internal-site/package.json
COPY apps/public-site/package.json ./apps/public-site/package.json
COPY packages/compare-core/package.json ./packages/compare-core/package.json
COPY packages/content-schema/package.json ./packages/content-schema/package.json
COPY packages/shared-utils/package.json ./packages/shared-utils/package.json
COPY packages/ui/package.json ./packages/ui/package.json
COPY patches ./patches
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
  pnpm fetch --prod --frozen-lockfile
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
  pnpm install --prod --offline --frozen-lockfile --ignore-scripts
# Root postinstall generates the client with the development-only Prisma CLI. The builder already
# produced that source, so the runtime install only rebuilds the native packages it actually uses.
RUN pnpm rebuild better-sqlite3 esbuild sharp workerd
# The optional Playwright peer is build-only payload and needlessly enlarges the runtime.
RUN rm -rf \
  node_modules/.pnpm/@playwright+test@* \
  node_modules/.pnpm/playwright@* \
  node_modules/.pnpm/playwright-core@*

FROM base AS runner

ARG MAGIC_COMPARE_COMMIT_SHA
WORKDIR /app
ENV NODE_ENV=production
ENV MAGIC_COMPARE_COMMIT_SHA=$MAGIC_COMPARE_COMMIT_SHA
ENV MALLOC_ARENA_MAX=2
ENV NODE_OPTIONS=--max-old-space-size=512

COPY --from=production-deps /app/node_modules ./node_modules
COPY --from=builder /app/apps ./apps
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/patches ./patches
COPY --from=builder /app/scripts/sync-published.ts ./scripts/sync-published.ts
COPY --from=builder /app/scripts/write-public-route-aliases.ts ./scripts/write-public-route-aliases.ts
COPY --from=builder /app/scripts/export-public.ts ./scripts/export-public.ts
COPY --from=builder /app/scripts/deploy-public.ts ./scripts/deploy-public.ts
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=builder /app/pnpm-workspace.yaml ./pnpm-workspace.yaml
COPY --from=builder /app/tsconfig.base.json ./tsconfig.base.json
COPY docker/internal-site-init.sh /usr/local/bin/internal-site-init

RUN chmod 755 /usr/local/bin/internal-site-init

EXPOSE 3000

CMD ["node", "apps/internal-site/node_modules/next/dist/bin/next", "start", "apps/internal-site", "--hostname", "0.0.0.0"]
