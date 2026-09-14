import { resolveBuildIdentityConfig } from "@magic-compare/shared-utils";

// The public site emits this file at export time; it needs no server or internal write API.
export const dynamic = "force-static";

/** Emit the same build identity embedded in the exported shell, including same-version commits. */
export function GET() {
  return Response.json(
    resolveBuildIdentityConfig({
      MAGIC_COMPARE_APP_VERSION: process.env.MAGIC_COMPARE_APP_VERSION,
      MAGIC_COMPARE_COMMIT_SHA: process.env.MAGIC_COMPARE_COMMIT_SHA,
    }),
  );
}
