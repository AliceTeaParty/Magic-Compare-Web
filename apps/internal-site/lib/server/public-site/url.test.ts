import { afterEach, describe, expect, it } from "vitest";
import {
  CF_PAGES_PROJECT_NAME_ENV_NAME,
  PUBLIC_SITE_BASE_URL_ENV_NAME,
} from "../runtime-config";
import { resolvePublishedGroupUrl } from "./url";

const originalProjectName = process.env[CF_PAGES_PROJECT_NAME_ENV_NAME];
const originalPublicSiteBaseUrl = process.env[PUBLIC_SITE_BASE_URL_ENV_NAME];

afterEach(() => {
  process.env[CF_PAGES_PROJECT_NAME_ENV_NAME] = originalProjectName;
  process.env[PUBLIC_SITE_BASE_URL_ENV_NAME] = originalPublicSiteBaseUrl;
});

describe("resolvePublishedGroupUrl", () => {
  it("prefers a configured public site base url", () => {
    process.env[PUBLIC_SITE_BASE_URL_ENV_NAME] = "https://compare.example.com";
    process.env[CF_PAGES_PROJECT_NAME_ENV_NAME] = "magic-compare-public";

    expect(resolvePublishedGroupUrl("demo-grain-study--banding-check")).toBe(
      "https://compare.example.com/g/demo-grain-study--banding-check",
    );
  });

  it("falls back to pages.dev when no custom public site url is set", () => {
    delete process.env[PUBLIC_SITE_BASE_URL_ENV_NAME];
    process.env[CF_PAGES_PROJECT_NAME_ENV_NAME] = "magic-compare-public";

    expect(resolvePublishedGroupUrl("demo-grain-study--banding-check")).toBe(
      "https://magic-compare-public.pages.dev/g/demo-grain-study--banding-check",
    );
  });
});
