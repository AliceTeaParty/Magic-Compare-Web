# Changelog

This project started keeping a structured changelog on 2026-03-21.

Entries before that date are summarized at release level instead of being reconstructed commit by commit.

## Unreleased

- No unreleased entries yet.

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
