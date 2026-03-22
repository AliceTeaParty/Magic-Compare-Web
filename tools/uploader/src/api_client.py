from __future__ import annotations

from dataclasses import dataclass

import httpx

from .auth import UploaderConfig, build_request_headers

@dataclass(frozen=True)
class CaseSearchGroup:
    slug: str
    title: str


@dataclass(frozen=True)
class CaseSearchResult:
    id: str
    slug: str
    title: str
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


def group_delete_url(api_url: str) -> str:
    return _replace_operation_url(api_url, "group-delete")


def _request_error(error: httpx.HTTPStatusError) -> RuntimeError:
    status_code = error.response.status_code
    if status_code in {401, 403}:
        return RuntimeError("请求被内部站拒绝。请确认 Service Token 配置和 internal-site 访问策略。")
    return RuntimeError(f"请求失败：HTTP {status_code}")


def _post_json(config: UploaderConfig, url: str, payload: dict) -> dict:
    """Keep uploader HTTP calls deterministic by doing a single authenticated request per operation."""
    headers = build_request_headers(config)
    response = httpx.post(url, json=payload, timeout=30.0, headers=headers)

    try:
        response.raise_for_status()
    except httpx.HTTPStatusError as error:
        raise _request_error(error) from error

    return response.json()


def search_cases(config: UploaderConfig, query: str, limit: int = 8) -> list[CaseSearchResult]:
    """Search cases through the internal API so the wizard can reuse remote metadata without local caches."""
    payload = _post_json(config, case_search_url(config.api_url), {"query": query, "limit": limit})
    results: list[CaseSearchResult] = []
    for item in payload.get("cases", []):
        results.append(
            CaseSearchResult(
                id=item["id"],
                slug=item["slug"],
                title=item["title"],
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


def sync_manifest(config: UploaderConfig, manifest: dict) -> dict:
    """Push one manifest snapshot into internal-site after uploads finished successfully."""
    return _post_json(config, config.api_url, manifest)


def delete_group(config: UploaderConfig, case_slug: str, group_slug: str) -> dict:
    """Delete one remote group through the same authenticated API surface used by sync."""
    return _post_json(
        config,
        group_delete_url(config.api_url),
        {"caseSlug": case_slug, "groupSlug": group_slug},
    )
