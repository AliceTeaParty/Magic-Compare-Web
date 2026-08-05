"use client";

import { CheckCircleOutlineRounded, CheckRounded, CollectionsOutlined } from "@mui/icons-material";
import {
  Box,
  Divider,
  Drawer,
  Link as MuiLink,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Stack,
  Typography,
} from "@mui/material";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { findAsset, getComparisonTargetAssets } from "@magic-compare/compare-core/viewer-data";
import { useEffect, useState } from "react";
import type {
  ViewerAsset,
  ViewerDataset,
  ViewerFrame,
  ViewerGroup,
} from "@magic-compare/compare-core/viewer-data";
import { useRootScrollLock } from "../../overlays/use-root-scroll-lock";

const internalStatusLabels = {
  archived: "已归档",
  draft: "草稿",
  internal: "内部",
  published: "公开",
} as const;

/** Formats server timestamps only after hydration so the browser's locale and time zone win. */
function useLocalizedPublishDate(value: string | null | undefined) {
  const [localizedDate, setLocalizedDate] = useState<{ source: string; label: string } | null>(
    null,
  );

  useEffect(() => {
    if (!value) return;

    const date = new Date(value);
    const label = Number.isNaN(date.getTime())
      ? "时间不可用"
      : new Intl.DateTimeFormat(undefined, {
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          timeZoneName: "short",
        }).format(date);

    setLocalizedDate({ source: value, label });
  }, [value]);

  if (!value) return "尚未发布";
  return localizedDate?.source === value ? localizedDate.label : null;
}

/** Lists the baseline and every selectable comparison target shown by the Viewer toolbar. */
function getAvailableVariableLabels(frame: ViewerFrame | undefined): string[] {
  if (!frame) return [];
  return [findAsset(frame, "before"), ...getComparisonTargetAssets(frame)]
    .filter((asset): asset is ViewerAsset => Boolean(asset))
    .map((asset) => asset.label);
}

/**
 * Uses the sibling-group list from the dataset so navigation order stays aligned with workspace
 * ordering instead of rebuilding links from route params in the sidebar.
 */
function GroupLinks({
  currentGroup,
  groups,
  onGroupIntent,
}: {
  currentGroup: ViewerGroup;
  groups: ViewerDataset["siblingGroups"];
  onGroupIntent: (assets: ViewerDataset["siblingGroups"][number]["preloadAssets"]) => void;
}) {
  const router = useRouter();

  /**
   * Uses hover/focus/touch as explicit navigation intent: route data can be prefetched immediately
   * while only the target group's small first-frame hint is handed to the image preloader.
   */
  function handleGroupIntent(group: ViewerDataset["siblingGroups"][number]) {
    router.prefetch(group.href);
    onGroupIntent(group.preloadAssets);
  }

  return (
    <List
      disablePadding
      sx={{
        display: "grid",
        gap: 0.25,
        p: 0.5,
        borderRadius: 2,
        // The list owns one supporting surface so unselected groups still read as navigation.
        backgroundColor: "surface.container",
      }}
    >
      {groups.map((group) => (
        <ListItemButton
          key={group.id}
          component={Link}
          href={group.href}
          selected={group.isCurrent}
          aria-current={group.isCurrent ? "page" : undefined}
          onFocus={() => handleGroupIntent(group)}
          onMouseEnter={() => handleGroupIntent(group)}
          onTouchStart={() => handleGroupIntent(group)}
          sx={{
            minHeight: 44,
            px: 1.25,
            py: 0.6,
            borderRadius: 999,
            color: "text.secondary",
            // Group navigation is a selectable list, so the current destination uses the same
            // container pair as the rail instead of relying on bold text alone.
            "&.Mui-selected": {
              color: "primary.onContainer",
              backgroundColor:
                "color-mix(in srgb, var(--mui-palette-primary-light) 72%, var(--mui-palette-surface-container))",
            },
            "&.Mui-selected:hover": {
              backgroundColor:
                "color-mix(in srgb, var(--mui-palette-primary-light) 80%, var(--mui-palette-surface-container))",
            },
            "&:hover": {
              backgroundColor: "color-mix(in srgb, currentColor 8%, transparent)",
            },
          }}
        >
          <ListItemIcon sx={{ minWidth: 32, color: "inherit" }}>
            <Box
              component={motion.span}
              initial={false}
              animate={
                group.isCurrent
                  ? { scale: [1, 0.84, 1.08, 1], rotate: [0, -7, 0] }
                  : { scale: 1, rotate: 0 }
              }
              transition={{ duration: 0.3, ease: [0.2, 0, 0, 1] }}
              sx={{ display: "grid", placeItems: "center", transformOrigin: "center" }}
            >
              <CollectionsOutlined sx={{ fontSize: 19 }} />
            </Box>
          </ListItemIcon>
          <ListItemText
            primary={group.title}
            slotProps={{
              primary: {
                sx: {
                  display: "-webkit-box",
                  overflow: "hidden",
                  WebkitBoxOrient: "vertical",
                  WebkitLineClamp: 2,
                  fontSize: "0.88rem",
                  fontWeight: group.isCurrent ? 600 : 500,
                  lineHeight: 1.35,
                },
              },
            }}
          />
          {group.isCurrent ? (
            <CheckRounded aria-hidden="true" sx={{ ml: 1, fontSize: 18 }} />
          ) : null}
        </ListItemButton>
      ))}
      {groups.length === 0 ? (
        <Stack
          direction="row"
          sx={{
            minHeight: 44,
            px: 1.25,
            py: 0.6,
            alignItems: "center",
            gap: 1,
            borderRadius: 999,
            color: "primary.onContainer",
            backgroundColor:
              "color-mix(in srgb, var(--mui-palette-primary-light) 72%, var(--mui-palette-surface-container))",
          }}
        >
          <CollectionsOutlined sx={{ fontSize: 19 }} />
          <Typography variant="body2" sx={{ flex: 1, fontWeight: 600 }}>
            {currentGroup.title}
          </Typography>
          <CheckRounded aria-hidden="true" sx={{ fontSize: 18 }} />
        </Stack>
      ) : null}
    </List>
  );
}

/**
 * Concentrates metadata, publish status, and internal navigation in one place so desktop and mobile
 * sidebars render the same information surface.
 */
function ViewerSidebarContent({
  currentGroup,
  currentFrame,
  groups,
  heatmapAsset,
  onGroupIntent,
  publishStatus,
  variant,
}: {
  currentGroup: ViewerGroup;
  currentFrame: ViewerFrame | undefined;
  groups: ViewerDataset["siblingGroups"];
  heatmapAsset: ViewerAsset | undefined;
  onGroupIntent: (assets: ViewerDataset["siblingGroups"][number]["preloadAssets"]) => void;
  publishStatus: ViewerDataset["publishStatus"];
  variant: "public" | "internal";
}) {
  const isInternal = variant === "internal";
  const localizedPublishDate = useLocalizedPublishDate(publishStatus?.publishedAt);

  return (
    <Stack spacing={2} sx={{ p: 2.25 }}>
      {variant === "internal" ? (
        <>
          <Stack spacing={0.85}>
            <Typography
              variant="body2"
              sx={{
                color: "text.secondary",
                fontWeight: 500,
              }}
            >
              Group
            </Typography>
            <GroupLinks currentGroup={currentGroup} groups={groups} onGroupIntent={onGroupIntent} />
          </Stack>
          <Divider />
        </>
      ) : null}

      <Stack spacing={0.75}>
        <Typography
          variant="body2"
          sx={{
            color: "text.secondary",
            fontWeight: 500,
          }}
        >
          {isInternal ? "画面信息" : "Frame details"}
        </Typography>
        <Typography variant="subtitle1">{currentFrame?.title}</Typography>
        <Typography
          variant="body2"
          sx={{
            color: "text.secondary",
          }}
        >
          {currentFrame?.caption.replace(/\bepisode\b/gi, "clip") ||
            (isInternal ? "暂无备注。" : "No frame note.")}
        </Typography>
      </Stack>

      <Divider />

      <Stack spacing={0.75}>
        <Typography
          variant="body2"
          sx={{
            color: "text.secondary",
            fontWeight: 500,
          }}
        >
          {isInternal ? "素材信息" : "Asset metadata"}
        </Typography>
        <Typography variant="body2">
          {/* Use the same asset resolver as the toolbar so extra columns such as Flt do not
              disappear from the metadata summary after a three-way upload. */}
          {isInternal ? "可用变量：" : "Available variables: "}
          {getAvailableVariableLabels(currentFrame).join(", ") || (isInternal ? "无" : "None")}
        </Typography>
        <Typography variant="body2">
          {isInternal ? "热图：" : "Heatmap: "}
          {heatmapAsset
            ? isInternal
              ? "可用"
              : "Available"
            : isInternal
              ? "不可用"
              : "Unavailable"}
        </Typography>
      </Stack>

      {variant === "internal" && publishStatus ? (
        <>
          <Divider />
          <Stack spacing={0.75}>
            <Typography
              variant="body2"
              sx={{
                color: "text.secondary",
              }}
            >
              发布状态
            </Typography>
            <Stack
              direction="row"
              sx={{
                alignSelf: "flex-start",
                minHeight: 32,
                px: 1.25,
                alignItems: "center",
                gap: 0.65,
                borderRadius: 999,
                color: "text.secondary",
                backgroundColor: "surface.containerHigh",
              }}
            >
              {publishStatus.status === "published" ? (
                <CheckCircleOutlineRounded
                  aria-hidden="true"
                  sx={{ color: "success.main", fontSize: 18 }}
                />
              ) : null}
              <Typography variant="caption" sx={{ fontWeight: 650 }}>
                {internalStatusLabels[publishStatus.status]}
              </Typography>
            </Stack>
            {publishStatus.publicUrl && publishStatus.publicSlug ? (
              <MuiLink
                href={publishStatus.publicUrl}
                target="_blank"
                rel="noreferrer"
                aria-label={`打开公开 Slug ${publishStatus.publicSlug}`}
                underline="hover"
                variant="body2"
                sx={{ alignSelf: "flex-start", fontWeight: 550, overflowWrap: "anywhere" }}
              >
                公开 Slug：{publishStatus.publicSlug}
              </MuiLink>
            ) : (
              <Typography variant="body2" sx={{ color: "text.secondary" }}>
                公开 Slug：首次发布后生成
              </Typography>
            )}
            <Typography
              component="time"
              dateTime={publishStatus.publishedAt ?? undefined}
              variant="body2"
              sx={{
                minHeight: "1.5em",
                color: "text.secondary",
              }}
            >
              {/* A non-breaking space keeps the metadata stack stable during hydration without
                  briefly presenting the server's UTC value as the user's local time. */}
              {localizedPublishDate ?? "\u00a0"}
            </Typography>
          </Stack>
        </>
      ) : null}
    </Stack>
  );
}

interface ViewerSidebarProps {
  currentFrame: ViewerFrame | undefined;
  currentGroup: ViewerGroup;
  groups: ViewerDataset["siblingGroups"];
  heatmapAsset: ViewerAsset | undefined;
  onGroupIntent: (assets: ViewerDataset["siblingGroups"][number]["preloadAssets"]) => void;
  publishStatus: ViewerDataset["publishStatus"];
  showDesktopSidebar: boolean;
  sidebarOpen: boolean;
  closeSidebar: () => void;
  variant: "public" | "internal";
}

/**
 * Switches between inline and drawer sidebars without changing the metadata payload, which keeps
 * viewer state independent from the current responsive layout.
 */
export function ViewerSidebar({
  currentFrame,
  currentGroup,
  groups,
  heatmapAsset,
  onGroupIntent,
  publishStatus,
  showDesktopSidebar,
  sidebarOpen,
  closeSidebar,
  variant,
}: ViewerSidebarProps) {
  const contentProps = {
    currentFrame,
    currentGroup,
    groups,
    heatmapAsset,
    onGroupIntent,
    publishStatus,
    variant,
  };
  const mobileDrawerOpen = sidebarOpen && !showDesktopSidebar;
  useRootScrollLock(mobileDrawerOpen);

  return (
    <>
      <AnimatePresence initial={false}>
        {sidebarOpen && showDesktopSidebar ? (
          <Box
            component={motion.aside}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            sx={{
              borderLeft: "1px solid",
              borderColor: "divider",
              backgroundColor:
                variant === "internal" ? "surface.containerLow" : "rgba(255,255,255,0.03)",
            }}
          >
            <ViewerSidebarContent {...contentProps} />
          </Box>
        ) : null}
      </AnimatePresence>

      <Drawer
        anchor="right"
        open={mobileDrawerOpen}
        onClose={closeSidebar}
        // Viewer owns the root scroll lock so Modal must not add body padding and squeeze the sheet.
        ModalProps={{ keepMounted: true, disableScrollLock: true }}
        slotProps={{
          paper: {
            sx: {
              width: "min(88vw, 360px)",
              borderLeft: "1px solid",
              borderColor: "divider",
              // Match the inline supporting pane so the Group list keeps its container contrast
              // when the same content moves into a modal Drawer on narrower viewports.
              backgroundColor:
                variant === "internal" ? "surface.containerLow" : "rgba(20, 33, 70, 0.98)",
              backgroundImage: "none",
            },
          },
        }}
      >
        <ViewerSidebarContent {...contentProps} />
      </Drawer>
    </>
  );
}
