"use client";

import {
  Box,
  Button,
  Divider,
  Drawer,
  IconButton,
  Stack,
  Typography,
  useMediaQuery,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { Close } from "@mui/icons-material";
import { viewerTokens } from "./viewer-tokens";

interface ViewerGuidePanelProps {
  open: boolean;
  onClose: () => void;
  onComplete: () => void;
}

const guideSections = [
  {
    title: "界面",
    items: [
      "主图：查看和检查图片。",
      "模式：Swipe、A/B、Heatmap。",
      "胶卷带：切换图片。",
      "Details：查看分组和素材信息。",
    ],
  },
  {
    title: "操作",
    items: [
      "Swipe：拖动分割线。",
      "A/B：选中主图后缩放或拖动。",
      "Heatmap：调整叠加强度。",
    ],
  },
  {
    title: "快捷键",
    items: [
      "←/→ 切换图片",
      "1/2/3 切换模式",
      "R Reset 视图",
      "I 打开 Details",
      "? 打开引导",
      "A/B 激活时：↑/↓ 切换侧，Esc 退出",
    ],
  },
] as const;

/**
 * Presents the viewer guide as a replayable help surface instead of a blocking tour, matching the
 * inspection workflow where users need immediate access to the image.
 */
export function ViewerGuidePanel({
  open,
  onClose,
  onComplete,
}: ViewerGuidePanelProps) {
  const theme = useTheme();
  const useBottomDrawer = useMediaQuery(theme.breakpoints.down("sm"), {
    noSsr: true,
  });

  return (
    <Drawer
      aria-describedby="viewer-guide-description"
      aria-labelledby="viewer-guide-title"
      anchor={useBottomDrawer ? "bottom" : "right"}
      open={open}
      onClose={onClose}
      ModalProps={{ keepMounted: true }}
      PaperProps={{
        sx: {
          width: useBottomDrawer ? "100%" : 360,
          maxWidth: "100%",
          maxHeight: useBottomDrawer ? "78svh" : "100%",
          borderTopLeftRadius: useBottomDrawer ? 16 : 0,
          borderTopRightRadius: useBottomDrawer ? 16 : 0,
          background: viewerTokens.guide.panelSurface,
          backgroundImage: "none",
          borderLeft: useBottomDrawer ? 0 : "1px solid",
          borderTop: useBottomDrawer ? "1px solid" : 0,
          borderColor: "divider",
        },
      }}
    >
      <Stack
        spacing={2.25}
        sx={{
          p: { xs: 2, sm: 2.5 },
          pb: { xs: 2.5, sm: 3 },
        }}
      >
        <Stack direction="row" alignItems="center" justifyContent="space-between">
          <Box>
            <Typography id="viewer-guide-title" variant="h6">
              快速引导
            </Typography>
            <Typography
              id="viewer-guide-description"
              variant="body2"
              color="text.secondary"
            >
              了解对比图页面的核心操作。
            </Typography>
          </Box>
          <IconButton aria-label="关闭引导" onClick={onClose}>
            <Close fontSize="small" />
          </IconButton>
        </Stack>

        <Stack spacing={1.5}>
          {guideSections.map((section) => (
            <Box
              key={section.title}
              sx={{
                p: 1.5,
                borderRadius: 2,
                backgroundColor: viewerTokens.guide.subtleSurface,
              }}
            >
              <Typography
                variant="subtitle2"
                sx={{ mb: 0.9, fontWeight: 700 }}
              >
                {section.title}
              </Typography>
              <Stack component="ul" spacing={0.7} sx={{ m: 0, pl: 2.4 }}>
                {section.items.map((item) => (
                  <Typography
                    key={item}
                    component="li"
                    variant="body2"
                    color="text.secondary"
                    sx={{ pl: 0.2 }}
                  >
                    {item}
                  </Typography>
                ))}
              </Stack>
            </Box>
          ))}
        </Stack>

        <Divider />

        <Stack direction="row" spacing={1} justifyContent="flex-end">
          <Button color="inherit" onClick={onClose}>
            关闭
          </Button>
          <Button variant="contained" onClick={onComplete}>
            完成
          </Button>
        </Stack>
      </Stack>
    </Drawer>
  );
}
