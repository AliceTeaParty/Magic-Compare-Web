from __future__ import annotations

from dataclasses import dataclass

import httpx

from .auth import UploaderConfig, build_request_headers, clear_access_token

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


def group_delete_url(api_url: str) -> str:
    return _replace_operation_url(api_url, "group-delete")


def _request_error(error: httpx.HTTPStatusError) -> RuntimeError:
    status_code = error.response.status_code
    if status_code in {401, 403}:
        return RuntimeError("请求被 Cloudflare Access 或内部站拒绝。请确认 Zero Trust 登录状态或 Service Token 配置。")
    return RuntimeError(f"请求失败：HTTP {status_code}")


def _post_json(config: UploaderConfig, url: str, payload: dict) -> dict:
    headers = build_request_headers(config)
    response = httpx.post(url, json=payload, timeout=30.0, headers=headers)

    if response.status_code in {401, 403} and not config.has_service_token and not config.is_local_site:
        clear_access_token(config)
        headers = build_request_headers(config, force_refresh_access_token=True)
        response = httpx.post(url, json=payload, timeout=30.0, headers=headers)

    try:
        response.raise_for_status()
    except httpx.HTTPStatusError as error:
        raise _request_error(error) from error

    return response.json()


def search_cases(config: UploaderConfig, query: str, limit: int = 8) -> list[CaseSearchResult]:
    payload = _post_json(config, case_search_url(config.api_url), {"query": query, "limit": limit})
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


def sync_manifest(config: UploaderConfig, manifest: dict) -> dict:
    return _post_json(config, config.api_url, manifest)


def delete_group(config: UploaderConfig, case_slug: str, group_slug: str) -> dict:
    return _post_json(
        config,
        group_delete_url(config.api_url),
        {"caseSlug": case_slug, "groupSlug": group_slug},
    )
