# Changelog

This project started keeping a structured changelog on 2026-03-21.

Entries before that date are summarized at release level instead of being reconstructed commit by commit.

## Unreleased

### Fixed

- CI compose smoke and GHCR Docker smoke now explicitly set `MAGIC_COMPARE_HIDE_DEMO=false` whenever they expect demo seed to run against the CI RustFS sidecar, matching the new “demo only seeds when demo is visible and external storage is configured” runtime rule.

## v1.6.0 - 2026-03-28

R2-first upload and maintainability release focused on moving internal assets to external S3-compatible storage, making frame uploads resumable and inspectable, and tightening viewer/mobile behavior before the next tag.

### Added

- Internal-site now exposes frame-level upload orchestration endpoints: `group-upload-start`, `group-upload-frame-prepare`, `group-upload-frame-commit`, `group-upload-complete`, plus `case-delete`, `case-list`, and `case-groups`.
- Uploader now persists group upload job state locally, resumes from the last fully committed frame, and exposes `list-cases` / `list-groups` commands for operator discovery.
- Wizard upload flow now shows file-level progress, current frame/stage, and skipped/retried/failed counters instead of only a coarse original-image counter.
- Added dedicated engineering notes and a full internal API endpoint reference under `docs/` for the new upload workflow and maintainability cleanup.

### Changed

- Bundled local RustFS/MinIO compose services were removed; Docker, dev bootstrap, and CI now assume external S3-compatible storage, with Cloudflare R2 as the default reference setup.
- Uploader import flow now uses presigned PUT URLs signed by internal-site and no longer calls `import-sync` or any binary upload proxy endpoint.
- `case.yaml` no longer carries `status`, `group.yaml` no longer carries `isPublic`, and reused cases are treated as read-only metadata snapshots.
- Internal asset keys for new uploads now live under opaque `/groups/<group>/<frame>/<revision>/...` prefixes instead of semantic `/internal-assets/<case>/<group>/...` paths.
- Viewer/workspace hotspots were split into smaller helper modules, and uploader orchestration was decomposed into clearer runtime, progress, and wizard layers to reduce future maintenance risk.
- Uploader package metadata is now versioned as `1.6.0` to match the release tag line.

### Fixed

- Group deletion now deletes the stored bucket prefix rather than guessing storage paths from slugs, and demo seed/publish helpers now emit data that matches the new group/frame storage model.
- Group restarts and public visibility downgrades now recompute case-level derived state instead of leaving `coverAssetId` empty or stale after destructive upload resets.
- Lookahead frame prepare failures now persist into uploader session state and summary output instead of aborting with an unstructured top-level exception.
- Wizard progress now renders frame titles as plain text, preventing bracketed names like `[v2] sample` from being swallowed by Rich markup parsing.
- Group Viewer mobile layout now reserves A/B toolbar space up front, fixes stage sizing/layout regressions, and avoids title descenders being clipped by header overflow rules.

## v1.5.2 - 2026-03-22

Group Viewer mobile adaptation and uploader robustness release.

### Added

- Uploader now accepts `rip` as a fallback after variant (priority: out > output > rip > others) to support tools that export non-standard naming like ripple or temporal difference maps.
- Uploader wizard now offers explicit `c` option to create new case, making the intent clearer than relying on default behavior.

### Fixed

- Group Viewer on landscape phones now uses compact header layout (viewportWidth < 760px orientation:portrait) to prevent stage overflow and improve usable area.
- Group Viewer stage container now properly constrains height on mobile via CSS grid and flex layout fixes, preventing content from exceeding viewport.
- ViewerHeader and ViewerToolbar now adapt flex direction at xs breakpoint for landscape phones.
- Both app layouts now include proper viewport meta tags with initialScale and viewportFit for full mobile device support.
- iOS Safari blur effect on swipe handle now works correctly with WebkitBackdropFilter.
- Custom pinch-zoom on iOS Safari now works in A/B mode with proper touchAction handling.

## v1.5.1 - 2026-03-22

Viewer interaction and accessibility hardening release.

### Fixed

- Keyboard shortcuts now properly guard against system/browser shortcuts (Ctrl+1, Cmd+←, etc.), input method composition, and form/contenteditable regions to avoid unintended mode switches and IME interference.

### Changed

- A/B drag interactions now skip redundant state updates when clamping produces no change, reducing render cycles during high-frequency pan/zoom operations.

### Improved

- Filmstrip thumbnails now use native lazy loading (`loading="lazy"`) to defer off-screen image loads, improving initial page load time for cases with many frames.
- Removed unused React wheel event handler that was duplicating DOM-level wheel processing, reducing bundle complexity.
- Added ARIA label to external publish link button for improved screen reader support.
- Clarified keyboard shortcut guard layer documentation for future maintainers.

## v1.5.0 - 2026-03-22

Uploader hardening release focused on making remote uploads credential-light, packaging startup less painful, and turning tag builds into real GitHub releases.

### Added

- Internal-site now exposes a dedicated asset-upload proxy endpoint so remote uploader runs only need the site URL plus Cloudflare Service Token credentials.
- Uploader packaging now supports `onedir` and `onedir + zip`, making it possible to distribute a single archive while keeping runtime startup fast after the first manual unzip.
- GitHub tag builds now create uploader release archives and publish a GitHub Release instead of stopping at workflow artifacts only.

### Changed

- Uploader config resolution now checks the packaged binary directory `.env`, then the caller cwd `.env`, and only uses the work-dir `.env` as a fallback snapshot.
- Uploader binary CI now builds `onedir zip` artifacts by default, matching the current startup/performance tradeoff better than PyInstaller `onefile`.
- Docker data mounts are now environment-driven: leave the new mount env vars blank to use named volumes, or point them at host paths to bind into `docker-data/**`.
- Uploader package metadata is now versioned as `1.5.0` to match the release tag line.

### Fixed

- Running the packaged uploader from `dist/` no longer gets silently redirected back to `localhost` by a newly created or stale work-dir `.env`.
- Remote uploader usage no longer requires exposing raw S3 credentials on the client side.

## v1.3.0 - 2026-03-21

Refactor and stability release focused on breaking apart viewer/workspace hotspots, hardening browser-level verification, and making local runtime debugging more trustworthy.

### Added

- Playwright and Playwright Test were added as workspace dev dependencies to support local browser debugging and future browser-smoke CI coverage.
- A dedicated browser smoke and CI preparation guide was added under `docs/`, including explicit guidance to verify real image decode instead of trusting `HTTP 200` alone.
- Viewer and workspace hot paths now expose focused helper modules for filmstrip drag physics, stage pan/zoom interactions, and workspace action handling, keeping the exported hooks thin and easier to audit.

### Changed

- Root published-sync and legacy public-route alias scripts now run through TypeScript + `tsx`, removing the old mixed MJS script path for release-related maintenance tasks.
- Internal content queries, mutations, import handling, publish flow, public runtime wiring, viewer workbench, and workspace board were split into smaller modules to reduce God files and hotspot concentration.
- Internal catalog/workspace/viewer application types no longer propagate deprecated `subtitle` fields, while schema, import, publish, and public manifest compatibility remain intact.
- Workflow and MCP usage docs were refreshed to reflect the current release path, browser-smoke lessons, and the updated `mcp-vector-search` usage model.
- Generated app build outputs are now ignored by Git so local analysis and browser debugging do not pollute the worktree.

### Fixed

- Viewer and workspace regressions around `Open`, `Internal/Public`, mode switching, sidebar/details toggles, and optimistic local state synchronization were stabilized after the large viewer/workspace split.
- A/B wheel zoom and local dev bootstrap behavior were hardened so local Docker/runtime debugging is less likely to land on a false app state.
- Mobile rotated viewer behavior now keeps drag and swipe directions aligned with the screen, and misleading scale-only motion affordances were removed.
- Public export now pins nested `tsx` maintenance scripts to the workspace base tsconfig so `pnpm public:export` keeps working under CI and other nested runtime entry points.

## v1.2.1 - 2026-03-21

Maintenance release focused on consolidating shared runtime wiring, simplifying release build targets, and documenting the current repo workflow more clearly.

### Added

- A new project overview guide, refreshed MCP usage notes, and two `mcp-vector-search` reference documents were added under `docs/` to capture the current codebase structure and tool usage boundaries.

### Changed

- Internal-site and public-site now share a common root layout shell, reducing duplicated font, theme, and footer wiring across the two Next.js apps.
- Workspace-level `.env` loading is now centralized for app runtime helpers and root scripts, reducing duplicated parsing logic across the monorepo.
- GHCR image publishing now targets `linux/amd64` only, matching the current server fleet and avoiding unnecessary `arm64` build overhead.
- Repository docs were reorganized and renamed for more consistent paths, including the VSEditor workflow guide, UI improvement notes, workflow documentation, uploader references, and top-level README links.

### Fixed

- Node-only workspace env helpers are now exposed through a dedicated shared-utils subpath instead of the browser-safe root export, preventing public-site builds from pulling `node:*` modules into the client graph.

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
