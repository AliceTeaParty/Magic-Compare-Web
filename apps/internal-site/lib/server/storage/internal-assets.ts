import { Readable } from "node:stream";
import { extname, posix as pathPosix } from "node:path";
import { readFile } from "node:fs/promises";
import {
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
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

export interface InternalAssetHeadState {
  metadata: Record<string, string>;
  size: number;
}

export interface PresignedInternalAssetUpload {
  key: string;
  logicalPath: string;
  uploadUrl: string;
  expiresInSeconds: number;
  contentType: string;
}

function hasTraversal(input: string): boolean {
  return input
    .split("/")
    .some((segment) => segment === ".." || segment.length === 0);
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
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });

  return cachedClient;
}

/**
 * Normalize AWS SDK body variants into bytes once so the sanity-check layer stays independent from
 * Node stream/runtime differences.
 */
async function bodyToUint8Array(body: unknown): Promise<Uint8Array> {
  if (!body) {
    return new Uint8Array();
  }

  if (body instanceof Uint8Array) {
    return body;
  }

  if (
    typeof body === "object" &&
    body !== null &&
    "transformToByteArray" in body &&
    typeof body.transformToByteArray === "function"
  ) {
    return body.transformToByteArray();
  }

  if (body instanceof Readable) {
    const chunks: Buffer[] = [];
    for await (const chunk of body) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return new Uint8Array(Buffer.concat(chunks));
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
  contentType: string;
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
      ContentType: params.contentType,
    }),
    { expiresIn: expiresInSeconds },
  );

  return {
    key,
    logicalPath: params.logicalPath,
    uploadUrl,
    expiresInSeconds,
    contentType: params.contentType,
  };
}

/**
 * Head is shared by commit and cleanup flows because both need a cheap existence check that does
 * not download the full object body just to verify one prepared upload finished.
 */
export async function headInternalAsset(logicalPath: string): Promise<InternalAssetHeadState | null> {
  const client = buildS3Client();
  const config = getInternalAssetStorageConfig();

  try {
    const response = await client.send(
      new HeadObjectCommand({
        Bucket: config.bucket,
        Key: internalAssetObjectKey(logicalPath),
      }),
    );

    return {
      metadata: Object.fromEntries(
        Object.entries(response.Metadata ?? {}).map(([key, value]) => [
          key.toLowerCase(),
          value ?? "",
        ]),
      ),
      size: Number(response.ContentLength ?? 0),
    };
  } catch (error) {
    const statusCode =
      typeof error === "object" && error && "$metadata" in error
        ? Number(
            (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode ?? 0,
          )
        : 0;
    const errorName =
      typeof error === "object" && error && "name" in error ? String(error.name) : "";

    if (statusCode === 404 || errorName === "NotFound" || errorName === "NoSuchKey") {
      return null;
    }

    throw error;
  }
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

  return bodyToUint8Array(response.Body);
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
