from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from PIL import Image

from src.image_sanity import validate_local_image


class ImageSanityTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.root = Path(self.temp_dir.name)

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def test_validate_local_image_returns_raster_dimensions(self) -> None:
        image_path = self.root / "before.png"
        Image.new("RGB", (48, 36), color=(10, 20, 30)).save(image_path)

        self.assertEqual(validate_local_image(image_path), (48, 36))

    def test_validate_local_image_rejects_invalid_svg(self) -> None:
        image_path = self.root / "bad.svg"
        image_path.write_text("<html></html>", encoding="utf-8")

        with self.assertRaisesRegex(ValueError, "缺少 <svg>"):
            validate_local_image(image_path)
