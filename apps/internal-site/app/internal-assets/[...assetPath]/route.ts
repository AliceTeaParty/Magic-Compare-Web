import { extname } from "node:path";
import { readFile, stat } from "node:fs/promises";
import { resolveExistingInternalAssetFile } from "@/lib/server/storage/internal-assets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MIME_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".svg": "image/svg+xml",
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ assetPath: string[] }> },
) {
  try {
    const { assetPath } = await params;
    const assetUrl = `/internal-assets/${assetPath.join("/")}`;
    const filePath = await resolveExistingInternalAssetFile(assetUrl);
    const [buffer, fileStat] = await Promise.all([readFile(filePath), stat(filePath)]);
    const contentType = MIME_TYPES[extname(filePath).toLowerCase()] ?? "application/octet-stream";

    return new Response(buffer, {
      status: 200,
      headers: {
        "content-type": contentType,
        "content-length": String(fileStat.size),
        "cache-control": "public, max-age=0, must-revalidate",
        "last-modified": fileStat.mtime.toUTCString(),
      },
    });
  } catch {
    return new Response("Not Found", { status: 404 });
  }
}
