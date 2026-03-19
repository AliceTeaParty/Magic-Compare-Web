from __future__ import annotations

import os
import re
from dataclasses import dataclass
from pathlib import Path

from .naming import kebab_case, title_case
from .scanner import SUPPORTED_EXTENSIONS

SOURCE_VARIANTS = {"src", "source"}
HEATMAP_VARIANTS = {"heatmap"}
FILENAME_RE = re.compile(
    r"(?P<prefix>.+?)[_\-.](?P<frame>\d+)(?:[_\-.](?P<variant>[^_\-.]+))?$"
)


@dataclass(frozen=True)
class SourceCandidate:
    path: Path
    original_name: str
    variant: str
    fps: str
    episode: str
    frame_number: int
    title: str
    caption: str
    root_hint: str

    @property
    def frame_key(self) -> tuple[str, str, int]:
        return (self.fps, self.episode, self.frame_number)


@dataclass(frozen=True)
class ParsedFrame:
    order: int
    fps: str
    episode: str
    frame_number: int
    title: str
    caption: str
    before: SourceCandidate
    after: SourceCandidate
    explicit_heatmap: SourceCandidate | None
    misc: list[SourceCandidate]

    @property
    def slug(self) -> str:
        return kebab_case(self.title.replace("_", "-"))


@dataclass(frozen=True)
class ParsedSourceGroup:
    source_root: Path
    slug: str
    title: str
    description: str
    frames: list[ParsedFrame]


def _split_tokens(input_text: str) -> list[str]:
    return [token for token in re.split(r"[_\-.]+", input_text) if token]


def _extract_fps(stem: str) -> str:
    match = re.match(r"^(\d{2})", stem)
    return match.group(1) if match else "00"


def _extract_episode(prefix: str) -> str:
    tokens = _split_tokens(prefix)
    candidates: list[str] = []
    for token in reversed(tokens):
        if not token.isdigit():
            continue
        normalized = str(int(token))
        if len(normalized) <= 3:
            candidates.append(normalized.zfill(2))
    if candidates:
        return candidates[0]

    return "00"


def _normalize_variant(raw_variant: str | None) -> str:
    if not raw_variant:
        return "output"
    return raw_variant.strip().lower()


def _parse_candidate(path: Path) -> SourceCandidate:
    stem = path.stem
    match = FILENAME_RE.search(stem)
    if not match:
        raise ValueError(f"无法从文件名解析帧信息：{path.name}")

    prefix = match.group("prefix")
    fps = _extract_fps(stem)
    episode = _extract_episode(prefix)
    frame_number = int(match.group("frame").lstrip("0") or "0")
    variant = _normalize_variant(match.group("variant"))
    title = f"{fps}_{episode}_{frame_number}"
    caption = f"fps {fps} • episode {episode} • frame {frame_number}"

    return SourceCandidate(
        path=path,
        original_name=path.name,
        variant=variant,
        fps=fps,
        episode=episode,
        frame_number=frame_number,
        title=title,
        caption=caption,
        root_hint=prefix,
    )


def _after_priority(candidate: SourceCandidate) -> tuple[int, str, str]:
    if candidate.variant == "out":
        return (0, candidate.variant, candidate.original_name.lower())
    if candidate.variant == "output":
        return (1, candidate.variant, candidate.original_name.lower())
    return (2, candidate.variant, candidate.original_name.lower())


def _resolve_frame(order: int, candidates: list[SourceCandidate]) -> ParsedFrame:
    before_candidates = [candidate for candidate in candidates if candidate.variant in SOURCE_VARIANTS]
    if len(before_candidates) != 1:
        raise ValueError(
            f"{candidates[0].title} 需要且只能有一个 src/source 原图，当前找到 {len(before_candidates)} 个。"
        )

    heatmap_candidates = [candidate for candidate in candidates if candidate.variant in HEATMAP_VARIANTS]
    if len(heatmap_candidates) > 1:
        raise ValueError(f"{candidates[0].title} 存在多个 heatmap 候选，无法自动决定。")

    output_candidates = [
        candidate
        for candidate in candidates
        if candidate.variant not in SOURCE_VARIANTS and candidate.variant not in HEATMAP_VARIANTS
    ]
    if not output_candidates:
        raise ValueError(f"{candidates[0].title} 没有可用的 after 候选。")

    after = sorted(output_candidates, key=_after_priority)[0]
    misc = sorted(
        [candidate for candidate in output_candidates if candidate.path != after.path],
        key=lambda candidate: (candidate.variant, candidate.original_name.lower()),
    )

    before = before_candidates[0]
    return ParsedFrame(
        order=order,
        fps=before.fps,
        episode=before.episode,
        frame_number=before.frame_number,
        title=before.title,
        caption=before.caption,
        before=before,
        after=after,
        explicit_heatmap=heatmap_candidates[0] if heatmap_candidates else None,
        misc=misc,
    )


def _derive_group_identity(source_root: Path, candidates: list[SourceCandidate]) -> tuple[str, str]:
    common_prefix = os.path.commonprefix([candidate.root_hint for candidate in candidates]).strip(" _-.")
    common_slug = kebab_case(common_prefix)
    if len(common_slug) < 8 or common_slug.count("-") < 1:
        fallback = source_root.name
        return kebab_case(fallback), title_case(fallback)

    return common_slug, title_case(common_prefix)


def discover_source_group(source_root: Path) -> ParsedSourceGroup:
    source_root = source_root.resolve()
    if not source_root.exists() or not source_root.is_dir():
        raise ValueError(f"素材目录不存在或不可读：{source_root}")

    image_paths = sorted(
        path
        for path in source_root.rglob("*")
        if path.is_file() and path.suffix.lower() in SUPPORTED_EXTENSIONS
    )
    if not image_paths:
        raise ValueError(f"{source_root} 中没有可导入的图片文件。")

    parsed_candidates = [_parse_candidate(path) for path in image_paths]
    grouped_candidates: dict[tuple[str, str, int], list[SourceCandidate]] = {}
    for candidate in parsed_candidates:
        grouped_candidates.setdefault(candidate.frame_key, []).append(candidate)

    ordered_keys = sorted(grouped_candidates.keys(), key=lambda key: (int(key[1]), key[2], key[0]))
    frames = [
        _resolve_frame(order, grouped_candidates[key])
        for order, key in enumerate(ordered_keys)
    ]
    group_slug, group_title = _derive_group_identity(source_root, parsed_candidates)

    return ParsedSourceGroup(
        source_root=source_root,
        slug=group_slug,
        title=group_title,
        description=f"Imported from {source_root.name}.",
        frames=frames,
    )
