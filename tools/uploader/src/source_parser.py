from __future__ import annotations

import os
import re
from dataclasses import dataclass
from pathlib import Path

from .naming import kebab_case, title_case
from .scanner import SUPPORTED_EXTENSIONS

SOURCE_VARIANTS = {"src", "source", "ori", "origin"}
HEATMAP_VARIANTS = {"heatmap"}
BEFORE_DIR_HINTS = SOURCE_VARIANTS | {"before"}
AFTER_DIR_HINTS = {"after", "out", "output", "rip"}
MISC_DIR_HINTS = {"misc", "extra", "extras", "alt", "alts"}
IGNORED_BASENAMES = {".ds_store", "thumbs.db"}
IGNORED_SUFFIXES = {".json", ".yaml", ".yml", ".txt", ".md", ".csv", ".db", ".log"}
FILENAME_RE = re.compile(
    r"(?P<prefix>.+?)[_\-.](?P<frame>\d+)(?:[_\-.](?P<variant>[^_\-.]+))?$"
)
FALLBACK_FILENAME_RE = re.compile(r"^(?P<frame>\d+)(?P<variant>[A-Za-z][A-Za-z0-9]*)$")
GROUP_SUFFIX_NOISE_RE = re.compile(
    r"(?:[_\-. ]+\d{4,5}[_\-. ]+gen[_\-. ]+vpy)$", re.IGNORECASE
)
MATCH_KEY_SUFFIX_RE = re.compile(
    r"(?:[_\-. ]+(?:before|after|src|source|ori|origin|out|output|rip|misc|heatmap))+$",
    re.IGNORECASE,
)
NON_ALNUM_RE = re.compile(r"[^0-9a-z]+")


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


@dataclass(frozen=True)
class NonFlatSourceLayout:
    before_dir: Path | None
    after_dirs: tuple[Path, ...]
    misc_dirs: tuple[Path, ...]


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


def _parse_candidate(
    path: Path,
    *,
    variant_override: str | None = None,
) -> SourceCandidate:
    """Support both rich VSEditor names and fallback `<frame><variant>` names so imports stay forgiving across flat and folder-based layouts."""
    stem = path.stem
    match = FILENAME_RE.search(stem)
    if match:
        prefix = match.group("prefix")
        fps = _extract_fps(stem)
        episode = _extract_episode(prefix)
        frame_number = int(match.group("frame").lstrip("0") or "0")
        variant = _normalize_variant(variant_override or match.group("variant"))
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
        if not variant_override:
            raise ValueError(f"无法从文件名解析帧信息：{path.name}")

        number_tokens = re.findall(r"\d+", stem)
        frame_number = int(number_tokens[-1].lstrip("0") or "0") if number_tokens else 0
        fallback_title = str(frame_number) if frame_number else stem
        return SourceCandidate(
            path=path,
            original_name=path.name,
            variant=_normalize_variant(variant_override),
            fps="00",
            episode="00",
            frame_number=frame_number,
            title=fallback_title,
            caption=f"file {path.stem}",
            root_hint=path.stem,
            is_fallback=True,
        )

    frame_number = int(fallback_match.group("frame").lstrip("0") or "0")
    variant = _normalize_variant(variant_override or fallback_match.group("variant"))
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
    """Trim common export suffix noise before deriving slug/title so auto-generated group names reflect the work instead of one sampled frame id."""
    common_prefix = os.path.commonprefix(
        [candidate.root_hint for candidate in candidates]
    ).strip(" _-.")
    # VSEditor exports often append one sampled frame id plus `Gen Vpy` to every file,
    # which makes the folder-derived title look like a one-off frame instead of the case.
    common_prefix = (
        GROUP_SUFFIX_NOISE_RE.sub("", common_prefix).strip(" _-.") or common_prefix
    )
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


def _directory_tokens(name: str) -> set[str]:
    """Normalize subdirectory names into lowercase tokens so folder auto-detection tolerates spaces, punctuation, and mixed casing."""
    normalized = NON_ALNUM_RE.sub(" ", name.casefold())
    return {token for token in normalized.split() if token}


def _matches_directory_hints(path: Path, hints: set[str]) -> bool:
    return bool(_directory_tokens(path.name) & hints)


def _match_key_for_name(name: str) -> str:
    """Strip compare-role suffix noise from file stems so nested before/after folders can pair files by their real shared identity."""
    normalized = MATCH_KEY_SUFFIX_RE.sub("", name.casefold())
    normalized = NON_ALNUM_RE.sub("-", normalized).strip("-")
    return normalized or NON_ALNUM_RE.sub("-", name.casefold()).strip("-")


def _match_key_for_path(path: Path) -> str:
    return _match_key_for_name(path.stem)


def _match_tokens_for_name(name: str) -> set[str]:
    """Use shared normalized tokens as a fallback pairing signal when before/after filenames differ by small export suffixes such as `v2` or `deband`. """
    normalized = _match_key_for_name(name)
    return {token for token in normalized.split("-") if token}


def _similarity_score(left: set[str], right: set[str]) -> int:
    """Prefer shared numeric anchors first because frame ids are usually the most stable cross-folder identifier."""
    shared = left & right
    if not shared:
        return 0
    numeric_bonus = sum(2 for token in shared if token.isdigit())
    return len(shared) + numeric_bonus


def suggest_nonflat_source_layout(source_root: Path) -> NonFlatSourceLayout:
    """Guess before/after/misc subdirectories from common names so users only need manual folder input when the layout is unusual."""
    directories = sorted(path for path in source_root.iterdir() if path.is_dir())
    before_dir = next(
        (path for path in directories if _matches_directory_hints(path, BEFORE_DIR_HINTS)),
        None,
    )
    after_dirs = tuple(
        path
        for path in directories
        if path != before_dir and _matches_directory_hints(path, AFTER_DIR_HINTS)
    )
    misc_dirs = tuple(
        path
        for path in directories
        if path != before_dir
        and path not in after_dirs
        and _matches_directory_hints(path, MISC_DIR_HINTS)
    )
    return NonFlatSourceLayout(
        before_dir=before_dir,
        after_dirs=after_dirs,
        misc_dirs=misc_dirs,
    )


def _discover_source_files(
    source_root: Path,
    *,
    recursive: bool = True,
) -> tuple[list[Path], list[IgnoredSourceFile]]:
    """Collect importable source images while surfacing ignored noise instead of failing on it."""
    image_paths: list[Path] = []
    ignored_files: list[IgnoredSourceFile] = []

    for path in sorted(
        candidate
        for candidate in (
            source_root.rglob("*") if recursive else source_root.iterdir()
        )
        if candidate.is_file()
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


def _parsed_candidates_for_paths(
    paths: list[Path],
    *,
    variant_override: str | None = None,
) -> tuple[list[SourceCandidate], list[IgnoredSourceFile]]:
    """Treat unparseable filenames as ignored noise so one stray image does not block the rest of the import batch."""
    parsed_candidates: list[SourceCandidate] = []
    ignored_files: list[IgnoredSourceFile] = []

    for path in paths:
        try:
            parsed_candidates.append(
                _parse_candidate(path, variant_override=variant_override)
            )
        except ValueError:
            ignored_files.append(
                IgnoredSourceFile(path=path, reason="unrecognized-image-name")
            )

    return parsed_candidates, ignored_files


def _build_group_from_candidates(
    source_root: Path,
    parsed_candidates: list[SourceCandidate],
    ignored_files: list[IgnoredSourceFile],
) -> ParsedSourceGroup:
    """Keep frame collapsing shared so flat imports and nested-folder imports land on the same frame model."""
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


def _group_candidates_by_match_key(
    candidates: list[SourceCandidate],
) -> dict[str, list[SourceCandidate]]:
    """Keep raw match-key buckets because nested mode may need multiple after/misc variants for one frame identity."""
    grouped: dict[str, list[SourceCandidate]] = {}
    for candidate in candidates:
        grouped.setdefault(_match_key_for_path(candidate.path), []).append(candidate)
    return grouped


def _assign_candidates_to_before_keys(
    candidates: list[SourceCandidate],
    before_by_key: dict[str, list[SourceCandidate]],
) -> tuple[dict[str, list[SourceCandidate]], list[SourceCandidate]]:
    """Match nested after/misc files back to before files by exact key first, then by token similarity, so users do not have to hand-normalize every export filename."""
    grouped: dict[str, list[SourceCandidate]] = {}
    unmatched: list[SourceCandidate] = []
    before_tokens = {
        key: _match_tokens_for_name(items[0].path.stem) for key, items in before_by_key.items()
    }

    for candidate in candidates:
        direct_key = _match_key_for_path(candidate.path)
        if direct_key in before_by_key:
            grouped.setdefault(direct_key, []).append(candidate)
            continue

        candidate_tokens = _match_tokens_for_name(candidate.path.stem)
        scored_matches = sorted(
            (
                (key, _similarity_score(candidate_tokens, tokens))
                for key, tokens in before_tokens.items()
            ),
            key=lambda item: item[1],
            reverse=True,
        )
        if not scored_matches or scored_matches[0][1] <= 0:
            unmatched.append(candidate)
            continue

        best_key, best_score = scored_matches[0]
        second_score = scored_matches[1][1] if len(scored_matches) > 1 else -1
        # Only take fuzzy matches when one candidate is clearly best; otherwise we keep the file
        # unmatched and surface it, because guessing between two similar frame names is riskier than asking the user to fix the layout.
        if best_score == second_score:
            unmatched.append(candidate)
            continue

        grouped.setdefault(best_key, []).append(candidate)

    return grouped, unmatched


def discover_source_group_from_layout(
    source_root: Path,
    layout: NonFlatSourceLayout,
) -> ParsedSourceGroup:
    """Resolve nested before/after/misc folders into one compare group so users can point at a parent directory instead of flattening files by hand."""
    if not layout.before_dir:
        raise ValueError("非平铺模式缺少 before 文件夹。")
    if not layout.after_dirs:
        raise ValueError("非平铺模式至少需要一个 after 文件夹。")

    ignored_files: list[IgnoredSourceFile] = []

    before_paths, before_ignored = _discover_source_files(layout.before_dir)
    ignored_files.extend(before_ignored)
    if not before_paths:
        raise ValueError(f"{layout.before_dir} 中没有可导入的 before 图片。")

    before_candidates, before_parse_ignored = _parsed_candidates_for_paths(
        before_paths,
        variant_override="source",
    )
    ignored_files.extend(before_parse_ignored)
    if not before_candidates:
        raise ValueError(f"{layout.before_dir} 中没有可识别的 before 图片。")

    before_by_key = _group_candidates_by_match_key(before_candidates)
    duplicate_before_keys = [key for key, items in before_by_key.items() if len(items) > 1]
    if duplicate_before_keys:
        raise ValueError(
            f"{layout.before_dir} 中存在无法唯一配对的 before 文件：{duplicate_before_keys[0]}"
        )

    after_candidates: list[SourceCandidate] = []
    for index, directory in enumerate(layout.after_dirs):
        after_paths, after_ignored = _discover_source_files(directory)
        ignored_files.extend(after_ignored)
        variant_name = "out" if index == 0 else directory.name.casefold().strip() or "misc"
        parsed, parse_ignored = _parsed_candidates_for_paths(
            after_paths,
            variant_override=variant_name,
        )
        after_candidates.extend(parsed)
        ignored_files.extend(parse_ignored)

    if not after_candidates:
        raise ValueError("非平铺模式没有解析到任何 after 图片。")

    misc_candidates: list[SourceCandidate] = []
    for directory in layout.misc_dirs:
        misc_paths, misc_ignored = _discover_source_files(directory)
        ignored_files.extend(misc_ignored)
        parsed, parse_ignored = _parsed_candidates_for_paths(
            misc_paths,
            variant_override=directory.name.casefold().strip() or "misc",
        )
        misc_candidates.extend(parsed)
        ignored_files.extend(parse_ignored)

    after_by_key, unmatched_after = _assign_candidates_to_before_keys(
        after_candidates,
        before_by_key,
    )
    misc_by_key, unmatched_misc = _assign_candidates_to_before_keys(
        misc_candidates,
        before_by_key,
    )
    for candidate in unmatched_after:
        ignored_files.append(
            IgnoredSourceFile(path=candidate.path, reason="unmatched-after-file")
        )
    for candidate in unmatched_misc:
        ignored_files.append(
            IgnoredSourceFile(path=candidate.path, reason="unmatched-misc-file")
        )

    ordered_before_items = sorted(
        ((match_key, items[0]) for match_key, items in before_by_key.items()),
        key=lambda item: (int(item[1].episode), item[1].frame_number, item[1].fps, item[0]),
    )
    fallback_width = max(
        4,
        len(
            str(
                max((candidate.frame_number for _, candidate in ordered_before_items), default=0)
            )
        ),
    )
    frames: list[ParsedFrame] = []

    for order, (match_key, before) in enumerate(ordered_before_items):
        matched_after = after_by_key.get(match_key, [])
        if not matched_after:
            raise ValueError(f"{before.original_name} 没有匹配到 after 文件。")

        primary_after = sorted(matched_after, key=_after_priority)[0]
        extra_after = [candidate for candidate in matched_after if candidate.path != primary_after.path]
        misc = sorted(
            [*extra_after, *misc_by_key.get(match_key, [])],
            key=lambda candidate: (candidate.variant, candidate.original_name.lower()),
        )
        title = before.title
        caption = before.caption
        if before.is_fallback:
            title = (
                str(before.frame_number).zfill(fallback_width)
                if before.frame_number
                else before.path.stem
            )
            caption = f"file {before.path.stem}"

        frames.append(
            ParsedFrame(
                order=order,
                fps=before.fps,
                episode=before.episode,
                frame_number=before.frame_number,
                title=title,
                caption=caption,
                before=before,
                after=primary_after,
                explicit_heatmap=None,
                misc=misc,
            )
        )

    group_slug, group_title = _derive_group_identity(
        source_root,
        [candidate for _, candidate in ordered_before_items],
    )
    return ParsedSourceGroup(
        source_root=source_root,
        slug=group_slug,
        title=group_title,
        description=f"Imported from {source_root.name}.",
        frames=frames,
        ignored_files=sorted(ignored_files, key=lambda item: item.path.as_posix()),
    )


def discover_source_group(source_root: Path) -> ParsedSourceGroup:
    """Prefer flat files in the root directory first, then fall back to an auto-detected nested-folder layout when the root itself does not contain valid compare images."""
    source_root = source_root.resolve()
    if not source_root.exists() or not source_root.is_dir():
        raise ValueError(f"素材目录不存在或不可读：{source_root}")

    image_paths, ignored_files = _discover_source_files(source_root, recursive=False)
    if not image_paths:
        layout = suggest_nonflat_source_layout(source_root)
        if layout.before_dir and layout.after_dirs:
            return discover_source_group_from_layout(source_root, layout)
        raise ValueError(f"{source_root} 中没有可导入的图片文件。")

    parsed_candidates, parse_ignored = _parsed_candidates_for_paths(image_paths)
    ignored_files.extend(parse_ignored)

    if not parsed_candidates:
        layout = suggest_nonflat_source_layout(source_root)
        if layout.before_dir and layout.after_dirs:
            return discover_source_group_from_layout(source_root, layout)
        raise ValueError(f"{source_root} 根目录没有符合平铺导入命名规则的图片文件。")

    return _build_group_from_candidates(source_root, parsed_candidates, ignored_files)
