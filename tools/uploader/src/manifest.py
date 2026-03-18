from __future__ import annotations

import json
import shutil
from pathlib import Path

from .scanner import CaseSource, scan_case_directory
from .thumbnailer import build_thumbnail, image_dimensions


def _workspace_root(current_file: Path) -> Path:
    return current_file.resolve().parents[3]


def _stage_asset(
    asset_path: Path,
    case_slug: str,
    group_slug: str,
    frame_order: int,
    workspace_root: Path,
) -> tuple[str, str, int, int]:
    target_root = (
        workspace_root
        / "apps"
        / "internal-site"
        / "public"
        / "internal-assets"
        / case_slug
        / group_slug
        / f"{frame_order + 1:03d}"
    )
    target_root.mkdir(parents=True, exist_ok=True)

    image_target = target_root / asset_path.name
    thumb_target = target_root / f"thumb-{asset_path.name}"

    shutil.copy2(asset_path, image_target)
    build_thumbnail(asset_path, thumb_target)
    width, height = image_dimensions(asset_path)

    relative_root = Path("internal-assets") / case_slug / group_slug / f"{frame_order + 1:03d}"
    return (
        f"/{(relative_root / image_target.name).as_posix()}",
        f"/{(relative_root / thumb_target.name).as_posix()}",
        width,
        height,
    )


def build_import_manifest(case_root: Path, workspace_root: Path | None = None) -> dict:
    scanned_case: CaseSource = scan_case_directory(case_root)
    resolved_workspace_root = workspace_root or _workspace_root(Path(__file__))
    case_slug = scanned_case.metadata.get("slug", scanned_case.root.name.lower())

    groups_payload = []
    for group in scanned_case.groups:
        frames_payload = []
        for frame in group.frames:
            assets_payload = []
            for asset in frame.assets:
                image_url, thumb_url, width, height = _stage_asset(
                    asset.path,
                    case_slug=case_slug,
                    group_slug=group.slug,
                    frame_order=frame.order,
                    workspace_root=resolved_workspace_root,
                )
                assets_payload.append(
                    {
                        "kind": asset.kind,
                        "label": asset.label,
                        "imageUrl": image_url,
                        "thumbUrl": thumb_url,
                        "width": width,
                        "height": height,
                        "note": asset.note,
                        "isPublic": asset.kind in {"before", "after", "heatmap"},
                        "isPrimaryDisplay": asset.kind in {"before", "after"},
                    }
                )

            frames_payload.append(
                {
                    "frame": {
                        "title": frame.title,
                        "caption": frame.caption,
                        "order": frame.order,
                        "isPublic": True,
                    },
                    "assets": assets_payload,
                }
            )

        groups_payload.append(
            {
                "group": {
                    "slug": group.slug,
                    "title": group.metadata.get("title", group.slug.replace("-", " ").title()),
                    "description": group.metadata.get("description", ""),
                    "order": group.order,
                    "defaultMode": group.metadata.get("defaultMode", "before-after"),
                    "isPublic": bool(group.metadata.get("isPublic", False)),
                    "tags": group.metadata.get("tags", []),
                },
                "frames": frames_payload,
            }
        )

    return {
        "case": {
            "slug": case_slug,
            "title": scanned_case.metadata.get("title", case_slug.replace("-", " ").title()),
            "subtitle": scanned_case.metadata.get("subtitle", ""),
            "summary": scanned_case.metadata.get("summary", ""),
            "tags": scanned_case.metadata.get("tags", []),
            "status": scanned_case.metadata.get("status", "draft"),
            "coverAssetLabel": scanned_case.metadata.get("coverAssetLabel", "After"),
        },
        "groups": groups_payload,
    }


def manifest_json(case_root: Path, workspace_root: Path | None = None) -> str:
    manifest = build_import_manifest(case_root, workspace_root)
    return json.dumps(manifest, indent=2, ensure_ascii=True)
