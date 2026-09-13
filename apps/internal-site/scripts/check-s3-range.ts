import { randomUUID } from "node:crypto";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";

interface S3ErrorMetadata {
  $metadata?: { httpStatusCode?: unknown };
  name?: unknown;
}

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

/** Validates that the very first signed Range read reaches storage with an intact signature. */
function isExpectedMissingKeyError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) {
    return false;
  }
  const { name, $metadata } = error as S3ErrorMetadata;
  return name === "NoSuchKey" && $metadata?.httpStatusCode === 404;
}

/** Executes exactly one Range request against a random key; no warm-up request may precede it. */
async function verifyFirstSignedRangeRead() {
  const endpoint = requireEnv("MAGIC_COMPARE_S3_ENDPOINT");
  const bucket = requireEnv("MAGIC_COMPARE_S3_BUCKET");
  const client = new S3Client({
    region: process.env.MAGIC_COMPARE_S3_REGION?.trim() || "us-east-1",
    endpoint,
    forcePathStyle: process.env.MAGIC_COMPARE_S3_FORCE_PATH_STYLE === "true",
    credentials: {
      accessKeyId: requireEnv("MAGIC_COMPARE_S3_ACCESS_KEY_ID"),
      secretAccessKey: requireEnv("MAGIC_COMPARE_S3_SECRET_ACCESS_KEY"),
    },
  });

  try {
    await client.send(
      new GetObjectCommand({
        Bucket: bucket,
        Key: `ci-range-signature-probe/${randomUUID()}`,
        Range: "bytes=0-511",
      }),
    );
  } catch (error) {
    if (isExpectedMissingKeyError(error)) {
      console.log("First signed Range GET returned 404 NoSuchKey as expected.");
      return;
    }

    const details = error as S3ErrorMetadata;
    const status = details.$metadata?.httpStatusCode ?? "unknown";
    const code = typeof details.name === "string" ? details.name : "unknown";
    throw new Error(`First signed Range GET failed with ${code} (HTTP ${status}).`);
  }

  throw new Error("First signed Range GET unexpectedly found the random test key.");
}

await verifyFirstSignedRangeRead();
