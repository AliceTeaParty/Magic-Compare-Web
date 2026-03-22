from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from src.cli import _normalize_path_text, _resolve_source_dir


class CliPathResolutionTests(unittest.TestCase):
    def test_normalize_path_text_strips_wrapping_quotes(self) -> None:
        self.assertEqual(
            _normalize_path_text('"/tmp/example path"'), "/tmp/example path"
        )
        self.assertEqual(
            _normalize_path_text("'/tmp/example path'"), "/tmp/example path"
        )

    def test_resolve_source_dir_accepts_quoted_absolute_path(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            source_dir = Path(temp_dir) / "随机抽检对比图" / "out"
            source_dir.mkdir(parents=True, exist_ok=True)

            resolved = _resolve_source_dir(f"'{source_dir}'")

            self.assertEqual(resolved, source_dir.resolve())


if __name__ == "__main__":
    unittest.main()
