from __future__ import annotations

import shutil
from dataclasses import dataclass
from pathlib import Path

import yaml

from .api_client import CaseSearchResult
from .quotes import random_acg_quote
from .source_parser import ParsedSourceGroup
from .thumbnailer import generate_heatmap


@dataclass(frozen=True)
class PreparedWorkspace:
    work_dir: Path
    case_slug: str
    group_slug: str
    group_title: str
    case_yaml: Path
    group_yaml: Path


def write_yaml(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        yaml.safe_dump(payload, sort_keys=False, allow_unicode=True),
        encoding="utf-8",
    )


def build_case_payload(existing_case: CaseSearchResult | None, current_year: str) -> dict:
    if existing_case:
        return {
            "slug": existing_case.slug,
            "title": existing_case.title,
            "summary": existing_case.summary,
            "tags": existing_case.tags,
            "status": existing_case.status,
            "coverAssetLabel": "After",
        }

    return {
        "slug": current_year,
        "title": current_year,
        "summary": random_acg_quote(),
        "tags": [],
        "status": "internal",
        "coverAssetLabel": "After",
    }


def build_group_payload(group: ParsedSourceGroup) -> dict:
    return {
        "title": group.title,
        "description": group.description,
        "defaultMode": "before-after",
        "isPublic": False,
        "tags": [],
    }


def _copy_asset(source: Path, target: Path) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, target)


def _unique_misc_name(used_names: set[str], base_name: str, extension: str) -> str:
    candidate = f"{base_name}{extension}"
    counter = 2
    while candidate in used_names:
        candidate = f"{base_name}-{counter}{extension}"
        counter += 1
    used_names.add(candidate)
    return candidate


def prepare_workspace(
    source_group: ParsedSourceGroup,
    work_dir: Path,
    existing_case: CaseSearchResult | None,
    current_year: str,
    group_slug: str,
) -> PreparedWorkspace:
    case_payload = build_case_payload(existing_case, current_year)
    group_payload = build_group_payload(source_group)

    case_yaml = work_dir / "case.yaml"
    group_dir = work_dir / "groups" / f"001-{group_slug}"
    group_yaml = group_dir / "group.yaml"
    frames_root = group_dir / "frames"

    write_yaml(case_yaml, case_payload)
    write_yaml(group_yaml, group_payload)

    for frame in source_group.frames:
        frame_dir = frames_root / f"{frame.order + 1:03d}-{frame.slug}"
        frame_dir.mkdir(parents=True, exist_ok=True)
        write_yaml(
            frame_dir / "frame.yaml",
            {
                "title": frame.title,
                "caption": frame.caption,
            },
        )

        asset_notes: dict[str, dict[str, str]] = {}
        used_names: set[str] = set()

        before_name = f"before{frame.before.path.suffix.lower()}"
        _copy_asset(frame.before.path, frame_dir / before_name)
        asset_notes["before"] = {"note": frame.before.original_name}
        used_names.add(before_name)

        after_name = f"after{frame.after.path.suffix.lower()}"
        _copy_asset(frame.after.path, frame_dir / after_name)
        asset_notes["after"] = {"note": frame.after.original_name}
        used_names.add(after_name)

        if frame.explicit_heatmap:
            heatmap_name = f"heatmap{frame.explicit_heatmap.path.suffix.lower()}"
            _copy_asset(frame.explicit_heatmap.path, frame_dir / heatmap_name)
            asset_notes["heatmap"] = {"note": frame.explicit_heatmap.original_name}
            used_names.add(heatmap_name)
        else:
            generate_heatmap(frame.before.path, frame.after.path, frame_dir / "heatmap.png")
            asset_notes["heatmap"] = {
                "note": f"Auto-generated from {frame.before.original_name} vs {frame.after.original_name}",
            }
            used_names.add("heatmap.png")

        for misc in frame.misc:
            misc_base = misc.variant or misc.path.stem
            target_name = _unique_misc_name(
                used_names,
                misc_base,
                misc.path.suffix.lower(),
            )
            _copy_asset(misc.path, frame_dir / target_name)
            asset_notes[Path(target_name).stem] = {"note": misc.original_name}

        write_yaml(frame_dir / "assets.yaml", asset_notes)

    return PreparedWorkspace(
        work_dir=work_dir,
        case_slug=case_payload["slug"],
        group_slug=group_slug,
        group_title=source_group.title,
        case_yaml=case_yaml,
        group_yaml=group_yaml,
    )
