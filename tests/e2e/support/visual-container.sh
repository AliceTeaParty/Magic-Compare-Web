#!/usr/bin/env bash
set -euo pipefail
corepack enable
pnpm config set store-dir /pnpm/store
pnpm install --frozen-lockfile
pnpm exec playwright test --config=playwright.visual.config.ts "$@"
