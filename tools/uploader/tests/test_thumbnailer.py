from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from PIL import Image

from src.thumbnailer import generate_heatmap


class GenerateHeatmapTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.root = Path(self.temp_dir.name)

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def _make_image(self, name: str, size: tuple[int, int], color: tuple[int, int, int]) -> Path:
        path = self.root / name
        Image.new("RGB", size, color=color).save(path)
        return path

    def test_generates_heatmap_png(self) -> None:
        before = self._make_image("before.png", (8, 8), (0, 0, 0))
        after = self._make_image("after.png", (8, 8), (255, 255, 255))
        destination = self.root / "heatmap.png"

        generate_heatmap(before, after, destination)

        self.assertTrue(destination.exists())
        with Image.open(destination) as image:
            self.assertEqual(image.size, (8, 8))

    def test_rejects_mismatched_dimensions(self) -> None:
        before = self._make_image("before.png", (8, 8), (0, 0, 0))
        after = self._make_image("after.png", (12, 8), (255, 255, 255))

        with self.assertRaisesRegex(ValueError, "尺寸不一致"):
            generate_heatmap(before, after, self.root / "heatmap.png")
