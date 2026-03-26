from __future__ import annotations

import unittest
from unittest import mock

import httpx

from src.api_client import start_group_upload
from src.auth import UploaderConfig


class ApiClientTests(unittest.TestCase):
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

        config = UploaderConfig(
            site_url="https://compare.example.com",
            api_url="https://compare.example.com/api/ops/group-upload-start",
            env_path=None,
            work_dir=None,
            service_token_client_id="client-id",
            service_token_client_secret="client-secret",
        )

        with self.assertRaisesRegex(RuntimeError, "Service Token"):
            start_group_upload(
                config,
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

        build_headers.assert_called_once_with(config)
        post.assert_called_once()
