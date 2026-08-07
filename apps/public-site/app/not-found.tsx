import { LinkOffOutlined } from "@mui/icons-material";
import { Box, Container, Stack, Typography } from "@mui/material";

export default function NotFoundPage() {
  return (
    <Container
      maxWidth="sm"
      sx={{
        // The public mobile app bar now owns 56px of the viewport; using the shared budget keeps the
        // empty state centered in the remaining content area instead of forcing a needless scroll.
        minHeight: "calc(100svh - var(--magic-public-app-bar-height, 0px))",
        display: "grid",
        placeItems: "center",
      }}
    >
      {/* The missing-link state uses the workbench surface directly so an unavailable gallery does
          not fall back to the retired public card treatment. */}
      <Box sx={{ width: "100%", px: { xs: 1, sm: 2 }, py: 6 }}>
        <Stack spacing={1.5} sx={{ maxWidth: 520 }}>
          <LinkOffOutlined aria-hidden="true" sx={{ color: "primary.main", fontSize: 40 }} />
          {/* The public document is zh-CN; keeping its only standalone error page in English made
              navigation failures feel like a separate legacy surface. */}
          <Typography variant="h2">未找到 Group</Typography>
          <Typography variant="body1" sx={{ maxWidth: "62ch", color: "text.secondary" }}>
            此地址没有对应的已发布对比 Group。请检查分享链接，或请发布者重新发布该 Group。
          </Typography>
        </Stack>
      </Box>
    </Container>
  );
}
