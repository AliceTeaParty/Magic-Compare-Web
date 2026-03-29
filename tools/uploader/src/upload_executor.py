from __future__ import annotations

import json
import threading
import time
from collections.abc import Callable
from concurrent.futures import Future, ThreadPoolExecutor, as_completed
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
    PreparedUploadFrame,
    build_group_upload_from_case,
)
from .plan import PreparedCasePlan
from .storage import create_upload_http_client, upload_file_to_presigned_url

MAX_UPLOAD_ATTEMPTS = 3
_DEFAULT_MAX_WORKERS = 6
_LOOKAHEAD_MAX_AGE_SECONDS = 60 * 8


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
    uploaded_count: int = 0
    skipped_count: int = 0
    retried_count: int = 0
    completed_frames: int = 0
    failures: list[UploadFailure] = field(default_factory=list)
    lock: threading.Lock = field(default_factory=threading.Lock)


@dataclass(frozen=True)
class FrameUploadContext:
    runtime: UploadRuntimeState
    frame_order: int
    frame_title: str
    frame_session: dict
    on_progress_event: Callable[[UploadProgressEvent], None] | None = None


@dataclass(frozen=True)
class PreparedFrameCache:
    frame_order: int
    frame_title: str
    prepared_frame: dict[str, Any]
    prepared_at: float


@dataclass(frozen=True)
class PendingLookaheadPrepare:
    frame_order: int
    frame_title: str
    future: Future[PreparedFrameCache]


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


def _frame_file_count(
    prepared_upload: PreparedGroupUpload, frame_order: int
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

    on_progress_event(
        UploadProgressEvent(
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
        )
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


def _create_runtime_state(
    plan: PreparedCasePlan,
    config: UploaderConfig,
    thumbnail_dir: Path,
    upload_client: httpx.Client,
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
        upload_client=upload_client,
        total_frames=len(prepared_upload.frames),
        total_files=_total_upload_file_count(prepared_upload),
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


def _mark_frame_as_resumed(context: FrameUploadContext) -> None:
    """Record a resumed frame as completed work so file progress jumps over already-committed revisions."""
    context.runtime.skipped_count += _frame_file_count(
        context.runtime.prepared_upload,
        context.frame_order,
    )
    context.runtime.completed_frames += 1
    context.frame_session["status"] = "committed"
    _write_session(context.runtime.session_path, context.runtime.session)
    _emit_progress_event(
        context.runtime,
        "frame_resumed",
        "complete",
        context.on_progress_event,
        frame_order=context.frame_order,
        frame_title=context.frame_title,
    )


def _request_frame_prepare(runtime: UploadRuntimeState, frame_order: int) -> dict[str, Any]:
    """Ask internal-site to sign one frame's URLs without mutating local session state yet."""
    return prepare_group_upload_frame(
        runtime.config,
        runtime.start_result["groupUploadJobId"],
        frame_order,
    )


def _activate_prepared_frame(
    context: FrameUploadContext,
    prepared_frame: dict[str, Any],
) -> dict[str, Any]:
    """Persist the frame's active pending prefix only when the uploader is about to consume it."""
    context.frame_session["status"] = "prepared"
    context.frame_session["pendingPrefix"] = prepared_frame.get("pendingPrefix")
    context.frame_session["lastError"] = None
    _write_session(context.runtime.session_path, context.runtime.session)
    _emit_progress_event(
        context.runtime,
        "frame_prepared",
        "prepare",
        context.on_progress_event,
        frame_order=context.frame_order,
        frame_title=context.frame_title,
    )
    return prepared_frame


def _prepare_lookahead_frame(
    runtime: UploadRuntimeState,
    frame: PreparedUploadFrame,
) -> PreparedFrameCache:
    """Prepare at most one upcoming frame in the background so the next iteration can often skip prepare latency."""
    return PreparedFrameCache(
        frame_order=frame.order,
        frame_title=frame.title,
        prepared_frame=_request_frame_prepare(runtime, frame.order),
        prepared_at=time.monotonic(),
    )


def _resolve_prepared_frame(
    context: FrameUploadContext,
    cached_prepared_frame: PreparedFrameCache | None,
) -> dict[str, Any]:
    """Reuse a fresh lookahead prepare when available; otherwise request a new frame prepare synchronously."""
    prepared_frame: dict[str, Any]
    if (
        cached_prepared_frame
        and cached_prepared_frame.frame_order == context.frame_order
        and time.monotonic() - cached_prepared_frame.prepared_at
        <= _LOOKAHEAD_MAX_AGE_SECONDS
    ):
        prepared_frame = cached_prepared_frame.prepared_frame
    else:
        prepared_frame = _request_frame_prepare(context.runtime, context.frame_order)

    return _activate_prepared_frame(context, prepared_frame)


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
            _emit_progress_event(
                context.runtime,
                "file_failed",
                "upload",
                context.on_progress_event,
                frame_order=context.frame_order,
                frame_title=context.frame_title,
            )
            return

        context.runtime.uploaded_count += 1
        _emit_progress_event(
            context.runtime,
            "file_uploaded",
            "upload",
            context.on_progress_event,
            frame_order=context.frame_order,
            frame_title=context.frame_title,
        )


def _upload_prepared_frame_files(
    context: FrameUploadContext,
    prepared_frame: dict,
    max_workers: int,
) -> None:
    """Upload every presigned file for one frame in parallel and fold the results back into the runtime state."""
    file_count = len(prepared_frame.get("files", []))
    worker_count = _resolve_file_worker_count(max_workers, file_count)

    with ThreadPoolExecutor(max_workers=worker_count) as executor:
        future_to_file = {
            executor.submit(
                _execute_one_file_upload,
                context.runtime.upload_client,
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


def _resolve_file_worker_count(max_workers: int, file_count: int) -> int:
    """Cap worker count by the current frame's file count so tiny frames do not create idle upload threads."""
    return max(1, min(max_workers, file_count or 1))


def _find_next_pending_frame(
    frames: list[PreparedUploadFrame],
    frame_states: dict[int, str],
    current_index: int,
) -> PreparedUploadFrame | None:
    """Look ahead to the next non-committed frame so upload can overlap with one prepare call."""
    for frame in frames[current_index + 1 :]:
        if frame_states.get(frame.order, "pending") != "committed":
            return frame
    return None


def _schedule_lookahead_prepare(
    runtime: UploadRuntimeState,
    next_pending_frame: PreparedUploadFrame | None,
    current_lookahead: PendingLookaheadPrepare | None,
    lookahead_executor: ThreadPoolExecutor,
) -> PendingLookaheadPrepare | None:
    """Keep at most one future prepare in flight so the next frame can often skip synchronous prepare latency."""
    if current_lookahead is not None or next_pending_frame is None:
        return current_lookahead

    return PendingLookaheadPrepare(
        frame_order=next_pending_frame.order,
        frame_title=next_pending_frame.title,
        future=lookahead_executor.submit(
            _prepare_lookahead_frame,
            runtime,
            next_pending_frame,
        ),
    )


def _consume_matching_lookahead(
    context: FrameUploadContext,
    current_lookahead: PendingLookaheadPrepare | None,
) -> tuple[
    PreparedFrameCache | None,
    PendingLookaheadPrepare | None,
    UploadExecutionSummary | None,
]:
    """Only consume a cached prepare when it belongs to the frame now entering upload."""
    if current_lookahead is None:
        return None, None, None

    if current_lookahead.frame_order != context.frame_order:
        return None, current_lookahead, None

    try:
        return current_lookahead.future.result(), None, None
    except Exception as error:
        return None, None, _mark_frame_prepare_failure(context, error)


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


def _mark_frame_prepare_failure(
    context: FrameUploadContext,
    error: Exception,
) -> UploadExecutionSummary:
    """Persist prepare failures so lookahead errors stop the job with the same resumable session shape as other failures."""
    context.frame_session["status"] = "failed"
    context.frame_session["lastError"] = str(error)
    _write_session(context.runtime.session_path, context.runtime.session)
    context.runtime.failures.append(
        UploadFailure(
            operation_id=f"{context.frame_order}:prepare",
            target_url=str(context.frame_session.get("pendingPrefix") or ""),
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
    context.runtime.completed_frames += 1
    context.runtime.session["committedFrameCount"] = (
        int(context.runtime.session["committedFrameCount"]) + 1
    )
    _write_session(context.runtime.session_path, context.runtime.session)
    _emit_progress_event(
        context.runtime,
        "frame_committed",
        "commit",
        context.on_progress_event,
        frame_order=context.frame_order,
        frame_title=context.frame_title,
    )
    return None


def _execute_frame_upload(
    context: FrameUploadContext,
    frame_state: str,
    max_workers: int,
    cached_lookahead: PreparedFrameCache | None,
    next_pending_frame: PreparedUploadFrame | None,
    current_lookahead: PendingLookaheadPrepare | None,
    lookahead_executor: ThreadPoolExecutor,
) -> tuple[UploadExecutionSummary | None, PendingLookaheadPrepare | None]:
    """Execute one frame's resume, prepare, upload, and commit path as a single orchestration step."""
    if frame_state == "committed":
        _mark_frame_as_resumed(context)
        return (
            None,
            _schedule_lookahead_prepare(
                context.runtime,
                next_pending_frame,
                current_lookahead,
                lookahead_executor,
            ),
        )

    prepared_frame = _resolve_prepared_frame(context, cached_lookahead)
    next_lookahead = _schedule_lookahead_prepare(
        context.runtime,
        next_pending_frame,
        current_lookahead,
        lookahead_executor,
    )
    _upload_prepared_frame_files(context, prepared_frame, max_workers)

    if context.runtime.failures:
        context.frame_session["status"] = "failed"
        _write_session(context.runtime.session_path, context.runtime.session)
        return _build_failure_summary(context.runtime), next_lookahead

    return _commit_frame_upload(context, prepared_frame), next_lookahead


def _complete_upload(
    runtime: UploadRuntimeState,
    on_progress_event: Callable[[UploadProgressEvent], None] | None,
) -> UploadExecutionSummary:
    """Finalize the remote group job and write the server completion payload back into the local session file."""
    completion_result = complete_group_upload(
        runtime.config, runtime.start_result["groupUploadJobId"]
    )
    runtime.session["result"] = completion_result
    _write_session(runtime.session_path, runtime.session)
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


def execute_upload_plan(
    plan: PreparedCasePlan,
    config: UploaderConfig,
    *,
    reset_session: bool = False,
    on_progress_event: Callable[[UploadProgressEvent], None] | None = None,
    max_workers: int = _DEFAULT_MAX_WORKERS,
) -> UploadExecutionSummary:
    """Execute one group-scoped upload plan by letting internal-site approve, sign, and commit each frame."""
    if plan.report.status == "error":
        raise RuntimeError("当前计划存在阻塞错误，无法执行上传。")

    started_at = time.monotonic()

    with (
        TemporaryDirectory(prefix="magic-compare-frame-upload-") as thumbnail_dir,
        create_upload_http_client() as upload_client,
        ThreadPoolExecutor(max_workers=1) as lookahead_executor,
    ):
        runtime = _create_runtime_state(
            plan,
            config,
            Path(thumbnail_dir),
            upload_client,
            reset_session=reset_session,
            started_at=started_at,
        )
        frame_states = _frame_states_by_order(runtime.start_result)
        sorted_frames = sorted(runtime.prepared_upload.frames, key=lambda item: item.order)
        pending_lookahead: PendingLookaheadPrepare | None = None

        _emit_progress_event(
            runtime,
            "job_started",
            "prepare",
            on_progress_event,
        )

        for index, frame in enumerate(sorted_frames):
            frame_state = frame_states.get(frame.order, "pending")
            frame_session = _ensure_frame_session(
                runtime, frame.order, frame.title, frame_state
            )
            frame_context = FrameUploadContext(
                runtime=runtime,
                frame_order=frame.order,
                frame_title=frame.title,
                frame_session=frame_session,
                on_progress_event=on_progress_event,
            )
            (
                cached_lookahead,
                pending_lookahead,
                lookahead_failure,
            ) = _consume_matching_lookahead(
                frame_context,
                pending_lookahead,
            )
            if lookahead_failure is not None:
                return lookahead_failure
            next_pending_frame = _find_next_pending_frame(
                sorted_frames,
                frame_states,
                index,
            )
            commit_failure, pending_lookahead = _execute_frame_upload(
                frame_context,
                frame_state,
                max_workers,
                cached_lookahead,
                next_pending_frame,
                pending_lookahead,
                lookahead_executor,
            )
            if commit_failure is not None:
                return commit_failure

        return _complete_upload(runtime, on_progress_event)
