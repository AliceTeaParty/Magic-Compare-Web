"use client";

import { keyframes } from "@emotion/react";
import { CheckCircleOutlineRounded, CheckRounded, CollectionsOutlined } from "@mui/icons-material";
import {
  Box,
  CircularProgress,
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
import { findAsset, getComparisonTargetAssets } from "@magic-compare/compare-core/viewer-data";
import { memo, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
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

const currentGroupIconEnter = keyframes`
  0% { transform: scale(1) rotate(0); }
  35% { transform: scale(0.84) rotate(-7deg); }
  70% { transform: scale(1.08) rotate(0); }
  100% { transform: scale(1) rotate(0); }
`;

const desktopSidebarEnter = keyframes`
  from { opacity: 0; transform: translateX(6px); }
  to { opacity: 1; transform: translateX(0); }
`;

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
  onGroupNavigate,
  onGroupPrefetch,
  pendingGroupHref,
}: {
  currentGroup: ViewerGroup;
  groups: ViewerDataset["siblingGroups"];
  onGroupIntent: (assets: ViewerDataset["siblingGroups"][number]["preloadAssets"]) => void;
  onGroupNavigate?: (href: string) => void;
  onGroupPrefetch?: (href: string) => void;
  pendingGroupHref?: string | null;
}) {
  const router = useRouter();
  const hoverIntentTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function cancelHoverIntent() {
    if (hoverIntentTimerRef.current) {
      clearTimeout(hoverIntentTimerRef.current);
      hoverIntentTimerRef.current = null;
    }
  }

  /**
   * Prefetches immediately for focus and touch, while hover waits briefly so crossing a compact
   * navigation list does not start route and image requests for every row.
   */
  function handleGroupIntent(group: ViewerDataset["siblingGroups"][number]) {
    if (onGroupPrefetch) {
      onGroupPrefetch(group.href);
    } else {
      router.prefetch(group.href);
    }
    onGroupIntent(group.preloadAssets);
  }

  function handleGroupHover(group: ViewerDataset["siblingGroups"][number]) {
    cancelHoverIntent();
    hoverIntentTimerRef.current = setTimeout(() => {
      hoverIntentTimerRef.current = null;
      handleGroupIntent(group);
    }, 150);
  }

  function handleImmediateGroupIntent(group: ViewerDataset["siblingGroups"][number]) {
    cancelHoverIntent();
    handleGroupIntent(group);
  }

  useEffect(() => cancelHoverIntent, []);

  /** Intercepts only an ordinary primary click; browser-native new-tab and modifier behavior stays. */
  function handleGroupClick(
    event: ReactMouseEvent<HTMLAnchorElement>,
    group: ViewerDataset["siblingGroups"][number],
  ) {
    // Touch waits for a real click instead of prefetching on touchstart, which may only be the
    // beginning of a vertical scroll through the sidebar.
    handleImmediateGroupIntent(group);
    if (
      !onGroupNavigate ||
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }

    event.preventDefault();
    // The current row also reaches the controller so it can cancel a slower pending switch.
    onGroupNavigate(group.href);
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
          prefetch={onGroupNavigate ? false : undefined}
          selected={group.isCurrent}
          aria-current={group.isCurrent ? "page" : undefined}
          aria-busy={pendingGroupHref === group.href || undefined}
          data-viewer-group-link={onGroupNavigate ? "" : undefined}
          onClick={(event) => handleGroupClick(event, group)}
          onFocus={() => handleImmediateGroupIntent(group)}
          onMouseEnter={() => handleGroupHover(group)}
          onMouseLeave={cancelHoverIntent}
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
              component="span"
              sx={{
                display: "grid",
                placeItems: "center",
                transformOrigin: "center",
                // Current-group feedback is a fixed keyframe sequence, so CSS avoids retaining a
                // general-purpose animation runtime for every sidebar row.
                animation: group.isCurrent
                  ? `${currentGroupIconEnter} 300ms cubic-bezier(0.2, 0, 0, 1)`
                  : "none",
                "@media (prefers-reduced-motion: reduce)": { animation: "none" },
              }}
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
          {pendingGroupHref === group.href ? (
            <CircularProgress aria-hidden="true" color="inherit" size={18} thickness={5} />
          ) : group.isCurrent ? (
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
  onGroupNavigate,
  onGroupPrefetch,
  pendingGroupHref,
  publishStatus,
  variant,
}: {
  currentGroup: ViewerGroup;
  currentFrame: ViewerFrame | undefined;
  groups: ViewerDataset["siblingGroups"];
  heatmapAsset: ViewerAsset | undefined;
  onGroupIntent: (assets: ViewerDataset["siblingGroups"][number]["preloadAssets"]) => void;
  onGroupNavigate?: (href: string) => void;
  onGroupPrefetch?: (href: string) => void;
  pendingGroupHref?: string | null;
  publishStatus: ViewerDataset["publishStatus"];
  variant: "public" | "internal";
}) {
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
            <GroupLinks
              currentGroup={currentGroup}
              groups={groups}
              onGroupIntent={onGroupIntent}
              onGroupNavigate={onGroupNavigate}
              onGroupPrefetch={onGroupPrefetch}
              pendingGroupHref={pendingGroupHref}
            />
          </Stack>
          <Divider />
        </>
      ) : null}

      <Stack spacing={0.75}>
        {/* Site variant controls read/write capability, not language; both viewers share the same
            Chinese product vocabulary so public pages do not drift back to legacy English copy. */}
        <Typography
          variant="body2"
          sx={{
            color: "text.secondary",
            fontWeight: 500,
          }}
        >
          画面信息
        </Typography>
        <Typography variant="subtitle1">{currentFrame?.title}</Typography>
        <Typography
          variant="body2"
          sx={{
            color: "text.secondary",
          }}
        >
          {/* Clip is the correct product term and the earlier ep wording was a typo. Captions are
              authored manifest content, so the viewer must display them verbatim. */}
          {currentFrame?.caption || "暂无备注。"}
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
          素材信息
        </Typography>
        <Typography variant="body2">
          {/* Use the same asset resolver as the toolbar so extra columns such as Flt do not
              disappear from the metadata summary after a three-way upload. */}
          可用变量：{getAvailableVariableLabels(currentFrame).join(", ") || "无"}
        </Typography>
        <Typography variant="body2">热图：{heatmapAsset ? "可用" : "不可用"}</Typography>
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
  onGroupNavigate?: (href: string) => void;
  onGroupPrefetch?: (href: string) => void;
  pendingGroupHref?: string | null;
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
export const ViewerSidebar = memo(function ViewerSidebar({
  currentFrame,
  currentGroup,
  groups,
  heatmapAsset,
  onGroupIntent,
  onGroupNavigate,
  onGroupPrefetch,
  pendingGroupHref,
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
    onGroupNavigate,
    onGroupPrefetch,
    pendingGroupHref,
    publishStatus,
    variant,
  };
  const mobileDrawerOpen = sidebarOpen && !showDesktopSidebar;
  useRootScrollLock(mobileDrawerOpen);

  return (
    <>
      {sidebarOpen && showDesktopSidebar ? (
        <Box
          component="aside"
          sx={{
            borderLeft: "1px solid",
            borderColor: "divider",
            // The sidebar only fades into its final grid column. A CSS entry animation keeps the
            // visual cue while allowing closed metadata content and Motion runtime code to unload.
            animation: `${desktopSidebarEnter} 180ms ease-out`,
            "@media (prefers-reduced-motion: reduce)": { animation: "none" },
            // Public details use the same supporting surface; variant only trims internal data.
            backgroundColor: "surface.containerLow",
          }}
        >
          <ViewerSidebarContent {...contentProps} />
        </Box>
      ) : null}

      <Drawer
        anchor="right"
        open={mobileDrawerOpen}
        onClose={closeSidebar}
        // Viewer owns the root scroll lock so Modal must not add body padding and squeeze the sheet.
        // Closed mobile details duplicated the full metadata tree beside the desktop pane. Let MUI
        // unmount it while retaining the shell's explicit root-scroll handling.
        ModalProps={{ disableScrollLock: true }}
        slotProps={{
          paper: {
            sx: {
              width: "min(88vw, 360px)",
              borderLeft: "1px solid",
              borderColor: "divider",
              // Match the inline supporting pane so the Group list keeps its container contrast
              // when the same content moves into a modal Drawer on narrower viewports.
              backgroundColor: "surface.containerLow",
              backgroundImage: "none",
            },
          },
        }}
      >
        <ViewerSidebarContent {...contentProps} />
      </Drawer>
    </>
  );
});
