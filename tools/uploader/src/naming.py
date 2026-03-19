from __future__ import annotations

import re
from pathlib import Path


def kebab_case(input_text: str) -> str:
    ascii_text = input_text.encode("ascii", "ignore").decode("ascii")
    normalized = re.sub(r"[^a-zA-Z0-9]+", "-", ascii_text.strip().lower())
    normalized = re.sub(r"-{2,}", "-", normalized).strip("-")
    return normalized or "untitled"


def title_case(input_text: str) -> str:
    normalized = re.sub(r"[_\-.]+", " ", input_text).strip()
    normalized = re.sub(r"\s{2,}", " ", normalized)
    if not normalized:
        return "Untitled"

    return " ".join(
        token.capitalize() if token.isascii() else token for token in normalized.split()
    )


def build_default_work_dir(source_dir: Path) -> Path:
    return source_dir.parent / f"{source_dir.name}-case"


def build_unique_slug(base_slug: str, existing_slugs: set[str]) -> str:
    candidate = base_slug
    counter = 2

    while candidate in existing_slugs:
        candidate = f"{base_slug}-{counter}"
        counter += 1

    return candidate
