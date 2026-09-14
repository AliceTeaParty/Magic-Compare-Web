import { resolveBuildIdentityConfig } from "@magic-compare/shared-utils";

export const dynamic = "force-dynamic";

/** Expose this deployment's build identity without letting intermediaries reuse stale metadata. */
export function GET() {
  return Response.json(
    resolveBuildIdentityConfig({
      MAGIC_COMPARE_APP_VERSION: process.env.MAGIC_COMPARE_APP_VERSION,
      MAGIC_COMPARE_COMMIT_SHA: process.env.MAGIC_COMPARE_COMMIT_SHA,
    }),
    { headers: { "Cache-Control": "no-store" } },
  );
}
