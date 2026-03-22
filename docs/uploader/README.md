# Magic Compare Uploader

This document covers the Python-only uploader in `tools/uploader`.
Its workflow is intentionally split from the TS/JS sites so local import tooling can evolve without leaking runtime assumptions back into `apps/`.

Related docs:

- `docs/uploader/vseditor-workflow.zh-CN.md`: shortest path from a flat VSEditor export folder to a successful sync
- `docs/uploader/boundaries-and-env-split.zh-CN.md`: why uploader docs and env files live outside the website runtime
- `docs/uploader/distribution.zh-CN.md`: single-binary build and CI artifact notes

## What changed in the hardened uploader

The uploader now treats every run as three explicit stages:

1. `plan`: scan local files, validate images, collect ignored noise, and build a machine-readable upload plan
2. `upload`: upload only the required objects, skip matching remote objects, and resume from the last session automatically
3. `sync`: send the final import manifest to `internal-site`

That change exists for one reason: finding input problems after a long upload is too expensive. The tool now tries to surface naming, structure, and image issues before any remote write begins.

## Installation

From the repository root:

```bash
cd tools/uploader
python3 -m venv .venv
source .venv/bin/activate
pip install -e .
```

CLI entry point:

```bash
magic-compare-uploader
```

## Configuration

The uploader keeps its own `.env` template at `tools/uploader/.env.example`.
When the wizard creates or reuses a work directory, it seeds `<work-dir>/.env` from that template.

Current fields:

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
MAGIC_COMPARE_CF_ACCESS_CLIENT_ID=
MAGIC_COMPARE_CF_ACCESS_CLIENT_SECRET=
```

Rules:

- `MAGIC_COMPARE_SITE_URL` is the internal-site homepage
- `MAGIC_COMPARE_API_URL` can override the sync endpoint; if blank, uploader derives `/api/ops/import-sync`
- `MAGIC_COMPARE_S3_*` config is uploader-local only and should not be copied back into the website runtime docs
- remote internal sites now support **Service Token only**
- local/private targets such as `localhost`, `127.0.0.1`, or RFC1918 private IPs can still run without auth headers

The uploader no longer performs `cloudflared` login and no longer writes a human access token back into `.env`.

## Commands

### Interactive wizard

```bash
magic-compare-uploader
```

This is still the main entry point for manual operators. The wizard now:

- parses a flat source folder
- shows a preflight plan summary
- prepares or reuses a structured work directory
- opens metadata files for confirmation
- uploads objects with auto-resume
- syncs the manifest only after uploads succeed

### Plan / dry-run

```bash
magic-compare-uploader plan /path/to/source
magic-compare-uploader plan /path/to/source --case-slug 2026 --group-slug test-example
magic-compare-uploader sync /path/to/work-dir --dry-run
```

`plan` and `sync --dry-run` both:

- count upload operations
- report ignored files and why they were ignored
- report blocking issues such as broken key images or target path conflicts
- summarize intended target URLs
- return exit code `0` for usable plans and `1` when blocking issues were found

Optional machine output:

```bash
magic-compare-uploader plan /path/to/source --report-json /tmp/plan.json
```

## Upload sessions and resume

Structured sync runs now store session state at:

```text
<work-dir>/.magic-compare/upload-session.json
```

Each session records:

- the planned operation hash
- per-object state: `pending`, `uploaded`, `skipped`, `failed`
- retry counts
- source fingerprints

Behavior:

- rerunning `sync` on the same work dir resumes automatically when the plan hash matches
- if the input changed, uploader discards the stale session and builds a new one
- `sync --reset-session` forces a clean restart
- remote objects are skipped when their metadata already matches the local file fingerprint

This is why upload metadata now includes `sha256`, `source-size`, and `derivative-kind`.

## Input cleaning and image sanity

The uploader now treats common junk files as explicit ignored input instead of hard errors.
Typical ignored files include:

- `.DS_Store`
- `Thumbs.db`
- `._*`
- editor temp files
- obvious sidecars such as `.txt`, `.json`, `.yaml`
- generated `thumb-*` files

Ignored files appear in the plan/report output. They are not silently swallowed.

Image sanity checks happen in two places:

- local uploader side: raster images go through a quick Pillow verify/load pass; SVGs get a lightweight XML + `<svg>` check
- server side: `import-sync` and `publish` only do a cheap prefix-based sanity check to reject obviously bad or disguised files

This is intentionally lightweight. The project only needs to reject “not actually a normal image” cases, not build a full security scanning pipeline.

## Manifest generation

`manifest` is now local-only:

```bash
magic-compare-uploader manifest /path/to/work-dir -o manifest.json
```

It builds the import manifest shape from local files and metadata, but it does not upload assets and does not call the internal API.

## Delete group

```bash
magic-compare-uploader delete-group --case-slug 2026 --group-slug out --work-dir /path/to/work-dir
```

This uses the same auth rules as `sync`. Local targets can run without Service Token headers; remote targets require them.

## Troubleshooting

- `plan` fails before upload:
  - fix broken images, duplicate target URLs, or malformed work-dir metadata first
- remote requests return `401` or `403`:
  - check `MAGIC_COMPARE_CF_ACCESS_CLIENT_ID` and `MAGIC_COMPARE_CF_ACCESS_CLIENT_SECRET`
  - check the internal-site Access policy rather than retrying blindly
- rerunning `sync` seems to “skip too much”:
  - inspect `<work-dir>/.magic-compare/upload-session.json`
  - use `--reset-session` if you intentionally want a full re-upload
- uploads work locally but not in CI:
  - make sure CI is using uploader’s own `.env` contract, not the root website `.env.example`

## Boundaries to keep

- uploader docs live under `docs/uploader/`, not under `tools/uploader/`
- uploader env vars live in `tools/uploader/.env.example`, not the root `.env.example`
- uploader does not own public-site export or deploy behavior
- the website should only consume uploader output through manifests, storage objects, and import APIs
