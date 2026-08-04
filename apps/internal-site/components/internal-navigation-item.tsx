"use client";

import type { ReactNode } from "react";
import { ListItemButton, ListItemIcon, ListItemText } from "@mui/material";
import Link from "next/link";

interface InternalNavigationItemProps {
  disabled?: boolean;
  href?: string;
  icon: ReactNode;
  label: string;
  onClick?: () => void;
  selected?: boolean;
  title?: string;
}

const navigationItemSx = {
  minHeight: { xs: 52, sm: 64, md: 52 },
  mb: 0.5,
  px: { xs: 1.25, sm: 0.5, md: 1 },
  borderRadius: 2,
  flexDirection: { xs: "row", sm: "column", md: "row" },
  justifyContent: { xs: "flex-start", sm: "center", md: "flex-start" },
  gap: { xs: 1.25, sm: 0.25, md: 1.25 },
  color: "text.secondary",
  backgroundColor: "transparent",
  "&.Mui-selected": { color: "text.primary", backgroundColor: "transparent" },
  "&.Mui-selected:hover": { backgroundColor: "transparent" },
  "&:hover .internal-navigation-indicator": {
    backgroundColor: "color-mix(in srgb, currentColor 8%, transparent)",
  },
  "&.Mui-selected .internal-navigation-indicator": {
    // Expressive secondary hues can drift far from the chosen seed. The primary container pair
    // keeps the active destination tied to the user's theme color in every generated scheme.
    color: "primary.onContainer",
    backgroundColor: "primary.light",
  },
  "&.Mui-selected:hover .internal-navigation-indicator": {
    backgroundColor:
      "color-mix(in srgb, var(--mui-palette-primary-onContainer) 8%, var(--mui-palette-primary-light))",
  },
} as const;

/** Keeps global destinations and the global create action on one M3 rail geometry. */
export function InternalNavigationItem({
  disabled = false,
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
          width: { xs: 40, sm: 56, md: 40 },
          height: 32,
          borderRadius: 2,
          color: "inherit",
          transition:
            "background-color 200ms cubic-bezier(0.2, 0, 0, 1), color 200ms cubic-bezier(0.2, 0, 0, 1)",
          "& .MuiSvgIcon-root": { fontSize: 22 },
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
              fontSize: { sm: "0.6875rem", md: "0.8125rem" },
              fontWeight: selected ? 650 : 550,
              lineHeight: { sm: 1.25, md: 1.5 },
              whiteSpace: "nowrap",
            },
          },
        }}
        sx={{ m: 0, flex: { sm: "0 0 auto", md: "1 1 auto" } }}
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
        sx={navigationItemSx}
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
      sx={navigationItemSx}
    >
      {content}
    </ListItemButton>
  );
}
