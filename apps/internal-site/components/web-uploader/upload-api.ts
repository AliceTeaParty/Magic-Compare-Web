import type { GroupUploadStartInput, UploadFrameDescriptor } from "@/lib/server/uploads/contracts";
import { postJson } from "@/lib/client/internal-api";

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
  frameOrder: number;
  status: "committed";
}

export interface GroupUploadCompleteResult {
  groupUploadJobId: string;
  status: "completed";
  committedFrameCount: number;
}

export interface GroupUploadCancelResult {
  groupUploadJobId: string;
  status: "cancelled";
  deletedPendingPrefixCount: number;
}

export function startGroupUpload(input: GroupUploadStartInput) {
  return postJson<GroupUploadStartResult>("/api/ops/group-upload-start", input);
}

export function prepareGroupUploadFrame(params: {
  groupUploadJobId: string;
  frameOrder: number;
  frame?: UploadFrameDescriptor;
}) {
  return postJson<GroupUploadPrepareResult>("/api/ops/group-upload-frame-prepare", params);
}

export function commitGroupUploadFrame(params: { groupUploadJobId: string; frameOrder: number }) {
  return postJson<GroupUploadCommitResult>("/api/ops/group-upload-frame-commit", params);
}

export function completeGroupUpload(params: { groupUploadJobId: string }) {
  return postJson<GroupUploadCompleteResult>("/api/ops/group-upload-complete", params);
}

export function cancelGroupUpload(params: { groupUploadJobId: string }) {
  return postJson<GroupUploadCancelResult>("/api/ops/group-upload-cancel", params);
}
