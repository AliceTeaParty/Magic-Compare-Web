from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path
from unittest import mock

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
        start_group_upload.return_value = {
            "groupUploadJobId": "job-1",
            "inputHash": "hash-1",
            "expectedFrameCount": 1,
            "committedFrameCount": 0,
            "frameStates": [{"frameOrder": 0, "status": "pending"}],
        }
        prepare_group_upload_frame.return_value = {
            "groupUploadJobId": "job-1",
            "frameOrder": 0,
            "pendingPrefix": "/groups/group-1/1/revision-1",
            "files": [
                {
                    "slot": "slot-001",
                    "variant": "original",
                    "logicalPath": "/groups/group-1/1/revision-1/o1.png",
                    "uploadUrl": "https://r2.example.com/o1",
                    "contentType": "image/png",
                },
                {
                    "slot": "slot-001",
                    "variant": "thumbnail",
                    "logicalPath": "/groups/group-1/1/revision-1/t1.png",
                    "uploadUrl": "https://r2.example.com/t1",
                    "contentType": "image/png",
                },
                {
                    "slot": "slot-002",
                    "variant": "original",
                    "logicalPath": "/groups/group-1/1/revision-1/o2.png",
                    "uploadUrl": "https://r2.example.com/o2",
                    "contentType": "image/png",
                },
                {
                    "slot": "slot-002",
                    "variant": "thumbnail",
                    "logicalPath": "/groups/group-1/1/revision-1/t2.png",
                    "uploadUrl": "https://r2.example.com/t2",
                    "contentType": "image/png",
                },
            ],
        }
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
        self.assertTrue(session_file_path(self.case_root).exists())
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
        start_group_upload.return_value = {
            "groupUploadJobId": "job-1",
            "inputHash": "hash-1",
            "expectedFrameCount": 1,
            "committedFrameCount": 1,
            "frameStates": [{"frameOrder": 0, "status": "committed"}],
        }
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
        start_group_upload.return_value = {
            "groupUploadJobId": "job-2",
            "inputHash": "hash-2",
            "expectedFrameCount": 1,
            "committedFrameCount": 0,
            "frameStates": [{"frameOrder": 0, "status": "pending"}],
        }
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
        session_path = session_file_path(self.case_root)
        session_path.parent.mkdir(parents=True, exist_ok=True)

        summary = execute_upload_plan(plan, self.config, reset_session=True)

        self.assertTrue(summary.succeeded)
        session = json.loads(session_path.read_text(encoding="utf-8"))
        self.assertEqual(session["groupUploadJobId"], "job-2")
        self.assertTrue(start_group_upload.call_args.args[1]["forceRestart"])

    @mock.patch("src.upload_executor.time.monotonic")
    @mock.patch("src.upload_executor.prepare_group_upload_frame")
    def test_resolve_prepared_frame_reuses_fresh_lookahead_cache(
        self,
        prepare_group_upload_frame: mock.Mock,
        monotonic: mock.Mock,
    ) -> None:
        monotonic.return_value = 120.0
        runtime = upload_executor_module.UploadRuntimeState(
            config=self.config,
            prepared_upload=mock.Mock(),
            start_result={"groupUploadJobId": "job-1"},
            session_path=self.case_root / ".magic-compare" / "upload-session.json",
            session={"frames": {}},
            started_at=0.0,
            upload_client=mock.Mock(),
            total_frames=1,
            total_files=4,
        )
        context = upload_executor_module.FrameUploadContext(
            runtime=runtime,
            frame_order=0,
            frame_title="Frame A",
            frame_session={"status": "pending", "pendingPrefix": None, "lastError": None},
        )
        cached = upload_executor_module.PreparedFrameCache(
            frame_order=0,
            frame_title="Frame A",
            prepared_frame={"pendingPrefix": "/groups/g/1/revision-cached", "files": []},
            prepared_at=100.0,
        )

        prepared_frame = upload_executor_module._resolve_prepared_frame(
            context,
            cached,
        )

        self.assertEqual(
            prepared_frame["pendingPrefix"],
            "/groups/g/1/revision-cached",
        )
        prepare_group_upload_frame.assert_not_called()

    @mock.patch("src.upload_executor.time.monotonic")
    @mock.patch("src.upload_executor.prepare_group_upload_frame")
    def test_resolve_prepared_frame_refreshes_expired_lookahead_cache(
        self,
        prepare_group_upload_frame: mock.Mock,
        monotonic: mock.Mock,
    ) -> None:
        monotonic.return_value = 100.0 + upload_executor_module._LOOKAHEAD_MAX_AGE_SECONDS + 1
        prepare_group_upload_frame.return_value = {
            "pendingPrefix": "/groups/g/1/revision-fresh",
            "files": [],
        }
        runtime = upload_executor_module.UploadRuntimeState(
            config=self.config,
            prepared_upload=mock.Mock(),
            start_result={"groupUploadJobId": "job-1"},
            session_path=self.case_root / ".magic-compare" / "upload-session.json",
            session={"frames": {}},
            started_at=0.0,
            upload_client=mock.Mock(),
            total_frames=1,
            total_files=4,
        )
        context = upload_executor_module.FrameUploadContext(
            runtime=runtime,
            frame_order=0,
            frame_title="Frame A",
            frame_session={"status": "pending", "pendingPrefix": None, "lastError": None},
        )
        cached = upload_executor_module.PreparedFrameCache(
            frame_order=0,
            frame_title="Frame A",
            prepared_frame={"pendingPrefix": "/groups/g/1/revision-expired", "files": []},
            prepared_at=100.0,
        )

        prepared_frame = upload_executor_module._resolve_prepared_frame(
            context,
            cached,
        )

        self.assertEqual(
            prepared_frame["pendingPrefix"],
            "/groups/g/1/revision-fresh",
        )
        prepare_group_upload_frame.assert_called_once_with(
            self.config,
            "job-1",
            0,
        )

    @mock.patch("src.upload_executor.complete_group_upload")
    @mock.patch("src.upload_executor.commit_group_upload_frame")
    @mock.patch("src.upload_executor.prepare_group_upload_frame")
    @mock.patch("src.upload_executor.start_group_upload")
    @mock.patch("src.upload_executor.upload_file_to_presigned_url")
    def test_emits_structured_progress_events(
        self,
        upload_file: mock.Mock,
        start_group_upload: mock.Mock,
        prepare_group_upload_frame: mock.Mock,
        commit_group_upload_frame: mock.Mock,
        complete_group_upload: mock.Mock,
    ) -> None:
        self._create_frame("002-frame-b", "Frame B", (10, 10, 10), (240, 240, 240))
        upload_file.return_value = None
        start_group_upload.return_value = {
            "groupUploadJobId": "job-3",
            "inputHash": "hash-3",
            "expectedFrameCount": 2,
            "committedFrameCount": 1,
            "frameStates": [
                {"frameOrder": 0, "status": "committed"},
                {"frameOrder": 1, "status": "pending"},
            ],
        }
        prepare_group_upload_frame.return_value = {
            "groupUploadJobId": "job-3",
            "frameOrder": 1,
            "pendingPrefix": "/groups/group-1/2/revision-1",
            "files": [
                {
                    "slot": "slot-001",
                    "variant": "original",
                    "logicalPath": "/groups/group-1/2/revision-1/o1.png",
                    "uploadUrl": "https://r2.example.com/o1",
                    "contentType": "image/png",
                },
                {
                    "slot": "slot-001",
                    "variant": "thumbnail",
                    "logicalPath": "/groups/group-1/2/revision-1/t1.png",
                    "uploadUrl": "https://r2.example.com/t1",
                    "contentType": "image/png",
                },
                {
                    "slot": "slot-002",
                    "variant": "original",
                    "logicalPath": "/groups/group-1/2/revision-1/o2.png",
                    "uploadUrl": "https://r2.example.com/o2",
                    "contentType": "image/png",
                },
                {
                    "slot": "slot-002",
                    "variant": "thumbnail",
                    "logicalPath": "/groups/group-1/2/revision-1/t2.png",
                    "uploadUrl": "https://r2.example.com/t2",
                    "contentType": "image/png",
                },
            ],
        }
        commit_group_upload_frame.return_value = {
            "groupUploadJobId": "job-3",
            "frameOrder": 1,
            "status": "committed",
        }
        complete_group_upload.return_value = {
            "groupUploadJobId": "job-3",
            "caseSlug": "2026",
            "groupSlug": "test-group",
            "committedFrameCount": 2,
        }
        plan = build_case_plan(self.case_root)
        events: list[upload_executor_module.UploadProgressEvent] = []

        summary = execute_upload_plan(
            plan,
            self.config,
            on_progress_event=events.append,
        )

        self.assertTrue(summary.succeeded)
        self.assertEqual(events[0].kind, "job_started")
        self.assertEqual(events[0].total_files, 8)
        self.assertEqual(events[1].kind, "frame_resumed")
        self.assertEqual(events[1].frame_order, 0)
        self.assertEqual(events[1].completed_files, 4)
        self.assertEqual(events[1].skipped_files, 4)
        self.assertEqual(events[1].completed_frames, 1)
        self.assertEqual(events[2].kind, "frame_prepared")
        self.assertEqual(events[2].stage, "prepare")
        self.assertEqual(events[-2].kind, "frame_committed")
        self.assertEqual(events[-2].completed_frames, 2)
        self.assertEqual(events[-1].kind, "job_completed")
        self.assertEqual(events[-1].completed_files, 8)

    @mock.patch("src.upload_executor.complete_group_upload")
    @mock.patch("src.upload_executor.commit_group_upload_frame")
    @mock.patch("src.upload_executor.prepare_group_upload_frame")
    @mock.patch("src.upload_executor.start_group_upload")
    @mock.patch("src.upload_executor.upload_file_to_presigned_url")
    def test_persists_lookahead_prepare_failures_into_session_summary(
        self,
        upload_file: mock.Mock,
        start_group_upload: mock.Mock,
        prepare_group_upload_frame: mock.Mock,
        commit_group_upload_frame: mock.Mock,
        complete_group_upload: mock.Mock,
    ) -> None:
        self._create_frame("002-frame-b", "Frame B", (10, 10, 10), (240, 240, 240))
        upload_file.return_value = None
        start_group_upload.return_value = {
            "groupUploadJobId": "job-4",
            "inputHash": "hash-4",
            "expectedFrameCount": 2,
            "committedFrameCount": 0,
            "frameStates": [
                {"frameOrder": 0, "status": "pending"},
                {"frameOrder": 1, "status": "pending"},
            ],
        }
        prepare_group_upload_frame.side_effect = [
            {
                "groupUploadJobId": "job-4",
                "frameOrder": 0,
                "pendingPrefix": "/groups/group-1/1/revision-1",
                "files": [
                    {
                        "slot": "slot-001",
                        "variant": "original",
                        "logicalPath": "/groups/group-1/1/revision-1/o1.png",
                        "uploadUrl": "https://r2.example.com/o1",
                        "contentType": "image/png",
                    },
                    {
                        "slot": "slot-001",
                        "variant": "thumbnail",
                        "logicalPath": "/groups/group-1/1/revision-1/t1.png",
                        "uploadUrl": "https://r2.example.com/t1",
                        "contentType": "image/png",
                    },
                    {
                        "slot": "slot-002",
                        "variant": "original",
                        "logicalPath": "/groups/group-1/1/revision-1/o2.png",
                        "uploadUrl": "https://r2.example.com/o2",
                        "contentType": "image/png",
                    },
                    {
                        "slot": "slot-002",
                        "variant": "thumbnail",
                        "logicalPath": "/groups/group-1/1/revision-1/t2.png",
                        "uploadUrl": "https://r2.example.com/t2",
                        "contentType": "image/png",
                    },
                ],
            },
            RuntimeError("lookahead prepare failed"),
        ]
        commit_group_upload_frame.return_value = {
            "groupUploadJobId": "job-4",
            "frameOrder": 0,
            "status": "committed",
        }
        plan = build_case_plan(self.case_root)

        summary = execute_upload_plan(plan, self.config)

        self.assertFalse(summary.succeeded)
        self.assertEqual(summary.failed_count, 1)
        self.assertEqual(summary.failures[0].operation_id, "1:prepare")
        self.assertEqual(summary.failures[0].message, "lookahead prepare failed")
        complete_group_upload.assert_not_called()
        session = json.loads(
            session_file_path(self.case_root).read_text(encoding="utf-8")
        )
        self.assertEqual(session["frames"]["1"]["status"], "failed")
        self.assertEqual(
            session["frames"]["1"]["lastError"],
            "lookahead prepare failed",
        )
