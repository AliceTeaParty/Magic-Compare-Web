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


@dataclass(frozen=True)
class CaseListResult:
    id: str
    slug: str
    title: str
    summary: str
    tags: list[str]
    status: str
    published_at: str | None
    updated_at: str
    group_count: int
    public_group_count: int


@dataclass(frozen=True)
class CaseWorkspaceGroup:
    id: str
    slug: str
    title: str
    description: str
    order: int
    default_mode: str
    is_public: bool
    public_slug: str | None
    frame_count: int


@dataclass(frozen=True)
class CaseGroupsResult:
    id: str
    slug: str
    title: str
    summary: str
    status: str
    published_at: str | None
    tags: list[str]
    groups: list[CaseWorkspaceGroup]


def _replace_operation_url(api_url: str, operation: str) -> str:
    prefix, separator, _ = api_url.rpartition("/")
    if not separator:
        raise ValueError(f"无法从 API 地址推断操作端点：{api_url}")
    return f"{prefix}/{operation}"


def case_search_url(api_url: str) -> str:
    return _replace_operation_url(api_url, "case-search")


def case_list_url(api_url: str) -> str:
    return _replace_operation_url(api_url, "case-list")


def case_groups_url(api_url: str) -> str:
    return _replace_operation_url(api_url, "case-groups")


def group_delete_url(api_url: str) -> str:
    return _replace_operation_url(api_url, "group-delete")


def case_delete_url(api_url: str) -> str:
    return _replace_operation_url(api_url, "case-delete")


def group_upload_frame_prepare_url(api_url: str) -> str:
    return _replace_operation_url(api_url, "group-upload-frame-prepare")


def group_upload_frame_commit_url(api_url: str) -> str:
    return _replace_operation_url(api_url, "group-upload-frame-commit")


def group_upload_complete_url(api_url: str) -> str:
    return _replace_operation_url(api_url, "group-upload-complete")


def _request_error(error: httpx.HTTPStatusError) -> RuntimeError:
    status_code = error.response.status_code
    message = ""
    try:
        payload = error.response.json()
        if isinstance(payload, dict):
            message = str(payload.get("error", "")).strip()
    except Exception:
        message = ""
    if status_code in {401, 403}:
        return RuntimeError(
            "请求被内部站拒绝。请确认 Service Token 配置和 internal-site 访问策略。"
        )
    return RuntimeError(message or f"请求失败：HTTP {status_code}")


def _post_json(config: UploaderConfig, url: str, payload: dict) -> dict:
    """Keep uploader HTTP calls deterministic by doing a single authenticated request per operation."""
    headers = build_request_headers(config)
    response = httpx.post(url, json=payload, timeout=30.0, headers=headers)

    try:
        response.raise_for_status()
    except httpx.HTTPStatusError as error:
        raise _request_error(error) from error

    return response.json()


def search_cases(
    config: UploaderConfig, query: str, limit: int = 8
) -> list[CaseSearchResult]:
    """Search cases through the internal API so the wizard can reuse remote metadata without local caches."""
    payload = _post_json(
        config, case_search_url(config.api_url), {"query": query, "limit": limit}
    )
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


def list_cases(config: UploaderConfig) -> list[CaseListResult]:
    """Fetch the complete remote case list without the search endpoint's limit cap."""
    payload = _post_json(config, case_list_url(config.api_url), {})
    results: list[CaseListResult] = []
    for item in payload.get("cases", []):
        results.append(
            CaseListResult(
                id=item["id"],
                slug=item["slug"],
                title=item["title"],
                summary=item.get("summary", ""),
                tags=item.get("tags", []),
                status=item.get("status", "internal"),
                published_at=item.get("publishedAt"),
                updated_at=item.get("updatedAt", ""),
                group_count=item.get("groupCount", 0),
                public_group_count=item.get("publicGroupCount", 0),
            )
        )
    return results


def list_case_groups(config: UploaderConfig, case_slug: str) -> CaseGroupsResult:
    """Load one case workspace summary so CLI commands can list every group under that slug."""
    payload = _post_json(
        config, case_groups_url(config.api_url), {"caseSlug": case_slug}
    )
    case_item = payload["case"]
    return CaseGroupsResult(
        id=case_item["id"],
        slug=case_item["slug"],
        title=case_item["title"],
        summary=case_item.get("summary", ""),
        status=case_item.get("status", "internal"),
        published_at=case_item.get("publishedAt"),
        tags=case_item.get("tags", []),
        groups=[
            CaseWorkspaceGroup(
                id=group["id"],
                slug=group["slug"],
                title=group["title"],
                description=group.get("description", ""),
                order=group.get("order", 0),
                default_mode=group.get("defaultMode", "before-after"),
                is_public=group.get("isPublic", False),
                public_slug=group.get("publicSlug"),
                frame_count=group.get("frameCount", 0),
            )
            for group in payload.get("groups", [])
        ],
    )


def start_group_upload(config: UploaderConfig, payload: dict) -> dict:
    """Create or resume one group upload job before any frame requests presigned URLs."""
    return _post_json(config, config.api_url, payload)


def prepare_group_upload_frame(
    config: UploaderConfig, group_upload_job_id: str, frame_order: int
) -> dict:
    """Ask internal-site to approve one frame upload and return per-file presigned PUT URLs."""
    return _post_json(
        config,
        group_upload_frame_prepare_url(config.api_url),
        {"groupUploadJobId": group_upload_job_id, "frameOrder": frame_order},
    )


def commit_group_upload_frame(
    config: UploaderConfig, group_upload_job_id: str, frame_order: int
) -> dict:
    """Tell internal-site one prepared frame finished uploading and should replace the old revision."""
    return _post_json(
        config,
        group_upload_frame_commit_url(config.api_url),
        {"groupUploadJobId": group_upload_job_id, "frameOrder": frame_order},
    )


def complete_group_upload(config: UploaderConfig, group_upload_job_id: str) -> dict:
    """Finalize one group upload after every frame finished committing successfully."""
    return _post_json(
        config,
        group_upload_complete_url(config.api_url),
        {"groupUploadJobId": group_upload_job_id},
    )


def delete_group(config: UploaderConfig, case_slug: str, group_slug: str) -> dict:
    """Delete one remote group through the same authenticated API surface used by sync."""
    return _post_json(
        config,
        group_delete_url(config.api_url),
        {"caseSlug": case_slug, "groupSlug": group_slug},
    )


def delete_case(config: UploaderConfig, case_slug: str) -> dict:
    """Delete one empty remote case through the internal API control surface."""
    return _post_json(
        config,
        case_delete_url(config.api_url),
        {"caseSlug": case_slug},
    )
