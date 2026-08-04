import type { ReactNode } from "react";
import { ArrowBack } from "@mui/icons-material";
import { Box, Button, IconButton, Stack, Tooltip, Typography } from "@mui/material";
import Link from "next/link";

interface InternalPageHeaderProps {
  actions?: ReactNode;
  backHref?: string;
  compact?: boolean;
  eyebrow?: string;
  subtitle?: ReactNode;
  title: ReactNode;
}

/** Fixes page identity to a shared grid so route-specific actions cannot move the title. */
export function InternalPageHeader({
  actions,
  backHref,
  compact = false,
  eyebrow,
  subtitle,
  title,
}: InternalPageHeaderProps) {
  return (
    <Box
      component="header"
      sx={{
        display: "grid",
        gridTemplateColumns: { xs: "minmax(0, 1fr)", md: "minmax(0, 1fr) auto" },
        alignItems: compact ? "center" : "end",
        gap: { xs: compact ? 1.5 : 2, md: compact ? 2 : 3 },
        minHeight: compact ? { xs: 96, md: 88 } : { xs: 120, md: 112 },
        py: compact ? { xs: 1.75, md: 2 } : { xs: 2.5, md: 3 },
        borderBottom: "1px solid",
        borderColor: "divider",
      }}
    >
      <Stack
        direction={compact ? "row" : "column"}
        spacing={compact ? 1.25 : 0.5}
        sx={{ minWidth: 0, alignItems: compact ? "center" : "flex-start" }}
      >
        {backHref && compact ? (
          <Tooltip title="返回 Case 列表">
            <IconButton component={Link} href={backHref} aria-label="返回 Case 列表">
              <ArrowBack />
            </IconButton>
          </Tooltip>
        ) : backHref ? (
          <Button
            component={Link}
            href={backHref}
            variant="text"
            size="small"
            startIcon={<ArrowBack />}
            sx={{ alignSelf: "flex-start", ml: -1.25, color: "text.secondary" }}
          >
            返回
          </Button>
        ) : null}
        <Stack spacing={compact ? 0.25 : 0.5} sx={{ minWidth: 0 }}>
          {eyebrow ? (
            <Typography variant="overline" color="text.secondary" noWrap>
              {eyebrow}
            </Typography>
          ) : null}
          <Typography
            component="h1"
            variant="h2"
            noWrap
            title={typeof title === "string" ? title : undefined}
          >
            {title}
          </Typography>
          {subtitle ? (
            <Typography component="div" variant="body2" color="text.secondary" sx={{ minWidth: 0 }}>
              {subtitle}
            </Typography>
          ) : null}
        </Stack>
      </Stack>
      <Box
        sx={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: { xs: "flex-start", md: "flex-end" },
          gap: 1,
          minHeight: 40,
        }}
      >
        {actions}
      </Box>
    </Box>
  );
}

/** Applies one responsive content inset to every internal route. */
export function InternalPageShell({
  children,
  width = 1600,
}: {
  children: ReactNode;
  width?: number;
}) {
  return (
    <Box
      sx={{
        width: "100%",
        maxWidth: width,
        mx: "auto",
        px: { xs: 2, sm: 2.5, lg: 3 },
        pb: { xs: 4, md: 6 },
      }}
    >
      {children}
    </Box>
  );
}
