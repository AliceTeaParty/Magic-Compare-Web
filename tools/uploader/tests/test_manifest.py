from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from unittest import mock

from PIL import Image

from src.auth import UploaderConfig
from src.manifest import build_import_manifest


class BuildImportManifestTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.case_root = Path(self.temp_dir.name) / "sample-case"
        frame_dir = self.case_root / "groups" / "001-test-example" / "frames" / "001-frame-a"
        frame_dir.mkdir(parents=True, exist_ok=True)

        (self.case_root / "case.yaml").write_text("slug: 2026\ntitle: 2026\n", encoding="utf-8")
        (frame_dir.parent.parent / "group.yaml").write_text("title: Test Example\n", encoding="utf-8")
        (frame_dir / "frame.yaml").write_text("title: 24_02_100\n", encoding="utf-8")

        Image.new("RGB", (128, 72), color=(16, 24, 32)).save(frame_dir / "before.png")
        Image.new("RGB", (128, 72), color=(240, 220, 180)).save(frame_dir / "after.png")

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    @mock.patch("src.manifest.upload_file_to_internal_assets")
    def test_uploads_assets_to_s3_and_keeps_logical_urls(self, upload_file: mock.Mock) -> None:
        config = UploaderConfig(
            site_url="https://compare.example.com",
            api_url="https://compare.example.com/api/ops/import-sync",
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

        manifest = build_import_manifest(self.case_root, config)

        assets = manifest["groups"][0]["frames"][0]["assets"]
        self.assertEqual(assets[0]["imageUrl"], "/internal-assets/2026/test-example/001/before.png")
        self.assertEqual(assets[0]["thumbUrl"], "/internal-assets/2026/test-example/001/thumb-before.png")
        self.assertEqual(assets[1]["imageUrl"], "/internal-assets/2026/test-example/001/after.png")
        self.assertEqual(assets[1]["thumbUrl"], "/internal-assets/2026/test-example/001/thumb-after.png")
        self.assertEqual(upload_file.call_count, 4)


if __name__ == "__main__":
    unittest.main()
