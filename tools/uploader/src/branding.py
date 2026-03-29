from __future__ import annotations

import sys
import json
from functools import lru_cache
from importlib.metadata import PackageNotFoundError, version
from pathlib import Path
import tomllib

REPO_URL = "https://github.com/AliceTeaParty/Magic-Compare-Web"
ISSUES_URL = f"{REPO_URL}/issues"
FALLBACK_LOGO = "Magic Compare Uploader"
LOGO_ASSET_NAME = "ascii-logo.txt"


def _repo_root() -> Path:
    """Resolve the repository root from the source tree so shared uploader assets can live outside the Python package."""
    return Path(__file__).resolve().parents[3]


def _uploader_root() -> Path:
    """Keep uploader-owned assets inside the uploader tree so distribution and source runs look in the same place."""
    return Path(__file__).resolve().parents[1]


def _frozen_resource_root() -> Path | None:
    """Prefer PyInstaller's extraction root when bundled so the startup brand assets survive onefile/onedir packaging."""
    frozen_root = getattr(sys, "_MEIPASS", None)
    if not frozen_root:
        return None
    return Path(frozen_root)


def _logo_candidate_paths() -> list[Path]:
    """Try the bundled uploader asset first and keep the old root path as a compatibility fallback while the filename migrates."""
    candidates: list[Path] = []
    frozen_root = _frozen_resource_root()
    if frozen_root is not None:
        candidates.append(frozen_root / LOGO_ASSET_NAME)
        candidates.append(frozen_root / "字符画.txt")
    candidates.append(_uploader_root() / "assets" / LOGO_ASSET_NAME)
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
def project_version() -> str | None:
    """Prefer the repo root package version so the uploader stays aligned with the main project release number."""
    package_json_path = _repo_root() / "package.json"
    if not package_json_path.exists():
        return None

    package_json = json.loads(package_json_path.read_text(encoding="utf-8"))
    package_version = str(package_json.get("version", "")).strip()
    return package_version or None


@lru_cache(maxsize=1)
def pyproject_version() -> str | None:
    """Keep uploader packaging metadata readable from the checked-out pyproject when developing from source."""
    pyproject_path = _uploader_root() / "pyproject.toml"
    if not pyproject_path.exists():
        return None

    project = tomllib.loads(pyproject_path.read_text(encoding="utf-8"))
    project_version = str(project.get("project", {}).get("version", "")).strip()
    return project_version or None


@lru_cache(maxsize=1)
def uploader_version() -> str:
    """Display the main project version first so the uploader banner matches the release line users see elsewhere."""
    linked_version = project_version()
    if linked_version:
        return linked_version

    pyproject_linked_version = pyproject_version()
    if pyproject_linked_version:
        return pyproject_linked_version

    try:
        return version("magic-compare-uploader")
    except PackageNotFoundError:
        return "dev"
