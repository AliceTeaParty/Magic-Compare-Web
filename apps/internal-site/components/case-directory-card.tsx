import { ArrowOutward, Collections, Public } from "@mui/icons-material";
import { Box, Button, Chip, Paper, Stack, Typography } from "@mui/material";
import Link from "next/link";
import type { CaseCatalogItem } from "@/lib/server/repositories/content-repository";

/**
 * Keeps each catalog card structurally consistent so operators can compare cases without the grid
 * changing width hierarchy underneath them.
 */
export function CaseDirectoryCard({
  item,
  index,
  isLead,
}: {
  item: CaseCatalogItem;
  index: number;
  isLead: boolean;
}) {
  return (
    <Paper
      elevation={0}
      sx={{
        p: { xs: 2.45, md: 3.05 },
        borderRadius: 3.5,
        border: "1px solid",
        borderColor: "divider",
        background:
          "linear-gradient(180deg, rgba(255,255,255,0.065) 0%, rgba(255,255,255,0.025) 100%)",
        minHeight: { xs: 246, md: 258 },
        position: "relative",
        overflow: "hidden",
        animation: "catalogCardRise 420ms cubic-bezier(0.22, 1, 0.36, 1) both",
        animationDelay: `${index * 50}ms`,
        "@keyframes catalogCardRise": {
          from: {
            opacity: 0,
            transform: "translateY(16px)",
          },
          to: {
            opacity: 1,
            transform: "translateY(0)",
          },
        },
        "&::before": {
          content: '""',
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(circle at top right, rgba(232, 198, 246, 0.12), transparent 32%)",
          pointerEvents: "none",
        },
      }}
    >
      <Stack
        spacing={1.9}
        sx={{ height: "100%", position: "relative", zIndex: 1 }}
      >
        <Stack
          direction="row"
          justifyContent="space-between"
          alignItems="flex-start"
          spacing={1.4}
        >
          <Box sx={{ minWidth: 0, display: "grid", gap: 0.9 }}>
            <Typography
              variant="h6"
              sx={{ lineHeight: 1.02, maxWidth: isLead ? 520 : "100%" }}
            >
              {item.title}
            </Typography>
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ letterSpacing: 0.5 }}
            >
              {/* Surface recency next to the title so operators can scan freshness before they read
                  the full summary; this replaces a later, easier-to-miss metadata row. */}
              Updated {new Date(item.updatedAt).toLocaleDateString()}
            </Typography>
          </Box>
          <Chip
            label={item.status}
            size="small"
            color={item.status === "published" ? "primary" : "default"}
            sx={{ height: 34, "& .MuiChip-label": { px: 1.45 } }}
          />
        </Stack>
        <Typography
          variant="body2"
          color="text.secondary"
          sx={{
            // Let real summary length and the bottom action row determine card height. The previous
            // empty spacer kept cards aligned, but it also made the grid feel like a placeholder
            // template instead of real content.
            minHeight: isLead ? { xs: "auto", md: 72 } : 52,
            maxWidth: isLead ? 620 : "100%",
            lineHeight: 1.72,
          }}
        >
          {item.summary || "No summary yet."}
        </Typography>
        <Stack spacing={1.1} sx={{ pt: 1.35, mt: "auto" }}>
          {/* Keep metadata and the primary action pinned to the card floor so varying summaries do
              not make the bottom edge drift from card to card. */}
          <Stack direction="row" spacing={0.9} flexWrap="wrap" useFlexGap>
            <Chip
              size="small"
              icon={<Collections fontSize="small" />}
              label={`${item.groupCount} groups`}
              variant="outlined"
              sx={{
                height: 34,
                pl: 0.6,
                pr: 0.85,
                "& .MuiChip-label": { px: 1.6 },
                "& .MuiChip-icon": { ml: 0.95, mr: -0.35 },
              }}
            />
            <Chip
              size="small"
              icon={<Public fontSize="small" />}
              label={`${item.publicGroupCount} public`}
              variant="outlined"
              sx={{
                height: 34,
                pl: 0.6,
                pr: 0.85,
                "& .MuiChip-label": { px: 1.6 },
                "& .MuiChip-icon": { ml: 0.95, mr: -0.35 },
              }}
            />
          </Stack>
          <Stack direction="row" spacing={1}>
            <Button
              component={Link}
              href={`/cases/${item.slug}`}
              variant="outlined"
              endIcon={<ArrowOutward />}
              sx={{ minHeight: 42, px: 2.2, borderRadius: 999 }}
            >
              Open workspace
            </Button>
          </Stack>
        </Stack>
      </Stack>
    </Paper>
  );
}
