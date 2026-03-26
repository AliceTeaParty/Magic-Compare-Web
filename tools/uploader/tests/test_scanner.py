from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from src.scanner import scan_case_directory


class ScannerRelaxedYamlTests(unittest.TestCase):
    def test_relaxed_group_yaml_parses_unquoted_bracket_title(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            case_root = Path(temp_dir) / "case-root"
            frame_dir = (
                case_root / "groups" / "001-test-group" / "frames" / "001-frame-0001"
            )
            frame_dir.mkdir(parents=True, exist_ok=True)

            (case_root / "case.yaml").write_text(
                "slug: 2026\n" "title: 2026\n",
                encoding="utf-8",
            )
            (case_root / "groups" / "001-test-group" / "group.yaml").write_text(
                "title: [Rip Check] test\n"
                "description: imported group\n"
                "defaultMode: before-after\n"
                "tags: []\n",
                encoding="utf-8",
            )
            (frame_dir / "frame.yaml").write_text(
                "title: 0001\n" "caption: frame 1\n",
                encoding="utf-8",
            )
            (frame_dir / "before.png").write_bytes(b"before")
            (frame_dir / "after.png").write_bytes(b"after")

            scanned = scan_case_directory(case_root)

            self.assertEqual(scanned.groups[0].metadata["title"], "[Rip Check] test")


if __name__ == "__main__":
    unittest.main()
