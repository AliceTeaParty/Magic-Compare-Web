import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

const { createCase } = vi.hoisted(() => ({
  createCase: vi.fn(),
}));

vi.mock("@/lib/server/repositories/content-repository", () => ({
  createCase,
}));

beforeEach(() => {
  createCase.mockReset();
});

describe("POST /api/ops/case-create", () => {
  it("creates a draft case", async () => {
    createCase.mockResolvedValue({
      caseSlug: "new-case",
      title: "New Case",
      summary: "",
      status: "draft",
    });

    const response = await POST(
      new Request("http://localhost:3000/api/ops/case-create", {
        method: "POST",
        body: JSON.stringify({
          slug: "new-case",
          title: " New Case ",
          summary: "",
        }),
        headers: {
          "content-type": "application/json",
        },
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      caseSlug: "new-case",
      title: "New Case",
      summary: "",
      status: "draft",
    });
    expect(createCase).toHaveBeenCalledWith({
      slug: "new-case",
      title: "New Case",
      summary: "",
    });
  });

  it("rejects invalid slugs", async () => {
    const response = await POST(
      new Request("http://localhost:3000/api/ops/case-create", {
        method: "POST",
        body: JSON.stringify({
          slug: "bad--case",
          title: "Bad Case",
          summary: "",
        }),
        headers: {
          "content-type": "application/json",
        },
      }),
    );

    expect(response.status).toBe(400);
    expect(createCase).not.toHaveBeenCalled();
  });

  it("keeps repository errors in the 400 range", async () => {
    createCase.mockRejectedValue(new Error("Case already exists."));

    const response = await POST(
      new Request("http://localhost:3000/api/ops/case-create", {
        method: "POST",
        body: JSON.stringify({
          slug: "mono",
          title: "mono",
          summary: "",
        }),
        headers: {
          "content-type": "application/json",
        },
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Case already exists." });
  });
});
