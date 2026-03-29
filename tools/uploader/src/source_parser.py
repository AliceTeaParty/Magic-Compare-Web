from __future__ import annotations

import os
import re
from dataclasses import dataclass
from pathlib import Path

from .naming import kebab_case, title_case
from .scanner import SUPPORTED_EXTENSIONS

SOURCE_VARIANTS = {"src", "source", "ori", "origin"}
HEATMAP_VARIANTS = {"heatmap"}
IGNORED_BASENAMES = {".ds_store", "thumbs.db"}
IGNORED_SUFFIXES = {".json", ".yaml", ".yml", ".txt", ".md", ".csv", ".db", ".log"}
FILENAME_RE = re.compile(
    r"(?P<prefix>.+?)[_\-.](?P<frame>\d+)(?:[_\-.](?P<variant>[^_\-.]+))?$"
)
FALLBACK_FILENAME_RE = re.compile(r"^(?P<frame>\d+)(?P<variant>[A-Za-z][A-Za-z0-9]*)$")


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
    is_fallback: bool

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
    ignored_files: list["IgnoredSourceFile"]


@dataclass(frozen=True)
class IgnoredSourceFile:
    path: Path
    reason: str


def _split_tokens(input_text: str) -> list[str]:
    return [token for token in re.split(r"[_\-.]+", input_text) if token]


def _extract_fps(stem: str) -> str:
    match = re.match(r"^(\d{2})", stem)
    return match.group(1) if match else "00"


def _extract_episode(prefix: str) -> str:
    """Prefer nearby short numeric tokens because VSEditor exports often bury episode ids inside long filenames."""
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
    """Support both rich VSEditor names and fallback `<frame><variant>` names so imports stay forgiving."""
    stem = path.stem
    match = FILENAME_RE.search(stem)
    if match:
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
            is_fallback=False,
        )

    fallback_match = FALLBACK_FILENAME_RE.match(stem)
    if not fallback_match:
        raise ValueError(f"无法从文件名解析帧信息：{path.name}")

    frame_number = int(fallback_match.group("frame").lstrip("0") or "0")
    variant = _normalize_variant(fallback_match.group("variant"))
    title = str(frame_number)
    caption = f"frame {frame_number}"

    return SourceCandidate(
        path=path,
        original_name=path.name,
        variant=variant,
        fps="00",
        episode="00",
        frame_number=frame_number,
        title=title,
        caption=caption,
        root_hint=path.stem,
        is_fallback=True,
    )


def _after_priority(candidate: SourceCandidate) -> tuple[int, str, str]:
    """Prioritize stable review outputs first so one directory can still contain experiments without changing the chosen after image."""
    if candidate.variant == "out":
        return (0, candidate.variant, candidate.original_name.lower())
    if candidate.variant == "output":
        return (1, candidate.variant, candidate.original_name.lower())
    if candidate.variant == "rip":
        return (2, candidate.variant, candidate.original_name.lower())
    return (3, candidate.variant, candidate.original_name.lower())


def _resolve_frame(
    order: int, candidates: list[SourceCandidate], fallback_width: int
) -> ParsedFrame:
    """Collapse one frame candidate set into before/after/misc because later plan/upload stages assume one canonical after."""
    before_candidates = [
        candidate for candidate in candidates if candidate.variant in SOURCE_VARIANTS
    ]
    if len(before_candidates) != 1:
        raise ValueError(
            f"{candidates[0].title} 需要且只能有一个 src/source 原图，当前找到 {len(before_candidates)} 个。"
        )

    heatmap_candidates = [
        candidate for candidate in candidates if candidate.variant in HEATMAP_VARIANTS
    ]
    if len(heatmap_candidates) > 1:
        raise ValueError(f"{candidates[0].title} 存在多个 heatmap 候选，无法自动决定。")

    output_candidates = [
        candidate
        for candidate in candidates
        if candidate.variant not in SOURCE_VARIANTS
        and candidate.variant not in HEATMAP_VARIANTS
    ]
    if not output_candidates:
        raise ValueError(f"{candidates[0].title} 没有可用的 after 候选。")

    after = sorted(output_candidates, key=_after_priority)[0]
    misc = sorted(
        [candidate for candidate in output_candidates if candidate.path != after.path],
        key=lambda candidate: (candidate.variant, candidate.original_name.lower()),
    )

    before = before_candidates[0]
    title = before.title
    caption = before.caption
    if before.is_fallback:
        title = str(before.frame_number).zfill(fallback_width)
        caption = f"frame {before.frame_number}"

    return ParsedFrame(
        order=order,
        fps=before.fps,
        episode=before.episode,
        frame_number=before.frame_number,
        title=title,
        caption=caption,
        before=before,
        after=after,
        explicit_heatmap=heatmap_candidates[0] if heatmap_candidates else None,
        misc=misc,
    )


def _derive_group_identity(
    source_root: Path, candidates: list[SourceCandidate]
) -> tuple[str, str]:
    """Fall back to the folder name when shared filename prefixes are too noisy to produce a stable human slug."""
    common_prefix = os.path.commonprefix(
        [candidate.root_hint for candidate in candidates]
    ).strip(" _-.")
    common_slug = kebab_case(common_prefix)
    if len(common_slug) < 8 or common_slug.count("-") < 1:
        fallback = source_root.name
        return kebab_case(fallback), title_case(fallback)

    return common_slug, title_case(common_prefix)


def _ignore_reason(path: Path) -> str | None:
    normalized_name = path.name.lower()
    if normalized_name in IGNORED_BASENAMES or normalized_name.startswith("._"):
        return "system-artifact"
    if normalized_name.startswith("."):
        return "hidden-file"
    if (
        normalized_name.endswith("~")
        or normalized_name.endswith(".swp")
        or normalized_name.endswith(".tmp")
    ):
        return "editor-temp"
    if normalized_name.startswith("thumb-"):
        # Generated thumbnails are uploader byproducts and re-importing them would only duplicate assets.
        return "generated-thumbnail"
    if path.suffix.lower() in IGNORED_SUFFIXES:
        return "sidecar-file"
    return None


def _discover_source_files(
    source_root: Path,
) -> tuple[list[Path], list[IgnoredSourceFile]]:
    """Collect importable source images while surfacing ignored noise instead of failing on it."""
    image_paths: list[Path] = []
    ignored_files: list[IgnoredSourceFile] = []

    for path in sorted(
        candidate for candidate in source_root.rglob("*") if candidate.is_file()
    ):
        ignore_reason = _ignore_reason(path)
        if ignore_reason:
            ignored_files.append(IgnoredSourceFile(path=path, reason=ignore_reason))
            continue

        if path.suffix.lower() not in SUPPORTED_EXTENSIONS:
            ignored_files.append(
                IgnoredSourceFile(path=path, reason="unsupported-file-type")
            )
            continue

        image_paths.append(path)

    return image_paths, ignored_files


def discover_source_group(source_root: Path) -> ParsedSourceGroup:
    """Parse a flat source directory into structured frames while tolerating unrelated local noise."""
    source_root = source_root.resolve()
    if not source_root.exists() or not source_root.is_dir():
        raise ValueError(f"素材目录不存在或不可读：{source_root}")

    image_paths, ignored_files = _discover_source_files(source_root)
    if not image_paths:
        raise ValueError(f"{source_root} 中没有可导入的图片文件。")

    parsed_candidates: list[SourceCandidate] = []
    for path in image_paths:
        try:
            parsed_candidates.append(_parse_candidate(path))
        except ValueError:
            # Unparseable image names are treated as ignored noise so one accidental screenshot does
            # not block the whole import, but the plan/report layer will still surface them.
            ignored_files.append(
                IgnoredSourceFile(path=path, reason="unrecognized-image-name")
            )

    if not parsed_candidates:
        raise ValueError(f"{source_root} 中没有符合导入命名规则的图片文件。")

    grouped_candidates: dict[tuple[str, str, int], list[SourceCandidate]] = {}
    for candidate in parsed_candidates:
        grouped_candidates.setdefault(candidate.frame_key, []).append(candidate)

    ordered_keys = sorted(
        grouped_candidates.keys(), key=lambda key: (int(key[1]), key[2], key[0])
    )
    fallback_width = max(4, len(str(max((key[2] for key in ordered_keys), default=0))))
    frames = [
        _resolve_frame(order, grouped_candidates[key], fallback_width)
        for order, key in enumerate(ordered_keys)
    ]
    group_slug, group_title = _derive_group_identity(source_root, parsed_candidates)

    return ParsedSourceGroup(
        source_root=source_root,
        slug=group_slug,
        title=group_title,
        description=f"Imported from {source_root.name}.",
        frames=frames,
        ignored_files=sorted(ignored_files, key=lambda item: item.path.as_posix()),
    )
