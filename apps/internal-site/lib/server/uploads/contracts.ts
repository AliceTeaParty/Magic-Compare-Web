import { createHash } from "node:crypto";
import { z } from "zod";
import { AssetKindSchema, ViewerModeSchema } from "@magic-compare/content-schema";

const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/i);
const ExtensionSchema = z.string().regex(/^\.[a-z0-9]+$/i);

export const UploadFileDescriptorSchema = z.object({
  extension: ExtensionSchema,
  contentType: z.string().min(1),
  sha256: Sha256Schema,
  size: z.number().int().positive(),
});

export const UploadAssetDescriptorSchema = z.object({
  slot: z.string().min(1),
  kind: AssetKindSchema,
  label: z.string().min(1),
  note: z.string().default(""),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  isPrimaryDisplay: z.boolean(),
  original: UploadFileDescriptorSchema,
  thumbnail: UploadFileDescriptorSchema,
});

export const UploadFrameDescriptorSchema = z.object({
  order: z.number().int().nonnegative(),
  title: z.string().min(1),
  caption: z.string().default(""),
  assets: z.array(UploadAssetDescriptorSchema).min(2),
});

export const GroupUploadStartInputSchema = z.object({
  case: z.object({
    slug: z.string().min(1),
    title: z.string().min(1),
    summary: z.string().default(""),
    tags: z.array(z.string().min(1)).default([]),
    coverAssetLabel: z.string().min(1).nullable().default(null),
  }),
  group: z.object({
    slug: z.string().min(1),
    title: z.string().min(1),
    description: z.string().default(""),
    order: z.number().int().nonnegative(),
    defaultMode: ViewerModeSchema.default("before-after"),
    tags: z.array(z.string().min(1)).default([]),
  }),
  frames: z.array(UploadFrameDescriptorSchema).min(1),
  forceRestart: z.boolean().optional().default(false),
});

export const GroupUploadFramePrepareInputSchema = z.object({
  groupUploadJobId: z.string().min(1),
  frameOrder: z.number().int().nonnegative(),
});

export const GroupUploadFrameCommitInputSchema = GroupUploadFramePrepareInputSchema;
export const GroupUploadCompleteInputSchema = z.object({
  groupUploadJobId: z.string().min(1),
});

export type GroupUploadStartInput = z.infer<typeof GroupUploadStartInputSchema>;
export type UploadFrameDescriptor = z.infer<typeof UploadFrameDescriptorSchema>;
export type UploadAssetDescriptor = z.infer<typeof UploadAssetDescriptorSchema>;

export type UploadJobStatus = "active" | "completed" | "cancelled";
export type UploadFrameStatus = "pending" | "prepared" | "committed" | "cancelled";

/**
 * Hash the normalized upload payload server-side so resume/reset decisions key off authoritative
 * content instead of trusting a client-provided checksum.
 */
export function computeGroupUploadInputHash(input: GroupUploadStartInput): string {
  const normalized = {
    case: input.case,
    group: input.group,
    frames: [...input.frames]
      .sort((left, right) => left.order - right.order)
      .map((frame) => ({
        ...frame,
        assets: [...frame.assets]
          .sort((left, right) => left.slot.localeCompare(right.slot))
          .map((asset) => ({
            ...asset,
            original: asset.original,
            thumbnail: asset.thumbnail,
          })),
      })),
  };

  return createHash("sha256")
    .update(JSON.stringify(normalized))
    .digest("hex");
}
