/** Shared page-identity metrics keep catalog, workspace, upload, and Viewer headers on one rhythm. */
export const MAGIC_PAGE_HEADER = {
  minHeight: { xs: 120, md: 124 },
  titleSx: {
    fontSize: { xs: "1.625rem", md: "2rem" },
    lineHeight: { xs: 1.25, md: 1.2 },
    fontWeight: 650,
  },
  subtitleSx: {
    fontSize: { xs: "0.8125rem", md: "0.9375rem" },
    lineHeight: 1.5,
  },
} as const;
