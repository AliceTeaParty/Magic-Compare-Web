# Magic Compare Web

[English](./README.md) | [简体中文](./README.zh-CN.md)

Magic Compare Web is a monorepo for reviewing and publishing image comparisons. It is built for focused before/after inspection and does not provide video processing or an in-site discussion workflow.

## Scope

- `internal-site`: server-backed catalog, case workspace, viewer, Web uploader, publishing, export, and deployment actions.
- `public-site`: static read-only pages generated from published manifests.
- `packages/`: shared viewer logic, content schemas, UI, and utilities.

## Quick Start

```bash
cp .env.example .env
# Fill in the required MAGIC_COMPARE_S3_* values.
pnpm install
pnpm dev:internal
```

Local entry points:

- Internal site: <http://localhost:3000>
- Public deploy monitor (`pnpm dev:all`): <http://localhost:3001>
- Demo page: <http://localhost:3001/g/demo-grain-study--banding-check>

Use `pnpm dev:bootstrap` when demo data needs repair, `pnpm dev:public` for public-site source development, or `pnpm dev:all` to monitor static deploy output beside the internal site.

## Workflows

### Upload

Open `/upload`, review the pairing plan, then preflight and upload the selected image set. The Web uploader guide is the source for current browser behavior and upload protocol details.

### Publish

Publish a case from the internal site, then explicitly export or deploy the public site when needed. Publishing, export, and deployment are separate actions.

## Repository Layout

```text
apps/internal-site/   Server-backed internal workspace
apps/public-site/     Static public viewer
packages/              Shared schemas, viewer logic, UI, and utilities
output/published/      Generated published manifest and demo content
docs/                  Workflow, API, deployment, and UI notes
```

## Common Commands

| Task                       | Command              |
| -------------------------- | -------------------- |
| Start internal site        | `pnpm dev:internal`  |
| Develop public-site source | `pnpm dev:public`    |
| Start deploy monitoring    | `pnpm dev:all`       |
| Repair demo and start      | `pnpm dev:bootstrap` |
| Build both apps            | `pnpm build`         |
| Run checks and tests       | `pnpm check`         |
| Run browser smoke tests    | `pnpm test:e2e`      |
| Initialize SQLite          | `pnpm db:push`       |
| Seed demo content          | `pnpm db:seed`       |
| Export public site         | `pnpm public:export` |
| Deploy public site         | `pnpm public:deploy` |
| Start local Docker runtime | `pnpm docker:dev:up` |

## Configuration

Copy `.env.example` to `.env`. Internal assets use S3-compatible storage; local Docker development uses the Compose configuration and named volumes. See the workflow guide for runtime, storage, and deployment details.

## Related Docs

- [Workflow and deployment guide](./docs/workflow-guide.md)
- [Web uploader guide](./docs/web-uploader.zh-CN.md)
- [API endpoint reference](./docs/reference/api-endpoints.zh-CN.md)
- [Database architecture](./docs/reference/database-architecture.zh-CN.md)
- [Demo vs real case/group flow](./docs/reference/demo-vs-real.zh-CN.md)
- [UI/UX notes](./docs/uiux-todo.md)
- [Commit guide](./docs/commit-guide.md)
- [Chinese README](./README.zh-CN.md)

## License

Released under the [GNU General Public License v3.0](./LICENSE).
