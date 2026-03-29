import type { MetadataRoute } from "next";

export const dynamic = "force-static";

/**
 * The public viewer is shareable by direct URL, but it should not advertise itself to crawlers.
 * Cloudflare still carries the real enforcement burden for abusive traffic and image scraping.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        disallow: "/",
      },
    ],
  };
}
