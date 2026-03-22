from __future__ import annotations

import unittest
from unittest import mock

import httpx

from src.api_client import sync_manifest
from src.auth import UploaderConfig


class ApiClientTests(unittest.TestCase):
    @mock.patch("src.api_client.build_request_headers")
    @mock.patch("src.api_client.httpx.post")
    def test_raises_service_token_error_on_unauthorized(
        self,
        post: mock.Mock,
        build_headers: mock.Mock,
    ) -> None:
        request = httpx.Request("POST", "https://compare.example.com/api/ops/import-sync")
        post.return_value = httpx.Response(401, request=request)
        build_headers.return_value = {
            "CF-Access-Client-Id": "client-id",
            "CF-Access-Client-Secret": "client-secret",
        }

        config = UploaderConfig(
            site_url="https://compare.example.com",
            api_url="https://compare.example.com/api/ops/import-sync",
            env_path=None,
            work_dir=None,
            service_token_client_id="client-id",
            service_token_client_secret="client-secret",
        )

        with self.assertRaisesRegex(RuntimeError, "Service Token"):
            sync_manifest(config, {"case": {"slug": "2026"}, "groups": []})

        build_headers.assert_called_once_with(config)
        post.assert_called_once()


if __name__ == "__main__":
    unittest.main()
