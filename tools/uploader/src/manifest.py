from __future__ import annotations

import json
from pathlib import Path

from .scanner import CaseSource, scan_case_directory
from .thumbnailer import image_dimensions


def build_asset_urls(
    case_slug: str,
    group_slug: str,
    frame_order: int,
    asset_path: Path,
) -> tuple[str, str]:
    relative_root = Path("internal-assets") / case_slug / group_slug / f"{frame_order + 1:03d}"
    image_url = f"/{(relative_root / asset_path.name).as_posix()}"
    thumb_url = f"/{(relative_root / f'thumb-{asset_path.name}').as_posix()}"
    return image_url, thumb_url


def build_import_manifest_from_case(scanned_case: CaseSource) -> dict:
    """Build the import manifest from local files only so dry-run and sync share the same payload shape."""
    case_slug = str(scanned_case.metadata.get("slug", scanned_case.root.name.lower()))

    groups_payload = []
    for group in scanned_case.groups:
        frames_payload = []
        for frame in group.frames:
            assets_payload = []
            for asset in frame.assets:
                image_url, thumb_url = build_asset_urls(case_slug, group.slug, frame.order, asset.path)
                width, height = image_dimensions(asset.path)
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


def build_import_manifest(case_root: Path) -> dict:
    """Scan a structured case directory and produce the same manifest shape that sync sends to the server."""
    scanned_case = scan_case_directory(case_root)
    return build_import_manifest_from_case(scanned_case)


def manifest_json(case_root: Path) -> str:
    manifest = build_import_manifest(case_root)
    return json.dumps(manifest, indent=2, ensure_ascii=True)
