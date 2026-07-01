import type { GroupUploadStartInput } from "@/lib/server/uploads/contracts";

export interface UploadFrameState {
  frameOrder: number;
  status: "pending" | "prepared" | "committed" | "cancelled";
}

export interface GroupUploadStartResult {
  groupUploadJobId: string;
  inputHash: string;
  expectedFrameCount: number;
  committedFrameCount: number;
  canComplete: boolean;
  frameStates: UploadFrameState[];
}

export interface PreparedUploadFile {
  slot: string;
  variant: "original" | "thumbnail";
  logicalPath: string;
  uploadUrl: string;
  expiresInSeconds: number;
  contentType: string;
}

export interface GroupUploadPrepareResult {
  groupUploadJobId: string;
  frameOrder: number;
  files: PreparedUploadFile[];
}

export interface GroupUploadCommitResult {
  groupUploadJobId: string;
  inputHash: string;
  expectedFrameCount: number;
  committedFrameCount: number;
  canComplete: boolean;
  frameStates: UploadFrameState[];
}

export interface GroupUploadCompleteResult {
  groupUploadJobId: string;
  status: "completed";
  committedFrameCount: number;
}

/**
 * Keeps upload endpoints behind one JSON helper so the runner reports API validation failures with
 * the same message style regardless of which phase failed.
 */
async function postJson<TResponse>(url: string, body: unknown): Promise<TResponse> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    let message = `Request failed with ${response.status}.`;
    try {
      const payload = (await response.json()) as { error?: string; message?: string };
      message = payload.error || payload.message || message;
    } catch {
      // Non-JSON failures usually come from the dev server or a proxy; keep the HTTP status.
    }
    throw new Error(message);
  }

  return (await response.json()) as TResponse;
}

export function startGroupUpload(input: GroupUploadStartInput) {
  return postJson<GroupUploadStartResult>("/api/ops/group-upload-start", input);
}

export function prepareGroupUploadFrame(params: {
  groupUploadJobId: string;
  frameOrder: number;
}) {
  return postJson<GroupUploadPrepareResult>(
    "/api/ops/group-upload-frame-prepare",
    params,
  );
}

export function commitGroupUploadFrame(params: {
  groupUploadJobId: string;
  frameOrder: number;
}) {
  return postJson<GroupUploadCommitResult>(
    "/api/ops/group-upload-frame-commit",
    params,
  );
}

export function completeGroupUpload(params: { groupUploadJobId: string }) {
  return postJson<GroupUploadCompleteResult>("/api/ops/group-upload-complete", params);
}
