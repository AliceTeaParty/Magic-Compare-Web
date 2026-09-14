import type { PublishManifest } from "@magic-compare/content-schema";

/** Distinct corners, a center cross and odd dimensions expose rotation and subpixel clipping. */
export function fixtureSvg(width: number, height: number, color: string, index: number) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="${color}"/><path d="M0 ${height / 2}H${width}M${width / 2} 0V${height}" stroke="#777" stroke-width="2"/><rect width="20" height="20" fill="#ff0000"/><rect x="${width - 20}" y="${height - 20}" width="20" height="20" fill="#00ff00"/><circle cx="${width / 2 + index * 2}" cy="${height / 2}" r="12" fill="#222"/></svg>`;
  return svg;
}

function imageUrl(width: number, height: number, color: string, index: number) {
  return `http://127.0.0.1:3102/internal-assets/e2e/${width}-${height}-${color.slice(1)}-${index}.svg`;
}

/** One portable dataset feeds both applications so shared viewer regressions run on both shells. */
export function createViewerFixture(): PublishManifest {
  return {
    schemaVersion: 2,
    publicSlug: "e2e-sample--viewer",
    generatedAt: "2026-09-14T00:00:00.000Z",
    assetBasePath: "data:image/svg+xml",
    case: {
      slug: "e2e-sample",
      title: "E2E Sample",
      subtitle: "",
      summary: "Browser regression fixture",
      tags: ["e2e"],
      publishedAt: "2026-09-14T00:00:00.000Z",
    },
    group: {
      id: "e2e-group",
      slug: "viewer",
      publicSlug: "e2e-sample--viewer",
      title: "E2E Viewer",
      description: "Deterministic fixture",
      defaultMode: "before-after",
      tags: [],
    },
    frames: Array.from({ length: 24 }, (_, index) => {
      const [width, height] = index === 1 ? [361, 641] : index === 2 ? [513, 513] : [640, 360];
      return {
        id: `e2e-frame-${index}`,
        title: `Frame ${index + 1}`,
        caption: "",
        order: index,
        assets: (
          [
            ["before", "Src", "#ffffff"],
            ["after", "Rip", "#eeeeee"],
            ["misc", "Flt", "#bbbbbb"],
            ["heatmap", "Heatmap", "#ff6600"],
          ] as const
        ).map(([kind, label, color]) => ({
          id: `e2e-${index}-${label}`,
          kind,
          label,
          imageUrl: imageUrl(width, height, color, index),
          thumbUrl: imageUrl(width, height, color, index),
          width,
          height,
          note: "",
          isPrimaryDisplay: kind === "before" || kind === "after",
          placeholder: {
            dataUrl:
              "data:image/webp;base64,UklGRiwAAABXRUJQVlA4ICAAAABwAQCdASoIAAUAA8BgJYwCdAFAAAD+76w5N2Hbk/CoAA==",
            sourceColor: color,
          },
        })),
      };
    }),
  };
}
