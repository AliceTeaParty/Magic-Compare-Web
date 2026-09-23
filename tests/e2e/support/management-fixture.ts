import type { APIRequestContext, TestInfo } from "@playwright/test";
import { expect } from "./browser-test";

/** Uses real contracts to create disposable empty workspaces without adding production test APIs. */
export async function createManagementCase(
  request: APIRequestContext,
  info: TestInfo,
  suffix: string,
) {
  const slug = `e2e-${suffix}-${info.project.name}-${info.retry}`;
  const response = await request.post("/api/ops/case-create", {
    data: { slug, title: slug, summary: "" },
  });
  expect(response.ok()).toBe(true);
  return slug;
}

/** An uncommitted upload creates an empty group suitable for destructive and reorder UI checks. */
export async function createDraftGroup(
  request: APIRequestContext,
  caseSlug: string,
  slug: string,
  order: number,
) {
  const file = { extension: ".png", contentType: "image/png", size: 1, sha256: "a".repeat(64) };
  const response = await request.post("/api/ops/group-upload-start", {
    data: {
      case: { slug: caseSlug, title: caseSlug },
      group: { slug, title: slug, order, defaultMode: "a-b" },
      frames: [
        {
          order: 0,
          title: "Frame 1",
          assets: ["before", "after"].map((kind) => ({
            slot: kind,
            kind,
            label: kind,
            width: 1,
            height: 1,
            isPrimaryDisplay: true,
            original: file,
            thumbnail: file,
          })),
        },
      ],
    },
  });
  expect(response.ok()).toBe(true);
}
