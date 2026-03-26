from __future__ import annotations

import json
import threading
import time
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
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
from .manifest import PreparedGroupUpload, PreparedUploadFile, build_group_upload_from_case
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


def session_file_path(case_root: Path) -> Path:
    return case_root / ".magic-compare" / "upload-session.json"


def _empty_session(start_result: dict, prepared_upload: PreparedGroupUpload) -> dict:
    now = time.time()
    frame_titles = {
        frame.order: frame.title for frame in prepared_upload.frames
    }
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


def _original_asset_count(prepared_upload: PreparedGroupUpload, frame_order: int) -> int:
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
    session_path = session_file_path(plan.case_root)

    with TemporaryDirectory(prefix="magic-compare-frame-upload-") as thumbnail_dir:
        prepared_upload = build_group_upload_from_case(
            plan.case_source, Path(thumbnail_dir)
        )
        start_payload = dict(prepared_upload.start_payload)
        if reset_session:
            start_payload["forceRestart"] = True

        start_result = start_group_upload(config, start_payload)
        session = _empty_session(start_result, prepared_upload)
        _write_session(session_path, session)

        uploaded_count = 0
        skipped_count = 0
        retried_count = 0
        failures: list[UploadFailure] = []
        lock = threading.Lock()

        frame_states = {
            int(frame_state["frameOrder"]): str(frame_state["status"])
            for frame_state in start_result.get("frameStates", [])
        }

        for frame in sorted(prepared_upload.frames, key=lambda item: item.order):
            frame_state = frame_states.get(frame.order, "pending")
            frame_session = session["frames"].setdefault(
                str(frame.order),
                {
                    "title": frame.title,
                    "status": frame_state,
                    "pendingPrefix": None,
                    "lastError": None,
                },
            )

            if frame_state == "committed":
                skipped_count += len(frame.assets) * 2
                frame_session["status"] = "committed"
                _write_session(session_path, session)
                if on_progress is not None:
                    for _ in range(_original_asset_count(prepared_upload, frame.order)):
                        on_progress()
                continue

            prepared_frame = prepare_group_upload_frame(
                config, start_result["groupUploadJobId"], frame.order
            )
            frame_session["status"] = "prepared"
            frame_session["pendingPrefix"] = prepared_frame.get("pendingPrefix")
            frame_session["lastError"] = None
            _write_session(session_path, session)

            def _handle_upload_result(
                file_payload: dict, status: str, error: str | None, retried: int
            ) -> None:
                nonlocal uploaded_count, retried_count
                with lock:
                    retried_count += retried
                    if status == "failed":
                        failures.append(
                            UploadFailure(
                                operation_id=(
                                    f"{frame.order}:{file_payload['slot']}:{file_payload['variant']}"
                                ),
                                target_url=str(file_payload["logicalPath"]),
                                message=error or "unknown error",
                            )
                        )
                        frame_session["lastError"] = error
                    else:
                        uploaded_count += 1

                if (
                    status == "uploaded"
                    and on_progress is not None
                    and str(file_payload["variant"]) == "original"
                ):
                    on_progress()

            with ThreadPoolExecutor(max_workers=max_workers) as executor:
                future_to_file = {
                    executor.submit(
                        _execute_one_file_upload,
                        frame.order,
                        file_payload,
                        prepared_upload,
                    ): file_payload
                    for file_payload in prepared_frame.get("files", [])
                }

                for future in as_completed(future_to_file):
                    file_payload = future_to_file[future]
                    status, error, retried = future.result()
                    _handle_upload_result(file_payload, status, error, retried)

            if failures:
                frame_session["status"] = "failed"
                _write_session(session_path, session)
                return UploadExecutionSummary(
                    uploaded_count=uploaded_count,
                    skipped_count=skipped_count,
                    failed_count=len(failures),
                    retried_count=retried_count,
                    duration_seconds=time.monotonic() - started_at,
                    session_path=session_path,
                    failures=failures,
                    completion_result=None,
                )

            try:
                commit_group_upload_frame(
                    config, start_result["groupUploadJobId"], frame.order
                )
            except Exception as error:
                frame_session["status"] = "failed"
                frame_session["lastError"] = str(error)
                _write_session(session_path, session)
                failures.append(
                    UploadFailure(
                        operation_id=f"{frame.order}:commit",
                        target_url=str(prepared_frame.get("pendingPrefix", "")),
                        message=str(error),
                    )
                )
                return UploadExecutionSummary(
                    uploaded_count=uploaded_count,
                    skipped_count=skipped_count,
                    failed_count=len(failures),
                    retried_count=retried_count,
                    duration_seconds=time.monotonic() - started_at,
                    session_path=session_path,
                    failures=failures,
                    completion_result=None,
                )

            frame_session["status"] = "committed"
            frame_session["pendingPrefix"] = None
            frame_session["lastError"] = None
            session["committedFrameCount"] = int(session["committedFrameCount"]) + 1
            _write_session(session_path, session)

        completion_result = complete_group_upload(
            config, start_result["groupUploadJobId"]
        )
        session["result"] = completion_result
        _write_session(session_path, session)

    return UploadExecutionSummary(
        uploaded_count=uploaded_count,
        skipped_count=skipped_count,
        failed_count=0,
        retried_count=retried_count,
        duration_seconds=time.monotonic() - started_at,
        session_path=session_path,
        failures=[],
        completion_result=completion_result,
    )
