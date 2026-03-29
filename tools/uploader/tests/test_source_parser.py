from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from src.source_parser import discover_source_group


class DiscoverSourceGroupTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.source_dir = Path(self.temp_dir.name) / "test-example"
        self.source_dir.mkdir(parents=True, exist_ok=True)

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def _touch(self, name: str) -> None:
        path = self.source_dir / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(b"")

    def test_parses_example_titles_and_groups_misc_assets(self) -> None:
        names = [
            "24_BDMV250725ざつ旅_That's_Journey_Vol_1_00002_gen_vpy_2087_src.png",
            "24_BDMV250725ざつ旅_That's_Journey_Vol_1_00002_gen_vpy_2087_output.png",
            "24_BDMV250725ざつ旅_That's_Journey_Vol_1_00002_gen_vpy_30516_src.png",
            "24_BDMV250725ざつ旅_That's_Journey_Vol_1_00002_gen_vpy_30516_output.png",
            "24_Vol.1_00002.gen.vpy-30516-rip.png",
        ]
        for name in names:
            self._touch(name)

        group = discover_source_group(self.source_dir)

        self.assertEqual(group.slug, "test-example")
        self.assertEqual(
            [frame.title for frame in group.frames], ["24_02_2087", "24_02_30516"]
        )
        self.assertEqual(group.frames[1].after.variant, "output")
        self.assertEqual([item.variant for item in group.frames[1].misc], ["rip"])

    def test_prefers_out_then_output_then_alphabetical(self) -> None:
        names = [
            "24_show_00002_100_src.png",
            "24_show_00002_100_output.png",
            "24_show_00002_100_out.png",
            "24_show_00002_100_degrain.png",
            "24_show_00002_100_out1.png",
        ]
        for name in names:
            self._touch(name)

        group = discover_source_group(self.source_dir)
        frame = group.frames[0]

        self.assertEqual(frame.after.variant, "out")
        self.assertEqual(
            [item.variant for item in frame.misc], ["degrain", "out1", "output"]
        )

    def test_requires_a_single_source_candidate(self) -> None:
        self._touch("24_show_00002_100_src.png")
        self._touch("24_show_00002_100_source.png")
        self._touch("24_show_00002_100_output.png")

        with self.assertRaisesRegex(ValueError, "只能有一个 src/source"):
            discover_source_group(self.source_dir)

    def test_requires_an_after_candidate(self) -> None:
        self._touch("24_show_00002_100_src.png")

        with self.assertRaisesRegex(ValueError, "没有可用的 after 候选"):
            discover_source_group(self.source_dir)

    def test_recognizes_ori_and_origin_as_source_variants(self) -> None:
        self._touch("24_show_00002_100_ori.png")
        self._touch("24_show_00002_100_out.png")

        group = discover_source_group(self.source_dir)

        self.assertEqual(group.frames[0].before.variant, "ori")
        self.assertEqual(group.frames[0].after.variant, "out")

    def test_origin_conflicts_with_other_source_variants(self) -> None:
        self._touch("24_show_00002_100_origin.png")
        self._touch("24_show_00002_100_src.png")
        self._touch("24_show_00002_100_output.png")

        with self.assertRaisesRegex(ValueError, "只能有一个 src/source"):
            discover_source_group(self.source_dir)

    def test_falls_back_to_zero_padded_numeric_titles_when_metadata_is_missing(
        self,
    ) -> None:
        names = [
            "01src.png",
            "01out.png",
            "10src.png",
            "10output.png",
            "10degrain.png",
        ]
        for name in names:
            self._touch(name)

        group = discover_source_group(self.source_dir)

        self.assertEqual([frame.title for frame in group.frames], ["0001", "0010"])
        self.assertEqual(group.frames[0].after.variant, "out")
        self.assertEqual(group.frames[1].after.variant, "output")
        self.assertEqual([item.variant for item in group.frames[1].misc], ["degrain"])
