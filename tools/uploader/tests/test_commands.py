from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from unittest import mock

from PIL import Image

from src.commands import handle_sync
from src.api_client import CaseGroupsResult, CaseListResult, CaseWorkspaceGroup


class CommandFlowTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.case_root = Path(self.temp_dir.name) / "sample-case"
        frame_dir = (
            self.case_root / "groups" / "001-test-group" / "frames" / "001-frame-a"
        )
        frame_dir.mkdir(parents=True, exist_ok=True)
        (self.case_root / "case.yaml").write_text(
            "slug: 2026\ntitle: 2026\n", encoding="utf-8"
        )
        (frame_dir.parent.parent / "group.yaml").write_text(
            "title: Test Group\n", encoding="utf-8"
        )
        (frame_dir / "frame.yaml").write_text("title: Frame A\n", encoding="utf-8")
        Image.new("RGB", (32, 24), color=(0, 0, 0)).save(frame_dir / "before.png")
        Image.new("RGB", (32, 24), color=(255, 255, 255)).save(frame_dir / "after.png")

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    @mock.patch("src.commands.render_plan_summary")
    @mock.patch("src.commands.ensure_remote_access_config")
    @mock.patch("src.commands.execute_upload_plan")
    def test_handle_sync_dry_run_skips_remote_checks(
        self,
        execute_upload_plan: mock.Mock,
        ensure_remote_access_config: mock.Mock,
        _render_plan_summary: mock.Mock,
    ) -> None:
        report, execution_summary, sync_result = handle_sync(
            self.case_root,
            site_url=None,
            api_url=None,
            frame_workers=4,
            dry_run=True,
        )

        self.assertEqual(report.status, "ok")
        self.assertIsNone(execution_summary)
        self.assertIsNone(sync_result)
        ensure_remote_access_config.assert_not_called()
        execute_upload_plan.assert_not_called()

    @mock.patch("src.commands._render_execution_summary")
    @mock.patch("src.commands.ensure_remote_access_config")
    @mock.patch("src.commands.execute_upload_plan")
    def test_handle_sync_passes_frame_workers_to_executor(
        self,
        execute_upload_plan: mock.Mock,
        ensure_remote_access_config: mock.Mock,
        _render_execution_summary: mock.Mock,
    ) -> None:
        execute_upload_plan.return_value = mock.Mock(
            succeeded=True,
            completion_result={"caseSlug": "2026", "groupSlug": "test-group"},
        )

        handle_sync(
            self.case_root,
            site_url=None,
            api_url=None,
            frame_workers=5,
        )

        ensure_remote_access_config.assert_called_once()
        self.assertEqual(execute_upload_plan.call_args.kwargs["frame_workers"], 5)

    @mock.patch("src.commands._render_all_case_table")
    @mock.patch("src.commands.list_cases")
    @mock.patch("src.commands.ensure_remote_access_config")
    def test_handle_list_cases_fetches_full_inventory(
        self,
        ensure_remote_access_config: mock.Mock,
        list_cases: mock.Mock,
        render_table: mock.Mock,
    ) -> None:
        from src.commands import handle_list_cases

        list_cases.return_value = [
            CaseListResult(
                id="case-1",
                slug="2026",
                title="2026",
                summary="",
                tags=[],
                status="internal",
                published_at=None,
                updated_at="2026-03-26T10:00:00.000Z",
                group_count=1,
                public_group_count=0,
            )
        ]

        result = handle_list_cases(
            work_dir=self.case_root,
            site_url="https://compare.example.com",
            api_url="https://compare.example.com/api/ops/group-upload-start",
        )

        self.assertEqual(len(result), 1)
        ensure_remote_access_config.assert_called_once()
        render_table.assert_called_once()

    @mock.patch("src.commands._render_case_workspace_groups")
    @mock.patch("src.commands.list_case_groups")
    @mock.patch("src.commands.ensure_remote_access_config")
    @mock.patch("src.commands._resolve_case_for_delete")
    def test_handle_list_groups_fetches_case_workspace(
        self,
        resolve_case: mock.Mock,
        ensure_remote_access_config: mock.Mock,
        list_case_groups: mock.Mock,
        render_groups: mock.Mock,
    ) -> None:
        from src.commands import handle_list_groups

        resolve_case.return_value = mock.Mock(slug="2026")
        list_case_groups.return_value = CaseGroupsResult(
            id="case-1",
            slug="2026",
            title="2026",
            summary="",
            status="internal",
            published_at=None,
            tags=[],
            groups=[
                CaseWorkspaceGroup(
                    id="group-1",
                    slug="test-group",
                    title="Test Group",
                    description="",
                    order=0,
                    default_mode="before-after",
                    is_public=False,
                    public_slug=None,
                    frame_count=12,
                )
            ],
        )

        result = handle_list_groups(
            case_slug="2026",
            work_dir=self.case_root,
            site_url="https://compare.example.com",
            api_url="https://compare.example.com/api/ops/group-upload-start",
        )

        self.assertEqual(result.slug, "2026")
        ensure_remote_access_config.assert_called_once()
        list_case_groups.assert_called_once()
        render_groups.assert_called_once()
