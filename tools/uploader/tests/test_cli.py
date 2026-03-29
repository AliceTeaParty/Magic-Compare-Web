from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from unittest import mock

from typer.testing import CliRunner

from src import cli
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

    def test_windows_stdio_reconfigures_to_utf8(self) -> None:
        stdout = mock.Mock()
        stderr = mock.Mock()

        with (
            mock.patch.object(cli.os, "name", "nt"),
            mock.patch.object(cli.sys, "stdout", stdout),
            mock.patch.object(cli.sys, "stderr", stderr),
        ):
            cli._configure_windows_stdio_for_unicode()

        stdout.reconfigure.assert_called_once_with(
            encoding="utf-8", errors="replace"
        )
        stderr.reconfigure.assert_called_once_with(
            encoding="utf-8", errors="replace"
        )

    def test_help_surfaces_plan_and_sync_as_primary_commands(self) -> None:
        runner = CliRunner()

        result = runner.invoke(cli.app, ["--help"])

        self.assertEqual(result.exit_code, 0)
        self.assertIn("主要命令", result.stdout)
        self.assertIn("杂项命令", result.stdout)
        self.assertIn("plan", result.stdout)
        self.assertIn("sync", result.stdout)
        self.assertNotIn("scan", result.stdout)
        self.assertNotIn("manifest", result.stdout)
        self.assertIn("主要命令只有 plan 和 sync", result.stdout)


if __name__ == "__main__":
    unittest.main()
