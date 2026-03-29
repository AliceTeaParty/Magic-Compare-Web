from __future__ import annotations

import json
import tempfile
import threading
import time
import unittest
from pathlib import Path
from unittest import mock

import httpx
from PIL import Image

import src.upload_executor as upload_executor_module
from src.config import UploaderConfig
from src.plan import build_case_plan
from src.upload_executor import execute_upload_plan, session_file_path


class UploadExecutorTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.case_root = Path(self.temp_dir.name) / "sample-case"
        self.case_root.mkdir(parents=True, exist_ok=True)
        (self.case_root / "case.yaml").write_text(
            "slug: 2026\ntitle: 2026\n", encoding="utf-8"
        )
        group_dir = self.case_root / "groups" / "001-test-group"
        group_dir.mkdir(parents=True, exist_ok=True)
        (group_dir / "group.yaml").write_text(
            "title: Test Group\n", encoding="utf-8"
        )
        self._create_frame("001-frame-a", "Frame A", (0, 0, 0), (255, 255, 255))
        self.config = UploaderConfig(
            site_url="http://localhost:3000",
            api_url="http://localhost:3000/api/ops/group-upload-start",
            env_path=None,
            work_dir=self.case_root,
        )

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def _create_frame(
        self,
        folder_name: str,
        title: str,
        before_color: tuple[int, int, int],
        after_color: tuple[int, int, int],
    ) -> None:
        frame_dir = self.case_root / "groups" / "001-test-group" / "frames" / folder_name
        frame_dir.mkdir(parents=True, exist_ok=True)
        (frame_dir / "frame.yaml").write_text(f"title: {title}\n", encoding="utf-8")
        Image.new("RGB", (32, 24), color=before_color).save(frame_dir / "before.png")
        Image.new("RGB", (32, 24), color=after_color).save(frame_dir / "after.png")

    def _prepared_frame_response(self, frame_order: int) -> dict:
        frame_index = frame_order + 1
        return {
            "groupUploadJobId": "job-1",
            "frameOrder": frame_order,
            "pendingPrefix": f"/groups/group-1/{frame_index}/revision-1",
            "files": [
                {
                    "slot": "slot-001",
                    "variant": "original",
                    "logicalPath": f"/groups/group-1/{frame_index}/revision-1/o1.png",
                    "uploadUrl": f"https://r2.example.com/{frame_index}/o1",
                    "contentType": "image/png",
                },
                {
                    "slot": "slot-001",
                    "variant": "thumbnail",
                    "logicalPath": f"/groups/group-1/{frame_index}/revision-1/t1.png",
                    "uploadUrl": f"https://r2.example.com/{frame_index}/t1",
                    "contentType": "image/png",
                },
                {
                    "slot": "slot-002",
                    "variant": "original",
                    "logicalPath": f"/groups/group-1/{frame_index}/revision-1/o2.png",
                    "uploadUrl": f"https://r2.example.com/{frame_index}/o2",
                    "contentType": "image/png",
                },
                {
                    "slot": "slot-002",
                    "variant": "thumbnail",
                    "logicalPath": f"/groups/group-1/{frame_index}/revision-1/t2.png",
                    "uploadUrl": f"https://r2.example.com/{frame_index}/t2",
                    "contentType": "image/png",
                },
            ],
        }

    def _start_result(self, frame_states: list[dict], committed_frame_count: int = 0) -> dict:
        return {
            "groupUploadJobId": "job-1",
            "inputHash": "hash-1",
            "expectedFrameCount": len(frame_states),
            "committedFrameCount": committed_frame_count,
            "frameStates": frame_states,
        }

    def _retryable_runtime_error(self, message: str) -> RuntimeError:
        request = httpx.Request("POST", "https://compare.example.com/api/ops/example")
        error = RuntimeError(message)
        error.__cause__ = httpx.ConnectError(message, request=request)
        return error

    @mock.patch("src.upload_executor.complete_group_upload")
    @mock.patch("src.upload_executor.commit_group_upload_frame")
    @mock.patch("src.upload_executor.prepare_group_upload_frame")
    @mock.patch("src.upload_executor.start_group_upload")
    @mock.patch("src.upload_executor.upload_file_to_presigned_url")
    def test_uploads_every_frame_and_persists_session(
        self,
        upload_file: mock.Mock,
        start_group_upload: mock.Mock,
        prepare_group_upload_frame: mock.Mock,
        commit_group_upload_frame: mock.Mock,
        complete_group_upload: mock.Mock,
    ) -> None:
        upload_file.return_value = None
        start_group_upload.return_value = self._start_result(
            [{"frameOrder": 0, "status": "pending"}]
        )
        prepare_group_upload_frame.return_value = self._prepared_frame_response(0)
        commit_group_upload_frame.return_value = {
            "groupUploadJobId": "job-1",
            "frameOrder": 0,
            "status": "committed",
        }
        complete_group_upload.return_value = {
            "groupUploadJobId": "job-1",
            "caseSlug": "2026",
            "groupSlug": "test-group",
            "committedFrameCount": 1,
        }
        plan = build_case_plan(self.case_root)

        summary = execute_upload_plan(plan, self.config)

        self.assertTrue(summary.succeeded)
        self.assertEqual(summary.uploaded_count, 4)
        self.assertEqual(summary.completion_result["caseSlug"], "2026")
        session = json.loads(
            session_file_path(self.case_root).read_text(encoding="utf-8")
        )
        self.assertEqual(session["groupUploadJobId"], "job-1")
        self.assertEqual(session["frames"]["0"]["status"], "committed")
        self.assertEqual(upload_file.call_count, 4)

    @mock.patch("src.upload_executor.complete_group_upload")
    @mock.patch("src.upload_executor.prepare_group_upload_frame")
    @mock.patch("src.upload_executor.start_group_upload")
    @mock.patch("src.upload_executor.upload_file_to_presigned_url")
    def test_skips_already_committed_frames(
        self,
        upload_file: mock.Mock,
        start_group_upload: mock.Mock,
        prepare_group_upload_frame: mock.Mock,
        complete_group_upload: mock.Mock,
    ) -> None:
        plan = build_case_plan(self.case_root)
        start_group_upload.return_value = self._start_result(
            [{"frameOrder": 0, "status": "committed"}],
            committed_frame_count=1,
        )
        complete_group_upload.return_value = {
            "groupUploadJobId": "job-1",
            "caseSlug": "2026",
            "groupSlug": "test-group",
            "committedFrameCount": 1,
        }

        summary = execute_upload_plan(plan, self.config)

        self.assertTrue(summary.succeeded)
        self.assertEqual(summary.skipped_count, 4)
        prepare_group_upload_frame.assert_not_called()
        self.assertEqual(upload_file.call_count, 0)

    @mock.patch("src.upload_executor.complete_group_upload")
    @mock.patch("src.upload_executor.commit_group_upload_frame")
    @mock.patch("src.upload_executor.prepare_group_upload_frame")
    @mock.patch("src.upload_executor.start_group_upload")
    @mock.patch("src.upload_executor.upload_file_to_presigned_url")
    def test_reset_session_forces_server_side_restart(
        self,
        upload_file: mock.Mock,
        start_group_upload: mock.Mock,
        prepare_group_upload_frame: mock.Mock,
        commit_group_upload_frame: mock.Mock,
        complete_group_upload: mock.Mock,
    ) -> None:
        upload_file.return_value = None
        start_group_upload.return_value = self._start_result(
            [{"frameOrder": 0, "status": "pending"}]
        )
        prepare_group_upload_frame.return_value = {
            "groupUploadJobId": "job-2",
            "frameOrder": 0,
            "pendingPrefix": "/groups/group-1/1/revision-2",
            "files": [],
        }
        commit_group_upload_frame.return_value = {
            "groupUploadJobId": "job-2",
            "frameOrder": 0,
            "status": "committed",
        }
        complete_group_upload.return_value = {
            "groupUploadJobId": "job-2",
            "caseSlug": "2026",
            "groupSlug": "test-group",
            "committedFrameCount": 1,
        }
        plan = build_case_plan(self.case_root)

        summary = execute_upload_plan(plan, self.config, reset_session=True)

        self.assertTrue(summary.succeeded)
        self.assertTrue(start_group_upload.call_args.args[1]["forceRestart"])

    @mock.patch("src.upload_executor.time.sleep")
    @mock.patch("src.upload_executor.complete_group_upload")
    @mock.patch("src.upload_executor.commit_group_upload_frame")
    @mock.patch("src.upload_executor.prepare_group_upload_frame")
    @mock.patch("src.upload_executor.start_group_upload")
    @mock.patch("src.upload_executor.upload_file_to_presigned_url")
    def test_retries_transient_prepare_failures_up_to_success(
        self,
        upload_file: mock.Mock,
        start_group_upload: mock.Mock,
        prepare_group_upload_frame: mock.Mock,
        commit_group_upload_frame: mock.Mock,
        complete_group_upload: mock.Mock,
        _sleep: mock.Mock,
    ) -> None:
        upload_file.return_value = None
        start_group_upload.return_value = self._start_result(
            [{"frameOrder": 0, "status": "pending"}]
        )
        prepare_group_upload_frame.side_effect = [
            self._retryable_runtime_error("prepare transient 1"),
            self._retryable_runtime_error("prepare transient 2"),
            self._retryable_runtime_error("prepare transient 3"),
            self._retryable_runtime_error("prepare transient 4"),
            self._prepared_frame_response(0),
        ]
        commit_group_upload_frame.return_value = {
            "groupUploadJobId": "job-1",
            "frameOrder": 0,
            "status": "committed",
        }
        complete_group_upload.return_value = {
            "groupUploadJobId": "job-1",
            "caseSlug": "2026",
            "groupSlug": "test-group",
            "committedFrameCount": 1,
        }
        plan = build_case_plan(self.case_root)

        summary = execute_upload_plan(plan, self.config)

        self.assertTrue(summary.succeeded)
        self.assertEqual(prepare_group_upload_frame.call_count, 5)
        self.assertEqual(summary.retried_count, 4)

    @mock.patch("src.upload_executor.time.sleep")
    @mock.patch("src.upload_executor.complete_group_upload")
    @mock.patch("src.upload_executor.commit_group_upload_frame")
    @mock.patch("src.upload_executor.prepare_group_upload_frame")
    @mock.patch("src.upload_executor.start_group_upload")
    @mock.patch("src.upload_executor.upload_file_to_presigned_url")
    def test_retries_transient_commit_failures_then_marks_frame_failed(
        self,
        upload_file: mock.Mock,
        start_group_upload: mock.Mock,
        prepare_group_upload_frame: mock.Mock,
        commit_group_upload_frame: mock.Mock,
        complete_group_upload: mock.Mock,
        _sleep: mock.Mock,
    ) -> None:
        upload_file.return_value = None
        start_group_upload.return_value = self._start_result(
            [{"frameOrder": 0, "status": "pending"}]
        )
        prepare_group_upload_frame.return_value = self._prepared_frame_response(0)
        commit_group_upload_frame.side_effect = [
            self._retryable_runtime_error("commit transient 1"),
            self._retryable_runtime_error("commit transient 2"),
            self._retryable_runtime_error("commit transient 3"),
            self._retryable_runtime_error("commit transient 4"),
            self._retryable_runtime_error("commit transient 5"),
        ]
        plan = build_case_plan(self.case_root)

        summary = execute_upload_plan(plan, self.config)

        self.assertFalse(summary.succeeded)
        self.assertEqual(commit_group_upload_frame.call_count, 5)
        self.assertEqual(summary.failed_count, 1)
        self.assertEqual(summary.failures[0].operation_id, "0:commit")
        complete_group_upload.assert_not_called()
        session = json.loads(
            session_file_path(self.case_root).read_text(encoding="utf-8")
        )
        self.assertEqual(session["frames"]["0"]["status"], "failed")

    @mock.patch("src.upload_executor.complete_group_upload")
    @mock.patch("src.upload_executor.commit_group_upload_frame")
    @mock.patch("src.upload_executor.prepare_group_upload_frame")
    @mock.patch("src.upload_executor.start_group_upload")
    @mock.patch("src.upload_executor.upload_file_to_presigned_url")
    def test_continues_other_frames_after_one_frame_fails(
        self,
        upload_file: mock.Mock,
        start_group_upload: mock.Mock,
        prepare_group_upload_frame: mock.Mock,
        commit_group_upload_frame: mock.Mock,
        complete_group_upload: mock.Mock,
    ) -> None:
        self._create_frame("002-frame-b", "Frame B", (10, 10, 10), (240, 240, 240))
        upload_file.return_value = None
        start_group_upload.return_value = self._start_result(
            [
                {"frameOrder": 0, "status": "pending"},
                {"frameOrder": 1, "status": "pending"},
            ]
        )

        def prepare_side_effect(config: UploaderConfig, job_id: str, frame_order: int) -> dict:
            if frame_order == 0:
                raise RuntimeError("prepare failed")
            return self._prepared_frame_response(frame_order)

        prepare_group_upload_frame.side_effect = prepare_side_effect
        commit_group_upload_frame.return_value = {
            "groupUploadJobId": "job-1",
            "frameOrder": 1,
            "status": "committed",
        }
        plan = build_case_plan(self.case_root)

        summary = execute_upload_plan(plan, self.config, frame_workers=2)

        self.assertFalse(summary.succeeded)
        self.assertEqual(summary.failed_count, 1)
        self.assertEqual(summary.failures[0].operation_id, "0:prepare")
        self.assertEqual(commit_group_upload_frame.call_count, 1)
        complete_group_upload.assert_not_called()
        session = json.loads(
            session_file_path(self.case_root).read_text(encoding="utf-8")
        )
        self.assertEqual(session["frames"]["0"]["status"], "failed")
        self.assertEqual(session["frames"]["1"]["status"], "committed")

    @mock.patch("src.upload_executor.complete_group_upload")
    @mock.patch("src.upload_executor.commit_group_upload_frame")
    @mock.patch("src.upload_executor.prepare_group_upload_frame")
    @mock.patch("src.upload_executor.start_group_upload")
    @mock.patch("src.upload_executor.upload_file_to_presigned_url")
    def test_emits_parallel_progress_and_commits_serially(
        self,
        upload_file: mock.Mock,
        start_group_upload: mock.Mock,
        prepare_group_upload_frame: mock.Mock,
        commit_group_upload_frame: mock.Mock,
        complete_group_upload: mock.Mock,
    ) -> None:
        self._create_frame("002-frame-b", "Frame B", (10, 10, 10), (240, 240, 240))
        upload_file.return_value = None
        start_group_upload.return_value = self._start_result(
            [
                {"frameOrder": 0, "status": "pending"},
                {"frameOrder": 1, "status": "pending"},
            ]
        )
        prepare_group_upload_frame.side_effect = lambda config, job_id, frame_order: self._prepared_frame_response(
            frame_order
        )

        commit_active = 0
        max_commit_active = 0
        commit_lock = threading.Lock()

        def commit_side_effect(config: UploaderConfig, job_id: str, frame_order: int) -> dict:
            nonlocal commit_active, max_commit_active
            with commit_lock:
                commit_active += 1
                max_commit_active = max(max_commit_active, commit_active)
            time.sleep(0.01)
            with commit_lock:
                commit_active -= 1
            return {
                "groupUploadJobId": "job-1",
                "frameOrder": frame_order,
                "status": "committed",
            }

        commit_group_upload_frame.side_effect = commit_side_effect
        complete_group_upload.return_value = {
            "groupUploadJobId": "job-1",
            "caseSlug": "2026",
            "groupSlug": "test-group",
            "committedFrameCount": 2,
        }
        plan = build_case_plan(self.case_root)
        events: list[upload_executor_module.UploadProgressEvent] = []

        summary = execute_upload_plan(
            plan,
            self.config,
            frame_workers=2,
            on_progress_event=events.append,
        )

        self.assertTrue(summary.succeeded)
        self.assertEqual(events[0].kind, "job_started")
        self.assertEqual(events[0].frame_workers, 2)
        self.assertTrue(
            any(event.kind == "frame_started" and event.active_frames >= 1 for event in events)
        )
        self.assertTrue(
            any(event.kind == "frame_started" and event.active_frames == 2 for event in events)
        )
        self.assertEqual(max_commit_active, 1)
        self.assertEqual(events[-1].kind, "job_completed")
        self.assertEqual(events[-1].completed_files, 8)

    def test_resolve_frame_worker_count_clamps_and_adapts(self) -> None:
        self.assertEqual(upload_executor_module._resolve_frame_worker_count(None, 0), 1)
        self.assertEqual(upload_executor_module._resolve_frame_worker_count(None, 3), 3)
        self.assertEqual(upload_executor_module._resolve_frame_worker_count(None, 99), 8)
        self.assertEqual(upload_executor_module._resolve_frame_worker_count(0, 3), 1)
        self.assertEqual(upload_executor_module._resolve_frame_worker_count(20, 3), 8)


if __name__ == "__main__":
    unittest.main()
