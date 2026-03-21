# Changelog

This project started keeping a structured changelog on 2026-03-21.

Entries before that date are summarized at release level instead of being reconstructed commit by commit.

## Unreleased

## v1.2.0 - 2026-03-21

Deployment and runtime release focused on making Docker self-contained, preserving runtime branding config, and improving inspection fidelity for generated heatmaps.

### Added

- Uploader-generated heatmaps now use a thermal diffusion palette with softer spread, making large changes read as red-hot regions and subtle changes stay greener.
- `docker-compose.yml` now passes footer branding env and custom public-site base URL through to `internal-site`, so Docker deployments honor runtime footer and published-link configuration without extra file editing.
- Internal-site host port mapping is now configurable through `MAGIC_COMPARE_INTERNAL_SITE_HOST_PORT`, making port conflicts on deployment hosts easier to avoid.

### Changed

- Base Docker deployment has been simplified so deployment hosts only need `.env`, `docker-compose.yml`, and the published runtime image; compose no longer depends on checked-out `./docker/*.sh` helper mounts.
- `rustfs-init` and `internal-site-init` now run from inline compose entrypoints instead of external shell script mounts, reducing deployment-specific moving parts.
- Root public export/deploy scripts now run with the internal-site TypeScript config, keeping path alias resolution consistent between local and CI execution.

### Fixed

- Footer and public runtime env loading now explicitly reads workspace-level `.env` files in the monorepo, preventing branding/footer settings from silently falling back to defaults.
- Docker runtime now propagates footer config and custom public site URL correctly into `next start`, fixing cases where deployed pages still rendered `Magic Compare` instead of env-configured branding.
- Compose-based server deployments no longer require repository-side init scripts to exist on the host filesystem.

## v1.0.1 - 2026-03-21

First post-`v1.0.0` maintenance release focused on deployment correctness, public-link behavior, and A/B inspection polish.

### Added

- `A / B` inspect mode now exposes stepped `- / +` scale controls from `1x` through `8x`, keeping pixelated point-to-point inspection usable on higher-resolution sources.
- Internal-site published links can now prefer a custom public base domain via `MAGIC_COMPARE_PUBLIC_SITE_BASE_URL`, falling back to `*.pages.dev` only when that value is unset.

### Changed

- `.env.example` is now grouped by runtime scope with clearer separation between uploader, host-local development, Docker runtime, shared S3, and Cloudflare deploy settings.
- Internal object-storage container tuning is no longer exposed as a pile of low-value env knobs; the local compose runtime now keeps those values fixed in `docker-compose.yml`.

### Fixed

- `Deploy Pages` now republishes the current case before export/deploy so changed public S3 URLs or other publish-time metadata do not stay stale inside `published` manifests.
- Group viewer footer year display now collapses identical start/end years instead of rendering redundant ranges like `2026-2026`.
- Group viewer case-title alignment and A/B scale affordances received small final polish adjustments after `v1.0.0`.
- `docker/ci.compose.override.yml` now explicitly switches `internal-site` and `internal-site-init` back to a local CI image build, preventing the GHCR smoke workflow from trying to pull the published `:main` image before the publish job runs.

## v1.0.0 - 2026-03-21

First stable release of Magic Compare Web with a production-ready internal/public split, S3-backed image delivery, and a fully reworked comparison viewer.

### Added

- Pixel-exact A/B inspect mode with staged activation, fine zoom, pan, and `1x` to `4x` scale presets.
- Configurable global footer with env-driven author, year range, and optional `Join us` link.
- Persistent `Open details` state across internal and public viewer shells.
- Bottom-right workspace notification center for publish, deploy, reorder, and visibility feedback.
- UI improvement records under `docs/ui-improvements/` to preserve viewer and workspace interaction lessons.

### Changed

- Public exports and Cloudflare Pages deploys now publish only static pages and manifest metadata while images are served directly from public S3 URLs.
- Internal and public viewers now share the same S3-backed image URL resolution model instead of relying on internal dynamic asset serving.
- Base `docker-compose.yml` now defaults to the published GHCR runtime image, while local development overrides explicitly switch back to a local image build plus bind mounts.
- The viewer toolbar, filmstrip motion, fit behavior, and sidebar chrome were tightened around serious inspection work instead of preview-style interaction.
- Catalog and case workspace layouts were rebalanced for wide screens, clearer hierarchy, and a denser but more consistent action rhythm.
- Case subtitles are now deprecated across importer, app, and publish flows and are no longer used in the frontend.
- Demo seed content now lands in a published-ready state, making first-run verification and public export validation easier.

### Fixed

- Deploy progress now emits a dedicated toast notification instead of silently starting or piggybacking on generic workspace-saving feedback.
- Workspace save notifications now only appear for real workspace mutations, and group reorder failures roll back cleanly with error feedback.
- Group viewer title clipping, sidebar weight hierarchy, control alignment, and several filmstrip interaction regressions were resolved.
- A/B mode now avoids conflicting with browser zoom and mobile page scroll behavior while preserving inspect-grade image control.
- Cloudflare Pages deployment runtime no longer keeps a redundant post-command token check after configuration has already been validated.

## v0.9.0 - 2026-03-21

Promoted the post-`v0.8.0` infrastructure work into a fuller release covering Docker runtime hardening, S3-backed internal asset delivery, and workflow compatibility fixes.

### Added

- Dedicated `internal-site-init` container step for database push and demo seed before app startup.
- Local development Docker scripts in the root workspace package for common compose actions.
- `docker/dev.compose.override.yml` for local bind-mount development on top of the base compose stack.

### Changed

- Base `docker-compose.yml` now defaults to named volumes, making server-side runtime less dependent on repository-local directories.
- `rustfs-init` now uses a lighter `minio/mc`-based bucket initialization flow.
- `internal-site` now starts the app only, instead of bundling database initialization into the main container command.
- RustFS is pinned to `rustfs/rustfs:1.0.0-alpha.89` for more predictable local and deployment behavior.
- Internal asset delivery now resolves to browser-facing public S3 URLs instead of relying on internal logical paths alone.
- Deployment and environment documentation now reflects the public S3 asset model and the required runtime variables.

### Fixed

- Workflow waiting logic now handles exited one-shot compose tasks correctly instead of timing out on successful init containers.
- Docker startup behavior is more resilient through separated init responsibilities and explicit restart and healthcheck handling for `internal-site`.
- Demo seed output is now marked as published so CI and export validation follow the same published-content path as runtime.
- CI and GHCR workflows now explicitly provide `MAGIC_COMPARE_S3_PUBLIC_BASE_URL`, keeping seeded asset uploads compatible with the current runtime config.

## v0.8.0 - 2026-03-21

First formal release checkpoint for the current multi-branch, CI/CD-backed workflow.

### Added

- GitHub Actions CI workflow for workspace verification and demo public export verification.
- GitHub Actions GHCR workflow for runtime smoke tests and multi-arch container publishing.
- CI-specific Docker Compose override using named volumes instead of local bind mounts.
- Workflow and deployment guidance in `docs/workflow-guide.md` and `docs/ci-ghcr-lessons.zh-CN.md`.

### Changed

- `main` is now treated as the release branch, with day-to-day development moved to topic branches.
- Demo assets are unified under `apps/internal-site/prisma/demo-assets`.
- CI and GHCR workflows now keep logs, summaries, and export artifacts for easier debugging.
- GHCR publishing now distinguishes branch builds from version-tagged releases.

### Fixed

- Root-level `public:export` execution no longer depends on app-local TypeScript path aliases.
- `apps/public-site` content tests were aligned with manifest-based published content validation.
- `rustfs-init` bucket initialization now avoids host-side Compose interpolation issues.
- CI Docker execution now avoids runner bind mount permission problems by using named volumes.
- Demo export and smoke-test workflows were tightened around the actual runtime path.

### Historical Summary Before Structured Changelog

- Established the current internal/public site split for Magic Compare Web.
- Refined the viewer stage, filmstrip behavior, and internal workspace presentation.
- Moved internal assets to S3-compatible storage and clarified the uploader/import/publish flow.
- Reworked docs around project scope, workflow boundaries, and deployment behavior.
