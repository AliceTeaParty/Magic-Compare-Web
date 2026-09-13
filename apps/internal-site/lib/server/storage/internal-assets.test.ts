import { S3Client } from "@aws-sdk/client-s3";
import { Readable } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";
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
  createPresignedInternalAssetUpload,
  internalAssetObjectKey,
  internalAssetPublicGroupBaseUrl,
  readInternalAssetBytes,
  readInternalAssetPrefix,
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

    expect(() =>
      internalAssetObjectKey("/internal-assets/2026/test-example/../before.png"),
    ).toThrow(/Invalid internal asset path/);
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

  it("does not presign optional sdk checksum parameters for direct uploads", async () => {
    process.env[S3_BUCKET_ENV_NAME] = "magic-compare-assets";
    process.env[S3_ENDPOINT_ENV_NAME] =
      "https://magic-compare-assets.example.r2.cloudflarestorage.com";
    process.env[S3_PUBLIC_BASE_URL_ENV_NAME] = "https://assets.example.com/bucket";
    process.env[S3_ACCESS_KEY_ID_ENV_NAME] = "example-access-key";
    process.env[S3_SECRET_ACCESS_KEY_ENV_NAME] = "example-secret-key";
    process.env[S3_INTERNAL_PREFIX_ENV_NAME] = "internal-assets";

    const signed = await createPresignedInternalAssetUpload({
      logicalPath: "/groups/abc123/1/revision/o1.png",
    });

    const url = new URL(signed.uploadUrl);
    expect(url.searchParams.get("X-Amz-SignedHeaders")).toBe("host");
    expect(url.searchParams.get("x-amz-checksum-crc32")).toBeNull();
    expect(url.searchParams.get("x-amz-sdk-checksum-algorithm")).toBeNull();
  });

  it("rejects a declared object size before buffering an oversized thumbnail", async () => {
    process.env[S3_BUCKET_ENV_NAME] = "magic-compare-assets";
    process.env[S3_PUBLIC_BASE_URL_ENV_NAME] = "https://assets.example.com/bucket";
    process.env[S3_ACCESS_KEY_ID_ENV_NAME] = "example-access-key";
    process.env[S3_SECRET_ACCESS_KEY_ENV_NAME] = "example-secret-key";
    const send = vi
      .spyOn(S3Client.prototype, "send")
      .mockResolvedValueOnce({ ContentLength: 9, Body: new Uint8Array([1]) } as never);

    try {
      await expect(readInternalAssetBytes("/groups/group-1/thumb.png", 8)).rejects.toThrow(
        /8-byte read limit/,
      );
    } finally {
      send.mockRestore();
    }
  });

  it("checks actual bytes when object storage omits content length", async () => {
    process.env[S3_BUCKET_ENV_NAME] = "magic-compare-assets";
    process.env[S3_PUBLIC_BASE_URL_ENV_NAME] = "https://assets.example.com/bucket";
    process.env[S3_ACCESS_KEY_ID_ENV_NAME] = "example-access-key";
    process.env[S3_SECRET_ACCESS_KEY_ENV_NAME] = "example-secret-key";
    const send = vi
      .spyOn(S3Client.prototype, "send")
      .mockResolvedValueOnce({ Body: new Uint8Array(9) } as never);

    try {
      await expect(readInternalAssetBytes("/groups/group-1/thumb.png", 8)).rejects.toThrow(
        /8-byte read limit/,
      );
    } finally {
      send.mockRestore();
    }
  });

  it("bounds a Range prefix response even when storage ignores the requested range", async () => {
    process.env[S3_BUCKET_ENV_NAME] = "magic-compare-assets";
    process.env[S3_ENDPOINT_ENV_NAME] = "http://localhost:9000";
    process.env[S3_PUBLIC_BASE_URL_ENV_NAME] = "https://assets.example.com/bucket";
    process.env[S3_ACCESS_KEY_ID_ENV_NAME] = "example-access-key";
    process.env[S3_SECRET_ACCESS_KEY_ENV_NAME] = "example-secret-key";
    const body = Readable.from([Buffer.alloc(513)]);
    const destroy = vi.spyOn(body, "destroy");
    const send = vi
      .spyOn(S3Client.prototype, "send")
      .mockResolvedValueOnce({ Body: body } as never);

    try {
      await expect(readInternalAssetPrefix("/groups/group-1/thumb.png", 512)).rejects.toThrow(
        /512-byte read limit/,
      );
      expect(send).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({ Range: "bytes=0-511" }),
        }),
      );
      expect(destroy).toHaveBeenCalled();
    } finally {
      send.mockRestore();
      destroy.mockRestore();
    }
  });
});
