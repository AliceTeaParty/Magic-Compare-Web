# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Dev
pnpm dev:internal          # internal-site at localhost:3000
pnpm dev:public            # public-site at localhost:3001

# Build & verify
pnpm build                 # build both Next.js apps
pnpm test                  # run all tests (vitest)
pnpm typecheck             # typecheck all packages (runs next build per app)

# Single app test
pnpm --filter @magic-compare/internal-site test
pnpm --filter @magic-compare/public-site test

# Database
pnpm db:push               # init SQLite schema (runs prisma/init-db.ts, not prisma db push)
pnpm db:seed               # seed demo case + upload demo assets to S3

# Publish pipeline (must be triggered explicitly — not automatic)
pnpm public:export         # build static public bundle → dist/public-site
pnpm public:deploy         # export + upload to Cloudflare Pages via Wrangler

# Docker (local dev with local build + bind mounts)
pnpm docker:dev:up
pnpm docker:dev:down
pnpm docker:dev:logs
```

## Architecture

Three independent segments — never mix their responsibilities:

1. **`tools/uploader/`** — Python CLI. Scans local image directories, uploads frames directly to S3 via presigned PUT URLs, then calls the group-upload API sequence on internal-site.
2. **`apps/internal-site/`** — Server-backed Next.js app. Case catalog, workspace, viewer, all `/api/ops/*` endpoints, SQLite/Prisma metadata, S3 internal asset access, publish bundle generation, public-site export/deploy triggers.
3. **`apps/public-site/`** — Static export only. Reads `content/published/groups/*/manifest.json`, serves `/g/[publicSlug]`. No catalog, no uploads, no write APIs.

**Shared packages** (`packages/`):
- `compare-core` — viewer dataset shape, asset lookup, mode calculation, heatmap fallback, client-side controller state
- `content-schema` — Zod schemas and TypeScript types for all entities (Case, Group, Frame, Asset, manifests, enums)
- `ui` — shared MUI dark theme, viewer workbench layout (toolbar / stage / filmstrip / sidebar)
- `shared-utils` — misc utilities

## Data storage

| Data | Location |
|---|---|
| Internal metadata | SQLite (`DATABASE_URL=file:./dev.db` locally; `MAGIC_COMPARE_DOCKER_DATABASE_URL` in Docker) |
| Internal assets (images, thumbs, heatmaps) | S3-compatible (`MAGIC_COMPARE_S3_*`). Never write to `public/internal-assets` or `.runtime`. |
| Published bundles | `MAGIC_COMPARE_PUBLISHED_ROOT` (defaults to `content/published`) |
| Public static export | `MAGIC_COMPARE_PUBLIC_EXPORT_DIR` (defaults to `dist/public-site`) |

## Key internal-site API endpoints

Upload flow (called by uploader in order):
- `POST /api/ops/group-upload-start`
- `POST /api/ops/group-upload-frame-prepare` → returns presigned PUT URL; uploader uploads directly to S3
- `POST /api/ops/group-upload-frame-commit`
- `POST /api/ops/group-upload-complete`

Publish/deploy flow (must be triggered explicitly):
- `POST /api/ops/case-publish` → writes manifest to `MAGIC_COMPARE_PUBLISHED_ROOT`; does NOT auto-export or deploy
- `POST /api/ops/public-export` → builds static public bundle
- `POST /api/ops/public-deploy` → export + Cloudflare Pages upload

Workspace operations:
- `POST /api/ops/import-sync`, `POST /api/ops/group-reorder`, `POST /api/ops/frame-reorder`

## Hard constraints (P0)

> Violating these causes broken deployments, data loss, or viewer failure. No exceptions.
>
> - **Never write internal assets to `public/`** — `next start` caches static assets; runtime-written files will 404. Use S3 only.
> - **Never trigger `public:export` and `public:deploy` concurrently** — they share build directories and will corrupt each other.
> - **`public:export` and `public:deploy` are never implicit side effects of `case-publish`** — they must always be triggered separately.
> - **Never mix `internal-site` and `public-site` code responsibilities** — `public-site` is read-only static; it has no catalog, no upload UI, no write APIs.

## Information source priority

When investigating current behavior, check in this order:
1. Root `package.json` and app-level `package.json` scripts
2. Implementation code in `apps/`, `packages/`, `scripts/`, Docker files
3. `docs/workflow-guide.md` and other evergreen docs in `docs/`
4. README files (navigation only — may be outdated; code always wins on conflict)

## Constraints and known gotchas

- **`pnpm db:push` does not run `prisma db push`** — it runs `apps/internal-site/prisma/init-db.ts` (workaround for local Prisma schema engine issue).
- **`public-site` requires at least one published group to build** — empty `content/published` causes misleading build errors.
- **Demo images require both SQLite seed AND S3** — seed writes metadata; demo images are served from S3. Both must be present for the viewer to work.
- **Internal slugs use single hyphens** (`kebab-case`); public slugs use double hyphens as separators (`case--group`).
- **`public-site` canonical route is `/g/[publicSlug]`** — `/cases/[caseSlug]/groups/[groupSlug]` is a legacy redirect, not a primary path.
- **Viewer layout constraints**: main stage must self-size, filmstrip must use real scroll (not a carousel black box), heatmap must share the same media rect as the base image.

## AI agent execution rules

### Before making changes
1. Locate entry scripts (root `package.json` + target app `package.json`).
2. Locate implementation and config (`apps/`, `packages/`, `scripts/`, Docker files).
3. For `docs/` files: read only the first 10 lines unless actively implementing or debugging — first 10 lines are enough to judge relevance.
4. If README conflicts with implementation, trust implementation and update docs accordingly.

### Change principles
- Prefer minimal necessary changes; no unrelated reformatting or mass formatting.
- Reuse existing code; do not reinvent what already exists.
- Do not introduce new dependencies without explaining why alternatives are insufficient.
- When touching `app/api/ops/case-publish`, `lib/server/publish/`, `lib/server/public-site/`, manifest types in `packages/content-schema/`, or asset/mode logic in `packages/compare-core/` — verify the change does not break what `public-site` renders after a fresh `public:export`. This is the "public-site visible behavior" check.
- When a code change requires a doc update, include both in the same commit.

### Code comment rules
- Functions >10 lines must have a header comment.
- Any function with side effects must have a header comment regardless of length.
- Inline comments required for: business rules, boundary conditions, magic numbers, compatibility shims, performance trade-offs.
- Comments must explain *why*, not restate what the code does.
- If code needs heavy comments to be readable, refactor first.

### Risk checks
- **Path alias risk**: modules executed directly by root scripts must not depend on app-local path aliases. Root scripts run outside the app's module resolution context.
- **Data boundary risk**: do not write production data or published bundles into the repository.
- **Demo boundary risk**: demo is for bootstrap validation only; it does not substitute real import flows.
- **Dual-site risk**: do not mix `internal-site` and `public-site` responsibilities (see P0 above).

### Post-change validation
- **Docs changes**: verify heading + 1–2 line summary; check no stale links remain.
- **Code changes**: run typecheck or tests for the affected scope; if unable, state why explicitly.
- **Script/publish pipeline changes**: verify `public:export` I/O paths are correct.
- **Process changes**: update the relevant doc in `docs/`, not just README.

### Prohibited behaviors
- Do not draw conclusions based solely on README or memory — trace all claims to specific files/scripts/docs.
- Do not present unverified guesses as confirmed facts; if uncertain, explicitly mark what is confirmed vs. unconfirmed.
- Do not modify `case-publish` logic and `public:export`/`public:deploy` logic in the same change — keep them independent; changes to publish output shape must be validated through a separate export run.

## Commit and branch conventions

- `main` is production — never commit development work directly to it.
- Branch naming: `codex/<topic>`
- Format: `<type>: <summary>` (feat / fix / refactor / style / docs / chore / test)
- One commit per independent logical change. When a code change and its required doc update belong together, they go in the same commit — do not split them. Do not batch unrelated changes.
- The summary line must make "why and what changed" clear on its own. A summary that cannot be written clearly usually means the change scope is too broad.

## MCP tool usage

- **`next-js_docs`**: App Router, static generation, server actions, caching, routing
- **`context7`**: React, MUI, Prisma, Zod, dnd-kit, Motion, other third-party libs
- **`mcp-vector-search`**: search current codebase before adding or modifying anything (`pnpm mcp:index` if results are empty)
- **`cloudflare_api`**: Cloudflare account/R2/Pages configuration

Search the codebase first; confirm library APIs via docs before implementing.

## Documentation

Full scenario → document map: `docs/INDEX.md`

| Scenario | First doc to read |
|---|---|
| Overall workflow, constraints, known gotchas | `docs/workflow-guide.md` |
| API integration or uploader development | `docs/reference/api-endpoints.zh-CN.md` |
| Demo vs. real import flow differences | `docs/reference/demo-vs-real.zh-CN.md` |
| Commit/branch conventions | `docs/commit-guide.md` |
| MCP tool priority and principles | `docs/mcp-usage-guide.md` |
| Uploader usage (for group members) | `docs/uploader/README.md` |

**Authority levels:**
- `docs/workflow-guide.md`, `docs/commit-guide.md`, `docs/mcp-usage-guide.md` — evergreen, high authority
- `docs/reference/` — accurate but must stay in sync with code
- `docs/archive/` — historical session logs; do not use as current constraints

**Maintenance conventions:**
- After renaming or moving any `docs/` file, fix all internal references in the same commit.
- Every doc must have a 1–2 sentence summary immediately under its `# title`.
- When a process changes, update the relevant doc in `docs/`; then update README navigation.
