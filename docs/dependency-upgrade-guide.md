# 依赖升级指南

本文记录 workspace 的依赖升级批次、当前基线和迁移检查项。更新依赖时先确认实际安装版本与官方迁移文档，再按责任边界拆分提交。

最后更新：2026-08-05。

## 当前基线

| 范围                           | 版本                           |
| ------------------------------ | ------------------------------ |
| Next.js / React / React DOM    | `16.3.0` / `19.2.8` / `19.2.8` |
| Prisma / Prisma Client         | `6.19.3`                       |
| Zod                            | `4.4.3`                        |
| TypeScript / typescript-eslint | `6.0.3` / `8.66.0`             |
| Vitest                         | `4.1.10`                       |
| Playwright                     | `1.62.1`                       |
| ESLint / React Hooks plugin    | `10.8.0` / `7.1.1`             |
| Prettier / tsx                 | `3.9.6` / `4.23.6`             |
| Wrangler / Motion              | `4.118.0` / `12.43.0`          |
| AWS S3 client / presigner      | `3.1103.0`                     |

本地、CI 与 Docker 统一使用 Node `24.13.x`，pnpm 固定为 `10.32.1`，`@types/node` 保持 Node 24 版本线。TypeScript 7、Prisma 7 和 pnpm 11 属于后续独立迁移，不进入常规补丁更新。

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

## Prisma 7 决策

本轮保留 Prisma `6.19.3`。当前实现仍使用 `prisma-client-js`、schema 内的 datasource URL、`@prisma/client` 导入和运行时 datasource override。Prisma 7 会同时改变这些边界，适合在 `codex/prisma-7` 独立处理。

迁移时按 [Prisma 7 升级指南](https://www.prisma.io/docs/guides/upgrade-prisma-orm/v7) 完成以下检查：

1. 将 client generator 改为 `prisma-client`，设置明确输出目录并更新全部导入。
2. 把 datasource 配置移入 `prisma.config.ts`，确认本地、Docker 和测试数据库 URL 的来源。
3. 为 SQLite 选择并接入支持的 driver adapter，重新验证 singleton、初始化脚本和 shutdown 行为。
4. 运行 schema generate、数据库初始化、seed、repository、上传 commit、publish 和 Docker smoke。

当前 Prisma 配置链里的 `defu` 已通过兼容补丁固定到安全版本，Prisma 7 迁移无需承担紧急漏洞修复职责。

## 传递依赖补丁

根 `package.json` 的 `pnpm.overrides` 只固定已有安全修复的兼容版本。目前覆盖 Babel、brace-expansion、defu、esbuild、fast-uri、picomatch、Undici、Vite 和 YAML。

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
