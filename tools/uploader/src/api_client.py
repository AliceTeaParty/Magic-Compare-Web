from __future__ import annotations

from dataclasses import dataclass

import httpx


@dataclass(frozen=True)
class CaseSearchGroup:
    slug: str
    title: str


@dataclass(frozen=True)
class CaseSearchResult:
    id: str
    slug: str
    title: str
    subtitle: str
    summary: str
    tags: list[str]
    status: str
    updated_at: str
    group_count: int
    public_group_count: int
    groups: list[CaseSearchGroup]


def _replace_operation_url(api_url: str, operation: str) -> str:
    prefix, separator, _ = api_url.rpartition("/")
    if not separator:
        raise ValueError(f"无法从 API 地址推断操作端点：{api_url}")
    return f"{prefix}/{operation}"


def case_search_url(api_url: str) -> str:
    return _replace_operation_url(api_url, "case-search")


def internal_site_base_url(api_url: str) -> str:
    marker = "/api/ops/"
    if marker not in api_url:
        return api_url.rstrip("/")
    return api_url.split(marker, maxsplit=1)[0].rstrip("/")


def search_cases(api_url: str, query: str, limit: int = 8) -> list[CaseSearchResult]:
    response = httpx.post(
        case_search_url(api_url),
        json={"query": query, "limit": limit},
        timeout=30.0,
    )
    response.raise_for_status()
    payload = response.json()
    results: list[CaseSearchResult] = []
    for item in payload.get("cases", []):
        results.append(
            CaseSearchResult(
                id=item["id"],
                slug=item["slug"],
                title=item["title"],
                subtitle=item.get("subtitle", ""),
                summary=item.get("summary", ""),
                tags=item.get("tags", []),
                status=item.get("status", "internal"),
                updated_at=item.get("updatedAt", ""),
                group_count=item.get("groupCount", 0),
                public_group_count=item.get("publicGroupCount", 0),
                groups=[
                    CaseSearchGroup(slug=group["slug"], title=group["title"])
                    for group in item.get("groups", [])
                ],
            )
        )
    return results


def sync_manifest(api_url: str, manifest: dict) -> dict:
    response = httpx.post(api_url, json=manifest, timeout=30.0)
    response.raise_for_status()
    return response.json()
