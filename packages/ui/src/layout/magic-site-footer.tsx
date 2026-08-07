import { Box, Link as MuiLink, Stack, Typography } from "@mui/material";

export interface MagicSiteFooterProps {
  author: string;
  appVersion?: string | null;
  commitHash?: string | null;
  joinUsLabel?: string | null;
  joinUsUrl?: string | null;
  yearEnd: number;
  yearStart: number;
}

export function MagicSiteFooter({
  author,
  appVersion,
  commitHash,
  joinUsLabel,
  joinUsUrl,
  yearEnd,
  yearStart,
}: MagicSiteFooterProps) {
  const yearLabel = yearStart === yearEnd ? `${yearEnd}` : `${yearStart}-${yearEnd}`;
  const versionLabel = appVersion ? `v${appVersion}${commitHash ? `-${commitHash}` : ""}` : null;

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
          direction="column"
          spacing={0.9}
          sx={{
            alignItems: "center",
            justifyContent: "center",
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
            {versionLabel ? (
              <>
                {" · "}
                <Box
                  component="span"
                  sx={{
                    display: "inline-block",
                    font: "inherit",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {versionLabel}
                </Box>
              </>
            ) : null}
          </Typography>
          {joinUsUrl && joinUsLabel ? (
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
                // Footer links keep their geometry fixed; hover changes paint only, matching the
                // same Material state-layer rule used by the internal workbench controls.
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
          ) : null}
        </Stack>
      </Box>
    </Box>
  );
}
