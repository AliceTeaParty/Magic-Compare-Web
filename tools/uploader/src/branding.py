from __future__ import annotations

import sys
from functools import lru_cache
from importlib.metadata import PackageNotFoundError, version
from pathlib import Path

REPO_URL = "https://github.com/AliceTeaParty/Magic-Compare-Web"
ISSUES_URL = f"{REPO_URL}/issues"
FALLBACK_LOGO = "Magic Compare Uploader"


def _repo_root() -> Path:
    """Resolve the repository root from the source tree so shared uploader assets can live outside the Python package."""
    return Path(__file__).resolve().parents[3]


def _frozen_resource_root() -> Path | None:
    """Prefer PyInstaller's extraction root when bundled so the startup brand assets survive onefile/onedir packaging."""
    frozen_root = getattr(sys, "_MEIPASS", None)
    if not frozen_root:
        return None
    return Path(frozen_root)


def _logo_candidate_paths() -> list[Path]:
    """Try bundled resources first, then the checkout root, because the uploader must keep the same identity in source and binary runs."""
    candidates: list[Path] = []
    frozen_root = _frozen_resource_root()
    if frozen_root is not None:
        candidates.append(frozen_root / "字符画.txt")
    candidates.append(_repo_root() / "字符画.txt")
    return candidates


@lru_cache(maxsize=1)
def load_logo_text() -> str:
    """Load the shared ASCII logo with a safe fallback so missing resources never block uploads."""
    for candidate in _logo_candidate_paths():
        if candidate.exists():
            return candidate.read_text(encoding="utf-8").rstrip()
    return FALLBACK_LOGO


@lru_cache(maxsize=1)
def uploader_version() -> str:
    """Read the installed package version so startup copy stays in sync with wheels and frozen binaries."""
    try:
        return version("magic-compare-uploader")
    except PackageNotFoundError:
        return "dev"

