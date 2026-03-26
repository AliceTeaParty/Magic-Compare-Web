from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from PIL import Image

from src.manifest import build_group_upload_from_case
from src.scanner import scan_case_directory


class BuildGroupUploadManifestTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.case_root = Path(self.temp_dir.name) / "sample-case"
        frame_dir = (
            self.case_root / "groups" / "001-test-example" / "frames" / "001-frame-a"
        )
        frame_dir.mkdir(parents=True, exist_ok=True)

        (self.case_root / "case.yaml").write_text(
            "slug: 2026\ntitle: 2026\n", encoding="utf-8"
        )
        (frame_dir.parent.parent / "group.yaml").write_text(
            "title: Test Example\n", encoding="utf-8"
        )
        (frame_dir / "frame.yaml").write_text("title: 24_02_100\n", encoding="utf-8")

        Image.new("RGB", (128, 72), color=(16, 24, 32)).save(frame_dir / "before.png")
        Image.new("RGB", (128, 72), color=(240, 220, 180)).save(frame_dir / "after.png")

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def test_builds_group_upload_start_payload_and_local_thumbnail_descriptors(self) -> None:
        scanned_case = scan_case_directory(self.case_root)
        thumbnail_root = Path(self.temp_dir.name) / "thumbs"

        prepared = build_group_upload_from_case(scanned_case, thumbnail_root)

        assets = prepared.start_payload["frames"][0]["assets"]
        self.assertEqual(prepared.start_payload["case"]["slug"], "2026")
        self.assertEqual(prepared.start_payload["group"]["slug"], "test-example")
        self.assertEqual(assets[0]["kind"], "before")
        self.assertEqual(assets[0]["label"], "Before")
        self.assertEqual(assets[0]["width"], 128)
        self.assertEqual(assets[0]["height"], 72)
        self.assertTrue(assets[0]["original"]["sha256"])
        self.assertTrue(assets[0]["thumbnail"]["sha256"])
        self.assertEqual(
            prepared.frames[0].assets[0].thumbnail.source_path.parent.name, "001"
        )


if __name__ == "__main__":
    unittest.main()
