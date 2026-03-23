from __future__ import annotations

import hashlib
import json
import threading
import time
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from pathlib import Path
from tempfile import TemporaryDirectory

import httpx

from .config import UploaderConfig
from .plan import PlanOperation, PreparedCasePlan
from .storage import upload_file_to_internal_assets
from .thumbnailer import build_thumbnail

MAX_UPLOAD_ATTEMPTS = 3
_DEFAULT_MAX_WORKERS = 4


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
    session_path.write_text(
        json.dumps(session, indent=2, ensure_ascii=False), encoding="utf-8"
    )


def _metadata_for_operation(operation: PlanOperation) -> dict[str, str]:
    return {
        "sha256": operation.source_sha256,
        "source-size": str(operation.source_size),
        "derivative-kind": operation.derivative_kind,
    }


def _is_retryable_upload_error(error: Exception) -> bool:
    """Retry only transient proxy failures so auth or path mistakes still fail fast with one clear error."""
    if isinstance(error, (httpx.TimeoutException, httpx.NetworkError)):
        return True
    if isinstance(error, httpx.HTTPStatusError):
        return error.response.status_code == 429 or error.response.status_code >= 500
    return False


def _prepare_upload_source(
    operation: PlanOperation,
) -> tuple[Path, TemporaryDirectory[str] | None]:
    """Generate thumbnails lazily so dry-run mode and skipped objects never pay that local CPU cost."""
    source_path = Path(operation.source_path)
    if operation.kind != "upload-thumbnail":
        return source_path, None

    temp_dir = TemporaryDirectory(prefix="magic-compare-thumb-")
    thumbnail_path = Path(temp_dir.name) / Path(operation.target_url).name
    build_thumbnail(source_path, thumbnail_path)
    return thumbnail_path, temp_dir


def _execute_one_operation(
    operation: PlanOperation,
    config: UploaderConfig,
) -> tuple[str, str | None, int]:
    """Upload a single operation and return ``(status, last_error, retry_count)``."""
    last_error: str | None = None
    retried = 0
    for attempt in range(1, MAX_UPLOAD_ATTEMPTS + 1):
        prepared_path, temp_dir = _prepare_upload_source(operation)
        try:
            upload_result = upload_file_to_internal_assets(
                config,
                prepared_path,
                operation.target_url,
                metadata=_metadata_for_operation(operation),
            )
            return upload_result.status, None, retried
        except Exception as error:  # pragma: no cover - exercised via retry/IO tests
            last_error = str(error)
            if attempt < MAX_UPLOAD_ATTEMPTS and _is_retryable_upload_error(error):
                retried += 1
                continue
            return "failed", last_error, retried
        finally:
            if temp_dir is not None:
                temp_dir.cleanup()
    return "failed", last_error, retried  # pragma: no cover


def execute_upload_plan(
    plan: PreparedCasePlan,
    config: UploaderConfig,
    *,
    reset_session: bool = False,
    on_progress: Callable[[], None] | None = None,
    max_workers: int = _DEFAULT_MAX_WORKERS,
) -> UploadExecutionSummary:
    """Execute one structured-case plan with resumable uploads and deterministic skip/retry rules.

    Parameters
    ----------
    on_progress:
        Optional callable invoked after each **original** (non-thumbnail) upload
        completes (whether the server returned *uploaded* or *skipped*).  Useful
        for driving a progress bar in the caller.
    max_workers:
        Maximum number of concurrent upload threads.  Defaults to
        ``_DEFAULT_MAX_WORKERS`` (4).
    """
    if plan.report.status == "error":
        raise RuntimeError("当前计划存在阻塞错误，无法执行上传。")

    started_at = time.monotonic()
    plan_hash = _plan_hash(plan)
    session_path = session_file_path(plan.case_root)
    session = _load_session(session_path, plan_hash, reset_session)

    # Pre-populate session state for all operations so the session file always
    # contains a complete picture of the planned work even before uploads begin.
    for operation in plan.report.operations:
        session["operations"].setdefault(
            operation.id,
            {
                "status": "pending",
                "attempts": 0,
                "targetUrl": operation.target_url,
                "sourceSha256": operation.source_sha256,
                "sourceSize": operation.source_size,
            },
        )

    uploaded_count = 0
    skipped_count = 0
    retried_count = 0
    failures: list[UploadFailure] = []
    lock = threading.Lock()

    def _handle_result(operation: PlanOperation, status: str, error: str | None, retried: int) -> None:
        nonlocal uploaded_count, skipped_count, retried_count
        with lock:
            op_state = session["operations"][operation.id]
            op_state["attempts"] = retried + 1
            op_state["status"] = status
            op_state["lastError"] = error
            retried_count += retried
            if status == "failed":
                failures.append(
                    UploadFailure(
                        operation_id=operation.id,
                        target_url=operation.target_url,
                        message=error or "unknown error",
                    )
                )
            elif status == "skipped":
                skipped_count += 1
            else:
                uploaded_count += 1
            _write_session(session_path, session)

        if on_progress is not None and operation.kind == "upload-original":
            on_progress()

    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        future_to_op = {
            executor.submit(_execute_one_operation, operation, config): operation
            for operation in plan.report.operations
        }
        for future in as_completed(future_to_op):
            operation = future_to_op[future]
            status, error, retried = future.result()
            _handle_result(operation, status, error, retried)

    return UploadExecutionSummary(
        uploaded_count=uploaded_count,
        skipped_count=skipped_count,
        failed_count=len(failures),
        retried_count=retried_count,
        duration_seconds=time.monotonic() - started_at,
        session_path=session_path,
        failures=failures,
    )
