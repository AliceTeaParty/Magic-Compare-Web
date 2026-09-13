import { parsePublishManifest } from "@magic-compare/content-schema";

export interface PublishedRouteAlias {
  caseSlug: string;
  groupSlug: string;
  publicSlug: string;
}

/** Invalid bundles are isolated so one damaged manifest cannot abort every legacy route alias. */
export function parsePublishedRouteAlias(contents: string): PublishedRouteAlias | null {
  try {
    const manifest = parsePublishManifest(JSON.parse(contents));
    return {
      caseSlug: manifest.case.slug,
      groupSlug: manifest.group.slug,
      publicSlug: manifest.publicSlug,
    };
  } catch {
    return null;
  }
}
