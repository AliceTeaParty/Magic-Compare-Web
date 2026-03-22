from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from unittest import mock

from PIL import Image

from src.commands import handle_sync


class CommandFlowTests(unittest.TestCase):
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

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    @mock.patch("src.commands.render_plan_summary")
    @mock.patch("src.commands.ensure_remote_access_config")
    @mock.patch("src.commands._ensure_s3_ready")
    def test_handle_sync_dry_run_skips_remote_checks(
        self,
        ensure_s3_ready: mock.Mock,
        ensure_remote_access_config: mock.Mock,
        _render_plan_summary: mock.Mock,
    ) -> None:
        report, execution_summary, sync_result = handle_sync(
            self.case_root,
            site_url=None,
            api_url=None,
            dry_run=True,
        )

        self.assertEqual(report.status, "ok")
        self.assertIsNone(execution_summary)
        self.assertIsNone(sync_result)
        ensure_s3_ready.assert_not_called()
        ensure_remote_access_config.assert_not_called()
