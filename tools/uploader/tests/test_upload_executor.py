from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from PIL import Image

from src.config import UploaderConfig
from src.plan import build_case_plan
from src.upload_executor import execute_upload_plan, session_file_path


class UploadExecutorTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.case_root = Path(self.temp_dir.name) / "sample-case"
        frame_dir = (
            self.case_root / "groups" / "001-test-group" / "frames" / "001-frame-a"
        )
        frame_dir.mkdir(parents=True, exist_ok=True)
        (self.case_root / "case.yaml").write_text(
            "slug: 2026\ntitle: 2026\n", encoding="utf-8"
        )
        (frame_dir.parent.parent / "group.yaml").write_text(
            "title: Test Group\n", encoding="utf-8"
        )
        (frame_dir / "frame.yaml").write_text("title: Frame A\n", encoding="utf-8")
        Image.new("RGB", (32, 24), color=(0, 0, 0)).save(frame_dir / "before.png")
        Image.new("RGB", (32, 24), color=(255, 255, 255)).save(frame_dir / "after.png")
        self.config = UploaderConfig(
            site_url="http://localhost:3000",
            api_url="http://localhost:3000/api/ops/group-upload-start",
            env_path=None,
            work_dir=self.case_root,
        )

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

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
