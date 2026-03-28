from __future__ import annotations

import mimetypes
from pathlib import Path
from collections.abc import Iterator

import httpx

_UPLOAD_TIMEOUT_SECONDS = 120.0
_STREAM_CHUNK_SIZE = 1024 * 1024


def _guess_content_type(file_name: str) -> str:
    content_type, _ = mimetypes.guess_type(file_name)
    return content_type or "application/octet-stream"


def _iter_file_chunks(source_path: Path) -> Iterator[bytes]:
    """Yield fixed-size chunks so large uploads stream from disk instead of being buffered fully in memory."""
    with source_path.open("rb") as file_pointer:
        while True:
            chunk = file_pointer.read(_STREAM_CHUNK_SIZE)
            if not chunk:
                break
            yield chunk


def create_upload_http_client() -> httpx.Client:
    """Reuse one HTTP client across frame workers so repeated presigned PUTs share connection pools."""
    return httpx.Client(timeout=_UPLOAD_TIMEOUT_SECONDS)


def upload_file_to_presigned_url(
    source_path: Path,
    *,
    upload_url: str,
    content_type: str | None = None,
    client: httpx.Client | None = None,
) -> None:
    """Upload one local file directly to a presigned object URL without sending site credentials to R2."""
    final_content_type = content_type or _guess_content_type(source_path.name)
    request_headers = {
        "content-type": final_content_type,
        "content-length": str(source_path.stat().st_size),
    }

    if client is None:
        with create_upload_http_client() as transient_client:
            response = transient_client.put(
                upload_url,
                content=_iter_file_chunks(source_path),
                headers=request_headers,
            )
    else:
        response = client.put(
            upload_url,
            content=_iter_file_chunks(source_path),
            headers=request_headers,
        )

    response.raise_for_status()
