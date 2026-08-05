import { describe, expect, it } from "vitest";
import { GET } from "./route";

describe("GET /api/healthz", () => {
  it("returns an empty uncached response without touching application state", async () => {
    const response = GET();

    expect(response.status).toBe(204);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.text()).toBe("");
  });
});
