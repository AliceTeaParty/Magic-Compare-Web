"use client";

import { ArrowBack, OpenInNew } from "@mui/icons-material";
import {
  Box,
  Button,
  Chip,
  Divider,
  Drawer,
  IconButton,
  Link as MuiLink,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { formatUtcDate } from "@magic-compare/shared-utils";
import type {
  ViewerAsset,
  ViewerDataset,
  ViewerFrame,
  ViewerGroup,
} from "@magic-compare/compare-core/viewer-data";

function GroupLinks({
  currentGroup,
  groups,
}: {
  currentGroup: ViewerGroup;
  groups: ViewerDataset["siblingGroups"];
}) {
  return (
    <Stack spacing={1}>
      {groups.map((group) => (
        <MuiLink
          key={group.id}
          component={Link}
          href={group.href}
          underline="none"
          sx={{
            color: group.isCurrent ? "primary.main" : "text.secondary",
            fontWeight: group.isCurrent ? 700 : 500,
          }}
        >
          {group.title}
          {group.isCurrent ? " · current" : ""}
        </MuiLink>
      ))}
      {groups.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          {currentGroup.title}
        </Typography>
      ) : null}
    </Stack>
  );
}

function ViewerSidebarContent({
  caseMeta,
  currentGroup,
  currentFrame,
  groups,
  heatmapAsset,
  publishStatus,
  variant,
}: {
  caseMeta: ViewerDataset["caseMeta"];
  currentGroup: ViewerGroup;
  currentFrame: ViewerFrame | undefined;
  groups: ViewerDataset["siblingGroups"];
  heatmapAsset: ViewerAsset | undefined;
  publishStatus: ViewerDataset["publishStatus"];
  variant: "public" | "internal";
}) {
  return (
    <Stack spacing={2} sx={{ p: 2.25 }}>
      {variant === "internal" ? (
        <>
          <Stack spacing={0.85}>
            <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 500 }}>
              Group navigator
            </Typography>
            <Button
              component={Link}
              href={`/cases/${caseMeta.slug}`}
              variant="outlined"
              size="small"
              startIcon={<ArrowBack fontSize="small" />}
              sx={{
                alignSelf: "flex-start",
                minHeight: 34,
                px: 1.35,
              }}
            >
              Back to workspace
            </Button>
            <GroupLinks currentGroup={currentGroup} groups={groups} />
          </Stack>
          <Divider />
        </>
      ) : null}

      <Stack spacing={0.75}>
        <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 500 }}>
          Frame details
        </Typography>
        <Typography variant="subtitle1">{currentFrame?.title}</Typography>
        <Typography variant="body2" color="text.secondary">
          {currentFrame?.caption || "No frame note."}
        </Typography>
      </Stack>

      <Divider />

      <Stack spacing={0.75}>
        <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 500 }}>
          Asset metadata
        </Typography>
        <Typography variant="body2">
          Primary assets:{" "}
          {(currentFrame?.assets ?? [])
            .filter((asset) => asset.isPrimaryDisplay)
            .map((asset) => asset.label)
            .join(", ") || "None"}
        </Typography>
        <Typography variant="body2">Heatmap: {heatmapAsset ? "Available" : "Unavailable"}</Typography>
      </Stack>

      {variant === "internal" && publishStatus ? (
        <>
          <Divider />
          <Stack spacing={0.75}>
            <Typography variant="body2" color="text.secondary">
              Publish status
            </Typography>
            <Chip
              label={publishStatus.status}
              color={publishStatus.status === "published" ? "primary" : "default"}
              size="small"
              sx={{ alignSelf: "flex-start" }}
            />
            <Stack direction="row" spacing={0.6} alignItems="center" useFlexGap>
              <Typography variant="body2">
                Public slug: {publishStatus.publicSlug ?? "Pending first publish"}
              </Typography>
              {publishStatus.publicUrl ? (
                <Tooltip title="Open published page in a new tab">
                  <IconButton
                    component="a"
                    href={publishStatus.publicUrl}
                    target="_blank"
                    rel="noreferrer"
                    size="small"
                    sx={{
                      width: 38,
                      height: 30,
                      px: 0.9,
                      borderRadius: 999,
                      border: "1px solid",
                      borderColor: "divider",
                      backgroundColor: "background.raised",
                    }}
                  >
                    <OpenInNew sx={{ fontSize: 16 }} />
                  </IconButton>
                </Tooltip>
              ) : null}
            </Stack>
            <Typography variant="body2" color="text.secondary">
              {formatUtcDate(publishStatus.publishedAt ?? null)}
            </Typography>
          </Stack>
        </>
      ) : null}
    </Stack>
  );
}

interface ViewerSidebarProps {
  caseMeta: ViewerDataset["caseMeta"];
  currentFrame: ViewerFrame | undefined;
  currentGroup: ViewerGroup;
  groups: ViewerDataset["siblingGroups"];
  heatmapAsset: ViewerAsset | undefined;
  publishStatus: ViewerDataset["publishStatus"];
  showDesktopSidebar: boolean;
  sidebarOpen: boolean;
  toggleSidebar: () => void;
  variant: "public" | "internal";
}

export function ViewerSidebar({
  caseMeta,
  currentFrame,
  currentGroup,
  groups,
  heatmapAsset,
  publishStatus,
  showDesktopSidebar,
  sidebarOpen,
  toggleSidebar,
  variant,
}: ViewerSidebarProps) {
  const contentProps = {
    caseMeta,
    currentFrame,
    currentGroup,
    groups,
    heatmapAsset,
    publishStatus,
    variant,
  };

  return (
    <>
      <AnimatePresence initial={false}>
        {sidebarOpen && showDesktopSidebar ? (
          <Box
            component={motion.aside}
            initial={{ opacity: 0, x: 18 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 18 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            sx={{
              borderLeft: "1px solid",
              borderColor: "divider",
              backgroundColor: "rgba(255,255,255,0.03)",
            }}
          >
            <ViewerSidebarContent {...contentProps} />
          </Box>
        ) : null}
      </AnimatePresence>

      <Drawer
        anchor="right"
        open={sidebarOpen && !showDesktopSidebar}
        onClose={toggleSidebar}
        ModalProps={{ keepMounted: true }}
        PaperProps={{
          sx: {
            width: "min(88vw, 360px)",
            borderLeft: "1px solid",
            borderColor: "divider",
            backgroundColor: "rgba(20, 33, 70, 0.98)",
            backgroundImage: "none",
          },
        }}
      >
        <ViewerSidebarContent {...contentProps} />
      </Drawer>
    </>
  );
}
