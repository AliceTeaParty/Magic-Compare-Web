import { afterEach, describe, expect, it } from "vitest";
import {
  S3_BUCKET_ENV_NAME,
  S3_ENDPOINT_ENV_NAME,
  S3_PUBLIC_BASE_URL_ENV_NAME,
  S3_ACCESS_KEY_ID_ENV_NAME,
  S3_SECRET_ACCESS_KEY_ENV_NAME,
  S3_INTERNAL_PREFIX_ENV_NAME,
  getInternalAssetStorageConfig,
} from "@/lib/server/runtime-config";
import {
  internalAssetObjectKey,
  internalAssetPublicGroupBaseUrl,
  resolvePublicInternalAssetUrl,
} from "./internal-assets";

const originalEnv = {
  bucket: process.env[S3_BUCKET_ENV_NAME],
  endpoint: process.env[S3_ENDPOINT_ENV_NAME],
  publicBaseUrl: process.env[S3_PUBLIC_BASE_URL_ENV_NAME],
  accessKeyId: process.env[S3_ACCESS_KEY_ID_ENV_NAME],
  secretAccessKey: process.env[S3_SECRET_ACCESS_KEY_ENV_NAME],
  internalPrefix: process.env[S3_INTERNAL_PREFIX_ENV_NAME],
};

afterEach(() => {
  process.env[S3_BUCKET_ENV_NAME] = originalEnv.bucket;
  process.env[S3_ENDPOINT_ENV_NAME] = originalEnv.endpoint;
  process.env[S3_PUBLIC_BASE_URL_ENV_NAME] = originalEnv.publicBaseUrl;
  process.env[S3_ACCESS_KEY_ID_ENV_NAME] = originalEnv.accessKeyId;
  process.env[S3_SECRET_ACCESS_KEY_ENV_NAME] = originalEnv.secretAccessKey;
  process.env[S3_INTERNAL_PREFIX_ENV_NAME] = originalEnv.internalPrefix;
});

describe("internal asset storage helpers", () => {
  it("builds object keys from logical internal asset urls", () => {
    process.env[S3_BUCKET_ENV_NAME] = "magic-compare-assets";
    process.env[S3_ACCESS_KEY_ID_ENV_NAME] = "rustfsadmin";
    process.env[S3_SECRET_ACCESS_KEY_ENV_NAME] = "rustfsadmin";
    process.env[S3_INTERNAL_PREFIX_ENV_NAME] = "internal-assets";
    process.env[S3_PUBLIC_BASE_URL_ENV_NAME] = "https://assets.example.com/bucket/";

    expect(internalAssetObjectKey("/internal-assets/2026/test-example/001/before.png")).toBe(
      "internal-assets/2026/test-example/001/before.png",
    );
  });

  it("rejects path traversal in logical asset urls", () => {
    process.env[S3_BUCKET_ENV_NAME] = "magic-compare-assets";
    process.env[S3_ACCESS_KEY_ID_ENV_NAME] = "rustfsadmin";
    process.env[S3_SECRET_ACCESS_KEY_ENV_NAME] = "rustfsadmin";
    process.env[S3_PUBLIC_BASE_URL_ENV_NAME] = "https://assets.example.com/bucket";

    expect(() => internalAssetObjectKey("/internal-assets/2026/test-example/../before.png")).toThrow(
      /Invalid internal asset path/,
    );
  });

  it("resolves logical internal asset urls into public absolute urls", () => {
    process.env[S3_BUCKET_ENV_NAME] = "magic-compare-assets";
    process.env[S3_ACCESS_KEY_ID_ENV_NAME] = "rustfsadmin";
    process.env[S3_SECRET_ACCESS_KEY_ENV_NAME] = "rustfsadmin";
    process.env[S3_INTERNAL_PREFIX_ENV_NAME] = "internal-assets";
    process.env[S3_PUBLIC_BASE_URL_ENV_NAME] = "https://assets.example.com/bucket/";

    expect(resolvePublicInternalAssetUrl("/internal-assets/2026/test-example/001/before.png")).toBe(
      "https://assets.example.com/bucket/internal-assets/2026/test-example/001/before.png",
    );
    expect(internalAssetPublicGroupBaseUrl("/groups/abc123")).toBe(
      "https://assets.example.com/bucket/internal-assets/groups/abc123",
    );
  });

  it("reads env-driven s3 storage configuration", () => {
    process.env[S3_BUCKET_ENV_NAME] = "magic-compare-assets";
    process.env[S3_ENDPOINT_ENV_NAME] = "http://localhost:9000";
    process.env[S3_PUBLIC_BASE_URL_ENV_NAME] = "https://assets.example.com/bucket";
    process.env[S3_ACCESS_KEY_ID_ENV_NAME] = "rustfsadmin";
    process.env[S3_SECRET_ACCESS_KEY_ENV_NAME] = "rustfsadmin";
    process.env[S3_INTERNAL_PREFIX_ENV_NAME] = "internal-assets";

    expect(getInternalAssetStorageConfig()).toMatchObject({
      bucket: "magic-compare-assets",
      endpoint: "http://localhost:9000",
      publicBaseUrl: "https://assets.example.com/bucket",
      accessKeyId: "rustfsadmin",
      secretAccessKey: "rustfsadmin",
      objectPrefix: "internal-assets",
    });
  });
});
