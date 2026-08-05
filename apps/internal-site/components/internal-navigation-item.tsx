"use client";

import type { ReactNode } from "react";
import { ListItemButton, ListItemIcon, ListItemText } from "@mui/material";
import Link from "next/link";
import { NAV_RAIL_MEDIA_QUERY } from "./internal-layout-constants";

interface InternalNavigationItemProps {
  disabled?: boolean;
  emphasized?: boolean;
  href?: string;
  icon: ReactNode;
  label: string;
  onClick?: () => void;
  selected?: boolean;
  title?: string;
}

const navigationItemSx = {
  minHeight: 52,
  mb: 0.5,
  px: 1.25,
  borderRadius: 999,
  flexDirection: "row",
  justifyContent: "flex-start",
  gap: 1.25,
  color: "text.secondary",
  backgroundColor: "transparent",
  // Modal drawers use a full-row active indicator; the compact desktop rail keeps the M3
  // icon indicator so labels and destinations remain scannable inside the 80px column.
  "&.Mui-selected": {
    color: "primary.onContainer",
    backgroundColor: "primary.light",
  },
  "&.Mui-selected:hover": {
    backgroundColor:
      "color-mix(in srgb, var(--mui-palette-primary-onContainer) 8%, var(--mui-palette-primary-light))",
  },
  "&:hover .internal-navigation-indicator": {
    backgroundColor: "color-mix(in srgb, currentColor 8%, transparent)",
  },
  "&.Mui-selected .internal-navigation-indicator": {
    // Expressive secondary hues can drift far from the chosen seed. The primary container pair
    // keeps the active destination tied to the user's theme color in every generated scheme.
    color: "primary.onContainer",
    backgroundColor: "transparent",
  },
  "&.Mui-selected:hover .internal-navigation-indicator": {
    backgroundColor:
      "color-mix(in srgb, var(--mui-palette-primary-onContainer) 8%, var(--mui-palette-primary-light))",
  },
  [NAV_RAIL_MEDIA_QUERY]: {
    minHeight: 64,
    px: 0.5,
    borderRadius: 2,
    flexDirection: "column",
    justifyContent: "center",
    gap: 0.25,
    "&.Mui-selected": { color: "text.primary", backgroundColor: "transparent" },
    "&.Mui-selected:hover": { backgroundColor: "transparent" },
    "&.Mui-selected .internal-navigation-indicator": {
      color: "primary.onContainer",
      backgroundColor: "primary.light",
    },
  },
} as const;

/** Keeps global destinations and the global create action on one M3 rail geometry. */
export function InternalNavigationItem({
  disabled = false,
  emphasized = false,
  href,
  icon,
  label,
  onClick,
  selected = false,
  title,
}: InternalNavigationItemProps) {
  const content = (
    <>
      <ListItemIcon
        className="internal-navigation-indicator"
        sx={{
          display: "grid",
          placeItems: "center",
          minWidth: 0,
          width: 40,
          height: 32,
          borderRadius: 2,
          color: "inherit",
          transition:
            "background-color 200ms cubic-bezier(0.2, 0, 0, 1), color 200ms cubic-bezier(0.2, 0, 0, 1)",
          "& .MuiSvgIcon-root": { fontSize: 22 },
          [NAV_RAIL_MEDIA_QUERY]: { width: 56 },
        }}
      >
        {icon}
      </ListItemIcon>
      <ListItemText
        primary={label}
        slotProps={{
          primary: {
            variant: "body2",
            sx: {
              fontSize: "0.8125rem",
              fontWeight: selected || emphasized ? 650 : 550,
              lineHeight: 1.5,
              whiteSpace: "nowrap",
              [NAV_RAIL_MEDIA_QUERY]: { fontSize: "0.6875rem", lineHeight: 1.25 },
            },
          },
        }}
        sx={{ m: 0, [NAV_RAIL_MEDIA_QUERY]: { flex: "0 0 auto" } }}
      />
    </>
  );

  if (href) {
    return (
      <ListItemButton
        component={Link}
        href={href}
        disabled={disabled}
        selected={selected}
        onClick={onClick}
        title={title}
        sx={{ ...navigationItemSx, color: emphasized ? "primary.main" : "text.secondary" }}
      >
        {content}
      </ListItemButton>
    );
  }

  return (
    <ListItemButton
      disabled={disabled}
      selected={selected}
      onClick={onClick}
      title={title}
      sx={{ ...navigationItemSx, color: emphasized ? "primary.main" : "text.secondary" }}
    >
      {content}
    </ListItemButton>
  );
}
