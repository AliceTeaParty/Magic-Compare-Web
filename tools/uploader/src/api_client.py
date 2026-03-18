from __future__ import annotations

import httpx


def sync_manifest(api_url: str, manifest: dict) -> dict:
    response = httpx.post(api_url, json=manifest, timeout=30.0)
    response.raise_for_status()
    return response.json()
