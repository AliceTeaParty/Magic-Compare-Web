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
        frame_dir = self.case_root / "groups" / "001-test-group" / "frames" / "001-frame-a"
        frame_dir.mkdir(parents=True, exist_ok=True)
        (self.case_root / "case.yaml").write_text("slug: 2026\ntitle: 2026\n", encoding="utf-8")
        (frame_dir.parent.parent / "group.yaml").write_text("title: Test Group\n", encoding="utf-8")
        (frame_dir / "frame.yaml").write_text("title: Frame A\n", encoding="utf-8")
        Image.new("RGB", (32, 24), color=(0, 0, 0)).save(frame_dir / "before.png")
        Image.new("RGB", (32, 24), color=(255, 255, 255)).save(frame_dir / "after.png")
        self.config = UploaderConfig(
            site_url="http://localhost:3000",
            api_url="http://localhost:3000/api/ops/import-sync",
            env_path=None,
            work_dir=self.case_root,
            s3_bucket="magic-compare-assets",
            s3_region="us-east-1",
            s3_endpoint="http://localhost:9000",
            s3_access_key_id="rustfsadmin",
            s3_secret_access_key="rustfsadmin",
            s3_force_path_style=True,
            s3_internal_prefix="internal-assets",
        )

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    @mock.patch("src.upload_executor.head_internal_asset", return_value=None)
    @mock.patch("src.upload_executor.upload_file_to_internal_assets")
    def test_uploads_every_operation_and_persists_session(
        self,
        upload_file: mock.Mock,
        _head_internal_asset: mock.Mock,
    ) -> None:
        plan = build_case_plan(self.case_root)

        summary = execute_upload_plan(plan, self.config)

        self.assertTrue(summary.succeeded)
        self.assertEqual(summary.uploaded_count, 4)
        self.assertTrue(session_file_path(self.case_root).exists())
        session = json.loads(session_file_path(self.case_root).read_text(encoding="utf-8"))
        self.assertEqual(session["operations"][plan.report.operations[0].id]["status"], "uploaded")
        self.assertEqual(upload_file.call_count, 4)

    @mock.patch("src.upload_executor.upload_file_to_internal_assets")
    def test_skips_remote_objects_when_metadata_matches(self, upload_file: mock.Mock) -> None:
        plan = build_case_plan(self.case_root)
        remote_states = {
            operation.target_url: type(
                "RemoteState",
                (),
                {
                    "metadata": {
                        "sha256": operation.source_sha256,
                        "source-size": str(operation.source_size),
                        "derivative-kind": operation.derivative_kind,
                    },
                    "size": operation.source_size,
                },
            )
            for operation in plan.report.operations
        }

        with mock.patch("src.upload_executor.head_internal_asset", side_effect=lambda _config, target_url: remote_states[target_url]):
            summary = execute_upload_plan(plan, self.config)

        self.assertTrue(summary.succeeded)
        self.assertEqual(summary.skipped_count, 4)
        upload_file.assert_not_called()

    @mock.patch("src.upload_executor.head_internal_asset", return_value=None)
    @mock.patch("src.upload_executor.upload_file_to_internal_assets")
    def test_plan_hash_mismatch_rebuilds_session(
        self,
        upload_file: mock.Mock,
        _head_internal_asset: mock.Mock,
    ) -> None:
        plan = build_case_plan(self.case_root)
        session_path = session_file_path(self.case_root)
        session_path.parent.mkdir(parents=True, exist_ok=True)
        session_path.write_text(
            json.dumps(
                {
                    "planHash": "stale-plan",
                    "operations": {
                        "old-op": {
                            "status": "uploaded",
                            "attempts": 1,
                        }
                    },
                }
            ),
            encoding="utf-8",
        )

        summary = execute_upload_plan(plan, self.config)

        self.assertTrue(summary.succeeded)
        session = json.loads(session_path.read_text(encoding="utf-8"))
        self.assertNotEqual(session["planHash"], "stale-plan")
        self.assertNotIn("old-op", session["operations"])
        self.assertEqual(upload_file.call_count, 4)
