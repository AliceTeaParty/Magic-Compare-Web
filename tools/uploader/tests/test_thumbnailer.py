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

    def _make_image(
        self, name: str, size: tuple[int, int], color: tuple[int, int, int]
    ) -> Path:
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

    def test_uses_thermal_palette_with_greener_small_changes_and_redder_large_changes(
        self,
    ) -> None:
        before = self._make_image("before.png", (48, 24), (0, 0, 0))
        after = self.root / "after.png"

        image = Image.new("RGB", (48, 24), color=(0, 0, 0))
        for x in range(0, 24):
            for y in range(24):
                image.putpixel((x, y), (28, 28, 28))
        for x in range(24, 48):
            for y in range(24):
                image.putpixel((x, y), (255, 255, 255))
        image.save(after)

        destination = self.root / "heatmap.png"
        generate_heatmap(before, after, destination)

        with Image.open(destination) as heatmap:
            low_change = heatmap.getpixel((10, 12))
            high_change = heatmap.getpixel((38, 12))

        self.assertGreater(
            low_change[1], low_change[0], "small changes should stay greener"
        )
        self.assertGreater(
            high_change[0], high_change[1], "large changes should skew red"
        )
        self.assertGreater(
            high_change[0], low_change[0], "large changes should be hotter overall"
        )

    def test_rejects_mismatched_dimensions(self) -> None:
        before = self._make_image("before.png", (8, 8), (0, 0, 0))
        after = self._make_image("after.png", (12, 8), (255, 255, 255))

        with self.assertRaisesRegex(ValueError, "尺寸不一致"):
            generate_heatmap(before, after, self.root / "heatmap.png")
