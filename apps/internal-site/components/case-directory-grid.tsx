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
          xl: "repeat(2, minmax(0, 1fr))",
        },
        gap: { xs: 1.7, md: 2.2, xl: 2.4 },
        alignItems: "stretch",
      }}
    >
      {items.map((item, index) => (
        <CaseDirectoryCard
          key={item.id}
          item={item}
          index={index}
          // Keep every card on the same width after the lead-card experiment proved worse for
          // scanability than a plain equal grid.
          isLead={false}
        />
      ))}
    </Box>
  );
}
