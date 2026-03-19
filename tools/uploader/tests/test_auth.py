from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest import mock

from src.auth import (
    ENV_ACCESS_TOKEN_NAME,
    UploaderConfig,
    build_request_headers,
    ensure_cloudflared_installed,
    fetch_access_token_via_cloudflared,
    persist_config_overrides,
    resolve_uploader_config,
)


class UploaderAuthTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.work_dir = Path(self.temp_dir.name) / "sample-case"
        self.addCleanup(self.temp_dir.cleanup)

    def test_resolves_api_url_from_site_url_and_creates_env(self) -> None:
        config = resolve_uploader_config(self.work_dir, site_url_override="https://compare.example.com")

        self.assertTrue((self.work_dir / ".env").exists())
        self.assertEqual(config.site_url, "https://compare.example.com")
        self.assertEqual(config.api_url, "https://compare.example.com/api/ops/import-sync")

    def test_prefers_service_token_headers_over_user_token(self) -> None:
        config = UploaderConfig(
            site_url="https://compare.example.com",
            api_url="https://compare.example.com/api/ops/import-sync",
            env_path=None,
            work_dir=None,
            access_token="user-token",
            service_token_client_id="client-id",
            service_token_client_secret="client-secret",
        )

        headers = build_request_headers(config)

        self.assertEqual(
            headers,
            {
                "CF-Access-Client-Id": "client-id",
                "CF-Access-Client-Secret": "client-secret",
            },
        )

    def test_uses_cf_access_token_header_for_user_token(self) -> None:
        config = UploaderConfig(
            site_url="https://compare.example.com",
            api_url="https://compare.example.com/api/ops/import-sync",
            env_path=None,
            work_dir=None,
            access_token="user-token",
            service_token_client_id=None,
            service_token_client_secret=None,
        )

        headers = build_request_headers(config)

        self.assertEqual(headers, {"cf-access-token": "user-token"})

    def test_persists_site_url_override_to_work_dir_env(self) -> None:
        config = resolve_uploader_config(self.work_dir)

        persist_config_overrides(config, site_url="https://compare.example.com")

        env_text = (self.work_dir / ".env").read_text(encoding="utf-8")
        self.assertIn("MAGIC_COMPARE_SITE_URL=https://compare.example.com", env_text)

    @mock.patch("src.auth.subprocess.run")
    @mock.patch("src.auth.shutil.which")
    @mock.patch("src.auth.sys.platform", "darwin")
    def test_installs_cloudflared_via_brew_on_macos(self, which: mock.Mock, run: mock.Mock) -> None:
        def which_side_effect(name: str) -> str | None:
            if name == "cloudflared":
                return None if run.call_count == 0 else "/opt/homebrew/bin/cloudflared"
            if name == "brew":
                return "/opt/homebrew/bin/brew"
            return None

        which.side_effect = which_side_effect
        run.return_value = SimpleNamespace(returncode=0)

        executable = ensure_cloudflared_installed()

        self.assertEqual(executable, "/opt/homebrew/bin/cloudflared")
        run.assert_called_once_with(["/opt/homebrew/bin/brew", "install", "cloudflared"], check=False)

    @mock.patch("src.auth.ensure_cloudflared_installed", return_value="/usr/local/bin/cloudflared")
    @mock.patch("src.auth.subprocess.run")
    def test_fetches_access_token_and_persists_it(
        self,
        run: mock.Mock,
        _ensure_cloudflared_installed: mock.Mock,
    ) -> None:
        config = resolve_uploader_config(self.work_dir, site_url_override="https://compare.example.com")

        run.side_effect = [
            SimpleNamespace(returncode=0),
            SimpleNamespace(returncode=0, stdout="token-123\n", stderr=""),
        ]

        token = fetch_access_token_via_cloudflared(config)

        self.assertEqual(token, "token-123")
        self.assertEqual(config.access_token, "token-123")
        env_text = (self.work_dir / ".env").read_text(encoding="utf-8")
        self.assertIn(f"{ENV_ACCESS_TOKEN_NAME}=token-123", env_text)
        self.assertEqual(run.call_args_list[0].args[0], ["/usr/local/bin/cloudflared", "access", "login", "https://compare.example.com"])
        self.assertEqual(
            run.call_args_list[1].args[0],
            ["/usr/local/bin/cloudflared", "access", "token", "-app=https://compare.example.com"],
        )

    def test_raises_on_half_configured_service_token(self) -> None:
        config = UploaderConfig(
            site_url="https://compare.example.com",
            api_url="https://compare.example.com/api/ops/import-sync",
            env_path=None,
            work_dir=None,
            access_token=None,
            service_token_client_id="client-id",
            service_token_client_secret=None,
        )

        with self.assertRaisesRegex(RuntimeError, "缺少 Client Secret"):
            build_request_headers(config)


if __name__ == "__main__":
    unittest.main()
