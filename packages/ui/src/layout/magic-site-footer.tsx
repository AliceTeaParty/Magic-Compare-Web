import { Box, Link as MuiLink, Stack, Typography } from "@mui/material";

export interface MagicSiteFooterProps {
  author: string;
  joinUsLabel?: string | null;
  joinUsUrl?: string | null;
  yearEnd: number;
  yearStart: number;
}

export function MagicSiteFooter({
  author,
  joinUsLabel,
  joinUsUrl,
  yearEnd,
  yearStart,
}: MagicSiteFooterProps) {
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
          direction={{ xs: "column", md: "row" }}
          spacing={{ xs: 0.9, md: 1.4 }}
          alignItems={{ xs: "flex-start", md: "center" }}
          justifyContent="space-between"
        >
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{
              fontSize: "0.8rem",
              letterSpacing: "0.01em",
            }}
          >
            © {yearStart}-{yearEnd} {author}. All Rights Reserved.
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
