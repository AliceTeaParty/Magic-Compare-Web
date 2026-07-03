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
  const versionLabel = appVersion
    ? `v${appVersion}${commitHash ? `-${commitHash}` : ""}`
    : null;

  return (
    <Box
      component="footer"
      sx={{
        position: "relative",
        borderTop: "1px solid",
        borderColor: "divider",
        background:
          "linear-gradient(180deg, rgba(255,255,255,0.012) 0%, rgba(255,255,255,0.028) 100%)",
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
          alignItems="center"
          justifyContent="center"
          sx={{ textAlign: "center" }}
        >
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{
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
                px: 1.15,
                borderRadius: 999,
                border: "1px solid",
                borderColor: "rgba(232, 198, 246, 0.16)",
                backgroundColor: "rgba(255,255,255,0.02)",
                color: "text.secondary",
                fontSize: "0.8rem",
                fontWeight: 500,
                transition:
                  "transform 180ms cubic-bezier(0.22, 1, 0.36, 1), border-color 180ms cubic-bezier(0.22, 1, 0.36, 1), color 180ms cubic-bezier(0.22, 1, 0.36, 1), background-color 180ms cubic-bezier(0.22, 1, 0.36, 1)",
                "&:hover": {
                  transform: "translateY(-1px)",
                  color: "primary.light",
                  borderColor: "rgba(232, 198, 246, 0.28)",
                  backgroundColor: "rgba(255,255,255,0.038)",
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
