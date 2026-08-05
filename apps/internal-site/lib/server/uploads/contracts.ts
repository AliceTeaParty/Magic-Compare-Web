import { createHash } from "node:crypto";
import { z } from "zod";
import { AssetKindSchema, SlugSchema, ViewerModeSchema } from "@magic-compare/content-schema";

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

export const UploadStreamSourceAssetDescriptorSchema = UploadAssetDescriptorSchema.omit({
  thumbnail: true,
});

export const UploadGeneratedHeatmapDescriptorSchema = z.object({
  slot: z.string().min(1),
  beforeSlot: z.string().min(1),
  afterSlot: z.string().min(1),
});

export const UploadStreamFrameDescriptorSchema = z.object({
  order: z.number().int().nonnegative(),
  title: z.string().min(1),
  caption: z.string().default(""),
  assets: z.array(UploadStreamSourceAssetDescriptorSchema).min(2),
  generatedHeatmap: UploadGeneratedHeatmapDescriptorSchema.nullable().default(null),
});

const GroupUploadIdentitySchema = z.object({
  case: z.object({
    slug: SlugSchema,
    title: z.string().min(1),
    summary: z.string().default(""),
    tags: z.array(z.string().min(1)).default([]),
    coverAssetLabel: z.string().min(1).nullable().default(null),
  }),
  group: z.object({
    slug: SlugSchema,
    title: z.string().min(1),
    description: z.string().default(""),
    order: z.number().int().nonnegative(),
    defaultMode: ViewerModeSchema.default("before-after"),
    tags: z.array(z.string().min(1)).default([]),
  }),
});

const LegacyGroupUploadStartInputSchema = GroupUploadIdentitySchema.extend({
  frames: z.array(UploadFrameDescriptorSchema).min(1),
  forceRestart: z.boolean().optional().default(false),
});

const StreamGroupUploadStartInputSchema = GroupUploadIdentitySchema.extend({
  protocol: z.literal("stream-v2"),
  frames: z.array(UploadStreamFrameDescriptorSchema).min(1),
  forceRestart: z.boolean().optional().default(false),
});

export const GroupUploadStartInputSchema = z.union([
  StreamGroupUploadStartInputSchema,
  LegacyGroupUploadStartInputSchema,
]);

export const GroupUploadFramePrepareInputSchema = z.object({
  groupUploadJobId: z.string().min(1),
  frameOrder: z.number().int().nonnegative(),
  frame: UploadFrameDescriptorSchema.optional(),
});

export const GroupUploadFrameCommitInputSchema = GroupUploadFramePrepareInputSchema.omit({
  frame: true,
});
export const GroupUploadCompleteInputSchema = z.object({
  groupUploadJobId: z.string().min(1),
});
export const GroupUploadCancelInputSchema = GroupUploadCompleteInputSchema;

export type GroupUploadStartInput = z.infer<typeof GroupUploadStartInputSchema>;
export type UploadFrameDescriptor = z.infer<typeof UploadFrameDescriptorSchema>;
export type UploadAssetDescriptor = z.infer<typeof UploadAssetDescriptorSchema>;
export type UploadStreamFrameDescriptor = z.infer<typeof UploadStreamFrameDescriptorSchema>;
export type UploadStreamSourceAssetDescriptor = z.infer<
  typeof UploadStreamSourceAssetDescriptorSchema
>;

export type UploadJobStatus = "active" | "completed" | "cancelled";
export type UploadFrameStatus = "pending" | "prepared" | "committed" | "cancelled";

export function isStreamUploadInput(
  input: GroupUploadStartInput,
): input is Extract<GroupUploadStartInput, { protocol: "stream-v2" }> {
  return "protocol" in input && input.protocol === "stream-v2";
}

/**
 * Hash the normalized upload payload server-side so resume/reset decisions key off authoritative
 * content instead of trusting a client-provided checksum.
 */
export function computeGroupUploadInputHash(input: GroupUploadStartInput): string {
  const streamProtocol = isStreamUploadInput(input);
  const normalized = {
    case: input.case,
    group: input.group,
    ...(streamProtocol ? { protocol: input.protocol } : {}),
    frames: [...input.frames]
      .sort((left, right) => left.order - right.order)
      .map((frame) => ({
        ...frame,
        assets: [...frame.assets]
          .sort((left, right) => left.slot.localeCompare(right.slot))
          .map((asset) => ({
            ...asset,
            original: asset.original,
            ...("thumbnail" in asset ? { thumbnail: asset.thumbnail } : {}),
          })),
      })),
  };

  return createHash("sha256").update(JSON.stringify(normalized)).digest("hex");
}
