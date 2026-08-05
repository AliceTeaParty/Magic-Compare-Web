"use client";

import { useState, type ReactNode } from "react";
import { keyframes } from "@emotion/react";
import { Box, ListItemButton, ListItemIcon, ListItemText } from "@mui/material";
import Link from "next/link";
import { NAV_RAIL_MEDIA_QUERY } from "./internal-layout-constants";

type NavigationIconFeedback = "case" | "workspace" | "upload" | "create";

interface InternalNavigationItemProps {
  disabled?: boolean;
  emphasized?: boolean;
  href?: string;
  icon: ReactNode;
  iconFeedback?: NavigationIconFeedback;
  label: string;
  onClick?: () => void;
  selected?: boolean;
  title?: string;
}

const caseFeedback = keyframes`
  0% { transform: rotate(0deg) scaleY(1); }
  45% { transform: rotate(-5deg) translateY(1px) scaleY(0.92); }
  100% { transform: rotate(0deg) translateY(0) scaleY(1); }
`;

const workspaceFeedback = keyframes`
  0% { transform: rotate(-5deg) scale(0.88); clip-path: inset(18% 18% 18% 18%); }
  100% { transform: rotate(0deg) scale(1); clip-path: inset(0 0 0 0); }
`;

const uploadFeedback = keyframes`
  0% { transform: translateY(2px); }
  42% { transform: translateY(-3px); }
  100% { transform: translateY(0); }
`;

const createFeedback = keyframes`
  0% { transform: rotate(-90deg); }
  100% { transform: rotate(0deg); }
`;

const navigationFeedbackAnimations = {
  case: `${caseFeedback} 260ms cubic-bezier(0.2, 0, 0, 1)`,
  workspace: `${workspaceFeedback} 240ms cubic-bezier(0, 0, 0, 1)`,
  upload: `${uploadFeedback} 260ms cubic-bezier(0.2, 0, 0, 1)`,
  create: `${createFeedback} 220ms cubic-bezier(0, 0, 0, 1)`,
} satisfies Record<NavigationIconFeedback, string>;

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
  iconFeedback,
  label,
  onClick,
  selected = false,
  title,
}: InternalNavigationItemProps) {
  const [feedbackSequence, setFeedbackSequence] = useState(0);

  /** Restarts only the icon's semantic feedback while leaving the rail indicator geometry fixed. */
  function handleActivation() {
    if (iconFeedback) setFeedbackSequence((current) => current + 1);
    onClick?.();
  }

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
        <Box
          key={feedbackSequence}
          component="span"
          className="internal-navigation-glyph"
          sx={{
            display: "grid",
            placeItems: "center",
            transformOrigin: "50% 70%",
            animation:
              feedbackSequence > 0 && iconFeedback
                ? navigationFeedbackAnimations[iconFeedback]
                : "none",
            "@media (prefers-reduced-motion: reduce)": { animation: "none" },
          }}
        >
          {icon}
        </Box>
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
        onClick={handleActivation}
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
      onClick={handleActivation}
      title={title}
      sx={{ ...navigationItemSx, color: emphasized ? "primary.main" : "text.secondary" }}
    >
      {content}
    </ListItemButton>
  );
}
