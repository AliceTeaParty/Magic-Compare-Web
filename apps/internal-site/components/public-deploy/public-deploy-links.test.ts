import { describe, expect, it } from "vitest";
import { resolvePublicDeployMonitorUrl } from "./public-deploy-links";

describe("public deploy monitor links", () => {
  it("opens the matching exported Group alias after deployment", () => {
    expect(resolvePublicDeployMonitorUrl("http://localhost:3001", "/cases/2026/groups/suiji")).toBe(
      "http://localhost:3001/cases/2026/groups/suiji",
    );
  });

  it("keeps the site-level destination outside a Group viewer", () => {
    expect(resolvePublicDeployMonitorUrl("https://compare.example.com", "/cases/2026")).toBe(
      "https://compare.example.com",
    );
  });

  it("does not invent a monitor link when deployment has no public URL", () => {
    expect(resolvePublicDeployMonitorUrl(null, "/cases/2026/groups/suiji")).toBeNull();
  });
});
