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
RUN pnpm fetch --frozen-lockfile

COPY . .
RUN pnpm install --offline --frozen-lockfile
RUN pnpm --filter @magic-compare/internal-site build

FROM base AS runner

ARG MAGIC_COMPARE_COMMIT_SHA
WORKDIR /app
ENV NODE_ENV=production
ENV MAGIC_COMPARE_COMMIT_SHA=$MAGIC_COMPARE_COMMIT_SHA

COPY --from=builder /app /app

EXPOSE 3000

CMD ["pnpm", "--filter", "@magic-compare/internal-site", "start"]
