export const viewerTokens = {
  control: {
    disabledBorder: "var(--mui-palette-divider, rgba(255,255,255,0.12))",
    disabledSurface: "var(--mui-palette-action-disabledBackground, rgba(255,255,255,0.02))",
  },
  filmstrip: {
    activeCardSurface: "var(--mui-palette-primary-light, rgba(232, 198, 246, 0.18))",
    activeCardInset: "none",
    inactiveCardSurface: "var(--mui-palette-surface-container, rgba(255, 255, 255, 0.018))",
    shellSurface: "var(--mui-palette-surface-containerLow, rgba(255,255,255,0.014))",
    thumbnailSurface: "var(--mui-palette-surface-containerHighest, rgba(255,255,255,0.035))",
    scrollbarTrack: "var(--mui-palette-divider, rgba(255,255,255,0.08))",
    scrollbarThumb: "var(--mui-palette-primary-main, rgba(232, 198, 246, 0.72))",
    scrollbarThumbRing: "0 0 0 1px var(--mui-palette-divider, rgba(255,255,255,0.08))",
  },
  heatmapNotice: {
    surface: "var(--mui-palette-secondary-main, rgba(232, 198, 246, 0.12))",
  },
  stage: {
    activeBorder: "var(--mc-primary, rgba(232, 198, 246, 0.42))",
    // Keep the compare stage on the same workbench layer as the title so the image surround does
    // not become a separate gray block in light or custom themes.
    surface: "var(--mui-palette-surface-container)",
    activeShadow: "var(--mc-viewer-shadow, 0 18px 44px rgba(8, 15, 35, 0.28))",
    measuredShadow: "var(--mc-viewer-shadow, 0 24px 52px rgba(8, 15, 35, 0.28))",
  },
  swipe: {
    dividerSurface: "var(--mui-palette-text-primary)",
    dividerShadow: "0 0 0 1px var(--mui-palette-background-paper)",
    handleBorder: "1px solid var(--mui-palette-divider)",
    handleSurface: "var(--mui-palette-surface-containerHigh)",
    handleShadow: "var(--mc-viewer-shadow, none)",
    handleChevronBorder: "2px solid var(--mui-palette-text-primary)",
    handleChevronShadow: "none",
  },
  workbench: {
    pageWash: "var(--mui-palette-background-default, transparent)",
    panelSurface:
      "var(--mui-palette-surface-containerLow, linear-gradient(180deg, rgba(31, 51, 97, 0.94) 0%, rgba(12, 25, 56, 0.92) 100%))",
    hintBorder: "1px solid var(--mc-outline, rgba(232, 198, 246, 0.28))",
    hintSurface: "var(--mui-palette-surface-containerHigh, rgba(5, 13, 34, 0.72))",
    hintShadow: "var(--mc-viewer-shadow, 0 10px 24px rgba(0, 0, 0, 0.18))",
  },
  guide: {
    actionSurface: "var(--mui-palette-secondary-main, rgba(232, 198, 246, 0.12))",
    panelSurface: "var(--mui-palette-surface-containerHigh, rgba(9, 19, 43, 0.98))",
    subtleSurface: "var(--mui-palette-surface-containerHighest, rgba(255,255,255,0.045))",
  },
} as const;
