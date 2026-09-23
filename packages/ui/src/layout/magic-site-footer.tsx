"use client";

import { Box, Link as MuiLink, Stack, Typography } from "@mui/material";
import { MagicThemeControls } from "../theme/magic-theme-controls";
import { MagicBuildVersionLabel } from "./magic-navigation-rail";

export interface MagicSiteFooterProps {
  appVersion?: string | null;
  author: string;
  commitHash?: string | null;
  joinUsLabel?: string | null;
  joinUsUrl?: string | null;
  yearEnd: number;
  yearStart: number;
}

/** Keeps public display preferences and build identity beside the footer ownership line. */
export function MagicSiteFooter({
  appVersion,
  author,
  commitHash,
  joinUsLabel,
  joinUsUrl,
  yearEnd,
  yearStart,
}: MagicSiteFooterProps) {
  const yearLabel = yearStart === yearEnd ? `${yearEnd}` : `${yearStart}-${yearEnd}`;

  return (
    <Box
      component="footer"
      sx={{
        position: "relative",
        borderTop: "1px solid",
        borderColor: "divider",
        // The public footer belongs to the same tonal surface stack as the viewer above it.
        backgroundColor: "surface.containerLow",
      }}
    >
      <Box
        sx={{
          width: "100%",
          maxWidth: 1520,
          mx: "auto",
          px: { xs: 1.5, md: 2.5 },
          py: { xs: 1.2, md: 1.45 },
        }}
      >
        <Stack
          direction="row"
          useFlexGap
          sx={{
            alignItems: "center",
            justifyContent: "center",
            flexWrap: "wrap",
            columnGap: 0.8,
            rowGap: 0.4,
            textAlign: "center",
          }}
        >
          <MagicThemeControls />
          <MagicBuildVersionLabel
            appVersion={appVersion}
            commitHash={commitHash}
            fullWidth={false}
          />
          {/* Keep each separator with the content it introduces so mobile wrapping never leaves a dot behind. */}
          <Stack direction="row" useFlexGap sx={{ alignItems: "center", columnGap: 0.8 }}>
            <Typography aria-hidden="true" variant="body2" color="text.disabled">
              ·
            </Typography>
            <Typography
              variant="body2"
              sx={{
                color: "text.secondary",
                fontSize: "0.8rem",
                fontWeight: 400,
                letterSpacing: "0.01em",
                whiteSpace: "nowrap",
              }}
            >
              © {yearLabel} {author}. All Rights Reserved.
            </Typography>
          </Stack>
          {joinUsUrl && joinUsLabel ? (
            <Stack direction="row" useFlexGap sx={{ alignItems: "center", columnGap: 0.8 }}>
              <Typography aria-hidden="true" variant="body2" color="text.disabled">
                ·
              </Typography>
              <MuiLink
                href={joinUsUrl}
                target="_blank"
                rel="noreferrer"
                underline="none"
                sx={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  minHeight: 30,
                  px: 0.5,
                  color: "text.secondary",
                  fontSize: "0.8rem",
                  fontWeight: 600,
                  textUnderlineOffset: "0.2em",
                  transition: "color 150ms cubic-bezier(0.2, 0, 0, 1)",
                  "&:hover": {
                    color: "primary.main",
                    textDecoration: "underline",
                  },
                }}
              >
                {joinUsLabel}
              </MuiLink>
            </Stack>
          ) : null}
        </Stack>
      </Box>
    </Box>
  );
}
