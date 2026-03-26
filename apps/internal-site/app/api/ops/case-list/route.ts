import { NextResponse } from "next/server";
import { listCases } from "@/lib/server/repositories/content-repository";

export async function POST() {
  try {
    const cases = await listCases();
    return NextResponse.json({ cases });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Case list failed." },
      { status: 500 },
    );
  }
}
