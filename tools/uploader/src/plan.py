from __future__ import annotations

import hashlib
import json
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Literal

from .image_sanity import validate_local_image
from .manifest import build_asset_urls
from .scanner import CaseSource, scan_case_directory
from .source_parser import IgnoredSourceFile, ParsedSourceGroup, discover_source_group

PlanSeverity = Literal["warning", "error"]
PlanStatus = Literal["ok", "warning", "error"]

STRONG_ASSET_KINDS = {"before", "after", "heatmap"}


@dataclass(frozen=True)
class PlanIssue:
    code: str
    severity: PlanSeverity
    path: str
    message: str


@dataclass(frozen=True)
class PlanOperation:
    id: str
    kind: str
    source_path: str
    target_url: str
    exists_policy: str
    asset_kind: str
    derivative_kind: str
    source_sha256: str
    source_size: int


@dataclass(frozen=True)
class PlanSummary:
    case_slug: str
    group_count: int
    frame_count: int
    upload_file_count: int
    ignored_file_count: int
    issue_count: int
    blocking_issue_count: int
    target_count: int


@dataclass(frozen=True)
class PlanReport:
    mode: str
    status: PlanStatus
    issues: list[PlanIssue]
    ignored_files: list[IgnoredSourceFile]
    operations: list[PlanOperation]
    summary: PlanSummary

    @property
    def exit_code(self) -> int:
        if self.status == "error":
            return 1
        return 0

    def to_dict(self) -> dict:
        """Keep report JSON stable because upload sessions and CI automation key off these field names."""
        return {
            "status": self.status,
            "mode": self.mode,
            "issues": [asdict(issue) for issue in self.issues],
            "ignoredFiles": [
                {"path": ignored.path.as_posix(), "reason": ignored.reason}
                for ignored in self.ignored_files
            ],
            "operations": [
                {
                    "id": operation.id,
                    "kind": operation.kind,
                    "sourcePath": operation.source_path,
                    "targetUrl": operation.target_url,
                    "existsPolicy": operation.exists_policy,
                    "assetKind": operation.asset_kind,
                    "derivativeKind": operation.derivative_kind,
                    "sourceSha256": operation.source_sha256,
                    "sourceSize": operation.source_size,
                }
                for operation in self.operations
            ],
            "summary": {
                "caseSlug": self.summary.case_slug,
                "groupCount": self.summary.group_count,
                "frameCount": self.summary.frame_count,
                "uploadFileCount": self.summary.upload_file_count,
                "ignoredFileCount": self.summary.ignored_file_count,
                "issueCount": self.summary.issue_count,
                "blockingIssueCount": self.summary.blocking_issue_count,
                "targetCount": self.summary.target_count,
            },
            "exitCode": self.exit_code,
        }


@dataclass(frozen=True)
class PreparedCasePlan:
    case_root: Path
    case_source: CaseSource
    report: PlanReport


def _sha256_for_path(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as file_pointer:
        for chunk in iter(lambda: file_pointer.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _issue_path(path: Path) -> str:
    return path.resolve().as_posix()


def _build_operation(
    *,
    identifier: str,
    kind: str,
    source_path: Path,
    target_url: str,
    asset_kind: str,
    derivative_kind: str,
) -> PlanOperation:
    """Capture source fingerprints at plan time so resume/skip logic does not need to reopen every file later."""
    return PlanOperation(
        id=identifier,
        kind=kind,
        source_path=source_path.resolve().as_posix(),
        target_url=target_url,
        exists_policy="skip-if-metadata-matches",
        asset_kind=asset_kind,
        derivative_kind=derivative_kind,
        source_sha256=_sha256_for_path(source_path),
        source_size=source_path.stat().st_size,
    )


def _image_issue(asset_kind: str, path: Path, error: Exception) -> PlanIssue:
    severity: PlanSeverity = "error" if asset_kind in STRONG_ASSET_KINDS else "warning"
    return PlanIssue(
        code="invalid-image",
        severity=severity,
        path=_issue_path(path),
        message=f"{path.name} 无法作为有效图片读取：{error}",
    )


def _detect_duplicate_target_urls(operations: list[PlanOperation]) -> list[PlanIssue]:
    """Duplicate target URLs would make resume/skip logic ambiguous, so the plan blocks on them early."""
    seen: dict[str, str] = {}
    issues: list[PlanIssue] = []

    for operation in operations:
        if operation.target_url not in seen:
            seen[operation.target_url] = operation.source_path
            continue

        issues.append(
            PlanIssue(
                code="target-url-conflict",
                severity="error",
                path=operation.source_path,
                message=(
                    f"目标路径冲突：{operation.target_url} 同时来自 "
                    f"{seen[operation.target_url]} 和 {operation.source_path}"
                ),
            )
        )

    return issues


def _finalize_report(
    *,
    mode: str,
    case_slug: str,
    group_count: int,
    frame_count: int,
    ignored_files: list[IgnoredSourceFile],
    issues: list[PlanIssue],
    operations: list[PlanOperation],
) -> PlanReport:
    """Derive one final status from issues plus ignored noise so CLI exit codes stay deterministic."""
    blocking_issue_count = sum(1 for issue in issues if issue.severity == "error")
    if blocking_issue_count > 0:
        status: PlanStatus = "error"
    elif issues or ignored_files:
        status = "warning"
    else:
        status = "ok"

    return PlanReport(
        mode=mode,
        status=status,
        issues=issues,
        ignored_files=ignored_files,
        operations=operations,
        summary=PlanSummary(
            case_slug=case_slug,
            group_count=group_count,
            frame_count=frame_count,
            upload_file_count=len(operations),
            ignored_file_count=len(ignored_files),
            issue_count=len(issues),
            blocking_issue_count=blocking_issue_count,
            target_count=len({operation.target_url for operation in operations}),
        ),
    )


def _plan_case_source(case_source: CaseSource) -> PreparedCasePlan:
    """Structured work dirs are the upload source of truth, so the sync executor always plans from them."""
    case_slug = str(case_source.metadata.get("slug", case_source.root.name.lower()))
    issues: list[PlanIssue] = []
    operations: list[PlanOperation] = []

    for group in case_source.groups:
        for frame in group.frames:
            for asset in frame.assets:
                image_url, thumb_url = build_asset_urls(
                    case_slug, group.slug, frame.order, asset.path
                )
                try:
                    validate_local_image(asset.path)
                except Exception as error:  # pragma: no cover - defensive boundary
                    issues.append(_image_issue(asset.kind, asset.path, error))

                asset_base_id = (
                    f"{case_slug}:{group.slug}:{frame.order}:{asset.path.name}"
                )
                operations.append(
                    _build_operation(
                        identifier=f"{asset_base_id}:original",
                        kind="upload-original",
                        source_path=asset.path,
                        target_url=image_url,
                        asset_kind=asset.kind,
                        derivative_kind="original",
                    )
                )
                operations.append(
                    _build_operation(
                        identifier=f"{asset_base_id}:thumbnail",
                        kind="upload-thumbnail",
                        source_path=asset.path,
                        target_url=thumb_url,
                        asset_kind=asset.kind,
                        derivative_kind="thumbnail",
                    )
                )

    issues.extend(_detect_duplicate_target_urls(operations))
    report = _finalize_report(
        mode="structured-case",
        case_slug=case_slug,
        group_count=len(case_source.groups),
        frame_count=sum(len(group.frames) for group in case_source.groups),
        ignored_files=[],
        issues=issues,
        operations=operations,
    )
    return PreparedCasePlan(
        case_root=case_source.root, case_source=case_source, report=report
    )


def _flat_source_operations(
    source_group: ParsedSourceGroup,
    *,
    case_slug: str,
    group_slug: str,
) -> list[PlanOperation]:
    """Mirror flat-source uploads into the same operation model used by structured work dirs."""
    operations: list[PlanOperation] = []
    for frame in source_group.frames:
        asset_candidates = [("before", frame.before), ("after", frame.after)]
        if frame.explicit_heatmap:
            asset_candidates.append(("heatmap", frame.explicit_heatmap))
        asset_candidates.extend(("misc", item) for item in frame.misc)

        for asset_kind, candidate in asset_candidates:
            image_url, thumb_url = build_asset_urls(
                case_slug, group_slug, frame.order, candidate.path
            )
            asset_base_id = (
                f"{case_slug}:{group_slug}:{frame.order}:{candidate.path.name}"
            )
            operations.append(
                _build_operation(
                    identifier=f"{asset_base_id}:original",
                    kind="upload-original",
                    source_path=candidate.path,
                    target_url=image_url,
                    asset_kind=asset_kind,
                    derivative_kind="original",
                )
            )
            operations.append(
                _build_operation(
                    identifier=f"{asset_base_id}:thumbnail",
                    kind="upload-thumbnail",
                    source_path=candidate.path,
                    target_url=thumb_url,
                    asset_kind=asset_kind,
                    derivative_kind="thumbnail",
                )
            )
    return operations


def build_flat_source_plan(
    source_group: ParsedSourceGroup,
    *,
    case_slug: str,
    group_slug: str,
) -> PlanReport:
    """Preview flat source imports without writing a workspace so users can catch mistakes before staging."""
    issues: list[PlanIssue] = []
    for frame in source_group.frames:
        for asset_kind, candidate in [
            ("before", frame.before),
            ("after", frame.after),
            *((("heatmap", frame.explicit_heatmap),) if frame.explicit_heatmap else ()),
            *[("misc", item) for item in frame.misc],
        ]:
            if candidate is None:
                continue
            try:
                validate_local_image(candidate.path)
            except Exception as error:  # pragma: no cover - defensive boundary
                issues.append(_image_issue(asset_kind, candidate.path, error))

    operations = _flat_source_operations(
        source_group, case_slug=case_slug, group_slug=group_slug
    )
    issues.extend(_detect_duplicate_target_urls(operations))
    return _finalize_report(
        mode="flat-source",
        case_slug=case_slug,
        group_count=1,
        frame_count=len(source_group.frames),
        ignored_files=source_group.ignored_files,
        issues=issues,
        operations=operations,
    )


def build_case_plan(case_root: Path) -> PreparedCasePlan:
    """Turn a structured work dir into one plan object so sync and dry-run share the same validation path."""
    try:
        case_source = scan_case_directory(case_root)
    except Exception as error:
        report = _finalize_report(
            mode="structured-case",
            case_slug=case_root.name,
            group_count=0,
            frame_count=0,
            ignored_files=[],
            issues=[
                PlanIssue(
                    code="scan-error",
                    severity="error",
                    path=case_root.resolve().as_posix(),
                    message=str(error),
                )
            ],
            operations=[],
        )
        empty_case_source = CaseSource(root=case_root.resolve(), metadata={}, groups=[])
        return PreparedCasePlan(
            case_root=case_root.resolve(), case_source=empty_case_source, report=report
        )

    return _plan_case_source(case_source)


def build_path_plan(
    source: Path, *, case_slug: str | None = None, group_slug: str | None = None
) -> PlanReport:
    """Build a dry-run report from either a flat source folder or a structured case directory."""
    normalized_source = source.resolve()
    looks_structured = (normalized_source / "groups").exists() or (
        normalized_source / "case.yaml"
    ).exists()
    if looks_structured:
        return build_case_plan(normalized_source).report

    try:
        source_group = discover_source_group(normalized_source)
    except Exception as error:
        return _finalize_report(
            mode="flat-source",
            case_slug=case_slug or normalized_source.name,
            group_count=0,
            frame_count=0,
            ignored_files=[],
            issues=[
                PlanIssue(
                    code="source-parse-error",
                    severity="error",
                    path=normalized_source.as_posix(),
                    message=str(error),
                )
            ],
            operations=[],
        )

    return build_flat_source_plan(
        source_group,
        case_slug=case_slug or normalized_source.name,
        group_slug=group_slug or source_group.slug,
    )


def write_plan_report(report: PlanReport, output_path: Path) -> None:
    """Persist machine-readable reports only when explicitly requested so regular CLI runs stay uncluttered."""
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(
        json.dumps(report.to_dict(), indent=2, ensure_ascii=False), encoding="utf-8"
    )
