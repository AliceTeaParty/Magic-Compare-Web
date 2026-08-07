"use client";

import { useState } from "react";
import { Box, Tooltip, Typography } from "@mui/material";

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

/** Keeps build identity in the navigation utility area without turning it into page content. */
export function MagicBuildVersionLabel({
  appVersion,
  commitHash,
  compact = false,
}: {
  appVersion?: string | null;
  commitHash?: string | null;
  compact?: boolean;
}) {
  if (!appVersion) return null;

  const shortLabel = `v${appVersion}`;
  const fullLabel = commitHash
    ? `Magic Compare ${shortLabel} (${commitHash})`
    : `Magic Compare ${shortLabel}`;

  return (
    <Tooltip title={fullLabel} placement={compact ? "right" : "top"}>
      <Typography
        component="div"
        variant="caption"
        sx={{
          width: "100%",
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
