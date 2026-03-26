import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { completeGroupUpload } from "@/lib/server/repositories/content-repository";

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    const result = await completeGroupUpload(payload);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: error.flatten() }, { status: 400 });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to complete group upload." },
      { status: 400 },
    );
  }
}
