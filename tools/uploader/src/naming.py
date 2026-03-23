from __future__ import annotations

import re
from pathlib import Path


def _cjk_to_latin(text: str) -> str:
    """Convert CJK characters to Latin equivalents for slug generation.

    Uses hepburn romanization (pykakasi) when Japanese kana scripts are present,
    and pinyin (pypinyin) otherwise for Chinese characters.  ASCII characters are
    passed through unchanged by both libraries.
    """
    # Hiragana: U+3040-U+309F, Katakana: U+30A0-U+30FF
    has_kana = any(0x3040 <= ord(ch) <= 0x30FF for ch in text)
    if has_kana:
        from pykakasi import kakasi  # type: ignore[import-untyped]

        kks = kakasi()
        return "".join(
            seg.get("hepburn") or seg.get("orig", "") for seg in kks.convert(text)
        )
    from pypinyin import Style, lazy_pinyin  # type: ignore[import-untyped]

    return "".join(lazy_pinyin(text, style=Style.NORMAL))


def kebab_case(input_text: str) -> str:
    latin_text = _cjk_to_latin(input_text)
    ascii_text = latin_text.encode("ascii", "ignore").decode("ascii")
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
