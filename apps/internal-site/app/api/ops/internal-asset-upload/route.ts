import { NextResponse } from "next/server";
import { z } from "zod";
import { headInternalAsset, uploadInternalAssetBuffer } from "@/lib/server/storage/internal-assets";

const UploadFieldsSchema = z.object({
  assetUrl: z.string().min(1),
  sha256: z.string().min(1),
  sourceSize: z.string().min(1),
  derivativeKind: z.string().min(1),
});

function matchesStoredObject(
  metadata: Record<string, string>,
  payload: z.infer<typeof UploadFieldsSchema>,
): boolean {
  return (
    metadata.sha256 === payload.sha256 &&
    metadata["source-size"] === payload.sourceSize &&
    metadata["derivative-kind"] === payload.derivativeKind
  );
}

/**
 * Keep uploader uploads behind internal-site so remote operators only need site credentials and
 * the server can centralize object-level skip logic instead of exposing raw storage secrets.
 */
export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Missing upload file." }, { status: 400 });
    }

    const payload = UploadFieldsSchema.parse({
      assetUrl: formData.get("assetUrl"),
      sha256: formData.get("sha256"),
      sourceSize: formData.get("source-size"),
      derivativeKind: formData.get("derivative-kind"),
    });
    const remoteState = await headInternalAsset(payload.assetUrl);
    if (remoteState && matchesStoredObject(remoteState.metadata, payload)) {
      return NextResponse.json({ status: "skipped", assetUrl: payload.assetUrl });
    }

    await uploadInternalAssetBuffer(
      Buffer.from(await file.arrayBuffer()),
      payload.assetUrl,
      file.type || undefined,
      {
        sha256: payload.sha256,
        "source-size": payload.sourceSize,
        "derivative-kind": payload.derivativeKind,
      },
    );
    return NextResponse.json({ status: "uploaded", assetUrl: payload.assetUrl });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.flatten() }, { status: 400 });
    }

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Internal asset upload failed.",
      },
      { status: 500 },
    );
  }
}
