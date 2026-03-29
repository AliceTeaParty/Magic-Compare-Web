import { Box } from "@mui/material";
import type { CaseCatalogItem } from "@/lib/server/repositories/content-repository";
import { CaseDirectoryCard } from "./case-directory-card";
import { CaseDirectoryEmptyState } from "./case-directory-empty-state";

/**
 * Uses a slightly asymmetric grid so large catalogs do not collapse into a perfectly even card
 * wall, which tested as visually flat even before search/filter controls exist.
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
          xl: "repeat(12, minmax(0, 1fr))",
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
          // Only promote a lead card when there is another card to contrast against; a single case
          // page should stay visually centered instead of faking asymmetry for its own sake.
          isLead={index === 0 && items.length > 1}
        />
      ))}
    </Box>
  );
}
