export const DEMO_CASE_SLUG = "demo-grain-study";
export const HIDE_DEMO_ENV_NAME = "MAGIC_COMPARE_HIDE_DEMO";
export const PUBLISHED_ROOT_ENV_NAME = "MAGIC_COMPARE_PUBLISHED_ROOT";

export interface FooterConfig {
  author: string;
  joinUsLabel: string | null;
  joinUsUrl: string | null;
  yearEnd: number;
  yearStart: number;
}

export function kebabCase(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

export function buildPublicGroupSlug(caseSlug: string, groupSlug: string): string {
  return `${caseSlug}--${groupSlug}`;
}

export function parseEnvFlag(value: string | undefined): boolean {
  if (!value) {
    return false;
  }

  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

export function orderByNumericOrder<T extends { order: number }>(items: T[]): T[] {
  return [...items].sort((left, right) => left.order - right.order);
}

export function notEmpty<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

export function clampNumber(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

export function formatUtcDate(isoDate: string | null): string {
  if (!isoDate) {
    return "Not published";
  }

  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(isoDate));
}

export function resolveFooterConfig(
  env: Record<string, string | undefined>,
  currentYear = new Date().getFullYear(),
): FooterConfig {
  const parsedYearStart = Number.parseInt(env.MAGIC_COMPARE_FOOTER_YEAR_START?.trim() || "", 10);
  const yearStart =
    Number.isFinite(parsedYearStart) && parsedYearStart > 0
      ? Math.min(parsedYearStart, currentYear)
      : 2026;
  const joinUsUrl = env.MAGIC_COMPARE_FOOTER_JOIN_US_URL?.trim() || null;

  return {
    author: env.MAGIC_COMPARE_FOOTER_AUTHOR?.trim() || "Magic Compare",
    joinUsLabel: joinUsUrl ? env.MAGIC_COMPARE_FOOTER_JOIN_US_LABEL?.trim() || "Join us" : null,
    joinUsUrl,
    yearEnd: currentYear,
    yearStart,
  };
}
