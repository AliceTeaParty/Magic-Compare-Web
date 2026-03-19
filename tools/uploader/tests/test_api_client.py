from __future__ import annotations

import unittest
from unittest import mock

import httpx

from src.api_client import sync_manifest
from src.auth import UploaderConfig


class ApiClientTests(unittest.TestCase):
    @mock.patch("src.api_client.clear_access_token")
    @mock.patch("src.api_client.build_request_headers")
    @mock.patch("src.api_client.httpx.post")
    def test_retries_once_after_unauthorized_with_refreshed_user_token(
        self,
        post: mock.Mock,
        build_headers: mock.Mock,
        clear_access_token: mock.Mock,
    ) -> None:
        request = httpx.Request("POST", "https://compare.example.com/api/ops/import-sync")
        unauthorized = httpx.Response(401, request=request)
        success = httpx.Response(200, request=request, json={"slug": "2026"})
        post.side_effect = [unauthorized, success]
        build_headers.side_effect = [
            {"cf-access-token": "stale-token"},
            {"cf-access-token": "fresh-token"},
        ]

        config = UploaderConfig(
            site_url="https://compare.example.com",
            api_url="https://compare.example.com/api/ops/import-sync",
            env_path=None,
            work_dir=None,
            access_token="stale-token",
            service_token_client_id=None,
            service_token_client_secret=None,
        )

        result = sync_manifest(config, {"case": {"slug": "2026"}, "groups": []})

        self.assertEqual(result, {"slug": "2026"})
        clear_access_token.assert_called_once_with(config)
        self.assertEqual(build_headers.call_args_list[0].kwargs, {})
        self.assertEqual(build_headers.call_args_list[1].kwargs, {"force_refresh_access_token": True})
        self.assertEqual(post.call_count, 2)


if __name__ == "__main__":
    unittest.main()
