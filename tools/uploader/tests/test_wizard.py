from __future__ import annotations

import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest import mock

from rich.progress import Progress
from rich.text import Text

from src.upload_executor import UploadProgressEvent
from src.wizard import (
    WizardUploadProgressState,
    _discover_source_group,
    _frame_status_line,
    _render_completion_links,
    _render_upload_progress,
    _render_startup_banner,
)


class WizardProgressRenderingTests(unittest.TestCase):
    def test_render_upload_progress_preserves_bracketed_frame_titles(self) -> None:
        event = UploadProgressEvent(
            kind="file_uploaded",
            stage="upload",
            frame_order=0,
            frame_title="[v2] sample",
            completed_frames=0,
            total_frames=2,
            completed_files=1,
            total_files=4,
            skipped_files=0,
            retried_count=0,
            failed_count=0,
        )
        state = WizardUploadProgressState(
            stage_status="阶段：文件上传",
            frame_status=_frame_status_line(event),
            stats_line="文件：1/4 | frame：0/2 | skipped：0 | retried：0 | failed：0",
        )

        renderables = _render_upload_progress(Progress(), state).renderables

        self.assertIsInstance(renderables[2], Text)
        self.assertEqual(
            renderables[2].plain,
            "当前 frame：1/2 [v2] sample · 文件上传",
        )

    def test_render_startup_banner_includes_support_links(self) -> None:
        with mock.patch("src.wizard.console.print") as print_mock:
            _render_startup_banner()

        rendered = "\n".join(str(call.args[0]) for call in print_mock.call_args_list if call.args)
        self.assertIn("Magic Compare Uploader", rendered)
        self.assertIn("github.com/AliceTeaParty/Magic-Compare-Web", rendered)
        self.assertIn("/issues", rendered)
        self.assertIn("GPLv3", rendered)

    def test_render_completion_links_prints_raw_urls(self) -> None:
        with mock.patch("src.wizard.console.print") as print_mock:
            _render_completion_links(
                "https://example.com/cases/demo",
                "https://example.com/cases/demo/groups/group-a",
            )

        printed_scalars = [call.args[0] for call in print_mock.call_args_list if call.args]
        self.assertEqual(
            printed_scalars[1],
            "https://example.com/cases/demo",
        )
        self.assertEqual(
            printed_scalars[3],
            "https://example.com/cases/demo/groups/group-a",
        )


class BrandingFallbackTests(unittest.TestCase):
    def test_load_logo_text_falls_back_when_asset_missing(self) -> None:
        from src import branding

        branding.load_logo_text.cache_clear()
        with mock.patch.object(branding, "_logo_candidate_paths", return_value=[Path("/definitely-missing-logo.txt")]):
            self.assertEqual(branding.load_logo_text(), branding.FALLBACK_LOGO)
        branding.load_logo_text.cache_clear()


class WizardSourcePromptTests(unittest.TestCase):
    def test_discover_source_group_retries_after_invalid_path(self) -> None:
        with TemporaryDirectory() as temp_dir:
            source_dir = Path(temp_dir) / "sample"
            source_dir.mkdir(parents=True, exist_ok=True)
            (source_dir / "24_show_00002_100_src.png").write_bytes(b"")
            (source_dir / "24_show_00002_100_out.png").write_bytes(b"")

            with (
                mock.patch("src.wizard.typer.prompt", side_effect=["/definitely-missing", f"'{source_dir}'"]),
                mock.patch("src.wizard.console.print"),
            ):
                group = _discover_source_group()

        self.assertEqual(group.source_root, source_dir.resolve())


if __name__ == "__main__":
    unittest.main()
