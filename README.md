# Magic Compare Web

Magic Compare Web is a monorepo for an image compare platform aimed at encoding groups.

The project has two deployment targets:

- `internal-site`: internal catalog, case workspace, compare viewer, reorder operations, and publish operations.
- `public-site`: static, read-only group pages that consume published artifacts from `content/published`.

This repository is deliberately not a video previewer, not an online VapourSynth runner, and not an in-site review/comment system. The current scope is "look" and "publish".

## Current Status

The repository is fully bootstrapped and verified:

- `pnpm install` works.
- `pnpm db:push` initializes the SQLite schema.
- `pnpm db:seed` seeds a demo case into the internal database and stages demo internal assets.
- `pnpm sync:published` copies published bundles into `apps/public-site/public/published`.
- `pnpm build` succeeds for both Next.js apps.
- `pnpm test` succeeds for shared schema and viewer logic tests.

The seeded demo case is:

- Internal site case slug: `demo-grain-study`
- Internal group slug: `banding-check`
- Public group slug: `demo-grain-study--banding-check`

## Monorepo Layout

```text
apps/
  internal-site/
  public-site/

packages/
  compare-core/
  content-schema/
  shared-utils/
  ui/

tools/
  uploader/

content/
  published/
```

### apps/internal-site

Internal site responsibilities:

- show the case catalog
- show a case workspace
- show the internal group viewer
- accept import manifests from the uploader
- reorder groups within a case
- reorder frames within a group
- publish public artifacts into `content/published`

Key implementation areas:

- `app/`: Next.js App Router routes
- `components/`: internal-only UI such as the case directory and workspace list
- `lib/server/repositories/`: read/write data access backed by Prisma client
- `lib/server/publish/`: publish pipeline that filters public content and writes manifests
- `lib/server/storage/`: filesystem helpers for published artifacts
- `prisma/schema.prisma`: Prisma data model
- `prisma/init-db.ts`: SQLite schema bootstrap script used by `pnpm db:push`

### apps/public-site

Public site responsibilities:

- statically generate published group pages
- read only from `content/published/groups/*/manifest.json`
- expose no catalog, no upload UI, and no write APIs

Key implementation areas:

- `app/g/[publicSlug]/page.tsx`: SSG group viewer entry
- `lib/content.ts`: published manifest reader

### packages/content-schema

Shared Zod schemas and TypeScript types for:

- case
- group
- frame
- asset
- import manifest
- publish manifest
- enums such as `CaseStatus`, `ViewerMode`, and `AssetKind`

Important current rule:

- internal `slug` values use kebab-case with single hyphens
- public `publicSlug` values allow double hyphen separators such as `case--group`

### packages/compare-core

Shared viewer logic:

- viewer dataset shape
- asset lookup helpers
- available mode calculation
- heatmap fallback resolution
- client-side viewer controller state

### packages/ui

Shared viewer workbench and theme:

- dark modern MUI theme
- group viewer shell
- top toolbar
- main stage
- filmstrip rail
- right sidebar

### tools/uploader

Python CLI that:

- validates a local case directory
- stages source images into `apps/internal-site/public/internal-assets`
- generates thumbnails
- builds an import manifest
- posts the manifest to `POST /api/ops/import-sync`

There is a dedicated uploader document at `tools/uploader/README.md`.

## Data Model

The current implementation uses four content entities.

### Case

Case is the top-level container.

Fields:

- `id`
- `slug`
- `title`
- `subtitle`
- `summary`
- `tags[]`
- `status`
- `coverAssetId`
- `publishedAt`
- `updatedAt`

### Group

Group is the smallest public sharing unit.

Fields:

- `id`
- `caseId`
- `slug`
- `publicSlug`
- `title`
- `description`
- `order`
- `defaultMode`
- `isPublic`
- `tags[]`

### Frame

Frame is one position in the filmstrip. A group can contain multiple frames.

Fields:

- `id`
- `groupId`
- `title`
- `caption`
- `order`
- `isPublic`

### Asset

Asset is one concrete image variant attached to a frame.

Fields:

- `id`
- `frameId`
- `kind`
- `label`
- `imageUrl`
- `thumbUrl`
- `width`
- `height`
- `note`
- `isPublic`
- `isPrimaryDisplay`

Current semantic rules:

- `before` and `after` are required for every frame
- `before` and `after` are the default primary display assets
- `heatmap` is optional
- `crop` and `misc` are optional

## Routing

### Internal site

- `/`
- `/cases/[caseSlug]`
- `/cases/[caseSlug]/groups/[groupSlug]`
- `POST /api/ops/import-sync`
- `POST /api/ops/group-reorder`
- `POST /api/ops/frame-reorder`
- `POST /api/ops/case-publish`

### Public site

- `/g/[publicSlug]`

The public site intentionally has no index page.

## Viewer Behavior

The shared viewer layout follows the agreed workbench structure:

- top lightweight toolbar
- central main stage
- bottom filmstrip rail
- collapsible right sidebar

Supported v1 viewer modes:

- `before-after`
- `a-b`
- `heatmap`

Current heatmap degradation rules:

- if a frame has no heatmap asset, the public site hides the heatmap entry
- on the internal site, heatmap is shown as unavailable through state and sidebar information
- if the current frame does not support heatmap, viewer mode falls back to `group.defaultMode`
- if `group.defaultMode` also depends on heatmap, the final fallback is `before-after`

Keyboard support currently includes:

- left and right arrow for frame navigation
- `1` for before/after
- `2` for A/B
- `3` for heatmap
- `i` for sidebar toggle

## Import Flow

The current import flow is filesystem-first.

1. A local case directory is prepared according to the uploader convention.
2. The uploader scans the directory and validates required files.
3. The uploader copies source images into `apps/internal-site/public/internal-assets/...`.
4. The uploader generates thumbnails next to the staged files.
5. The uploader builds an `ImportManifest`.
6. The uploader posts the manifest to `POST /api/ops/import-sync`.
7. The internal site upserts case/group metadata, deletes existing frame/asset rows for replaced groups, and recreates them from the manifest.

Important current limitation:

- the uploader assumes it is running inside this repository, because staging currently writes directly into `apps/internal-site/public/internal-assets`

## Publish Flow

The current publish flow is explicit and case-scoped.

1. Internal site calls `POST /api/ops/case-publish`.
2. The publish pipeline loads the full case and filters `group.isPublic`, `frame.isPublic`, and `asset.isPublic`.
3. Each public group gets a stable `publicSlug`. If it does not exist yet, it is derived from `caseSlug--groupSlug`. Collisions add a short suffix.
4. Public assets are copied from internal staged assets into `content/published/groups/[publicSlug]/assets`.
5. A `manifest.json` with `schemaVersion` is written for each published group.
6. `pnpm sync:published` copies `content/published` into `apps/public-site/public/published` for the public deployment target.

Important current rule:

- a public frame without both `before` and `after` causes publish to fail

## Local Development

### 1. Install dependencies

```bash
pnpm install
```

### 2. Initialize SQLite

```bash
pnpm db:push
```

Note:

- `pnpm db:push` currently runs `apps/internal-site/prisma/init-db.ts`
- Prisma remains the runtime ORM
- this workaround exists because `prisma db push` itself fails in the current local environment

### 3. Seed demo content

```bash
pnpm db:seed
pnpm sync:published
```

### 4. Start internal and public sites

In separate terminals:

```bash
pnpm dev:internal
pnpm dev:public
```

Suggested local URLs:

- internal site: `http://localhost:3000`
- public site: `http://localhost:3001` or another port if you launch it separately

## Build and Test

Build everything:

```bash
pnpm build
```

Run all tests:

```bash
pnpm test
```

Run workspace type checks:

```bash
pnpm typecheck
```

## Demo Assets and Published Bundle

The repository includes a checked-in published demo bundle:

- `content/published/groups/demo-grain-study--banding-check/manifest.json`
- corresponding SVG assets in the same directory

This is used for:

- public-site static generation
- local verification of the publish artifact shape
- seed/bootstrap reference content

## Current Limitations

- Prisma migrations are not yet wired; SQLite bootstrap is currently implemented through a manual init script.
- Internal asset staging is repo-local, not remote-storage-backed.
- The public site consumes published artifacts from the same repository; external deployment sync is still a pre-build step, not a dedicated pipeline.
- The uploader does not yet support remote binary upload. It stages files locally and syncs metadata over HTTP.
- There is no browser-side upload UI in v1.
- There is no in-site discussion, scoring, annotation, or review workflow.

## Recommended Next Steps

- add a proper migration workflow once the Prisma schema engine issue is resolved in this environment
- move internal assets from app public storage to object storage or a dedicated managed path
- add richer error reporting for reorder and publish failures in the UI
- add end-to-end tests around internal reorder and publish flows
