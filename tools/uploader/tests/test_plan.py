from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from PIL import Image

from src.plan import build_case_plan, build_path_plan


class PlanReportTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.root = Path(self.temp_dir.name)

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def _make_image(self, path: Path) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        Image.new("RGB", (24, 24), color=(12, 24, 36)).save(path)

    def test_flat_source_plan_reports_ignored_noise(self) -> None:
        source_dir = self.root / "flat-source"
        source_dir.mkdir(parents=True, exist_ok=True)
        self._make_image(source_dir / "24_show_00002_100_src.png")
        self._make_image(source_dir / "24_show_00002_100_output.png")
        (source_dir / ".DS_Store").write_text("noise", encoding="utf-8")
        (source_dir / "notes.txt").write_text("ignore me", encoding="utf-8")

        report = build_path_plan(
            source_dir, case_slug="2026", group_slug="test-example"
        )

        self.assertEqual(report.status, "warning")
        self.assertEqual(report.summary.ignored_file_count, 2)
        self.assertEqual(report.summary.upload_file_count, 4)

    def test_structured_case_plan_blocks_on_broken_primary_image(self) -> None:
        case_root = self.root / "sample-case"
        frame_dir = case_root / "groups" / "001-test-group" / "frames" / "001-frame-a"
        frame_dir.mkdir(parents=True, exist_ok=True)
        (case_root / "case.yaml").write_text(
            "slug: 2026\ntitle: 2026\n", encoding="utf-8"
        )
        (frame_dir.parent.parent / "group.yaml").write_text(
            "title: Test Group\n", encoding="utf-8"
        )
        (frame_dir / "frame.yaml").write_text("title: Frame A\n", encoding="utf-8")
        (frame_dir / "before.png").write_bytes(b"not-a-real-png")
        self._make_image(frame_dir / "after.png")

        report = build_case_plan(case_root).report

        self.assertEqual(report.status, "error")
        self.assertEqual(report.exit_code, 1)
        self.assertEqual(report.issues[0].code, "invalid-image")
