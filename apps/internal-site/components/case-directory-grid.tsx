import {
  ArrowOutward,
  Collections,
  ImageSearch,
  Public,
} from "@mui/icons-material";
import { Box, Button, Chip, Paper, Stack, Typography } from "@mui/material";
import Link from "next/link";
import type { listCases } from "@/lib/server/repositories/content-repository";

type DirectoryItem = Awaited<ReturnType<typeof listCases>>[number];

export function CaseDirectoryGrid({ items }: { items: DirectoryItem[] }) {
  if (items.length === 0) {
    return (
      <Paper
        elevation={0}
        sx={{
          p: { xs: 3, md: 4 },
          borderRadius: 3,
          border: "1px dashed",
          borderColor: "divider",
          backgroundColor: "rgba(255,255,255,0.02)",
        }}
      >
        <Stack spacing={1.5}>
          <Typography variant="h5">No cases yet</Typography>
          <Typography color="text.secondary">
            Initialize the SQLite schema, then import a local case with the Python uploader.
          </Typography>
          <Typography component="pre" sx={{ fontSize: 13, color: "text.secondary", m: 0 }}>
            pnpm db:push
            {"\n"}pnpm db:seed
          </Typography>
        </Stack>
      </Paper>
    );
  }

  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
        gap: { xs: 1.5, md: 2 },
      }}
    >
      {items.map((item) => (
        <Paper
          key={item.id}
          elevation={0}
          sx={{
            p: { xs: 2.5, md: 3 },
            borderRadius: 3,
            border: "1px solid",
            borderColor: "divider",
            backgroundColor: "rgba(255,255,255,0.025)",
            minHeight: 236,
          }}
        >
          <Stack spacing={2} sx={{ height: "100%" }}>
            <Stack
              direction="row"
              justifyContent="space-between"
              alignItems="flex-start"
              spacing={1.5}
            >
              <Box sx={{ minWidth: 0 }}>
                <Typography variant="h6">{item.title}</Typography>
                {item.subtitle ? (
                  <Typography variant="body2" color="text.secondary">
                    {item.subtitle}
                  </Typography>
                ) : null}
              </Box>
              <Chip label={item.status} size="small" color={item.status === "published" ? "primary" : "default"} />
            </Stack>
            <Typography variant="body2" color="text.secondary" sx={{ minHeight: 48 }}>
              {item.summary || "No summary yet."}
            </Typography>
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ pt: 0.25 }}>
              <Chip
                size="small"
                icon={<Collections fontSize="small" />}
                label={`${item.groupCount} groups`}
                variant="outlined"
              />
              <Chip
                size="small"
                icon={<Public fontSize="small" />}
                label={`${item.publicGroupCount} public`}
                variant="outlined"
              />
              <Chip
                size="small"
                icon={<ImageSearch fontSize="small" />}
                label={new Date(item.updatedAt).toLocaleDateString()}
                variant="outlined"
              />
            </Stack>
            <Stack direction="row" spacing={1} sx={{ pt: 1, mt: "auto" }}>
              <Button
                component={Link}
                href={`/cases/${item.slug}`}
                variant="outlined"
                endIcon={<ArrowOutward />}
              >
                Open workspace
              </Button>
            </Stack>
          </Stack>
        </Paper>
      ))}
    </Box>
  );
}
