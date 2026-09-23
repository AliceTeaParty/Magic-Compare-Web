"use client";

import { useState } from "react";
import { Menu } from "@mui/icons-material";
import { AppBar, Box, IconButton, Toolbar, Tooltip, Typography } from "@mui/material";

export const MAGIC_NAV_RAIL_WIDTH = 80;
export const MAGIC_NAV_RAIL_MIN_WIDTH = 700;
export const MAGIC_NAV_RAIL_MEDIA_QUERY = `@media (min-width:${MAGIC_NAV_RAIL_MIN_WIDTH}px)`;

/** Shows a configured navigation image while retaining the built-in mark if that image fails. */
export function MagicNavigationLogo({
  logoUrl,
  size = 36,
}: {
  logoUrl?: string | null;
  size?: number;
}) {
  const normalizedLogoUrl = logoUrl?.trim() || null;
  const [failedLogoUrl, setFailedLogoUrl] = useState<string | null>(null);
  const showCustomLogo = Boolean(normalizedLogoUrl && failedLogoUrl !== normalizedLogoUrl);

  return (
    <Box
      component="span"
      role="img"
      aria-label="Magic Compare"
      sx={{
        display: "grid",
        placeItems: "center",
        width: size,
        height: size,
        flex: "0 0 auto",
        overflow: "hidden",
        borderRadius: "12px",
        color: "primary.contrastText",
        backgroundColor: showCustomLogo ? "transparent" : "primary.main",
        fontWeight: 750,
      }}
    >
      {showCustomLogo ? (
        <Box
          component="img"
          src={normalizedLogoUrl!}
          alt=""
          onError={() => setFailedLogoUrl(normalizedLogoUrl)}
          sx={{ display: "block", width: "100%", height: "100%", objectFit: "contain" }}
        />
      ) : (
        "M"
      )}
    </Box>
  );
}

/**
 * Keeps mobile brand chrome shared by both sites. The duplicated public title previously drifted
 * to a heavier weight and tighter spacing than the internal title despite serving the same role.
 */
export function MagicMobileNavigationBar({
  alwaysVisible = false,
  logoUrl,
  onOpenNavigation,
}: {
  /** Public pages retain the brand bar after their empty navigation rail is removed. */
  alwaysVisible?: boolean;
  logoUrl?: string | null;
  onOpenNavigation?: () => void;
}) {
  return (
    <AppBar
      position="sticky"
      elevation={0}
      color="transparent"
      sx={{
        display: "block",
        height: 56,
        borderBottom: "1px solid",
        borderColor: "divider",
        // An opaque shared surface keeps scrolling content from changing title and icon contrast.
        backgroundColor: "var(--mui-palette-surface-container)",
        [MAGIC_NAV_RAIL_MEDIA_QUERY]: { display: alwaysVisible ? "block" : "none" },
      }}
    >
      <Toolbar disableGutters sx={{ minHeight: "56px !important", px: 1.5 }}>
        {onOpenNavigation ? (
          <IconButton aria-label="打开导航" onClick={onOpenNavigation} sx={{ mr: 0.75 }}>
            <Menu />
          </IconButton>
        ) : null}
        <MagicNavigationLogo logoUrl={logoUrl} size={32} />
        <Typography variant="subtitle1" noWrap sx={{ ml: 1, flex: 1, minWidth: 0 }}>
          Magic Compare
        </Typography>
      </Toolbar>
    </AppBar>
  );
}

const DISPLAY_PRERELEASE_LABELS = { alpha: "α", beta: "β" } as const;

/** Keeps semver-compatible release identifiers in metadata while fitting prerelease labels in the UI. */
export function formatDisplayedAppVersion(appVersion: string) {
  return appVersion.replace(
    /-(alpha|beta)(?=\.|$)/,
    (_, label: keyof typeof DISPLAY_PRERELEASE_LABELS) => `-${DISPLAY_PRERELEASE_LABELS[label]}`,
  );
}

/** Keeps build identity in the navigation utility area without turning it into page content. */
export function MagicBuildVersionLabel({
  appVersion,
  commitHash,
  compact = false,
  fullWidth = true,
}: {
  appVersion?: string | null;
  commitHash?: string | null;
  compact?: boolean;
  fullWidth?: boolean;
}) {
  if (!appVersion) return null;

  const displayedVersion = formatDisplayedAppVersion(appVersion);
  const shortLabel = `v${displayedVersion}`;
  const fullLabel = commitHash
    ? `Magic Compare ${shortLabel} (${commitHash})`
    : `Magic Compare ${shortLabel}`;

  return (
    <Tooltip title={fullLabel} placement={compact ? "right" : "top"}>
      <Typography
        component="div"
        variant="caption"
        sx={{
          width: fullWidth ? "100%" : "auto",
          px: compact ? 0 : 0.75,
          color: "text.disabled",
          fontVariantNumeric: "tabular-nums",
          lineHeight: 1.4,
          textAlign: compact ? "center" : "left",
          whiteSpace: "nowrap",
        }}
      >
        {shortLabel}
      </Typography>
    </Tooltip>
  );
}
