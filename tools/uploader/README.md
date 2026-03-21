# Magic Compare Uploader

This document covers the Python uploader in `tools/uploader`.

For a concrete Chinese walkthrough that starts with a flat VSEditor export folder and ends with a successful `sync`, see `docs/VSEDITOR-WORKFLOW.zh-CN.md`.

The uploader is intentionally local-first. It is designed for the current v1 workflow where images already live on disk and the web app should not implement a complex browser upload experience.

The default entry point is now an interactive Chinese wizard:

```bash
magic-compare-uploader
```

It can start from a flat VSEditor export folder, generate a structured work directory, open metadata files in the system editor for confirmation, auto-generate heatmaps, and sync the result into the internal site.

## What the uploader does

The uploader has three jobs:

- validate the local case directory structure
- upload original images, thumbnails, and generated heatmaps into S3-compatible internal asset storage
- build and optionally sync an import manifest to the internal site

Current internal asset destination:

```text
MAGIC_COMPARE_S3_BUCKET + MAGIC_COMPARE_S3_INTERNAL_PREFIX
```

Default internal site homepage:

```text
http://localhost:3000
```

Current default sync endpoint derived from the site URL:

```text
http://localhost:3000/api/ops/import-sync
```

The uploader now reads configuration from a work-directory `.env` file and ships with a repository-level `.env.example` template:

```text
MAGIC_COMPARE_SITE_URL=http://localhost:3000
MAGIC_COMPARE_API_URL=
MAGIC_COMPARE_S3_BUCKET=magic-compare-assets
MAGIC_COMPARE_S3_REGION=us-east-1
MAGIC_COMPARE_S3_ENDPOINT=http://localhost:9000
MAGIC_COMPARE_S3_ACCESS_KEY_ID=rustfsadmin
MAGIC_COMPARE_S3_SECRET_ACCESS_KEY=rustfsadmin
MAGIC_COMPARE_S3_FORCE_PATH_STYLE=true
MAGIC_COMPARE_S3_INTERNAL_PREFIX=internal-assets
MAGIC_COMPARE_CF_ACCESS_TOKEN=
MAGIC_COMPARE_CF_ACCESS_CLIENT_ID=
MAGIC_COMPARE_CF_ACCESS_CLIENT_SECRET=
```

## Installation

From the repository root:

```bash
cd tools/uploader
python3 -m venv .venv
source .venv/bin/activate
pip install -e .
```

After installation, the CLI entry point is:

```bash
magic-compare-uploader
```

## Configuration and Cloudflare Access

The uploader supports two auth modes:

- local human users: Cloudflare Access through `cloudflared`
- CI / automation: Cloudflare Service Token headers

### Work-directory `.env`

When the wizard creates or reuses a work directory, it also creates:

```text
<work-dir>/.env
```

If no `.env` exists yet, the CLI copies the repository `.env.example` into that work directory.

Default meanings:

- `MAGIC_COMPARE_SITE_URL`: the internal site homepage and Cloudflare Access app URL
- `MAGIC_COMPARE_API_URL`: optional override; if blank, the uploader derives `/api/ops/import-sync` from `MAGIC_COMPARE_SITE_URL`
- `MAGIC_COMPARE_S3_*`: shared S3-compatible storage config for internal assets
- `MAGIC_COMPARE_CF_ACCESS_TOKEN`: a human login token written by the CLI after successful `cloudflared` login
- `MAGIC_COMPARE_CF_ACCESS_CLIENT_ID` / `MAGIC_COMPARE_CF_ACCESS_CLIENT_SECRET`: optional CI credentials

### Local human login

When `MAGIC_COMPARE_SITE_URL` points to a non-local site and no Service Token is configured, the uploader:

1. checks whether `cloudflared` exists
2. on macOS, tries `brew install cloudflared` if it is missing
3. runs `cloudflared access login <site-url>`
4. runs `cloudflared access token -app=<site-url>`
5. writes the returned token into `<work-dir>/.env` as `MAGIC_COMPARE_CF_ACCESS_TOKEN`

This keeps the one-command wizard flow intact while letting Cloudflare Access handle browser login.

### CI / automation

Automation should not use browser login. Instead set:

```text
MAGIC_COMPARE_CF_ACCESS_CLIENT_ID=...
MAGIC_COMPARE_CF_ACCESS_CLIENT_SECRET=...
```

When both are present, the uploader sends:

- `CF-Access-Client-Id`
- `CF-Access-Client-Secret`

and skips `cloudflared`.

## Default Wizard

Running the CLI without subcommands launches the one-stop import wizard.

It will:

1. ask for a source directory
2. recursively scan image files
3. auto-detect `before` / `after` / `misc`
4. search existing cases from the internal site
5. default to the current year case if you don't choose another one
6. generate or reuse a structured work directory next to the source folder
7. create `<work-dir>/.env` from `.env.example` when needed
8. authenticate against Cloudflare Access when needed
9. generate `case.yaml`, `group.yaml`, `frame.yaml`, and `assets.yaml`
10. open metadata in the system editor for confirmation
11. auto-generate `heatmap.png` when missing
12. upload assets to S3-compatible storage, build the import manifest, and sync it

Default work directory:

```text
<source-dir>-case
```

Example:

```text
/Users/crop/Downloads/Telegram/test-example
-> /Users/crop/Downloads/Telegram/test-example-case
```

Case selection behavior:

- pressing Enter reuses the current year case if it exists
- otherwise pressing Enter creates the current year case
- choosing an existing case preserves that case's title, summary, tags, and status

Group conflict behavior:

- if the selected case already has the same group slug, the wizard asks whether to overwrite it or create a suffixed slug such as `group-2`

## Expert Commands

### `scan`

Validate the directory structure and print a summary.

```bash
magic-compare-uploader scan /path/to/sample-case
```

What it does:

- checks that `groups/` exists
- checks ordered folder naming
- checks that every frame has `before` and `after`
- prints the detected case/group/frame summary

### `manifest`

Stage assets and emit the import manifest JSON.

```bash
magic-compare-uploader manifest /path/to/sample-case
```

Write manifest to a file:

```bash
magic-compare-uploader manifest /path/to/sample-case -o /tmp/demo-manifest.json
```

Important:

- this command is not read-only
- it uploads original files and thumbnails into S3-compatible storage
- it generates thumbnails

### `sync`

Stage assets and push the manifest to the internal site.

```bash
magic-compare-uploader sync /path/to/sample-case
```

Use a custom internal API URL:

```bash
magic-compare-uploader sync /path/to/sample-case --api-url http://localhost:3100/api/ops/import-sync
```

Use a site URL and let the uploader derive API endpoints:

```bash
magic-compare-uploader sync /path/to/sample-case --site-url https://compare-internal.example.com
```

### `delete-group`

Delete a group from an existing case and clean its related internal assets.

Interactive selection:

```bash
magic-compare-uploader delete-group
```

Direct deletion:

```bash
magic-compare-uploader delete-group --case-slug 2026 --group-slug test-example
```

## Required directory convention

The uploader expects ordered directories.

```text
sample-case/
  case.yaml
  groups/
    001-banding-check/
      group.yaml
      frames/
        001-gradient-sweep/
          frame.yaml
          before.png
          after.png
          heatmap.png
          crop-1.png
          note.md
        002-edge-hold/
          before.png
          after.png
```

### Ordered directory names

Both group and frame directories must use:

```text
<order>-<slug>
```

Examples:

- `001-banding-check`
- `002-edge-hold`

The numeric prefix is converted to zero-based `order` in the manifest.

## Metadata files

### `case.yaml`

Supported fields:

- `slug`
- `title`
- `subtitle`
- `summary`
- `tags`
- `status`
- `coverAssetLabel`

Example:

```yaml
slug: grain-retention-study
title: Grain Retention Study
subtitle: Deband and edge hold
summary: Internal compare set for debanding passes.
tags:
  - grain
  - deband
status: internal
coverAssetLabel: After
```

### `group.yaml`

Supported fields:

- `title`
- `description`
- `defaultMode`
- `isPublic`
- `tags`

Example:

```yaml
title: Banding Check
description: Gradient cleanup and texture recovery.
defaultMode: before-after
isPublic: true
tags:
  - gradient
  - grain
```

### `frame.yaml`

Supported fields:

- `title`
- `caption`

Example:

```yaml
title: Gradient Sweep
caption: Sky gradient with visible banding.
```

### `assets.yaml`

`assets.yaml` is optional.

When present, it can override per-asset notes and labels keyed by file stem.

Example:

```yaml
before:
  note: raw-src.png
after:
  note: output-v2.png
heatmap:
  note: Auto-generated from raw-src.png vs output-v2.png
```

### `note.md`

`note.md` is optional.

If present, its contents become the fallback `note` field of every asset in that frame.
`assets.yaml` takes priority over `note.md`.

## Supported asset discovery

The uploader scans a frame directory with the following rules.

### Required files

- `before.*`
- `after.*`

Supported extensions:

- `.png`
- `.jpg`
- `.jpeg`
- `.webp`
- `.avif`
- `.svg`

### Optional files

- `heatmap.*`
- `crop-*.*`
- any other supported file, which is treated as `misc`

When using the default wizard on a flat source directory:

- `src` or `source` becomes the unique `before`
- `out` is preferred as `after`
- `output` is second
- all other same-frame outputs are treated as `misc`
- `heatmap` is preserved when explicitly present, otherwise auto-generated

## How asset upload works

The uploader does not upload binaries through the internal-site HTTP API.

Instead it performs an S3 upload step:

1. upload original assets into `MAGIC_COMPARE_S3_BUCKET` under `internal-assets/[caseSlug]/[groupSlug]/[frameOrder]/`
2. generate thumbnails in a temporary directory with `thumb-` prefix
3. compute `imageUrl` and `thumbUrl` as logical `/internal-assets/...` paths stored in metadata
4. upload both originals and thumbnails into the configured S3 bucket/prefix
5. construct the import manifest
6. optionally send the manifest JSON to the internal site

Example object keys:

```text
internal-assets/
  grain-retention-study/
    banding-check/
      001/
        before.png
        thumb-before.png
        after.png
        thumb-after.png
        heatmap.png
        thumb-heatmap.png
```

## Manifest semantics

The uploader emits the current repository import shape:

- case metadata at the top
- groups array
- nested frames array
- nested assets array

Current asset semantics:

- `before` and `after` are marked `isPrimaryDisplay: true`
- `heatmap`, `crop`, and `misc` are marked `isPrimaryDisplay: false`
- `before`, `after`, and `heatmap` default to `isPublic: true`
- `crop` and `misc` default to `isPublic: false`

This matches the current v1 intention:

- public compare pages should expose the main pair and optional heatmap
- extra crops and miscellaneous material stay internal by default

## Thumbnail generation

Raster inputs:

- thumbnails are generated through Pillow
- current max thumbnail size is `480x270`

SVG inputs:

- thumbnails are currently copied as-is
- width and height are read from `viewBox` or SVG width/height attributes

## How sync works

The uploader sends the manifest to:

```text
POST /api/ops/import-sync
```

The internal site then:

- validates the manifest with shared Zod schemas
- upserts the case by slug
- upserts groups by `(caseId, slug)`
- deletes existing frames/assets under replaced groups
- recreates frames/assets from the manifest
- sets a cover asset when possible

## Current assumptions

The uploader currently assumes:

- it runs inside this repository
- it can upload into the configured S3 bucket
- the internal site is reachable over HTTP or HTTPS if `sync` is used
- protected remote sites are fronted by Cloudflare Access if Zero Trust is enabled

## Typical workflows

### Start from a flat source folder

```bash
magic-compare-uploader
```

Follow the prompts, choose or reuse a case, confirm generated metadata, and let the wizard sync the result.

### Validate a new case folder

```bash
magic-compare-uploader scan ~/work/cases/grain-retention-study
```

### Stage assets and inspect generated manifest

```bash
magic-compare-uploader manifest ~/work/cases/grain-retention-study -o /tmp/manifest.json
```

### Import into a running internal site

```bash
pnpm dev:internal
magic-compare-uploader sync ~/work/cases/grain-retention-study
```

### Publish after import

1. open the internal site
2. open the case workspace
3. reorder groups if needed
4. open a group and reorder frames if needed
5. click publish in the case workspace
6. click `Export public site` or run `pnpm public:export`
7. click `Deploy to Pages` or run `pnpm public:deploy` when Cloudflare env is ready

## Troubleshooting

### `before` or `after` missing

Symptom:

- `scan`, `manifest`, or `sync` fails with a missing asset error

Fix:

- ensure each frame directory contains both `before.*` and `after.*`

### Invalid ordered directory name

Symptom:

- uploader rejects a folder name

Fix:

- rename it to `<order>-<slug>`
- example: `001-banding-check`

### Wrong `imageUrl` output path

Symptom:

- assets do not load in the internal site

Fix:

- ensure you are running the uploader from this repository layout
- confirm the uploaded objects exist in the configured S3 bucket and prefix

### `sync` cannot reach the internal site

Symptom:

- HTTP request fails

Fix:

- start `pnpm dev:internal`
- confirm the site is listening on the URL passed to `--site-url` or `--api-url`

### Cloudflare Access login fails

Symptom:

- the uploader cannot reach a protected internal site
- `cloudflared` login does not complete

Fix:

- confirm `MAGIC_COMPARE_SITE_URL` points at the protected internal site homepage
- confirm that the site is configured as a Cloudflare Access self-hosted application
- if `cloudflared` is missing on macOS, let the CLI install it or run `brew install cloudflared`
- if the token is stale, rerun the command; the uploader clears `MAGIC_COMPARE_CF_ACCESS_TOKEN` and retries once on 401/403

### Public site still shows old content after publish

Symptom:

- `content/published` is updated but `public-site` still serves stale assets

Fix:

- run `pnpm public:export`
- rebuild or redeploy the public static site

## Future improvements

- dry-run mode that validates without uploading binaries
- richer metadata support in `frame.yaml`
- uploader-side validation for duplicate labels and more explicit publish defaults
