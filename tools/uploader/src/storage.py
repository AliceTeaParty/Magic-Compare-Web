from __future__ import annotations

import mimetypes
from dataclasses import dataclass
from pathlib import Path

import httpx

from .auth import build_request_headers
from .config import UploaderConfig


@dataclass(frozen=True)
class RemoteUploadResult:
    status: str


def _guess_content_type(file_name: str) -> str:
    content_type, _ = mimetypes.guess_type(file_name)
    return content_type or "application/octet-stream"


def _replace_operation_url(api_url: str, operation: str) -> str:
    prefix, separator, _ = api_url.rpartition("/")
    if not separator:
        raise ValueError(f"无法从 API 地址推断操作端点：{api_url}")
    return f"{prefix}/{operation}"


def internal_asset_upload_url(api_url: str) -> str:
    return _replace_operation_url(api_url, "internal-asset-upload")


def upload_file_to_internal_assets(
    config: UploaderConfig,
    source_path: Path,
    asset_url: str,
    *,
    metadata: dict[str, str] | None = None,
) -> RemoteUploadResult:
    """Proxy uploads through internal-site so remote runs only need site access credentials, not raw S3 secrets."""
    headers = build_request_headers(config)
    payload = {"assetUrl": asset_url}
    if metadata:
        payload.update(metadata)

    with source_path.open("rb") as file_pointer:
        response = httpx.post(
            internal_asset_upload_url(config.api_url),
            data=payload,
            files={
                "file": (
                    source_path.name,
                    file_pointer,
                    _guess_content_type(source_path.name),
                )
            },
            timeout=120.0,
            headers=headers,
        )

    try:
        response.raise_for_status()
    except httpx.HTTPStatusError as error:
        if error.response.status_code in {401, 403}:
            raise RuntimeError(
                "请求被内部站拒绝。请确认 Service Token 配置和 internal-site 访问策略。"
            ) from error
        raise

    payload = response.json()
    return RemoteUploadResult(status=str(payload.get("status", "uploaded")))
