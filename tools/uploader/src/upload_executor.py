from __future__ import annotations

import json
import threading
import time
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass, field
from pathlib import Path
from tempfile import TemporaryDirectory
from typing import Any

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
from .storage import create_upload_http_client, upload_file_to_presigned_url

MAX_UPLOAD_ATTEMPTS = 3
MAX_FRAME_OPERATION_ATTEMPTS = 5
DEFAULT_FILE_WORKERS = 6
MAX_FRAME_WORKERS = 8
RETRY_BASE_DELAY_SECONDS = 0.35


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


@dataclass(frozen=True)
class UploadProgressEvent:
    kind: str
    stage: str
    frame_order: int | None
    frame_title: str | None
    completed_frames: int
    total_frames: int
    completed_files: int
    total_files: int
    skipped_files: int
    retried_count: int
    failed_count: int
    active_frames: int
    frame_workers: int


@dataclass
class UploadRuntimeState:
    config: UploaderConfig
    prepared_upload: PreparedGroupUpload
    start_result: dict
    session_path: Path
    session: dict
    started_at: float
    upload_client: httpx.Client
    total_frames: int
    total_files: int
    frame_workers: int
    uploaded_count: int = 0
    skipped_count: int = 0
    retried_count: int = 0
    completed_frames: int = 0
    failures: list[UploadFailure] = field(default_factory=list)
    active_frame_orders: set[int] = field(default_factory=set)
    lock: threading.RLock = field(default_factory=threading.RLock)


@dataclass(frozen=True)
class FrameUploadContext:
    runtime: UploadRuntimeState
    frame_order: int
    frame_title: str
    frame_session: dict
    on_progress_event: Callable[[UploadProgressEvent], None] | None = None


@dataclass(frozen=True)
class FrameUploadOutcome:
    frame_order: int
    frame_title: str
    prepared_frame: dict[str, Any] | None
    succeeded: bool


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


def _write_session_locked(runtime: UploadRuntimeState) -> None:
    """Write the shared session only while holding the runtime lock so concurrent frame workers never interleave JSON writes."""
    _write_session(runtime.session_path, runtime.session)


def _is_retryable_upload_error(error: Exception) -> bool:
    """Retry only transient network or upstream failures, even when API helpers wrap them in RuntimeError."""
    candidates: list[BaseException] = [error]
    cause = getattr(error, "__cause__", None)
    if cause is not None:
        candidates.append(cause)

    for candidate in candidates:
        if isinstance(candidate, (httpx.TimeoutException, httpx.NetworkError)):
            return True
        if isinstance(candidate, httpx.HTTPStatusError):
            return (
                candidate.response.status_code == 429
                or candidate.response.status_code >= 500
            )

    return False


def _retry_upload_operation(
    operation: Callable[[], Any],
    *,
    max_attempts: int,
    runtime: UploadRuntimeState,
) -> Any:
    """Retry transient frame-control operations so short network stalls do not waste an entire sync run."""
    for attempt in range(1, max_attempts + 1):
        try:
            return operation()
        except Exception as error:
            if attempt >= max_attempts or not _is_retryable_upload_error(error):
                raise
            with runtime.lock:
                runtime.retried_count += 1
            time.sleep(RETRY_BASE_DELAY_SECONDS * attempt)

    raise RuntimeError("unexpected retry loop exit")  # pragma: no cover


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


def _frame_file_count(
    prepared_upload: PreparedGroupUpload,
    frame_order: int,
) -> int:
    """Count every direct-upload object for one frame because progress is tracked in file units."""
    for frame in prepared_upload.frames:
        if frame.order == frame_order:
            return len(frame.assets) * 2
    return 0


def _total_upload_file_count(prepared_upload: PreparedGroupUpload) -> int:
    """File-level progress counts originals and thumbnails because both consume upload time and retries."""
    return sum(len(frame.assets) * 2 for frame in prepared_upload.frames)


def _completed_file_count(runtime: UploadRuntimeState) -> int:
    """Completed file progress includes uploads and resumed/skipped files but excludes failed attempts."""
    return runtime.uploaded_count + runtime.skipped_count


def _emit_progress_event(
    runtime: UploadRuntimeState,
    kind: str,
    stage: str,
    on_progress_event: Callable[[UploadProgressEvent], None] | None,
    *,
    frame_order: int | None = None,
    frame_title: str | None = None,
) -> None:
    """Emit one immutable snapshot so the wizard can render progress without inspecting runtime internals."""
    if on_progress_event is None:
        return

    with runtime.lock:
        event = UploadProgressEvent(
            kind=kind,
            stage=stage,
            frame_order=frame_order,
            frame_title=frame_title,
            completed_frames=runtime.completed_frames,
            total_frames=runtime.total_frames,
            completed_files=_completed_file_count(runtime),
            total_files=runtime.total_files,
            skipped_files=runtime.skipped_count,
            retried_count=runtime.retried_count,
            failed_count=len(runtime.failures),
            active_frames=len(runtime.active_frame_orders),
            frame_workers=runtime.frame_workers,
        )

    on_progress_event(event)


def _append_failure(
    runtime: UploadRuntimeState,
    *,
    operation_id: str,
    target_url: str,
    message: str,
) -> None:
    """Centralize failure aggregation so summary counts and persisted session state stay aligned."""
    runtime.failures.append(
        UploadFailure(
            operation_id=operation_id,
            target_url=target_url,
            message=message,
        )
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
    with runtime.lock:
        return runtime.session["frames"].setdefault(
            str(frame_order),
            {
                "title": frame_title,
                "status": frame_state,
                "pendingPrefix": None,
                "lastError": None,
            },
        )


def _mark_frame_as_resumed(context: FrameUploadContext) -> None:
    """Record a resumed frame as completed work so file progress jumps over already-committed revisions."""
    with context.runtime.lock:
        context.runtime.skipped_count += _frame_file_count(
            context.runtime.prepared_upload,
            context.frame_order,
        )
        context.runtime.completed_frames += 1
        context.frame_session["status"] = "committed"
        context.frame_session["pendingPrefix"] = None
        context.frame_session["lastError"] = None
        _write_session_locked(context.runtime)

    _emit_progress_event(
        context.runtime,
        "frame_resumed",
        "complete",
        context.on_progress_event,
        frame_order=context.frame_order,
        frame_title=context.frame_title,
    )


def _set_frame_active(context: FrameUploadContext, is_active: bool) -> None:
    """Track running frame workers so the wizard can show real parallelism instead of a fake single-frame cursor."""
    with context.runtime.lock:
        if is_active:
            context.runtime.active_frame_orders.add(context.frame_order)
        else:
            context.runtime.active_frame_orders.discard(context.frame_order)

    if is_active:
        _emit_progress_event(
            context.runtime,
            "frame_started",
            "prepare",
            context.on_progress_event,
            frame_order=context.frame_order,
            frame_title=context.frame_title,
        )


def _request_frame_prepare(runtime: UploadRuntimeState, frame_order: int) -> dict[str, Any]:
    """Ask internal-site to sign one frame's URLs without mutating local session state yet."""
    return _retry_upload_operation(
        lambda: prepare_group_upload_frame(
            runtime.config,
            runtime.start_result["groupUploadJobId"],
            frame_order,
        ),
        max_attempts=MAX_FRAME_OPERATION_ATTEMPTS,
        runtime=runtime,
    )


def _mark_frame_prepared(
    context: FrameUploadContext,
    prepared_frame: dict[str, Any],
) -> None:
    """Persist the frame's active pending prefix only when the uploader is about to consume it."""
    with context.runtime.lock:
        context.frame_session["status"] = "prepared"
        context.frame_session["pendingPrefix"] = prepared_frame.get("pendingPrefix")
        context.frame_session["lastError"] = None
        _write_session_locked(context.runtime)

    _emit_progress_event(
        context.runtime,
        "frame_prepared",
        "prepare",
        context.on_progress_event,
        frame_order=context.frame_order,
        frame_title=context.frame_title,
    )


def _execute_one_file_upload(
    upload_client: httpx.Client,
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
                client=upload_client,
            )
            return "uploaded", None, retried
        except Exception as error:  # pragma: no cover - exercised by tests via mocks
            last_error = str(error)
            if attempt < MAX_UPLOAD_ATTEMPTS and _is_retryable_upload_error(error):
                retried += 1
                continue
            return "failed", last_error, retried

    return "failed", last_error, retried  # pragma: no cover


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
            _append_failure(
                context.runtime,
                operation_id=(
                    f"{context.frame_order}:{file_payload['slot']}:{file_payload['variant']}"
                ),
                target_url=str(file_payload["logicalPath"]),
                message=error or "unknown error",
            )
            context.frame_session["lastError"] = error
            _write_session_locked(context.runtime)
        else:
            context.runtime.uploaded_count += 1

    _emit_progress_event(
        context.runtime,
        "file_failed" if status == "failed" else "file_uploaded",
        "upload",
        context.on_progress_event,
        frame_order=context.frame_order,
        frame_title=context.frame_title,
    )


def _upload_prepared_frame_files(
    context: FrameUploadContext,
    prepared_frame: dict,
) -> bool:
    """Upload every presigned file for one frame in parallel and report whether any object ultimately failed."""
    file_payloads = prepared_frame.get("files", [])
    if not file_payloads:
        return False

    had_failure = False
    worker_count = max(1, min(DEFAULT_FILE_WORKERS, len(file_payloads)))

    with ThreadPoolExecutor(max_workers=worker_count) as executor:
        future_to_file = {
            executor.submit(
                _execute_one_file_upload,
                context.runtime.upload_client,
                context.frame_order,
                file_payload,
                context.runtime.prepared_upload,
            ): file_payload
            for file_payload in file_payloads
        }

        for future in as_completed(future_to_file):
            file_payload = future_to_file[future]
            status, error, retried = future.result()
            if status == "failed":
                had_failure = True
            _record_file_upload_result(
                context,
                file_payload,
                status,
                error,
                retried,
            )

    return had_failure


def _mark_frame_prepare_failure(
    context: FrameUploadContext,
    error: Exception,
) -> None:
    """Persist prepare failures so retries stop with the same resumable session shape as other failures."""
    with context.runtime.lock:
        context.frame_session["status"] = "failed"
        context.frame_session["lastError"] = str(error)
        _append_failure(
            context.runtime,
            operation_id=f"{context.frame_order}:prepare",
            target_url=str(context.frame_session.get("pendingPrefix") or ""),
            message=str(error),
        )
        _write_session_locked(context.runtime)

    _emit_progress_event(
        context.runtime,
        "frame_failed",
        "prepare",
        context.on_progress_event,
        frame_order=context.frame_order,
        frame_title=context.frame_title,
    )


def _mark_frame_upload_failure(context: FrameUploadContext) -> None:
    """Mark a frame failed after its file workers finish so retries resume from the last incomplete frame boundary."""
    with context.runtime.lock:
        context.frame_session["status"] = "failed"
        _write_session_locked(context.runtime)

    _emit_progress_event(
        context.runtime,
        "frame_failed",
        "upload",
        context.on_progress_event,
        frame_order=context.frame_order,
        frame_title=context.frame_title,
    )


def _mark_frame_commit_failure(
    context: FrameUploadContext,
    prepared_frame: dict,
    error: Exception,
) -> None:
    """Persist commit failures like upload failures so the next retry starts from a fully inspectable session state."""
    with context.runtime.lock:
        context.frame_session["status"] = "failed"
        context.frame_session["lastError"] = str(error)
        _append_failure(
            context.runtime,
            operation_id=f"{context.frame_order}:commit",
            target_url=str(prepared_frame.get("pendingPrefix", "")),
            message=str(error),
        )
        _write_session_locked(context.runtime)

    _emit_progress_event(
        context.runtime,
        "frame_failed",
        "commit",
        context.on_progress_event,
        frame_order=context.frame_order,
        frame_title=context.frame_title,
    )


def _prepare_and_upload_frame(context: FrameUploadContext) -> FrameUploadOutcome:
    """Run one frame through prepare and direct-to-storage upload in a worker thread, but leave commit to the main thread."""
    _set_frame_active(context, True)
    try:
        prepared_frame = _request_frame_prepare(context.runtime, context.frame_order)
        _mark_frame_prepared(context, prepared_frame)

        if _upload_prepared_frame_files(context, prepared_frame):
            _mark_frame_upload_failure(context)
            return FrameUploadOutcome(
                frame_order=context.frame_order,
                frame_title=context.frame_title,
                prepared_frame=None,
                succeeded=False,
            )

        return FrameUploadOutcome(
            frame_order=context.frame_order,
            frame_title=context.frame_title,
            prepared_frame=prepared_frame,
            succeeded=True,
        )
    except Exception as error:
        _mark_frame_prepare_failure(context, error)
        return FrameUploadOutcome(
            frame_order=context.frame_order,
            frame_title=context.frame_title,
            prepared_frame=None,
            succeeded=False,
        )
    finally:
        _set_frame_active(context, False)


def _commit_frame_upload(
    context: FrameUploadContext,
    prepared_frame: dict,
) -> None:
    """Commit one fully uploaded frame serially so SQLite writes stay controlled even when uploads run in parallel."""
    try:
        _retry_upload_operation(
            lambda: commit_group_upload_frame(
                context.runtime.config,
                context.runtime.start_result["groupUploadJobId"],
                context.frame_order,
            ),
            max_attempts=MAX_FRAME_OPERATION_ATTEMPTS,
            runtime=context.runtime,
        )
    except Exception as error:
        _mark_frame_commit_failure(context, prepared_frame, error)
        return

    with context.runtime.lock:
        context.frame_session["status"] = "committed"
        context.frame_session["pendingPrefix"] = None
        context.frame_session["lastError"] = None
        context.runtime.completed_frames += 1
        context.runtime.session["committedFrameCount"] = (
            int(context.runtime.session["committedFrameCount"]) + 1
        )
        _write_session_locked(context.runtime)

    _emit_progress_event(
        context.runtime,
        "frame_committed",
        "commit",
        context.on_progress_event,
        frame_order=context.frame_order,
        frame_title=context.frame_title,
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


def _complete_upload(
    runtime: UploadRuntimeState,
    on_progress_event: Callable[[UploadProgressEvent], None] | None,
) -> UploadExecutionSummary:
    """Finalize the remote group job and write the server completion payload back into the local session file."""
    completion_result = _retry_upload_operation(
        lambda: complete_group_upload(
            runtime.config,
            runtime.start_result["groupUploadJobId"],
        ),
        max_attempts=MAX_FRAME_OPERATION_ATTEMPTS,
        runtime=runtime,
    )
    with runtime.lock:
        runtime.session["result"] = completion_result
        _write_session_locked(runtime)

    summary = UploadExecutionSummary(
        uploaded_count=runtime.uploaded_count,
        skipped_count=runtime.skipped_count,
        failed_count=0,
        retried_count=runtime.retried_count,
        duration_seconds=time.monotonic() - runtime.started_at,
        session_path=runtime.session_path,
        failures=[],
        completion_result=completion_result,
    )
    _emit_progress_event(
        runtime,
        "job_completed",
        "complete",
        on_progress_event,
    )
    return summary


def _resolve_frame_worker_count(
    frame_workers: int | None,
    pending_frame_count: int,
) -> int:
    """Clamp explicit worker settings and otherwise adapt to the amount of unfinished work."""
    if frame_workers is not None:
        return max(1, min(MAX_FRAME_WORKERS, frame_workers))
    return max(1, min(MAX_FRAME_WORKERS, pending_frame_count or 1))


def _create_runtime_state(
    plan: PreparedCasePlan,
    config: UploaderConfig,
    thumbnail_dir: Path,
    upload_client: httpx.Client,
    *,
    reset_session: bool,
    started_at: float,
    frame_workers: int,
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
        upload_client=upload_client,
        total_frames=len(prepared_upload.frames),
        total_files=_total_upload_file_count(prepared_upload),
        frame_workers=frame_workers,
    )


def execute_upload_plan(
    plan: PreparedCasePlan,
    config: UploaderConfig,
    *,
    reset_session: bool = False,
    on_progress_event: Callable[[UploadProgressEvent], None] | None = None,
    frame_workers: int | None = None,
) -> UploadExecutionSummary:
    """Execute one group-scoped upload plan with frame-level parallel prepare/upload and serial commit."""
    if plan.report.status == "error":
        raise RuntimeError("当前计划存在阻塞错误，无法执行上传。")

    started_at = time.monotonic()

    with (
        TemporaryDirectory(prefix="magic-compare-frame-upload-") as thumbnail_dir,
        create_upload_http_client() as upload_client,
    ):
        runtime = _create_runtime_state(
            plan,
            config,
            Path(thumbnail_dir),
            upload_client,
            reset_session=reset_session,
            started_at=started_at,
            frame_workers=1,
        )
        frame_states = _frame_states_by_order(runtime.start_result)
        sorted_frames = sorted(runtime.prepared_upload.frames, key=lambda item: item.order)
        pending_frames = [
            frame
            for frame in sorted_frames
            if frame_states.get(frame.order, "pending") != "committed"
        ]
        runtime.frame_workers = _resolve_frame_worker_count(
            frame_workers,
            len(pending_frames),
        )

        _emit_progress_event(
            runtime,
            "job_started",
            "prepare",
            on_progress_event,
        )

        worker_contexts: dict[int, FrameUploadContext] = {}
        for frame in sorted_frames:
            frame_state = frame_states.get(frame.order, "pending")
            frame_session = _ensure_frame_session(
                runtime,
                frame.order,
                frame.title,
                frame_state,
            )
            context = FrameUploadContext(
                runtime=runtime,
                frame_order=frame.order,
                frame_title=frame.title,
                frame_session=frame_session,
                on_progress_event=on_progress_event,
            )
            worker_contexts[frame.order] = context
            if frame_state == "committed":
                _mark_frame_as_resumed(context)

        if pending_frames:
            with ThreadPoolExecutor(max_workers=runtime.frame_workers) as executor:
                future_to_frame = {
                    executor.submit(
                        _prepare_and_upload_frame,
                        worker_contexts[frame.order],
                    ): frame
                    for frame in pending_frames
                }

                for future in as_completed(future_to_frame):
                    outcome = future.result()
                    if not outcome.succeeded or outcome.prepared_frame is None:
                        continue
                    _commit_frame_upload(
                        worker_contexts[outcome.frame_order],
                        outcome.prepared_frame,
                    )

        if runtime.failures:
            return _build_failure_summary(runtime)

        return _complete_upload(runtime, on_progress_event)
