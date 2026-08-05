import { describe, expect, it } from "vitest";
import {
  collectDoctorChecks,
  resolveLocalDatabasePath,
  validateRuntimeVersions,
  validateS3Configuration,
  validateSqliteConfiguration,
} from "./dev-doctor";

describe("development environment doctor", () => {
  it("accepts the pinned Node and pnpm toolchain", () => {
    expect(validateRuntimeVersions("v24.13.1", "pnpm/10.32.1 npm/? node/v24.13.1")).toEqual([
      { status: "ok", label: "Node.js", message: "v24.13.1" },
      { status: "ok", label: "pnpm", message: "10.32.1" },
    ]);
  });

  it("reports runtime version mismatches as blockers", () => {
    expect(
      validateRuntimeVersions("v22.22.0", "pnpm/10.31.0 npm/? node/v22.22.0").every(
        (item) => item.status === "error",
      ),
    ).toBe(true);
  });

  it("warns when S3 is absent and rejects partial credential groups", () => {
    expect(validateS3Configuration({})[0]?.status).toBe("warning");
    expect(validateS3Configuration({ MAGIC_COMPARE_S3_BUCKET: "bucket" })[0]).toMatchObject({
      status: "error",
      label: "S3/R2",
    });
  });

  it("accepts a complete S3 group without exposing credential values", () => {
    const result = validateS3Configuration({
      MAGIC_COMPARE_S3_BUCKET: "bucket",
      MAGIC_COMPARE_S3_PUBLIC_BASE_URL: "https://assets.example.com",
      MAGIC_COMPARE_S3_ACCESS_KEY_ID: "sensitive-access-key",
      MAGIC_COMPARE_S3_SECRET_ACCESS_KEY: "sensitive-secret",
    });
    expect(result).toEqual([{ status: "ok", label: "S3/R2", message: "对象存储变量已成组配置。" }]);
    expect(JSON.stringify(result)).not.toContain("sensitive");
  });

  it("resolves relative SQLite URLs inside the internal app prisma directory", () => {
    expect(resolveLocalDatabasePath("file:./dev.db", "/workspace")).toBe(
      "/workspace/apps/internal-site/prisma/dev.db",
    );
  });

  it("reports a non-writable SQLite path", async () => {
    await expect(
      validateSqliteConfiguration("file:./dev.db", "/workspace", async () => false),
    ).resolves.toEqual([
      {
        status: "error",
        label: "SQLite",
        message: "数据库路径不可写：/workspace/apps/internal-site/prisma/dev.db",
      },
    ]);
  });

  it("reports an occupied requested port", async () => {
    const checks = await collectDoctorChecks(
      "internal",
      {
        npm_config_user_agent: "pnpm/10.32.1 npm/? node/v24.13.1",
        DATABASE_URL: "file:./dev.db",
      },
      "/workspace",
      { portProbe: async () => false, writableProbe: async () => true },
    );

    expect(checks).toContainEqual({
      status: "error",
      label: "端口 3000",
      message: "已被占用；请先停止现有服务。",
    });
  });
});
