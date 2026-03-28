from __future__ import annotations

import json
import threading
import time
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass, field
from pathlib import Path
from tempfile import TemporaryDirectory

import httpx

from .api_client import (
    commit_group_upload_frame,
    complete_group_upload,
    prepare_group_upload_frame,
    start_group_upload,
)
from .config import UploaderConfig
from .manifest import (
    PreparedGroupUpload,
    PreparedUploadFile,
    build_group_upload_from_case,
)
from .plan import PreparedCasePlan
from .storage import upload_file_to_presigned_url

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
    completion_result: dict | None = None

    @property
    def succeeded(self) -> bool:
        return self.failed_count == 0 and self.completion_result is not None


@dataclass
class UploadRuntimeState:
    config: UploaderConfig
    prepared_upload: PreparedGroupUpload
    start_result: dict
    session_path: Path
    session: dict
    started_at: float
    uploaded_count: int = 0
    skipped_count: int = 0
    retried_count: int = 0
    failures: list[UploadFailure] = field(default_factory=list)
    lock: threading.Lock = field(default_factory=threading.Lock)


@dataclass(frozen=True)
class FrameUploadContext:
    runtime: UploadRuntimeState
    frame_order: int
    frame_session: dict
    on_progress: Callable[[], None] | None = None


def session_file_path(case_root: Path) -> Path:
    return case_root / ".magic-compare" / "upload-session.json"


def _empty_session(start_result: dict, prepared_upload: PreparedGroupUpload) -> dict:
    """Build the persisted session payload from the authoritative server start response."""
    now = time.time()
    frame_titles = {frame.order: frame.title for frame in prepared_upload.frames}
    return {
        "groupUploadJobId": start_result["groupUploadJobId"],
        "inputHash": start_result["inputHash"],
        "expectedFrameCount": start_result["expectedFrameCount"],
        "committedFrameCount": start_result["committedFrameCount"],
        "createdAt": now,
        "updatedAt": now,
        "frames": {
            str(frame_state["frameOrder"]): {
                "title": frame_titles.get(frame_state["frameOrder"], ""),
                "status": frame_state["status"],
                "pendingPrefix": None,
                "lastError": None,
            }
            for frame_state in start_result.get("frameStates", [])
        },
    }


def _write_session(session_path: Path, session: dict) -> None:
    """Persist state after each server-visible step so resume decisions stay inspectable and deterministic."""
    session_path.parent.mkdir(parents=True, exist_ok=True)
    session["updatedAt"] = time.time()
    session_path.write_text(
        json.dumps(session, indent=2, ensure_ascii=False), encoding="utf-8"
    )


def _is_retryable_upload_error(error: Exception) -> bool:
    """Retry only transient presigned PUT failures so bad URLs and expired jobs still surface clearly."""
    if isinstance(error, (httpx.TimeoutException, httpx.NetworkError)):
        return True
    if isinstance(error, httpx.HTTPStatusError):
        return error.response.status_code == 429 or error.response.status_code >= 500
    return False


def _find_local_file(
    prepared_upload: PreparedGroupUpload,
    frame_order: int,
    slot: str,
    variant: str,
) -> PreparedUploadFile:
    """Resolve one signed upload target back to the prepared local file for that frame and slot."""
    for frame in prepared_upload.frames:
        if frame.order != frame_order:
            continue
        for asset in frame.assets:
            if asset.slot != slot:
                continue
            if variant == "original":
                return asset.original
            if variant == "thumbnail":
                return asset.thumbnail
            break
    raise ValueError(f"无法在本地上传计划中找到 {frame_order}/{slot}/{variant}。")


def _original_asset_count(
    prepared_upload: PreparedGroupUpload, frame_order: int
) -> int:
    """Count original assets only, because the CLI progress bar tracks human-visible frame media uploads."""
    for frame in prepared_upload.frames:
        if frame.order == frame_order:
            return len(frame.assets)
    return 0


def _execute_one_file_upload(
    frame_order: int,
    file_payload: dict,
    prepared_upload: PreparedGroupUpload,
) -> tuple[str, str | None, int]:
    """Upload one presigned file with bounded retries and return ``(status, error, retried_count)``."""
    local_file = _find_local_file(
        prepared_upload,
        frame_order,
        str(file_payload["slot"]),
        str(file_payload["variant"]),
    )
    last_error: str | None = None
    retried = 0

    for attempt in range(1, MAX_UPLOAD_ATTEMPTS + 1):
        try:
            upload_file_to_presigned_url(
                local_file.source_path,
                upload_url=str(file_payload["uploadUrl"]),
                content_type=str(file_payload["contentType"]),
            )
            return "uploaded", None, retried
        except Exception as error:  # pragma: no cover - exercised by tests via mocks
            last_error = str(error)
            if attempt < MAX_UPLOAD_ATTEMPTS and _is_retryable_upload_error(error):
                retried += 1
                continue
            return "failed", last_error, retried

    return "failed", last_error, retried  # pragma: no cover


def _create_runtime_state(
    plan: PreparedCasePlan,
    config: UploaderConfig,
    thumbnail_dir: Path,
    *,
    reset_session: bool,
    started_at: float,
) -> UploadRuntimeState:
    """Prepare thumbnails, start or resume the remote job, and initialize the local session file."""
    prepared_upload = build_group_upload_from_case(plan.case_source, thumbnail_dir)
    start_payload = dict(prepared_upload.start_payload)
    if reset_session:
        start_payload["forceRestart"] = True

    start_result = start_group_upload(config, start_payload)
    session_path = session_file_path(plan.case_root)
    session = _empty_session(start_result, prepared_upload)
    _write_session(session_path, session)

    return UploadRuntimeState(
        config=config,
        prepared_upload=prepared_upload,
        start_result=start_result,
        session_path=session_path,
        session=session,
        started_at=started_at,
    )


def _frame_states_by_order(start_result: dict) -> dict[int, str]:
    """Normalize frame state lookups by order so resume logic never depends on API list ordering."""
    return {
        int(frame_state["frameOrder"]): str(frame_state["status"])
        for frame_state in start_result.get("frameStates", [])
    }


def _ensure_frame_session(
    runtime: UploadRuntimeState,
    frame_order: int,
    frame_title: str,
    frame_state: str,
) -> dict:
    """Reuse or initialize one frame session record so every subsequent step updates a single object."""
    return runtime.session["frames"].setdefault(
        str(frame_order),
        {
            "title": frame_title,
            "status": frame_state,
            "pendingPrefix": None,
            "lastError": None,
        },
    )


def _advance_original_progress(
    on_progress: Callable[[], None] | None,
    original_count: int,
) -> None:
    """Advance the progress bar once per original asset so resumed frames look consistent with fresh uploads."""
    if on_progress is None:
        return

    for _ in range(original_count):
        on_progress()


def _mark_frame_as_resumed(context: FrameUploadContext) -> None:
    """Record a previously committed frame locally and mirror its original-asset count into the CLI progress bar."""
    original_count = _original_asset_count(
        context.runtime.prepared_upload, context.frame_order
    )
    context.runtime.skipped_count += original_count * 2
    context.frame_session["status"] = "committed"
    _write_session(context.runtime.session_path, context.runtime.session)
    _advance_original_progress(
        context.on_progress,
        original_count,
    )


def _prepare_frame_upload(context: FrameUploadContext) -> dict:
    """Request fresh presigned URLs for one frame and persist the pending prefix before uploads start."""
    prepared_frame = prepare_group_upload_frame(
        context.runtime.config,
        context.runtime.start_result["groupUploadJobId"],
        context.frame_order,
    )
    context.frame_session["status"] = "prepared"
    context.frame_session["pendingPrefix"] = prepared_frame.get("pendingPrefix")
    context.frame_session["lastError"] = None
    _write_session(context.runtime.session_path, context.runtime.session)
    return prepared_frame


def _record_file_upload_result(
    context: FrameUploadContext,
    file_payload: dict,
    status: str,
    error: str | None,
    retried: int,
) -> None:
    """Aggregate per-file upload outcomes into the shared runtime counters and session state."""
    with context.runtime.lock:
        context.runtime.retried_count += retried
        if status == "failed":
            context.runtime.failures.append(
                UploadFailure(
                    operation_id=(
                        f"{context.frame_order}:{file_payload['slot']}:{file_payload['variant']}"
                    ),
                    target_url=str(file_payload["logicalPath"]),
                    message=error or "unknown error",
                )
            )
            context.frame_session["lastError"] = error
            return

        context.runtime.uploaded_count += 1

    if (
        status == "uploaded"
        and context.on_progress is not None
        and str(file_payload["variant"]) == "original"
    ):
        context.on_progress()


def _upload_prepared_frame_files(
    context: FrameUploadContext,
    prepared_frame: dict,
    max_workers: int,
) -> None:
    """Upload every presigned file for one frame in parallel and fold the results back into the runtime state."""
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        future_to_file = {
            executor.submit(
                _execute_one_file_upload,
                context.frame_order,
                file_payload,
                context.runtime.prepared_upload,
            ): file_payload
            for file_payload in prepared_frame.get("files", [])
        }

        for future in as_completed(future_to_file):
            file_payload = future_to_file[future]
            status, error, retried = future.result()
            _record_file_upload_result(
                context,
                file_payload,
                status,
                error,
                retried,
            )


def _build_failure_summary(runtime: UploadRuntimeState) -> UploadExecutionSummary:
    """Return a consistent failure result whenever upload or commit stops the orchestration early."""
    return UploadExecutionSummary(
        uploaded_count=runtime.uploaded_count,
        skipped_count=runtime.skipped_count,
        failed_count=len(runtime.failures),
        retried_count=runtime.retried_count,
        duration_seconds=time.monotonic() - runtime.started_at,
        session_path=runtime.session_path,
        failures=runtime.failures,
        completion_result=None,
    )


def _mark_frame_commit_failure(
    context: FrameUploadContext,
    prepared_frame: dict,
    error: Exception,
) -> UploadExecutionSummary:
    """Persist commit failures like upload failures so the next retry starts from a fully inspectable session state."""
    context.frame_session["status"] = "failed"
    context.frame_session["lastError"] = str(error)
    _write_session(context.runtime.session_path, context.runtime.session)
    context.runtime.failures.append(
        UploadFailure(
            operation_id=f"{context.frame_order}:commit",
            target_url=str(prepared_frame.get("pendingPrefix", "")),
            message=str(error),
        )
    )
    return _build_failure_summary(context.runtime)


def _commit_frame_upload(
    context: FrameUploadContext,
    prepared_frame: dict,
) -> UploadExecutionSummary | None:
    """Commit one fully uploaded frame and persist the session counters before the next frame starts."""
    try:
        commit_group_upload_frame(
            context.runtime.config,
            context.runtime.start_result["groupUploadJobId"],
            context.frame_order,
        )
    except Exception as error:
        return _mark_frame_commit_failure(context, prepared_frame, error)

    context.frame_session["status"] = "committed"
    context.frame_session["pendingPrefix"] = None
    context.frame_session["lastError"] = None
    context.runtime.session["committedFrameCount"] = (
        int(context.runtime.session["committedFrameCount"]) + 1
    )
    _write_session(context.runtime.session_path, context.runtime.session)
    return None


def _execute_frame_upload(
    context: FrameUploadContext,
    frame_state: str,
    max_workers: int,
) -> UploadExecutionSummary | None:
    """Execute one frame's resume, prepare, upload, and commit path as a single orchestration step."""
    if frame_state == "committed":
        _mark_frame_as_resumed(context)
        return None

    prepared_frame = _prepare_frame_upload(context)
    _upload_prepared_frame_files(context, prepared_frame, max_workers)

    if context.runtime.failures:
        context.frame_session["status"] = "failed"
        _write_session(context.runtime.session_path, context.runtime.session)
        return _build_failure_summary(context.runtime)

    return _commit_frame_upload(context, prepared_frame)


def _complete_upload(runtime: UploadRuntimeState) -> UploadExecutionSummary:
    """Finalize the remote group job and write the server completion payload back into the local session file."""
    completion_result = complete_group_upload(
        runtime.config, runtime.start_result["groupUploadJobId"]
    )
    runtime.session["result"] = completion_result
    _write_session(runtime.session_path, runtime.session)
    return UploadExecutionSummary(
        uploaded_count=runtime.uploaded_count,
        skipped_count=runtime.skipped_count,
        failed_count=0,
        retried_count=runtime.retried_count,
        duration_seconds=time.monotonic() - runtime.started_at,
        session_path=runtime.session_path,
        failures=[],
        completion_result=completion_result,
    )


def execute_upload_plan(
    plan: PreparedCasePlan,
    config: UploaderConfig,
    *,
    reset_session: bool = False,
    on_progress: Callable[[], None] | None = None,
    max_workers: int = _DEFAULT_MAX_WORKERS,
) -> UploadExecutionSummary:
    """Execute one group-scoped upload plan by letting internal-site approve, sign, and commit each frame."""
    if plan.report.status == "error":
        raise RuntimeError("当前计划存在阻塞错误，无法执行上传。")

    started_at = time.monotonic()

    with TemporaryDirectory(prefix="magic-compare-frame-upload-") as thumbnail_dir:
        runtime = _create_runtime_state(
            plan,
            config,
            Path(thumbnail_dir),
            reset_session=reset_session,
            started_at=started_at,
        )
        frame_states = _frame_states_by_order(runtime.start_result)

        for frame in sorted(runtime.prepared_upload.frames, key=lambda item: item.order):
            frame_state = frame_states.get(frame.order, "pending")
            frame_session = _ensure_frame_session(
                runtime, frame.order, frame.title, frame_state
            )
            frame_context = FrameUploadContext(
                runtime=runtime,
                frame_order=frame.order,
                frame_session=frame_session,
                on_progress=on_progress,
            )
            commit_failure = _execute_frame_upload(
                frame_context, frame_state, max_workers
            )
            if commit_failure is not None:
                return commit_failure

        return _complete_upload(runtime)
