import { Readable } from "node:stream";
import { extname } from "node:path";
import { readFile } from "node:fs/promises";
import {
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
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

function hasTraversal(input: string): boolean {
  return input.split("/").some((segment) => segment === ".." || segment.length === 0);
}

function guessMimeType(fileName: string): string {
  return MIME_TYPES[extname(fileName).toLowerCase()] ?? "application/octet-stream";
}

function assetRelativePath(assetUrl: string): string {
  const normalizedUrl = assetUrl.replace(/^\/+/, "");
  if (!normalizedUrl.startsWith("internal-assets/")) {
    throw new Error(`Unsupported internal asset url: ${assetUrl}`);
  }

  const relativePath = normalizedUrl.slice("internal-assets/".length);
  if (!relativePath || hasTraversal(relativePath)) {
    throw new Error(`Invalid internal asset path: ${assetUrl}`);
  }

  return relativePath;
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

export function internalAssetObjectKey(assetUrl: string): string {
  const { objectPrefix } = getInternalAssetStorageConfig();
  const relativePath = assetRelativePath(assetUrl);
  return objectPrefix ? `${objectPrefix}/${relativePath}` : relativePath;
}

export function resolvePublicInternalAssetUrl(assetUrl: string): string {
  const { publicBaseUrl } = getInternalAssetStorageConfig();
  return `${publicBaseUrl}/${internalAssetObjectKey(assetUrl)}`;
}

export function internalAssetPublicGroupBaseUrl(caseSlug: string, groupSlug: string): string {
  const { objectPrefix, publicBaseUrl } = getInternalAssetStorageConfig();
  const normalizedPath = [objectPrefix, caseSlug, groupSlug].join("/");
  if (hasTraversal(normalizedPath)) {
    throw new Error(`Invalid internal asset group path: ${caseSlug}/${groupSlug}`);
  }

  return `${publicBaseUrl}/${normalizedPath}`;
}

/**
 * Preserve this file-based helper because most importer paths still start from local files and
 * should not need to manually read buffers before uploading.
 */
export async function uploadLocalFileToInternalAsset(
  localFilePath: string,
  assetUrl: string,
): Promise<void> {
  const content = await readFile(localFilePath);
  await uploadInternalAssetBuffer(content, assetUrl, guessMimeType(localFilePath));
}

/**
 * Keep this byte-oriented helper because import/publish utilities sometimes generate content in
 * memory and should not be forced through a temporary file just to reach S3.
 */
export async function uploadInternalAssetBuffer(
  content: Uint8Array | Buffer,
  assetUrl: string,
  contentType?: string,
): Promise<void> {
  const client = buildS3Client();
  const config = getInternalAssetStorageConfig();
  await client.send(
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: internalAssetObjectKey(assetUrl),
      Body: content,
      ContentType: contentType || guessMimeType(assetUrl),
    }),
  );
}

/**
 * Read only a small prefix from S3 so import/publish can cheaply reject obviously broken or
 * masqueraded image objects without turning the server into a full scanner.
 */
export async function readInternalAssetPrefix(
  assetUrl: string,
  byteCount = 512,
): Promise<Uint8Array> {
  const client = buildS3Client();
  const config = getInternalAssetStorageConfig();
  const response = await client.send(
    new GetObjectCommand({
      Bucket: config.bucket,
      Key: internalAssetObjectKey(assetUrl),
      Range: `bytes=0-${Math.max(byteCount - 1, 0)}`,
    }),
  );

  return bodyToUint8Array(response.Body);
}

/**
 * Delete the whole prefix page by page because repeated imports/publishes can leave many objects
 * behind, and partial cleanup would leak stale assets into later runs.
 */
export async function deleteInternalAssetGroupObjects(
  caseSlug: string,
  groupSlug: string,
): Promise<void> {
  const client = buildS3Client();
  const config = getInternalAssetStorageConfig();
  const prefix = [config.objectPrefix, caseSlug, groupSlug].filter(Boolean).join("/") + "/";

  let continuationToken: string | undefined;

  do {
    const page = await client.send(
      new ListObjectsV2Command({
        Bucket: config.bucket,
        Prefix: prefix,
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
}
