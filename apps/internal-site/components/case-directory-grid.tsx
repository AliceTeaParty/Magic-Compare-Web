import { Box } from "@mui/material";
import type { CaseCatalogItem } from "@/lib/server/repositories/content-repository";
import { CaseDirectoryCard } from "./case-directory-card";
import { CaseDirectoryEmptyState } from "./case-directory-empty-state";

export function CaseDirectoryGrid({ items }: { items: CaseCatalogItem[] }) {
  if (items.length === 0) {
    return <CaseDirectoryEmptyState />;
  }

  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
        gap: { xs: 1.7, md: 2.2 },
        alignItems: "stretch",
      }}
    >
      {items.map((item, index) => (
        <CaseDirectoryCard key={item.id} item={item} index={index} />
      ))}
    </Box>
  );
}
