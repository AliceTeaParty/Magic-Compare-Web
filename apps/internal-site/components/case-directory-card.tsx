import {
  ArrowForward,
  CollectionsOutlined,
  PublicOutlined,
  ScheduleOutlined,
} from "@mui/icons-material";
import { Box, Chip, Paper, Stack, Typography } from "@mui/material";
import Link from "next/link";
import type { CaseCatalogItem } from "@/lib/server/repositories/content-repository";

const statusLabels = {
  draft: "草稿",
  internal: "内部",
  published: "已发布",
  archived: "已归档",
} as const;

/** Presents Case metadata in a repeatable M3 card without decorative elevation or fixed spacers. */
export function CaseDirectoryCard({ item }: { item: CaseCatalogItem }) {
  return (
    <Paper
      component={Link}
      href={`/cases/${item.slug}`}
      sx={{
        // The catalog is scanned repeatedly, so the whole Case surface is the navigation target;
        // the prior footer-only link made Fitts's Law work against the primary workflow.
        display: "flex",
        minWidth: 0,
        minHeight: 220,
        p: { xs: 2, md: 2.5 },
        borderRadius: 1.5,
        color: "text.primary",
        textDecoration: "none",
        backgroundColor: "var(--mui-palette-surface-containerLow)",
        transition: "background-color 150ms cubic-bezier(0.2, 0, 0, 1)",
        "&:hover": { backgroundColor: "var(--mui-palette-surface-container)" },
        "&:focus-visible": {
          outline: "3px solid var(--mui-palette-primary-main)",
          outlineOffset: 2,
        },
      }}
    >
      <Stack spacing={1.5} sx={{ width: "100%", minWidth: 0 }}>
        <Stack
          direction="row"
          sx={{ alignItems: "flex-start", justifyContent: "space-between", gap: 1 }}
        >
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="h3" noWrap title={item.title}>
              {item.title}
            </Typography>
            <Typography variant="caption" color="text.secondary" noWrap>
              {item.slug}
            </Typography>
          </Box>
          <Chip
            label={statusLabels[item.status]}
            size="small"
            color={item.status === "published" ? "primary" : "default"}
          />
        </Stack>

        <Typography
          variant="body2"
          color="text.secondary"
          sx={{
            display: "-webkit-box",
            WebkitBoxOrient: "vertical",
            WebkitLineClamp: 3,
            overflow: "hidden",
          }}
        >
          {item.summary || "暂无描述。"}
        </Typography>

        <Stack direction="row" sx={{ flexWrap: "wrap", gap: 0.75, mt: "auto" }}>
          <Chip
            size="small"
            variant="outlined"
            icon={<CollectionsOutlined fontSize="small" />}
            label={`${item.groupCount} 个 Group`}
          />
          <Chip
            size="small"
            variant="outlined"
            icon={<PublicOutlined fontSize="small" />}
            label={`${item.publicGroupCount} 个公开`}
          />
          <Chip
            size="small"
            variant="outlined"
            icon={<ScheduleOutlined fontSize="small" />}
            label={new Date(item.updatedAt).toLocaleDateString("zh-CN")}
          />
        </Stack>

        <Stack direction="row" sx={{ alignItems: "center", gap: 0.75, color: "primary.main" }}>
          <Typography variant="button">打开工作区</Typography>
          <ArrowForward fontSize="small" />
        </Stack>
      </Stack>
    </Paper>
  );
}
