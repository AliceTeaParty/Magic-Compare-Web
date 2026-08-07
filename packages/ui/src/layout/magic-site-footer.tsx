import { Box, Link as MuiLink, Stack, Typography } from "@mui/material";

export interface MagicSiteFooterProps {
  author: string;
  joinUsLabel?: string | null;
  joinUsUrl?: string | null;
  yearEnd: number;
  yearStart: number;
}

/** Renders the public ownership and community links after build identity moved into navigation. */
export function MagicSiteFooter({
  author,
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
          <Typography
            variant="body2"
            sx={{
              color: "text.secondary",
              fontSize: "0.8rem",
              fontWeight: 400,
              letterSpacing: "0.01em",
            }}
          >
            © {yearLabel} {author}. All Rights Reserved.
          </Typography>
          {joinUsUrl && joinUsLabel ? (
            <>
              {/* Version used to compete with footer ownership text. Navigation now owns build
                  identity, leaving one quiet separator for the remaining optional link. */}
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
            </>
          ) : null}
        </Stack>
      </Box>
    </Box>
  );
}
