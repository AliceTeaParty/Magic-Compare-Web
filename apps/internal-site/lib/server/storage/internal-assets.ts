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

export interface InternalAssetObject {
  body: Uint8Array;
  contentType: string;
  contentLength: number;
  lastModified: Date | null;
}

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

export function internalAssetObjectKey(assetUrl: string): string {
  const { objectPrefix } = getInternalAssetStorageConfig();
  const relativePath = assetRelativePath(assetUrl);
  return objectPrefix ? `${objectPrefix}/${relativePath}` : relativePath;
}

export async function readInternalAsset(assetUrl: string): Promise<InternalAssetObject> {
  const client = buildS3Client();
  const config = getInternalAssetStorageConfig();
  const response = await client.send(
    new GetObjectCommand({
      Bucket: config.bucket,
      Key: internalAssetObjectKey(assetUrl),
    }),
  );

  const body = response.Body ? await response.Body.transformToByteArray() : null;
  if (!body) {
    throw new Error(`Internal asset body missing: ${assetUrl}`);
  }

  return {
    body: new Uint8Array(body),
    contentType: response.ContentType || guessMimeType(assetUrl),
    contentLength: Number(response.ContentLength ?? body.byteLength),
    lastModified: response.LastModified ?? null,
  };
}

export async function uploadLocalFileToInternalAsset(localFilePath: string, assetUrl: string): Promise<void> {
  const content = await readFile(localFilePath);
  await uploadInternalAssetBuffer(content, assetUrl, guessMimeType(localFilePath));
}

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
