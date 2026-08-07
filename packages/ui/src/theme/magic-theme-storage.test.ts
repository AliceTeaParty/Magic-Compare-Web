import { describe, expect, it } from "vitest";
import {
  MAGIC_THEME_SEED_COOKIE_NAME,
  readMagicThemeSeedCookie,
  serializeMagicThemeSeedCookie,
} from "./magic-theme-storage";

describe("magic theme storage", () => {
  it("reads the exact theme cookie among unrelated cookies", () => {
    expect(readMagicThemeSeedCookie("session=abc; mc_internal_theme=cyan; other=value")).toBe(
      "cyan",
    );
    expect(readMagicThemeSeedCookie("mc_internal_theme_backup=rose")).toBeNull();
  });

  it("decodes custom color seeds", () => {
    expect(readMagicThemeSeedCookie("mc_internal_theme=custom%3A%231A2B3C")).toBe("custom:#1A2B3C");
  });

  it("ignores malformed cookie values", () => {
    expect(readMagicThemeSeedCookie("mc_internal_theme=%E0%A4%A")).toBeNull();
  });

  it("serializes a one-year site-wide cookie", () => {
    expect(serializeMagicThemeSeedCookie("custom:#1A2B3C")).toBe(
      `${MAGIC_THEME_SEED_COOKIE_NAME}=custom%3A%231A2B3C; Path=/; Max-Age=31536000; SameSite=Lax`,
    );
  });
});
