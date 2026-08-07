import { afterEach, describe, expect, it, vi } from "vitest";
import { InternalApiError, postJson, readJsonResponse, requestJson } from "./internal-api";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("internal api client", () => {
  it("parses one successful JSON response", async () => {
    await expect(
      readJsonResponse<{ ok: boolean }>(
        new Response(JSON.stringify({ ok: true }), {
          headers: { "content-type": "application/json" },
        }),
      ),
    ).resolves.toEqual({ ok: true });
  });

  it("allows an explicitly empty success response", async () => {
    await expect(
      readJsonResponse<void>(new Response(null, { status: 204 }), { allowEmpty: true }),
    ).resolves.toBeUndefined();
  });

  it("rejects a damaged success payload with the operation fallback", async () => {
    await expect(
      readJsonResponse(new Response("not-json"), { fallbackMessage: "无法读取结果。" }),
    ).rejects.toMatchObject({
      message: "无法读取结果。",
      status: 200,
      payload: null,
    });
  });

  it("prefers structured error and message fields", async () => {
    await expect(
      readJsonResponse(new Response(JSON.stringify({ error: "请求无效。" }), { status: 400 })),
    ).rejects.toThrow("请求无效。");
    await expect(
      readJsonResponse(new Response(JSON.stringify({ message: "代理失败。" }), { status: 502 })),
    ).rejects.toThrow("代理失败。");
  });

  it("extracts the first Zod flattened field error", async () => {
    await expect(
      readJsonResponse(
        new Response(
          JSON.stringify({ error: { formErrors: [], fieldErrors: { title: ["不能为空。"] } } }),
          { status: 400 },
        ),
      ),
    ).rejects.toThrow("title: 不能为空。");
  });

  it("retains status and payload on InternalApiError", async () => {
    const error = await readJsonResponse(new Response("upstream unavailable", { status: 503 }), {
      fallbackMessage: "暂时不可用。",
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(InternalApiError);
    expect(error).toMatchObject({ message: "暂时不可用。", status: 503, payload: null });
  });

  it("wraps parser failures with response context", async () => {
    await expect(
      readJsonResponse(new Response(JSON.stringify({ ok: true })), {
        parse: () => {
          throw new Error("缺少 dataset。");
        },
      }),
    ).rejects.toMatchObject({ message: "缺少 dataset。", status: 200, payload: { ok: true } });
  });

  it("keeps AbortError unchanged", async () => {
    const abortError = new DOMException("aborted", "AbortError");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(abortError));

    await expect(requestJson("/api/ops/example")).rejects.toBe(abortError);
  });

  it("posts JSON with the shared request headers", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true })));
    vi.stubGlobal("fetch", fetchMock);

    await expect(postJson<{ ok: boolean }>("/api/ops/example", { value: 1 })).resolves.toEqual({
      ok: true,
    });
    expect(fetchMock).toHaveBeenCalledWith("/api/ops/example", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ value: 1 }),
      signal: undefined,
    });
  });
});
