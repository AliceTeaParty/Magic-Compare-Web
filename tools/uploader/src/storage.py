from __future__ import annotations

import mimetypes
from dataclasses import dataclass
from pathlib import Path

import boto3
from botocore.config import Config
from botocore.exceptions import ClientError

from .config import UploaderConfig


@dataclass(frozen=True)
class RemoteObjectState:
    metadata: dict[str, str]
    size: int


def _normalize_relative_asset_path(asset_url: str) -> str:
    normalized = asset_url.lstrip("/")
    if not normalized.startswith("internal-assets/"):
        raise ValueError(f"不支持的 internal asset URL：{asset_url}")
    return normalized


def _guess_content_type(file_name: str) -> str:
    content_type, _ = mimetypes.guess_type(file_name)
    return content_type or "application/octet-stream"


def build_s3_client(config: UploaderConfig):
    """Construct one uploader-scoped client so storage calls all honor the same .env-derived endpoint rules."""
    if not config.has_s3_config:
        raise RuntimeError(
            "缺少 S3 配置。请在 .env 中补齐 MAGIC_COMPARE_S3_BUCKET / REGION / ACCESS KEY / SECRET。"
        )

    return boto3.client(
        "s3",
        region_name=config.s3_region or "us-east-1",
        endpoint_url=config.s3_endpoint,
        aws_access_key_id=config.s3_access_key_id,
        aws_secret_access_key=config.s3_secret_access_key,
        config=Config(
            signature_version="s3v4",
            s3={"addressing_style": "path" if config.s3_force_path_style else "auto"},
        ),
    )


def head_internal_asset(config: UploaderConfig, asset_url: str) -> RemoteObjectState | None:
    """Read remote object metadata cheaply so resume/skip decisions do not need a full download."""
    client = build_s3_client(config)
    try:
        response = client.head_object(
            Bucket=config.s3_bucket or "",
            Key=_normalize_relative_asset_path(asset_url),
        )
    except ClientError as error:
        status_code = error.response.get("ResponseMetadata", {}).get("HTTPStatusCode")
        error_code = str(error.response.get("Error", {}).get("Code", ""))
        if status_code == 404 or error_code in {"404", "NoSuchKey", "NotFound"}:
            return None
        raise

    return RemoteObjectState(
        metadata={key.lower(): value for key, value in response.get("Metadata", {}).items()},
        size=int(response.get("ContentLength", 0)),
    )


def upload_file_to_internal_assets(
    config: UploaderConfig,
    source_path: Path,
    asset_url: str,
    *,
    metadata: dict[str, str] | None = None,
) -> None:
    """Upload one local file into internal-assets with deterministic metadata used by resume/skip logic."""
    client = build_s3_client(config)
    client.upload_file(
        str(source_path),
        config.s3_bucket or "",
        _normalize_relative_asset_path(asset_url),
        ExtraArgs={
            "ContentType": _guess_content_type(source_path.name),
            "Metadata": metadata or {},
        },
    )
