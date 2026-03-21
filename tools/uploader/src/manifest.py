from __future__ import annotations

import json
from pathlib import Path
from tempfile import TemporaryDirectory

from .auth import UploaderConfig
from .scanner import CaseSource, scan_case_directory
from .storage import upload_file_to_internal_assets
from .thumbnailer import build_thumbnail, image_dimensions

def _stage_asset(
    asset_path: Path,
    case_slug: str,
    group_slug: str,
    frame_order: int,
    config: UploaderConfig,
) -> tuple[str, str, int, int]:
    relative_root = Path("internal-assets") / case_slug / group_slug / f"{frame_order + 1:03d}"
    image_url = f"/{(relative_root / asset_path.name).as_posix()}"
    thumb_name = f"thumb-{asset_path.name}"
    thumb_url = f"/{(relative_root / thumb_name).as_posix()}"

    upload_file_to_internal_assets(config, asset_path, image_url)

    with TemporaryDirectory(prefix="magic-compare-thumb-") as temp_dir:
        thumb_target = Path(temp_dir) / thumb_name
        build_thumbnail(asset_path, thumb_target)
        upload_file_to_internal_assets(config, thumb_target, thumb_url)

    width, height = image_dimensions(asset_path)

    return (image_url, thumb_url, width, height)


def build_import_manifest(case_root: Path, config: UploaderConfig) -> dict:
    scanned_case: CaseSource = scan_case_directory(case_root)
    case_slug = str(scanned_case.metadata.get("slug", scanned_case.root.name.lower()))

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
                    config=config,
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
                    "title": str(group.metadata.get("title", group.slug.replace("-", " ").title())),
                    "description": str(group.metadata.get("description", "")),
                    "order": group.order,
                    "defaultMode": str(group.metadata.get("defaultMode", "before-after")),
                    "isPublic": bool(group.metadata.get("isPublic", False)),
                    "tags": group.metadata.get("tags", []),
                },
                "frames": frames_payload,
            }
        )

    return {
        "case": {
            "slug": case_slug,
            "title": str(scanned_case.metadata.get("title", case_slug.replace("-", " ").title())),
            "summary": str(scanned_case.metadata.get("summary", "")),
            "tags": scanned_case.metadata.get("tags", []),
            "status": str(scanned_case.metadata.get("status", "draft")),
            "coverAssetLabel": str(scanned_case.metadata.get("coverAssetLabel", "After")),
        },
        "groups": groups_payload,
    }


def manifest_json(case_root: Path, config: UploaderConfig) -> str:
    manifest = build_import_manifest(case_root, config)
    return json.dumps(manifest, indent=2, ensure_ascii=True)
