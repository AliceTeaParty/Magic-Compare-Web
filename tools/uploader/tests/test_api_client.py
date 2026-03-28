from __future__ import annotations

import unittest
from unittest import mock

import httpx

from src.api_client import list_case_groups, list_cases, start_group_upload
from src.auth import UploaderConfig


class ApiClientTests(unittest.TestCase):
    def setUp(self) -> None:
        self.config = UploaderConfig(
            site_url="https://compare.example.com",
            api_url="https://compare.example.com/api/ops/group-upload-start",
            env_path=None,
            work_dir=None,
            service_token_client_id="client-id",
            service_token_client_secret="client-secret",
        )

    @mock.patch("src.api_client.build_request_headers")
    @mock.patch("src.api_client.httpx.post")
    def test_raises_service_token_error_on_unauthorized(
        self,
        post: mock.Mock,
        build_headers: mock.Mock,
    ) -> None:
        request = httpx.Request(
            "POST", "https://compare.example.com/api/ops/group-upload-start"
        )
        post.return_value = httpx.Response(401, request=request)
        build_headers.return_value = {
            "CF-Access-Client-Id": "client-id",
            "CF-Access-Client-Secret": "client-secret",
        }

        with self.assertRaisesRegex(RuntimeError, "Service Token"):
            start_group_upload(
                self.config,
                {
                    "case": {
                        "slug": "2026",
                        "title": "2026",
                        "summary": "",
                        "tags": [],
                        "coverAssetLabel": "After",
                    },
                    "group": {
                        "slug": "test-group",
                        "title": "Test Group",
                        "description": "",
                        "order": 0,
                        "defaultMode": "before-after",
                        "tags": [],
                    },
                    "frames": [],
                },
            )

        build_headers.assert_called_once_with(self.config)
        post.assert_called_once()

    @mock.patch("src.api_client.build_request_headers")
    @mock.patch("src.api_client.httpx.post")
    def test_list_cases_parses_full_case_inventory(
        self,
        post: mock.Mock,
        build_headers: mock.Mock,
    ) -> None:
        request = httpx.Request(
            "POST", "https://compare.example.com/api/ops/case-list"
        )
        post.return_value = httpx.Response(
            200,
            request=request,
            json={
                "cases": [
                    {
                        "id": "case-1",
                        "slug": "2026",
                        "title": "2026",
                        "summary": "ACG quote",
                        "tags": ["demo"],
                        "status": "internal",
                        "publishedAt": None,
                        "updatedAt": "2026-03-26T10:00:00.000Z",
                        "groupCount": 2,
                        "publicGroupCount": 1,
                    }
                ]
            },
        )
        build_headers.return_value = {
            "CF-Access-Client-Id": "client-id",
            "CF-Access-Client-Secret": "client-secret",
        }

        results = list_cases(self.config)

        self.assertEqual(len(results), 1)
        self.assertEqual(results[0].slug, "2026")
        self.assertEqual(results[0].group_count, 2)
        post.assert_called_once()

    @mock.patch("src.api_client.build_request_headers")
    @mock.patch("src.api_client.httpx.post")
    def test_list_case_groups_parses_workspace_groups(
        self,
        post: mock.Mock,
        build_headers: mock.Mock,
    ) -> None:
        request = httpx.Request(
            "POST", "https://compare.example.com/api/ops/case-groups"
        )
        post.return_value = httpx.Response(
            200,
            request=request,
            json={
                "case": {
                    "id": "case-1",
                    "slug": "2026",
                    "title": "2026",
                    "summary": "ACG quote",
                    "status": "internal",
                    "publishedAt": None,
                    "tags": ["demo"],
                },
                "groups": [
                    {
                        "id": "group-1",
                        "slug": "test-group",
                        "title": "Test Group",
                        "description": "",
                        "order": 0,
                        "defaultMode": "before-after",
                        "isPublic": False,
                        "publicSlug": None,
                        "frameCount": 12,
                    }
                ],
            },
        )
        build_headers.return_value = {
            "CF-Access-Client-Id": "client-id",
            "CF-Access-Client-Secret": "client-secret",
        }

        result = list_case_groups(self.config, "2026")

        self.assertEqual(result.slug, "2026")
        self.assertEqual(len(result.groups), 1)
        self.assertEqual(result.groups[0].frame_count, 12)
        post.assert_called_once()

    @mock.patch("src.api_client.build_request_headers")
    @mock.patch("src.api_client.httpx.post")
    def test_reports_target_url_for_connection_refused(
        self,
        post: mock.Mock,
        build_headers: mock.Mock,
    ) -> None:
        request = httpx.Request(
            "POST", "http://localhost:3000/api/ops/group-upload-start"
        )
        post.side_effect = httpx.ConnectError(
            "[WinError 10061] actively refused", request=request
        )
        local_config = UploaderConfig(
            site_url="http://localhost:3000",
            api_url="http://localhost:3000/api/ops/group-upload-start",
            env_path=None,
            work_dir=None,
        )
        build_headers.return_value = {}

        with self.assertRaisesRegex(RuntimeError, "localhost:3000") as context:
            start_group_upload(
                local_config,
                {
                    "case": {
                        "slug": "2026",
                        "title": "2026",
                        "summary": "",
                        "tags": [],
                        "coverAssetLabel": "After",
                    },
                    "group": {
                        "slug": "test-group",
                        "title": "Test Group",
                        "description": "",
                        "order": 0,
                        "defaultMode": "before-after",
                        "tags": [],
                    },
                    "frames": [],
                },
            )

        self.assertIn("group-upload-start", str(context.exception))
        self.assertIn("localhost", str(context.exception))
