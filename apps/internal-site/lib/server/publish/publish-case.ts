import { withPublicSiteOperationLock } from "@/lib/server/public-site/runtime/operation-lock";
import { publishCase as servicePublishCase } from "./publish-case-service";

export function publishCase(caseId: string) {
  return withPublicSiteOperationLock("publish", () => servicePublishCase(caseId));
}
