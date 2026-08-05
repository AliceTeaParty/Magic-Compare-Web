# Product Context

> 仅供参考：本文件提供产品背景，不替代当前代码、测试和正式专题文档。

## Purpose

Magic Compare Web helps internal operators and reviewers inspect, organize, and publish large sets of before/after images. Internal asset operations remain separate from the static public viewer.

## Scope

- Web upload workspace for local image sets.
- Internal case workspace and frame-level comparison viewer.
- Static public pages for selected published comparisons.

## Core Principles

- Keep image inspection primary; interface chrome should stay quiet.
- Show truthful loading, failure, and selection states.
- Preserve the internal-site, public-site, and upload-workspace boundaries.
- Use preloading and polish to improve speed without replacing original assets as the inspection source.
- Prefer familiar controls and stable inline editing over custom interaction patterns.

## Accessibility

Target practical WCAG AA contrast, keyboard access, reduced-motion fallbacks, and status communication that does not rely on color alone.
