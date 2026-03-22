from __future__ import annotations

import hashlib
import json
import time
from dataclasses import dataclass
from pathlib import Path
from tempfile import TemporaryDirectory

from botocore.exceptions import (
    BotoCoreError,
    ClientError,
    ConnectionClosedError,
    ConnectTimeoutError,
    EndpointConnectionError,
    ReadTimeoutError,
)

from .config import UploaderConfig
from .plan import PlanOperation, PreparedCasePlan
from .storage import head_internal_asset, upload_file_to_internal_assets
from .thumbnailer import build_thumbnail

MAX_UPLOAD_ATTEMPTS = 3


@dataclass(frozen=True)
class UploadFailure:
    operation_id: str
    target_url: str
    message: str


@dataclass(frozen=True)
class UploadExecutionSummary:
    uploaded_count: int
    skipped_count: int
    failed_count: int
    retried_count: int
    duration_seconds: float
    session_path: Path
    failures: list[UploadFailure]

    @property
    def succeeded(self) -> bool:
        return self.failed_count == 0


def session_file_path(case_root: Path) -> Path:
    return case_root / ".magic-compare" / "upload-session.json"


def _plan_hash(plan: PreparedCasePlan) -> str:
    """Hash only the operation shape so resume survives reruns but resets when upload inputs really changed."""
    payload = [
        {
            "id": operation.id,
            "kind": operation.kind,
            "sourcePath": operation.source_path,
            "targetUrl": operation.target_url,
            "sourceSha256": operation.source_sha256,
            "sourceSize": operation.source_size,
        }
        for operation in plan.report.operations
    ]
    serialized = json.dumps(payload, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(serialized.encode("utf-8")).hexdigest()


def _empty_session(plan_hash: str) -> dict:
    now = time.time()
    return {
        "planHash": plan_hash,
        "createdAt": now,
        "updatedAt": now,
        "operations": {},
    }


def _load_session(session_path: Path, plan_hash: str, reset_session: bool) -> dict:
    """Reset sessions automatically when the planned workload changed so resume never reuses stale state."""
    if reset_session or not session_path.exists():
        return _empty_session(plan_hash)

    try:
        session = json.loads(session_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return _empty_session(plan_hash)

    if session.get("planHash") != plan_hash:
        return _empty_session(plan_hash)

    return session


def _write_session(session_path: Path, session: dict) -> None:
    """Persist session state after each decision so interrupted uploads can resume with minimal replay."""
    session_path.parent.mkdir(parents=True, exist_ok=True)
    session["updatedAt"] = time.time()
    session_path.write_text(json.dumps(session, indent=2, ensure_ascii=False), encoding="utf-8")


def _metadata_for_operation(operation: PlanOperation) -> dict[str, str]:
    return {
        "sha256": operation.source_sha256,
        "source-size": str(operation.source_size),
        "derivative-kind": operation.derivative_kind,
    }


def _matches_remote_object(operation: PlanOperation, remote_state: object) -> bool:
    if remote_state is None:
        return False

    metadata = getattr(remote_state, "metadata", {})
    return (
        metadata.get("sha256") == operation.source_sha256
        and metadata.get("source-size") == str(operation.source_size)
        and metadata.get("derivative-kind") == operation.derivative_kind
    )


def _is_retryable_upload_error(error: Exception) -> bool:
    """Retry only transient storage failures so credential or path mistakes fail fast instead of looping."""
    if isinstance(error, (ConnectTimeoutError, EndpointConnectionError, ConnectionClosedError, ReadTimeoutError)):
        return True
    if isinstance(error, ClientError):
        status_code = error.response.get("ResponseMetadata", {}).get("HTTPStatusCode", 0)
        error_code = str(error.response.get("Error", {}).get("Code", ""))
        return status_code == 429 or status_code >= 500 or error_code in {"SlowDown", "RequestTimeout"}
    return isinstance(error, BotoCoreError)


def _prepare_upload_source(operation: PlanOperation) -> tuple[Path, TemporaryDirectory[str] | None]:
    """Generate thumbnails lazily so dry-run mode and skipped objects never pay that local CPU cost."""
    source_path = Path(operation.source_path)
    if operation.kind != "upload-thumbnail":
        return source_path, None

    temp_dir = TemporaryDirectory(prefix="magic-compare-thumb-")
    thumbnail_path = Path(temp_dir.name) / Path(operation.target_url).name
    build_thumbnail(source_path, thumbnail_path)
    return thumbnail_path, temp_dir


def execute_upload_plan(
    plan: PreparedCasePlan,
    config: UploaderConfig,
    *,
    reset_session: bool = False,
) -> UploadExecutionSummary:
    """Execute one structured-case plan with resumable uploads and deterministic skip/retry rules."""
    if plan.report.status == "error":
        raise RuntimeError("当前计划存在阻塞错误，无法执行上传。")

    started_at = time.monotonic()
    plan_hash = _plan_hash(plan)
    session_path = session_file_path(plan.case_root)
    session = _load_session(session_path, plan_hash, reset_session)
    uploaded_count = 0
    skipped_count = 0
    retried_count = 0
    failures: list[UploadFailure] = []

    for operation in plan.report.operations:
        operation_state = session["operations"].setdefault(
            operation.id,
            {
                "status": "pending",
                "attempts": 0,
                "targetUrl": operation.target_url,
                "sourceSha256": operation.source_sha256,
                "sourceSize": operation.source_size,
            },
        )

        remote_state = head_internal_asset(config, operation.target_url)
        if _matches_remote_object(operation, remote_state):
            operation_state["status"] = "skipped"
            _write_session(session_path, session)
            skipped_count += 1
            continue

        last_error: str | None = None
        for attempt in range(1, MAX_UPLOAD_ATTEMPTS + 1):
            operation_state["attempts"] = attempt
            prepared_path, temp_dir = _prepare_upload_source(operation)
            try:
                upload_file_to_internal_assets(
                    config,
                    prepared_path,
                    operation.target_url,
                    metadata=_metadata_for_operation(operation),
                )
                operation_state["status"] = "uploaded"
                operation_state["lastError"] = None
                uploaded_count += 1
                _write_session(session_path, session)
                break
            except Exception as error:  # pragma: no cover - exercised via retry/IO tests
                last_error = str(error)
                operation_state["lastError"] = last_error
                operation_state["status"] = "failed"
                if attempt < MAX_UPLOAD_ATTEMPTS and _is_retryable_upload_error(error):
                    retried_count += 1
                    _write_session(session_path, session)
                    continue

                failures.append(
                    UploadFailure(
                        operation_id=operation.id,
                        target_url=operation.target_url,
                        message=last_error,
                    )
                )
                _write_session(session_path, session)
                break
            finally:
                if temp_dir is not None:
                    temp_dir.cleanup()

    return UploadExecutionSummary(
        uploaded_count=uploaded_count,
        skipped_count=skipped_count,
        failed_count=len(failures),
        retried_count=retried_count,
        duration_seconds=time.monotonic() - started_at,
        session_path=session_path,
        failures=failures,
    )
