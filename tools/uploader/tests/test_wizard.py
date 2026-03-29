from __future__ import annotations

import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest import mock

from rich.progress import Progress
from rich.text import Text

from src.api_client import CaseListResult, CaseSearchGroup, CaseSearchResult
from src.config import UploaderConfig
from src.upload_executor import UploadProgressEvent
from src.wizard import (
    WizardUploadProgressState,
    _choose_case,
    _confirm_new_case_metadata,
    _discover_source_group,
    _frame_status_line,
    _momentum_status_line,
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
            momentum_status="进度：25% · 已进入上传阶段，先把前几帧稳定送上去。",
        )

        renderables = _render_upload_progress(Progress(), state).renderables

        self.assertIsInstance(renderables[2], Text)
        self.assertEqual(
            renderables[2].plain,
            "当前 frame：1/2 [v2] sample · 文件上传",
        )

    def test_momentum_status_reports_goal_gradient_copy(self) -> None:
        event = UploadProgressEvent(
            kind="file_uploaded",
            stage="upload",
            frame_order=0,
            frame_title="sample",
            completed_frames=0,
            total_frames=4,
            completed_files=6,
            total_files=8,
            skipped_files=0,
            retried_count=0,
            failed_count=0,
        )

        self.assertEqual(
            _momentum_status_line(event),
            "进度：75% · 已到最后一段，收尾后就能直接打开 viewer。",
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

    def test_uploader_version_prefers_root_package_version(self) -> None:
        from src import branding

        branding.uploader_version.cache_clear()
        branding.project_version.cache_clear()
        branding.pyproject_version.cache_clear()
        with (
            mock.patch.object(branding, "project_version", return_value="9.9.9"),
            mock.patch.object(branding, "pyproject_version", return_value="1.7.1"),
        ):
            self.assertEqual(branding.uploader_version(), "9.9.9")
        branding.uploader_version.cache_clear()
        branding.project_version.cache_clear()
        branding.pyproject_version.cache_clear()


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

    def test_discover_source_group_prompts_for_nonflat_directories_when_auto_match_is_missing(self) -> None:
        with TemporaryDirectory() as temp_dir:
            source_dir = Path(temp_dir) / "sample"
            (source_dir / "raw").mkdir(parents=True, exist_ok=True)
            (source_dir / "done").mkdir(parents=True, exist_ok=True)
            (source_dir / "raw" / "24_show_00002_100.png").write_bytes(b"")
            (source_dir / "done" / "24_show_00002_100_v2.png").write_bytes(b"")

            with (
                mock.patch(
                    "src.wizard.typer.prompt",
                    side_effect=[str(source_dir), "raw", "done", ""],
                ),
                mock.patch("src.wizard.console.print"),
            ):
                group = _discover_source_group()

        self.assertEqual(group.source_root, source_dir.resolve())
        self.assertEqual(group.frames[0].after.original_name, "24_show_00002_100_v2.png")


class WizardMetadataValidationTests(unittest.TestCase):
    def test_invalid_case_slug_reopens_case_yaml_until_fixed(self) -> None:
        prepared = mock.Mock()
        prepared.case_yaml = Path("/tmp/case.yaml")
        prepared.work_dir = Path("/tmp/work-dir")

        with (
            mock.patch(
                "src.wizard._confirm_editor",
                side_effect=[None, None],
            ) as confirm_editor,
            mock.patch(
                "src.wizard.scan_case_directory",
                side_effect=[ValueError("case.yaml 的 slug 只能包含小写字母"), mock.Mock()],
            ),
            mock.patch("src.wizard.console.print") as print_mock,
        ):
            _confirm_new_case_metadata(prepared)

        self.assertEqual(confirm_editor.call_count, 2)
        printed = "\n".join(str(call.args[0]) for call in print_mock.call_args_list if call.args)
        self.assertIn("请重新编辑 case.yaml，修正 slug 后再继续。", printed)


class WizardCaseSelectionTests(unittest.TestCase):
    def setUp(self) -> None:
        self.config = UploaderConfig(
            site_url="http://localhost:3000",
            api_url="http://localhost:3000/api/ops/group-upload-start",
            env_path=None,
            work_dir=None,
        )

    def test_choose_case_skips_table_when_search_returns_empty(self) -> None:
        with (
            mock.patch("src.wizard.search_cases", return_value=[]),
            mock.patch("src.wizard.console.input", side_effect=["c"]),
            mock.patch("src.wizard._render_case_table") as render_case_table,
            mock.patch("src.wizard.console.print") as print_mock,
        ):
            selected = _choose_case(self.config, "2026")

        self.assertIsNone(selected)
        render_case_table.assert_not_called()
        printed = "\n".join(str(call.args[0]) for call in print_mock.call_args_list if call.args)
        self.assertIn("没有找到与“2026”匹配的 case。", printed)

    def test_choose_case_can_show_all_cases_and_resolve_selected_slug(self) -> None:
        searched_case = CaseSearchResult(
            id="case-2",
            slug="2025",
            title="2025 Case",
            summary="",
            tags=[],
            status="internal",
            updated_at="2026-03-29",
            group_count=1,
            public_group_count=0,
            groups=[CaseSearchGroup(slug="rip", title="Rip")],
        )
        all_case = CaseListResult(
            id="case-2",
            slug="2025",
            title="2025 Case",
            summary="",
            tags=[],
            status="internal",
            published_at=None,
            updated_at="2026-03-29",
            group_count=1,
            public_group_count=0,
        )

        with (
            mock.patch("src.wizard.search_cases", side_effect=[[], [searched_case]]),
            mock.patch("src.wizard.list_cases", return_value=[all_case]),
            mock.patch("src.wizard.console.input", side_effect=["all", "1"]),
            mock.patch("src.wizard._render_case_table") as render_case_table,
            mock.patch("src.wizard._render_all_case_table") as render_all_case_table,
        ):
            selected = _choose_case(self.config, "2026")

        self.assertEqual(selected, searched_case)
        render_case_table.assert_not_called()
        render_all_case_table.assert_called_once_with([all_case])


if __name__ == "__main__":
    unittest.main()
