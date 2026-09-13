import { Readable } from "node:stream";
import { extname, posix as pathPosix } from "node:path";
import { readFile } from "node:fs/promises";
import {
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getInternalAssetStorageConfig } from "@/lib/server/runtime-config";

const MIME_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".svg": "image/svg+xml",
};

let cachedClient: S3Client | null = null;
let cachedSignature: string | null = null;

export interface PresignedInternalAssetUpload {
  key: string;
  logicalPath: string;
  uploadUrl: string;
  expiresInSeconds: number;
}

function hasTraversal(input: string): boolean {
  return input.split("/").some((segment) => segment === ".." || segment.length === 0);
}

export function guessMimeType(fileName: string): string {
  return MIME_TYPES[extname(fileName).toLowerCase()] ?? "application/octet-stream";
}

/**
 * Strip leading slashes and validate that the path is rooted under a known prefix.
 * "groups/" is the current canonical prefix for frame-level presigned uploads.
 * "internal-assets/" is accepted for backward compat with demo seed data that predates the R2
 * migration; those records carry the old prefix literally in their stored logical paths.
 */
function normalizeLogicalPath(logicalPath: string): string {
  const normalized = logicalPath.replace(/^\/+/, "");
  if (
    !normalized ||
    (!normalized.startsWith("groups/") && !normalized.startsWith("internal-assets/"))
  ) {
    throw new Error(`Unsupported internal asset path: ${logicalPath}`);
  }

  if (hasTraversal(normalized)) {
    throw new Error(`Invalid internal asset path: ${logicalPath}`);
  }

  return normalized;
}

/**
 * Cache the S3 client by full runtime config so tests and local shells can swap endpoints safely
 * without leaving a stale client bound to old credentials or prefixes.
 */
function buildS3Client(): S3Client {
  const config = getInternalAssetStorageConfig();
  const signature = JSON.stringify(config);

  if (cachedClient && cachedSignature === signature) {
    return cachedClient;
  }

  cachedSignature = signature;
  cachedClient = new S3Client({
    region: config.region,
    endpoint: config.endpoint,
    forcePathStyle: config.forcePathStyle,
    // Direct-upload presigned URLs do not know the eventual request body up front. If the SDK
    // auto-adds flexible checksums here, it signs the empty-body CRC32 into the URL and R2 rejects
    // every real upload with 403.
    requestChecksumCalculation: "WHEN_REQUIRED",
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });

  return cachedClient;
}

function abortBody(body: unknown): void {
  if (body instanceof Readable) {
    body.destroy();
    return;
  }
  if (
    typeof body === "object" &&
    body !== null &&
    "cancel" in body &&
    typeof body.cancel === "function"
  ) {
    void body.cancel();
  }
}

/**
 * Reads an async byte source with a hard limit so a broken Range response cannot buffer a whole
 * object before image sanity checks reject it.
 */
async function readBoundedChunks(
  chunks: AsyncIterable<unknown>,
  maxByteCount?: number,
  abort?: () => void,
): Promise<Uint8Array> {
  const collected: Buffer[] = [];
  let totalBytes = 0;
  for await (const chunk of chunks) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
    totalBytes += buffer.byteLength;
    if (maxByteCount != null && totalBytes > maxByteCount) {
      abort?.();
      throw new Error(`Internal asset exceeds the ${maxByteCount}-byte read limit.`);
    }
    collected.push(buffer);
  }
  return new Uint8Array(Buffer.concat(collected));
}

/**
 * Normalize AWS SDK body variants into bytes once so the sanity-check layer stays independent from
 * Node stream/runtime differences.
 */
async function bodyToUint8Array(body: unknown, maxByteCount?: number): Promise<Uint8Array> {
  const assertWithinLimit = (bytes: Uint8Array) => {
    if (maxByteCount != null && bytes.byteLength > maxByteCount) {
      throw new Error(`Internal asset exceeds the ${maxByteCount}-byte read limit.`);
    }
    return bytes;
  };

  if (!body) {
    return new Uint8Array();
  }

  if (body instanceof Uint8Array) {
    return assertWithinLimit(body);
  }

  if (body instanceof Readable) {
    return readBoundedChunks(body, maxByteCount, () => body.destroy());
  }

  if (
    typeof body === "object" &&
    body !== null &&
    Symbol.asyncIterator in body &&
    typeof body[Symbol.asyncIterator] === "function"
  ) {
    return readBoundedChunks(body as AsyncIterable<unknown>, maxByteCount, () => abortBody(body));
  }

  if (
    typeof body === "object" &&
    body !== null &&
    "getReader" in body &&
    typeof body.getReader === "function"
  ) {
    const reader = body.getReader() as ReadableStreamDefaultReader<Uint8Array>;
    const chunks = {
      async *[Symbol.asyncIterator]() {
        try {
          while (true) {
            const next = await reader.read();
            if (next.done) return;
            yield next.value;
          }
        } finally {
          reader.releaseLock();
        }
      },
    };
    return readBoundedChunks(chunks, maxByteCount, () => void reader.cancel());
  }

  if (
    typeof body === "object" &&
    body !== null &&
    "transformToByteArray" in body &&
    typeof body.transformToByteArray === "function"
  ) {
    if (maxByteCount != null) {
      throw new Error("Unsupported bounded S3 response body type.");
    }
    return assertWithinLimit(await body.transformToByteArray());
  }

  throw new Error("Unsupported S3 response body type.");
}

export function internalAssetObjectKey(logicalPath: string): string {
  const { objectPrefix } = getInternalAssetStorageConfig();
  const relativePath = normalizeLogicalPath(logicalPath);
  if (!objectPrefix) {
    return relativePath;
  }

  if (relativePath === objectPrefix || relativePath.startsWith(`${objectPrefix}/`)) {
    return relativePath;
  }

  return `${objectPrefix}/${relativePath}`;
}

export function resolvePublicInternalAssetUrl(logicalPath: string): string {
  const { publicBaseUrl } = getInternalAssetStorageConfig();
  return `${publicBaseUrl}/${internalAssetObjectKey(logicalPath)}`;
}

export function internalAssetPublicGroupBaseUrl(storageRoot: string): string {
  const { publicBaseUrl } = getInternalAssetStorageConfig();
  const normalizedRoot = storageRoot.replace(/\/+$/, "");
  return `${publicBaseUrl}/${internalAssetObjectKey(normalizedRoot)}`;
}

/**
 * Preserve this file-based helper because seed/import utilities still start from local files and
 * should not need to manually read buffers before uploading.
 */
export async function uploadLocalFileToInternalAsset(
  localFilePath: string,
  logicalPath: string,
): Promise<void> {
  const content = await readFile(localFilePath);
  await uploadInternalAssetBuffer(content, logicalPath, guessMimeType(localFilePath));
}

/**
 * Keep this byte-oriented helper because import/publish utilities sometimes generate content in
 * memory and should not be forced through a temporary file just to reach object storage.
 */
export async function uploadInternalAssetBuffer(
  content: Uint8Array | Buffer,
  logicalPath: string,
  contentType?: string,
  metadata?: Record<string, string>,
): Promise<void> {
  const client = buildS3Client();
  const config = getInternalAssetStorageConfig();
  await client.send(
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: internalAssetObjectKey(logicalPath),
      Body: content,
      ContentType: contentType || guessMimeType(logicalPath),
      Metadata: metadata,
    }),
  );
}

/**
 * Prepare one direct-to-object-storage upload so the uploader never sees raw bucket credentials
 * while the server still controls path shape, expiry, and allowed content type per file.
 */
export async function createPresignedInternalAssetUpload(params: {
  logicalPath: string;
  expiresInSeconds?: number;
}): Promise<PresignedInternalAssetUpload> {
  const client = buildS3Client();
  const config = getInternalAssetStorageConfig();
  const expiresInSeconds = params.expiresInSeconds ?? 600;
  const key = internalAssetObjectKey(params.logicalPath);
  const uploadUrl = await getSignedUrl(
    client,
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: key,
    }),
    { expiresIn: expiresInSeconds },
  );

  return {
    key,
    logicalPath: params.logicalPath,
    uploadUrl,
    expiresInSeconds,
  };
}

/**
 * Read only a small prefix from object storage so import/publish can cheaply reject obviously
 * broken or masqueraded image objects without turning the server into a full scanner.
 */
export async function readInternalAssetPrefix(
  logicalPath: string,
  byteCount = 512,
): Promise<Uint8Array> {
  const client = buildS3Client();
  const config = getInternalAssetStorageConfig();
  const response = await client.send(
    new GetObjectCommand({
      Bucket: config.bucket,
      Key: internalAssetObjectKey(logicalPath),
      Range: `bytes=0-${Math.max(byteCount - 1, 0)}`,
    }),
  );

  if (response.ContentLength != null && response.ContentLength > byteCount) {
    abortBody(response.Body);
    throw new Error(`Internal asset exceeds the ${byteCount}-byte read limit.`);
  }

  return bodyToUint8Array(response.Body, byteCount);
}

/**
 * Reads one bounded object for server-side image derivation. Checking both the declared and actual
 * size prevents a malformed thumbnail from turning a publish into an unbounded memory allocation.
 */
export async function readInternalAssetBytes(
  logicalPath: string,
  maxByteCount: number,
): Promise<Uint8Array> {
  if (!Number.isInteger(maxByteCount) || maxByteCount <= 0) {
    throw new RangeError("Asset byte limit must be a positive integer.");
  }

  const client = buildS3Client();
  const config = getInternalAssetStorageConfig();
  const response = await client.send(
    new GetObjectCommand({
      Bucket: config.bucket,
      Key: internalAssetObjectKey(logicalPath),
    }),
  );

  if (response.ContentLength != null && response.ContentLength > maxByteCount) {
    abortBody(response.Body);
    throw new Error(`Internal asset exceeds the ${maxByteCount}-byte read limit.`);
  }

  return bodyToUint8Array(response.Body, maxByteCount);
}

/**
 * Delete the whole prefix page by page because frame retries and group resets can leave multiple
 * prepared revisions behind, and partial cleanup would leak stale assets into later imports.
 */
export async function deleteInternalAssetPrefix(prefix: string): Promise<void> {
  const client = buildS3Client();
  const config = getInternalAssetStorageConfig();
  const normalizedPrefix = internalAssetObjectKey(prefix.replace(/\/+$/, ""));
  const listPrefix = `${normalizedPrefix}/`;
  let continuationToken: string | undefined;

  do {
    const page = await client.send(
      new ListObjectsV2Command({
        Bucket: config.bucket,
        Prefix: listPrefix,
        ContinuationToken: continuationToken,
      }),
    );

    const keys = (page.Contents ?? [])
      .map((item) => item.Key)
      .filter((key): key is string => Boolean(key));

    if (keys.length > 0) {
      await client.send(
        new DeleteObjectsCommand({
          Bucket: config.bucket,
          Delete: {
            Objects: keys.map((Key) => ({ Key })),
            Quiet: true,
          },
        }),
      );
    }

    continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (continuationToken);

  // Some S3-compatible tools create zero-byte marker objects for folder names. Delete that exact
  // key too so a "removed" frame/group does not leave behind a dangling pseudo-directory.
  await client.send(
    new DeleteObjectsCommand({
      Bucket: config.bucket,
      Delete: {
        Objects: [{ Key: normalizedPrefix }, { Key: listPrefix }],
        Quiet: true,
      },
    }),
  );
}

export function buildLogicalStoragePath(...segments: Array<string | number>): string {
  const normalized = segments.map((segment) => String(segment).replace(/^\/+|\/+$/g, ""));
  const joined = pathPosix.join(...normalized);
  if (hasTraversal(joined)) {
    throw new Error(`Invalid storage path segments: ${segments.join("/")}`);
  }
  return `/${joined}`;
}
