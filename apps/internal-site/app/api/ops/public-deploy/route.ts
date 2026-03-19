import { NextResponse } from "next/server";
import {
  deployPublicSite,
  getPublicSiteOperationErrorStatus,
} from "@/lib/server/public-site/runtime";

export async function POST() {
  try {
    const result = await deployPublicSite();
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Public deploy failed." },
      { status: getPublicSiteOperationErrorStatus(error) },
    );
  }
}
