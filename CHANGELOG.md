# Changelog

This project started keeping a structured changelog on 2026-03-21.

Entries before that date are summarized at release level instead of being reconstructed commit by commit.

## Unreleased

- No unreleased entries yet.

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

## v0.8.1 - 2026-03-21

Stabilized the Docker runtime path after `v0.8.0` and split container initialization into clearer service boundaries.

### Added

- Dedicated `internal-site-init` container step for database push and demo seed before app startup.
- Local development Docker scripts in the root workspace package for common compose actions.
- `docker/dev.compose.override.yml` for local bind-mount development on top of the base compose stack.

### Changed

- Base `docker-compose.yml` now defaults to named volumes, making server-side runtime less dependent on repository-local directories.
- `rustfs-init` now uses a lighter `minio/mc`-based bucket initialization flow.
- `internal-site` now starts the app only, instead of bundling database initialization into the main container command.
- RustFS is pinned to `rustfs/rustfs:1.0.0-alpha.89` for more predictable local and deployment behavior.

### Fixed

- Workflow waiting logic now handles exited one-shot compose tasks correctly instead of timing out on successful init containers.
- Docker startup behavior is more resilient through separated init responsibilities and explicit restart and healthcheck handling for `internal-site`.

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
