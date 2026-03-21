import {
  ArrowOutward,
  Collections,
  ImageSearch,
  Public,
} from "@mui/icons-material";
import { Box, Button, Chip, Paper, Stack, Typography } from "@mui/material";
import Link from "next/link";
import type { CaseCatalogItem } from "@/lib/server/repositories/content-repository";

export function CaseDirectoryCard({
  item,
  index,
}: {
  item: CaseCatalogItem;
  index: number;
}) {
  return (
    <Paper
      elevation={0}
      sx={{
        p: { xs: 2.7, md: 3.2 },
        borderRadius: 3.5,
        border: "1px solid",
        borderColor: "divider",
        background:
          "linear-gradient(180deg, rgba(255,255,255,0.065) 0%, rgba(255,255,255,0.025) 100%)",
        minHeight: 258,
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
        spacing={2.15}
        sx={{ height: "100%", position: "relative", zIndex: 1 }}
      >
        <Stack
          direction="row"
          justifyContent="space-between"
          alignItems="flex-start"
          spacing={1.6}
        >
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="h6" sx={{ lineHeight: 1.05 }}>
              {item.title}
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
          sx={{ minHeight: 52 }}
        >
          {item.summary || "No summary yet."}
        </Typography>
        <Box
          sx={{
            minHeight: "1.6em",
            color: "text.secondary",
            fontSize: "0.875rem",
            lineHeight: 1.6,
          }}
        >
          &nbsp;
        </Box>
        <Stack
          direction="row"
          spacing={1}
          flexWrap="wrap"
          useFlexGap
          sx={{ pt: 0.1 }}
        >
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
          <Chip
            size="small"
            icon={<ImageSearch fontSize="small" />}
            label={new Date(item.updatedAt).toLocaleDateString()}
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
        <Stack direction="row" spacing={1} sx={{ pt: 1.15, mt: "auto" }}>
          <Button
            component={Link}
            href={`/cases/${item.slug}`}
            variant="outlined"
            endIcon={<ArrowOutward />}
            sx={{ minHeight: 42, px: 2.2 }}
          >
            Open workspace
          </Button>
        </Stack>
      </Stack>
    </Paper>
  );
}
