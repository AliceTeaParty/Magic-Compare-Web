import { DEMO_CASE_SLUG, parseEnvFlag } from "@magic-compare/shared-utils";

export const HIDE_DEMO_ENV_NAME = "MAGIC_COMPARE_HIDE_DEMO";

export function shouldHideDemoContent(): boolean {
  return parseEnvFlag(process.env[HIDE_DEMO_ENV_NAME]);
}

export function isHiddenDemoCaseSlug(caseSlug: string): boolean {
  return shouldHideDemoContent() && caseSlug === DEMO_CASE_SLUG;
}
