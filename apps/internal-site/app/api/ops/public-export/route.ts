import { NextResponse } from "next/server";
import { exportPublicSite } from "@/lib/server/public-site/runtime";

export async function POST() {
  try {
    const result = await exportPublicSite();
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Public export failed." },
      { status: 400 },
    );
  }
}
