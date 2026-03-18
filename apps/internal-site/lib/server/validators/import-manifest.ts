import { parseImportManifest, type ImportManifest } from "@magic-compare/content-schema";

export function validateImportManifest(input: unknown): ImportManifest {
  return parseImportManifest(input);
}
