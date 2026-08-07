import type { Metadata, Viewport } from "next";

export const MAGIC_SITE_VIEWPORT: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

/** Site-specific favicon URLs share the same checked-in fallback set across both shells. */
export function buildMagicSiteIcons(faviconUrl: string | null): Metadata["icons"] {
  return {
    icon: faviconUrl
      ? [{ url: faviconUrl, sizes: "any" }]
      : [
          { url: "/default-favicon.ico", sizes: "any" },
          { url: "/default-icon.png", type: "image/png", sizes: "64x64" },
        ],
    apple: [{ url: "/default-apple-icon.png", sizes: "180x180", type: "image/png" }],
  };
}
