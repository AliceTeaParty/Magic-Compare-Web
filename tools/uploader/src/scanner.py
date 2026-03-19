from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path

import yaml


ORDERED_DIRECTORY_RE = re.compile(r"^(?P<order>\d+)-(?P<slug>[a-z0-9-]+)$")
SUPPORTED_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".avif", ".svg"}


@dataclass(frozen=True)
class AssetSource:
    kind: str
    label: str
    path: Path
    note: str


@dataclass(frozen=True)
class FrameSource:
    title: str
    order: int
    caption: str
    directory: Path
    assets: list[AssetSource]


@dataclass(frozen=True)
class GroupSource:
    slug: str
    order: int
    metadata: dict
    frames: list[FrameSource]


@dataclass(frozen=True)
class CaseSource:
    root: Path
    metadata: dict
    groups: list[GroupSource]


def _load_yaml(path: Path) -> dict:
    if not path.exists():
        return {}
    text = path.read_text(encoding="utf-8")
    try:
        return yaml.safe_load(text) or {}
    except yaml.YAMLError:
        if path.name not in {"case.yaml", "group.yaml", "frame.yaml"}:
            raise
        return _load_relaxed_simple_mapping(text)


def _coerce_relaxed_value(raw_value: str):
    if raw_value == "":
        return ""

    try:
        parsed = yaml.safe_load(raw_value)
    except yaml.YAMLError:
        return raw_value

    if isinstance(parsed, dict):
        return raw_value

    return parsed


def _load_relaxed_simple_mapping(text: str) -> dict:
    data: dict[str, object] = {}
    for raw_line in text.splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue

        if ":" not in raw_line:
            raise ValueError(f"无法解析 metadata 行：{raw_line}")

        key, raw_value = raw_line.split(":", 1)
        normalized_key = key.strip()
        if not normalized_key:
            raise ValueError(f"metadata key 不能为空：{raw_line}")

        data[normalized_key] = _coerce_relaxed_value(raw_value.strip())

    return data


def _parse_ordered_directory(directory: Path) -> tuple[int, str]:
    match = ORDERED_DIRECTORY_RE.match(directory.name)
    if not match:
        raise ValueError(
            f"{directory} must use '<order>-<slug>' naming, for example '001-banding-check'."
        )
    return int(match.group("order")), match.group("slug")


def _find_asset_file(frame_directory: Path, stem: str) -> Path | None:
    for extension in SUPPORTED_EXTENSIONS:
        candidate = frame_directory / f"{stem}{extension}"
        if candidate.exists():
            return candidate
    return None


def _discover_assets(frame_directory: Path) -> list[AssetSource]:
    note_path = frame_directory / "note.md"
    note = note_path.read_text(encoding="utf-8").strip() if note_path.exists() else ""
    asset_notes = _load_yaml(frame_directory / "assets.yaml")
    assets: list[AssetSource] = []

    for kind, label in (("before", "Before"), ("after", "After")):
        candidate = _find_asset_file(frame_directory, kind)
        if not candidate:
            raise ValueError(f"{frame_directory} is missing required asset '{kind}'.")
        assets.append(
            AssetSource(
                kind=kind,
                label=label,
                path=candidate,
                note=asset_notes.get(kind, {}).get("note", note or candidate.name),
            )
        )

    heatmap = _find_asset_file(frame_directory, "heatmap")
    if heatmap:
        assets.append(
            AssetSource(
                kind="heatmap",
                label="Heatmap",
                path=heatmap,
                note=asset_notes.get("heatmap", {}).get("note", note or heatmap.name),
            )
        )

    for candidate in sorted(frame_directory.iterdir()):
        if candidate.suffix.lower() not in SUPPORTED_EXTENSIONS:
            continue
        if candidate.stem.startswith("crop-"):
            assets.append(
                AssetSource(
                    kind="crop",
                    label=asset_notes.get(candidate.stem, {}).get("label", candidate.stem),
                    path=candidate,
                    note=asset_notes.get(candidate.stem, {}).get("note", note or candidate.name),
                )
            )
        elif candidate.stem not in {"before", "after", "heatmap"}:
            assets.append(
                AssetSource(
                    kind="misc",
                    label=asset_notes.get(candidate.stem, {}).get("label", candidate.stem),
                    path=candidate,
                    note=asset_notes.get(candidate.stem, {}).get("note", note or candidate.name),
                )
            )

    return assets


def scan_case_directory(case_root: Path) -> CaseSource:
    case_root = case_root.resolve()
    case_metadata = _load_yaml(case_root / "case.yaml")
    groups_directory = case_root / "groups"
    if not groups_directory.exists():
        raise ValueError(f"{case_root} does not contain a groups/ directory.")

    groups: list[GroupSource] = []
    for group_directory in sorted(path for path in groups_directory.iterdir() if path.is_dir()):
        group_order, group_slug = _parse_ordered_directory(group_directory)
        group_metadata = _load_yaml(group_directory / "group.yaml")
        frames_directory = group_directory / "frames"
        if not frames_directory.exists():
            raise ValueError(f"{group_directory} does not contain a frames/ directory.")

        frames: list[FrameSource] = []
        for frame_directory in sorted(path for path in frames_directory.iterdir() if path.is_dir()):
            frame_order, frame_slug = _parse_ordered_directory(frame_directory)
            frame_metadata = _load_yaml(frame_directory / "frame.yaml")
            frames.append(
                FrameSource(
                    title=frame_metadata.get("title", frame_slug.replace("-", " ").title()),
                    order=frame_order - 1,
                    caption=frame_metadata.get("caption", ""),
                    directory=frame_directory,
                    assets=_discover_assets(frame_directory),
                )
            )

        groups.append(
            GroupSource(
                slug=group_slug,
                order=group_order - 1,
                metadata=group_metadata,
                frames=frames,
            )
        )

    return CaseSource(root=case_root, metadata=case_metadata, groups=groups)
