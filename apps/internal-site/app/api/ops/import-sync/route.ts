import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { applyImportManifest } from "@/lib/server/repositories/content-repository";

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    const result = await applyImportManifest(payload);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: error.flatten() }, { status: 400 });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Import failed." },
      { status: 500 },
    );
  }
}
