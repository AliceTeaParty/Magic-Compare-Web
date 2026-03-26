from __future__ import annotations

import hashlib
import json
import mimetypes
from dataclasses import dataclass
from pathlib import Path
from tempfile import TemporaryDirectory

from .scanner import CaseSource, scan_case_directory
from .thumbnailer import build_thumbnail, image_dimensions


@dataclass(frozen=True)
class PreparedUploadFile:
    source_path: Path
    extension: str
    content_type: str
    sha256: str
    size: int


@dataclass(frozen=True)
class PreparedUploadAsset:
    slot: str
    kind: str
    label: str
    note: str
    width: int
    height: int
    is_primary_display: bool
    original: PreparedUploadFile
    thumbnail: PreparedUploadFile


@dataclass(frozen=True)
class PreparedUploadFrame:
    order: int
    title: str
    caption: str
    assets: list[PreparedUploadAsset]


@dataclass(frozen=True)
class PreparedGroupUpload:
    start_payload: dict
    frames: list[PreparedUploadFrame]


def build_asset_urls(
    case_slug: str,
    group_slug: str,
    frame_order: int,
    asset_path: Path,
) -> tuple[str, str]:
    """Keep deterministic pseudo target ids for local-only plan mode and duplicate detection."""
    relative_root = (
        Path("internal-assets") / case_slug / group_slug / f"{frame_order + 1:03d}"
    )
    image_url = f"/{(relative_root / asset_path.name).as_posix()}"
    thumb_url = f"/{(relative_root / f'thumb-{asset_path.name}').as_posix()}"
    return image_url, thumb_url


def _sha256_for_path(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as file_pointer:
        for chunk in iter(lambda: file_pointer.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _guess_content_type(path: Path) -> str:
    content_type, _ = mimetypes.guess_type(path.name)
    return content_type or "application/octet-stream"


def _prepare_upload_file(path: Path) -> PreparedUploadFile:
    return PreparedUploadFile(
        source_path=path.resolve(),
        extension=path.suffix.lower(),
        content_type=_guess_content_type(path),
        sha256=_sha256_for_path(path),
        size=path.stat().st_size,
    )


def _thumbnail_path(
    thumbnail_root: Path,
    frame_order: int,
    slot: str,
    source_path: Path,
) -> Path:
    return (
        thumbnail_root
        / f"{frame_order + 1:03d}"
        / f"{slot}{source_path.suffix.lower()}"
    )


def _build_case_payload(case_source: CaseSource) -> dict:
    case_slug = str(case_source.metadata.get("slug", case_source.root.name.lower()))
    return {
        "slug": case_slug,
        "title": str(
            case_source.metadata.get("title", case_slug.replace("-", " ").title())
        ),
        "summary": str(case_source.metadata.get("summary", "")),
        "tags": list(case_source.metadata.get("tags", [])),
        "coverAssetLabel": case_source.metadata.get("coverAssetLabel", "After"),
    }


def _build_group_payload(group) -> dict:
    return {
        "slug": group.slug,
        "title": str(group.metadata.get("title", group.slug.replace("-", " ").title())),
        "description": str(group.metadata.get("description", "")),
        "order": group.order,
        "defaultMode": str(group.metadata.get("defaultMode", "before-after")),
        "tags": list(group.metadata.get("tags", [])),
    }


def build_group_upload_from_case(
    scanned_case: CaseSource, thumbnail_root: Path
) -> PreparedGroupUpload:
    """Build one group-scoped upload payload plus local file mappings for direct-to-R2 uploads."""
    if len(scanned_case.groups) != 1:
        raise ValueError("同步上传目前只支持单个 group 的结构化工作目录。")

    group = scanned_case.groups[0]
    prepared_frames: list[PreparedUploadFrame] = []
    frame_payloads: list[dict] = []

    for frame in group.frames:
        prepared_assets: list[PreparedUploadAsset] = []
        asset_payloads: list[dict] = []

        for asset_index, asset in enumerate(frame.assets, start=1):
            slot = f"slot-{asset_index:03d}"
            thumbnail_path = _thumbnail_path(
                thumbnail_root, frame.order, slot, asset.path
            )
            build_thumbnail(asset.path, thumbnail_path)
            width, height = image_dimensions(asset.path)
            original = _prepare_upload_file(asset.path)
            thumbnail = _prepare_upload_file(thumbnail_path)
            prepared_asset = PreparedUploadAsset(
                slot=slot,
                kind=asset.kind,
                label=asset.label,
                note=asset.note,
                width=width,
                height=height,
                is_primary_display=asset.kind in {"before", "after"},
                original=original,
                thumbnail=thumbnail,
            )
            prepared_assets.append(prepared_asset)
            asset_payloads.append(
                {
                    "slot": prepared_asset.slot,
                    "kind": prepared_asset.kind,
                    "label": prepared_asset.label,
                    "note": prepared_asset.note,
                    "width": prepared_asset.width,
                    "height": prepared_asset.height,
                    "isPrimaryDisplay": prepared_asset.is_primary_display,
                    "original": {
                        "extension": prepared_asset.original.extension,
                        "contentType": prepared_asset.original.content_type,
                        "sha256": prepared_asset.original.sha256,
                        "size": prepared_asset.original.size,
                    },
                    "thumbnail": {
                        "extension": prepared_asset.thumbnail.extension,
                        "contentType": prepared_asset.thumbnail.content_type,
                        "sha256": prepared_asset.thumbnail.sha256,
                        "size": prepared_asset.thumbnail.size,
                    },
                }
            )

        prepared_frames.append(
            PreparedUploadFrame(
                order=frame.order,
                title=frame.title,
                caption=frame.caption,
                assets=prepared_assets,
            )
        )
        frame_payloads.append(
            {
                "order": frame.order,
                "title": frame.title,
                "caption": frame.caption,
                "assets": asset_payloads,
            }
        )

    return PreparedGroupUpload(
        start_payload={
            "case": _build_case_payload(scanned_case),
            "group": _build_group_payload(group),
            "frames": frame_payloads,
        },
        frames=prepared_frames,
    )


def manifest_json(case_root: Path) -> str:
    """Emit the group-upload-start payload shape that sync sends before frame-level uploads begin."""
    scanned_case = scan_case_directory(case_root)
    with TemporaryDirectory(prefix="magic-compare-manifest-") as temp_dir:
        prepared = build_group_upload_from_case(scanned_case, Path(temp_dir))
    return json.dumps(prepared.start_payload, indent=2, ensure_ascii=True)
