import { readInternalAsset } from "@/lib/server/storage/internal-assets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ assetPath: string[] }> },
) {
  try {
    const { assetPath } = await params;
    const assetUrl = `/internal-assets/${assetPath.join("/")}`;
    const asset = await readInternalAsset(assetUrl);

    return new Response(Buffer.from(asset.body), {
      status: 200,
      headers: {
        "content-type": asset.contentType,
        "content-length": String(asset.contentLength),
        "cache-control": "public, max-age=0, must-revalidate",
        ...(asset.lastModified ? { "last-modified": asset.lastModified.toUTCString() } : {}),
      },
    });
  } catch {
    return new Response("Not Found", { status: 404 });
  }
}
