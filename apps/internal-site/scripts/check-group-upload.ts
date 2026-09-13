import { createHash, randomUUID } from "node:crypto";

interface PreparedUploadFile {
  contentType: string;
  logicalPath: string;
  slot: string;
  uploadUrl: string;
  variant: "original" | "thumbnail";
}

interface PreparedFrameResponse {
  files: PreparedUploadFile[];
  groupUploadJobId: string;
  pendingPrefix: string;
}

const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLkkAAAAABJRU5ErkJggg==",
  "base64",
);
const fileDescriptor = {
  extension: ".png",
  contentType: "image/png",
  sha256: createHash("sha256").update(png).digest("hex"),
  size: png.byteLength,
};

function internalSiteUrl(): string {
  return (process.env.MAGIC_COMPARE_INTERNAL_SITE_URL ?? "http://127.0.0.1:3000").replace(
    /\/$/,
    "",
  );
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${internalSiteUrl()}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`POST ${path} failed with HTTP ${response.status}: ${text.slice(0, 512)}`);
  }
  return JSON.parse(text) as T;
}

/** Exercises the full API, presigned PUT, validation, and idempotent commit path in CI storage. */
async function verifyGroupUpload() {
  const identifier = `ci-upload-${randomUUID()}`;
  const frame = {
    order: 0,
    title: "CI upload frame",
    caption: "",
    assets: [
      {
        slot: "before",
        kind: "before",
        label: "Before",
        note: "",
        width: 1,
        height: 1,
        isPrimaryDisplay: true,
        original: fileDescriptor,
        thumbnail: fileDescriptor,
      },
      {
        slot: "after",
        kind: "after",
        label: "After",
        note: "",
        width: 1,
        height: 1,
        isPrimaryDisplay: true,
        original: fileDescriptor,
        thumbnail: fileDescriptor,
      },
    ],
  };
  const start = await postJson<{ groupUploadJobId: string }>("/api/ops/group-upload-start", {
    case: {
      slug: identifier,
      title: "CI upload verification",
      summary: "",
      tags: [],
      coverAssetLabel: "After",
    },
    group: {
      slug: "upload-check",
      title: "Upload check",
      description: "",
      order: 0,
      defaultMode: "before-after",
      tags: [],
    },
    frames: [frame],
  });
  const preparePayload = { groupUploadJobId: start.groupUploadJobId, frameOrder: frame.order };
  const first = await postJson<PreparedFrameResponse>(
    "/api/ops/group-upload-frame-prepare",
    preparePayload,
  );
  const refreshed = await postJson<PreparedFrameResponse>(
    "/api/ops/group-upload-frame-prepare",
    preparePayload,
  );

  if (
    first.pendingPrefix !== refreshed.pendingPrefix ||
    first.files.map((file) => file.logicalPath).join("\n") !==
      refreshed.files.map((file) => file.logicalPath).join("\n")
  ) {
    throw new Error("Prepare refresh changed the pending revision paths.");
  }
  if (first.files.length !== 4) {
    throw new Error(`Expected four prepared upload files, received ${first.files.length}.`);
  }

  for (const file of first.files) {
    const response = await fetch(file.uploadUrl, {
      method: "PUT",
      headers: { "content-type": file.contentType },
      body: png,
    });
    if (!response.ok) {
      throw new Error(
        `PUT ${file.slot}/${file.variant} failed with HTTP ${response.status}: ${(await response.text()).slice(0, 512)}`,
      );
    }
  }

  const commitPayload = { groupUploadJobId: start.groupUploadJobId, frameOrder: frame.order };
  const [committed, committedAgain] = await Promise.all([
    postJson<{ status: string }>("/api/ops/group-upload-frame-commit", commitPayload),
    postJson<{ status: string }>("/api/ops/group-upload-frame-commit", commitPayload),
  ]);
  if (committed.status !== "committed" || committedAgain.status !== "committed") {
    throw new Error("Overlapping commits did not return the expected committed status.");
  }

  const completed = await postJson<{ status: string; committedFrameCount: number }>(
    "/api/ops/group-upload-complete",
    { groupUploadJobId: start.groupUploadJobId },
  );
  if (completed.status !== "completed" || completed.committedFrameCount !== 1) {
    throw new Error("Group upload did not complete with one committed frame.");
  }
}

await verifyGroupUpload();
console.log(
  "Group upload HTTP, presigned PUT, concurrent idempotent commit, and completion passed.",
);
