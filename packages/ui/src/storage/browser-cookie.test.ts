import { describe, expect, it } from "vitest";
import { readCookieValue, serializeCookieValue } from "./browser-cookie";

describe("browser cookie storage", () => {
  it("matches exact names with or without spaces after separators", () => {
    expect(readCookieValue("session=abc;mc_setting=cyan; other=value", "mc_setting")).toBe("cyan");
    expect(readCookieValue("mc_setting_backup=rose", "mc_setting")).toBeNull();
  });

  it("decodes encoded values without losing equals signs", () => {
    expect(readCookieValue("mc_setting=custom%3A%23AABBCC%3D", "mc_setting")).toBe(
      "custom:#AABBCC=",
    );
  });

  it("returns null for malformed encoded values", () => {
    expect(readCookieValue("mc_setting=%E0%A4%A", "mc_setting")).toBeNull();
  });

  it("serializes a one-year site-wide cookie", () => {
    expect(serializeCookieValue("mc_setting", "custom:#AABBCC")).toBe(
      "mc_setting=custom%3A%23AABBCC; Path=/; Max-Age=31536000; SameSite=Lax",
    );
  });
});
