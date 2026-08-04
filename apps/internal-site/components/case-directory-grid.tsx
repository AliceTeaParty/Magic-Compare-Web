import { Box } from "@mui/material";
import type { CaseCatalogItem } from "@/lib/server/repositories/content-repository";
import { CaseDirectoryCard } from "./case-directory-card";
import { CaseDirectoryEmptyState } from "./case-directory-empty-state";

/**
 * Keeps the catalog as a clean equal-width grid. The earlier lead-card experiment added visual
 * novelty, but it made scanning and comparison harder than a regular matrix.
 */
export function CaseDirectoryGrid({ items }: { items: CaseCatalogItem[] }) {
  if (items.length === 0) {
    return <CaseDirectoryEmptyState />;
  }

  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: {
          xs: "1fr",
          md: "repeat(2, minmax(0, 1fr))",
          xl: "repeat(3, minmax(0, 1fr))",
        },
        gap: { xs: 1.5, md: 2 },
        alignItems: "stretch",
      }}
    >
      {items.map((item) => (
        <CaseDirectoryCard key={item.id} item={item} />
      ))}
    </Box>
  );
}
