export const viewerTokens = {
  abStage: {
    activeOutline: "1px solid rgba(232, 198, 246, 0.48)",
    activeShadow:
      "0 0 0 1px rgba(232, 198, 246, 0.08), 0 0 22px rgba(228, 194, 242, 0.14)",
  },
  control: {
    disabledBorder: "rgba(255,255,255,0.12)",
    disabledSurface: "rgba(255,255,255,0.02)",
  },
  filmstrip: {
    activeCardSurface: "rgba(232, 198, 246, 0.1)",
    activeCardInset: "inset 0 0 0 1px rgba(232, 198, 246, 0.18)",
    inactiveCardSurface: "rgba(255, 255, 255, 0.018)",
    shellSurface: "rgba(255,255,255,0.014)",
    thumbnailSurface: "rgba(255,255,255,0.035)",
    scrollbarTrack: "rgba(255,255,255,0.08)",
    scrollbarThumb:
      "linear-gradient(90deg, rgba(232, 198, 246, 0.42) 0%, rgba(242, 235, 201, 0.5) 100%)",
    scrollbarThumbRing: "0 0 0 1px rgba(255,255,255,0.08)",
  },
  heatmapNotice: {
    surface: "rgba(232, 198, 246, 0.12)",
  },
  stage: {
    activeBorder: "rgba(232, 198, 246, 0.42)",
    measuredBorder: "rgba(232, 198, 246, 0.36)",
    surface:
      "radial-gradient(circle at top, rgba(232, 198, 246, 0.1), transparent 28%), rgba(13, 24, 54, 0.94)",
    activeShadow:
      "0 0 0 1px rgba(232, 198, 246, 0.08), 0 18px 44px rgba(8, 15, 35, 0.28)",
    measuredShadow: "0 24px 52px rgba(8, 15, 35, 0.28)",
  },
  swipe: {
    dividerSurface: "rgba(248, 245, 255, 0.88)",
    dividerShadow:
      "0 0 14px rgba(228, 194, 242, 0.24), 0 0 36px rgba(242, 235, 201, 0.12)",
    handleBorder: "1px solid rgba(248, 245, 255, 0.22)",
    handleSurface: "rgba(22, 37, 76, 0.34)",
    handleShadow:
      "0 10px 24px rgba(10, 18, 42, 0.18), 0 0 18px rgba(228, 194, 242, 0.18)",
    handleChevronBorder: "2px solid rgba(248, 245, 255, 0.72)",
    handleChevronShadow: "drop-shadow(0 0 5px rgba(10, 18, 42, 0.2))",
  },
  workbench: {
    pageWash:
      "linear-gradient(180deg, rgba(255,255,255,0.02) 0%, rgba(255,255,255,0) 22%), transparent",
    panelSurface:
      "linear-gradient(180deg, rgba(31, 51, 97, 0.94) 0%, rgba(12, 25, 56, 0.92) 100%)",
    hintBorder: "1px solid rgba(232, 198, 246, 0.28)",
    hintSurface: "rgba(5, 13, 34, 0.72)",
    hintShadow: "0 10px 24px rgba(0, 0, 0, 0.18)",
  },
} as const;
