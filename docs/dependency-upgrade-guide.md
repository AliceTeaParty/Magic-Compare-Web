# 依赖升级指南

本文记录 workspace 的依赖升级批次、当前基线和迁移检查项。更新依赖时先确认实际安装版本与官方迁移文档，再按责任边界拆分提交。

最后更新：2026-09-22。

## 当前基线

| 范围                           | 版本                           |
| ------------------------------ | ------------------------------ |
| Next.js / React / React DOM    | `16.3.5` / `19.2.8` / `19.2.8` |
| Prisma / Prisma Client         | `7.10.0`                       |
| Zod                            | `4.4.3`                        |
| TypeScript / typescript-eslint | `6.0.3` / `8.66.0`             |
| Vitest                         | `4.1.11`                       |
| Playwright                     | `1.62.1`                       |
| ESLint / React Hooks plugin    | `10.8.0` / `7.1.1`             |
| Prettier / tsx                 | `3.9.6` / `4.23.13`            |
| Wrangler / Motion              | `4.119.0` / `12.43.0`          |
| AWS S3 client / presigner      | `3.1104.0`                     |

最近一次已验证的批次更新了 Next.js `16.3.5`、Prisma `7.10.0`、Sharp `0.35.4`、tsx `4.23.13`、Vitest `4.1.11` 与 `@types/react-dom` `19.2.5`。TypeScript、Node 26 和 GitHub Actions major 仍保留为独立迁移项。

本地、CI 与 Docker 统一使用 Node `24.13.x`，pnpm 固定为 `10.32.1`，`@types/node` 保持 Node 24 版本线。根目录的 `@types/node`、`@types/react`、`@types/react-dom` 固定到已验证版本，避免工具升级附带未验证的类型变化。下一代 TypeScript、Prisma 和 pnpm 属于后续独立迁移，不进入常规补丁更新。

Next 开发缓存固定为 `.next-dev`，生产构建缓存为 `.next`。应用类型检查使用 `next typegen + tsc`；依赖升级验证时不需要为了类型检查停止开发服务器。

## 拆分顺序

依赖升级按下面四类提交：

1. 运行时与开发工具补丁：Playwright、ESLint、Prettier、tsx、Wrangler、Motion、AWS SDK 等。
2. Web 框架：Next.js 与 React 同步升级，并验证 internal-site 构建和 public-site 静态导出。
3. 类型、schema 与测试工具：TypeScript、typescript-eslint、Zod、Vitest 同批验证类型和测试行为。
4. 传递依赖安全补丁：根据 `pnpm audit` 固定兼容版本，单独提交锁文件变化。

框架、ORM 和测试工具的 major migration 分开后，构建失败可以直接定位到对应责任线。

## Next.js 16 迁移结论

参考 [Next.js 16 升级指南](https://nextjs.org/docs/app/guides/upgrading/version-16) 和 [next.config 配置文档](https://nextjs.org/docs/app/api-reference/config/next-config-js)。

- 两个应用使用 `next.config.mjs`。配置依赖的构建元数据 helper 同样使用原生 ESM，避免 Node 22/24 对 TypeScript 配置文件采用不同加载路径。
- `next build` 默认使用 Turbopack。internal-site 与 public-site 都要保留生产构建验证，public-site 还要确认动态公开路由被完整静态枚举。
- workspace 根目录的 `.env` 读取仅用于本地开发。动态路径需要使用 Turbopack ignore 标记，避免把整个仓库追踪进服务端产物；生产配置继续由 `process.env` 提供。
- React、React DOM、`@types/react` 和 `@types/react-dom` 与 Next.js 同批更新，避免运行时和 JSX 类型基线分离。

## TypeScript 6、Zod 4 与 Vitest 4

参考 [TypeScript 6 说明](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-6-0.html)、[Zod 4 迁移说明](https://zod.dev/v4/changelog) 和 [Vitest 4 迁移说明](https://vitest.dev/guide/migration)。

- TypeScript 6 会把 `baseUrl` 的弃用升级为错误。应用内 `@/*` 路径映射本身相对 tsconfig 解析，因此删除 `baseUrl` 和旧的 `ignoreDeprecations` 即可。
- Zod schema、API route 和 manifest 测试必须同批运行。类型检查通过不能代替 parse/validation 行为测试。
- Vitest 升级后运行全仓测试，覆盖 fake timers、mock、snapshot 和并发测试配置。当前仓库不需要 Vitest 4 兼容 shim。
- typescript-eslint 的 TypeScript 支持范围以[官方依赖版本说明](https://typescript-eslint.io/users/dependency-versions/)为准。升级 TypeScript 前先确认上限。

## Prisma 7 基线

迁移按 [Prisma 7 升级指南](https://www.prisma.io/docs/guides/upgrade-prisma-orm/v7) 和 [SQLite adapter 文档](https://www.prisma.io/docs/orm/v7/core-concepts/supported-databases/sqlite) 完成：

- `prisma`、`@prisma/client` 和 `@prisma/adapter-better-sqlite3` 固定为同一稳定版本 `7.10.0`。Prisma CLI 是开发依赖，运行环境只安装 client、adapter 和 SQLite native addon。
- schema 使用 `prisma-client` generator，并将生成源码放在 `apps/internal-site/generated/prisma/`。该目录不提交，由 `postinstall` 和 `db:generate` 重建；应用和 E2E fixture 都通过明确生成路径导入。
- datasource URL 位于 `apps/internal-site/prisma.config.ts`。CLI、`node:sqlite` 初始化器和运行时 adapter 共用 SQLite URL 解析规则，相对路径继续指向应用的 `prisma/` 目录。
- adapter 固定使用 `timestampFormat: "unixepoch-ms"`，保持与 Prisma 6 原生 SQLite 驱动写入的整数毫秒日期兼容。状态与模式字段继续使用既有字符串存储，不引入数据库 enum。
- `node:sqlite` 的 additive schema 初始化和 active upload job partial unique index保持不变。仓库没有引入第二套 migration ledger 或后台恢复进程。
- Docker builder 生成 client；runtime 从 builder 复制生成源码，并只重建 `better-sqlite3`、Sharp、esbuild 和 workerd 所需的安装脚本。镜像验证需要同时覆盖 client 加载和 native addon 查询。

## 传递依赖补丁

根 `package.json` 的 `pnpm.overrides` 只固定已有安全修复的兼容版本。目前覆盖 Babel、HumanFS、Browserslist、brace-expansion、defu、esbuild、fast-uri、picomatch、Sharp、Undici、Vite 和 YAML。

2026-09-13 的审计将 `fast-uri` 固定到 `3.1.6`、将 Wrangler 内 Miniflare 的 `sharp` 收敛到 `0.35.4`，并固定 `browserslist` `4.28.7` 与 `@humanfs/node` `0.16.8`。这些均为兼容范围内的补丁升级。

Prisma `7.10.0` 的 CLI 仍固定依赖 `deepmerge-ts@7.1.5` 和 `mysql2@3.15.3`，因此 `pnpm audit` 会报告对应公告。当前 schema 只允许 SQLite，应用不加载 Prisma CLI 的配置合并或 MySQL 驱动路径；不要用未经上游验证的 major override 改写 CLI 依赖。升级 Prisma 稳定版时重新检查，上游发布兼容修复后再移除这项已知结果。

维护规则：

- 每次常规升级后运行 `pnpm audit --audit-level low`。
- 上游依赖已经解析到安全版本时删除对应 override，避免永久持有无效约束。
- 新 override 必须有公开修复版本，并通过 lint、测试、类型检查和两站构建。
- 不用 major override 绕过 peer dependency 或迁移要求。

## 验证矩阵

常规依赖升级至少运行：

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm test
pnpm typecheck
pnpm audit --audit-level low
```

按改动范围增加：

```bash
pnpm --filter @magic-compare/internal-site exec vitest run lib/server/storage/internal-assets.test.ts
pnpm exec playwright install
pnpm public:export
pnpm docker:build:internal
```

AWS SDK 更新要确认 presigned PUT URL、签名 headers 和对象 URL。Playwright 更新后重新安装浏览器。Next.js、React、Zod、Vitest、TypeScript 或 Prisma 的 major upgrade 必须运行完整验证矩阵。
