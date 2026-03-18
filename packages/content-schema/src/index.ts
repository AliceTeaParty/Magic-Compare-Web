import { z } from "zod";

export const CASE_STATUSES = [
  "draft",
  "internal",
  "published",
  "archived",
] as const;

export const VIEWER_MODES = ["before-after", "a-b", "heatmap"] as const;

export const ASSET_KINDS = [
  "before",
  "after",
  "heatmap",
  "crop",
  "misc",
] as const;

export const PUBLISH_SCHEMA_VERSION = 1;

export const CaseStatusSchema = z.enum(CASE_STATUSES);
export const ViewerModeSchema = z.enum(VIEWER_MODES);
export const AssetKindSchema = z.enum(ASSET_KINDS);

const SlugSchema = z
  .string()
  .min(1)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

const StringListSchema = z.array(z.string().min(1)).default([]);

export const CaseSchema = z.object({
  id: z.string().min(1),
  slug: SlugSchema,
  title: z.string().min(1),
  subtitle: z.string().default(""),
  summary: z.string().default(""),
  tags: StringListSchema,
  status: CaseStatusSchema,
  coverAssetId: z.string().min(1).nullable().default(null),
  publishedAt: z.string().datetime().nullable().default(null),
  updatedAt: z.string().datetime(),
});

export const GroupSchema = z.object({
  id: z.string().min(1),
  caseId: z.string().min(1),
  slug: SlugSchema,
  publicSlug: SlugSchema.nullable().default(null),
  title: z.string().min(1),
  description: z.string().default(""),
  order: z.number().int().nonnegative(),
  defaultMode: ViewerModeSchema,
  isPublic: z.boolean(),
  tags: StringListSchema,
});

export const FrameSchema = z.object({
  id: z.string().min(1),
  groupId: z.string().min(1),
  title: z.string().min(1),
  caption: z.string().default(""),
  order: z.number().int().nonnegative(),
  isPublic: z.boolean(),
});

export const AssetSchema = z.object({
  id: z.string().min(1),
  frameId: z.string().min(1),
  kind: AssetKindSchema,
  label: z.string().min(1),
  imageUrl: z.string().min(1),
  thumbUrl: z.string().min(1),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  note: z.string().default(""),
  isPublic: z.boolean(),
  isPrimaryDisplay: z.boolean(),
});

const CaseImportSchema = z.object({
  slug: SlugSchema,
  title: z.string().min(1),
  subtitle: z.string().default(""),
  summary: z.string().default(""),
  tags: StringListSchema,
  status: CaseStatusSchema.default("draft"),
  coverAssetLabel: z.string().min(1).nullable().default(null),
});

const GroupImportSchema = z.object({
  slug: SlugSchema,
  title: z.string().min(1),
  description: z.string().default(""),
  order: z.number().int().nonnegative(),
  defaultMode: ViewerModeSchema.default("before-after"),
  isPublic: z.boolean().default(false),
  tags: StringListSchema,
});

const FrameImportSchema = z.object({
  title: z.string().min(1),
  caption: z.string().default(""),
  order: z.number().int().nonnegative(),
  isPublic: z.boolean().default(true),
});

const AssetImportSchema = z.object({
  kind: AssetKindSchema,
  label: z.string().min(1),
  imageUrl: z.string().min(1),
  thumbUrl: z.string().min(1),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  note: z.string().default(""),
  isPublic: z.boolean().default(true),
  isPrimaryDisplay: z.boolean(),
});

export const ImportManifestSchema = z
  .object({
    case: CaseImportSchema,
    groups: z
      .array(
        z.object({
          group: GroupImportSchema,
          frames: z
            .array(
              z.object({
                frame: FrameImportSchema,
                assets: z.array(AssetImportSchema).min(2),
              }),
            )
            .min(1),
        }),
      )
      .min(1),
  })
  .superRefine((manifest, ctx) => {
    manifest.groups.forEach((groupEntry, groupIndex) => {
      groupEntry.frames.forEach((frameEntry, frameIndex) => {
        const before = frameEntry.assets.find((asset) => asset.kind === "before");
        const after = frameEntry.assets.find((asset) => asset.kind === "after");

        if (!before || !after) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["groups", groupIndex, "frames", frameIndex, "assets"],
            message: "Each frame requires both before and after assets.",
          });
        }

        const invalidPrimary = frameEntry.assets.filter(
          (asset) =>
            asset.isPrimaryDisplay && asset.kind !== "before" && asset.kind !== "after",
        );

        if (invalidPrimary.length > 0) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["groups", groupIndex, "frames", frameIndex, "assets"],
            message: "Only before and after assets can be marked as primary display.",
          });
        }
      });
    });
  });

export const PublishManifestAssetSchema = z.object({
  id: z.string().min(1),
  kind: AssetKindSchema,
  label: z.string().min(1),
  imageUrl: z.string().min(1),
  thumbUrl: z.string().min(1),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  note: z.string().default(""),
  isPrimaryDisplay: z.boolean(),
});

export const PublishManifestFrameSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  caption: z.string().default(""),
  order: z.number().int().nonnegative(),
  assets: z.array(PublishManifestAssetSchema).min(2),
});

export const PublishManifestSchema = z.object({
  schemaVersion: z.number().int().positive(),
  publicSlug: SlugSchema,
  generatedAt: z.string().datetime(),
  assetBasePath: z.string().min(1),
  case: z.object({
    slug: SlugSchema,
    title: z.string().min(1),
    subtitle: z.string().default(""),
    summary: z.string().default(""),
    tags: StringListSchema,
    publishedAt: z.string().datetime().nullable().default(null),
  }),
  group: z.object({
    id: z.string().min(1),
    slug: SlugSchema,
    publicSlug: SlugSchema,
    title: z.string().min(1),
    description: z.string().default(""),
    defaultMode: ViewerModeSchema,
    tags: StringListSchema,
  }),
  frames: z.array(PublishManifestFrameSchema).min(1),
});

export type CaseStatus = z.infer<typeof CaseStatusSchema>;
export type ViewerMode = z.infer<typeof ViewerModeSchema>;
export type AssetKind = z.infer<typeof AssetKindSchema>;

export type CaseRecord = z.infer<typeof CaseSchema>;
export type GroupRecord = z.infer<typeof GroupSchema>;
export type FrameRecord = z.infer<typeof FrameSchema>;
export type AssetRecord = z.infer<typeof AssetSchema>;

export type ImportManifest = z.infer<typeof ImportManifestSchema>;
export type PublishManifest = z.infer<typeof PublishManifestSchema>;

export function parseImportManifest(input: unknown): ImportManifest {
  return ImportManifestSchema.parse(input);
}

export function parsePublishManifest(input: unknown): PublishManifest {
  return PublishManifestSchema.parse(input);
}
