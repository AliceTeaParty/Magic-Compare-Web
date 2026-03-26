from __future__ import annotations

import mimetypes
from pathlib import Path

import httpx


def _guess_content_type(file_name: str) -> str:
    content_type, _ = mimetypes.guess_type(file_name)
    return content_type or "application/octet-stream"


def upload_file_to_presigned_url(
    source_path: Path,
    *,
    upload_url: str,
    content_type: str | None = None,
) -> None:
    """Upload one local file directly to a presigned object URL without sending site credentials to R2."""
    final_content_type = content_type or _guess_content_type(source_path.name)

    with source_path.open("rb") as file_pointer:
        response = httpx.put(
            upload_url,
            content=file_pointer.read(),
            timeout=120.0,
            headers={
                "content-type": final_content_type,
            },
        )

    response.raise_for_status()
