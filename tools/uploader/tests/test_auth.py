from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from src.auth import (
    ENV_ACCESS_CLIENT_ID_NAME,
    ENV_ACCESS_CLIENT_SECRET_NAME,
    ENV_SITE_URL_NAME,
    build_request_headers,
    ensure_remote_access_config,
    ensure_work_dir_env,
    persist_config_overrides,
    resolve_uploader_config,
    uploader_env_example_path,
)


class UploaderConfigTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.work_dir = Path(self.temp_dir.name) / "sample-case"
        self.addCleanup(self.temp_dir.cleanup)

    def test_resolves_api_url_from_site_url_and_creates_env(self) -> None:
        config = resolve_uploader_config(
            self.work_dir, site_url_override="https://compare.example.com"
        )

        self.assertTrue((self.work_dir / ".env").exists())
        self.assertEqual(config.site_url, "https://compare.example.com")
        self.assertEqual(
            config.api_url, "https://compare.example.com/api/ops/import-sync"
        )

    def test_creates_work_dir_env_from_uploader_template(self) -> None:
        env_path = ensure_work_dir_env(self.work_dir)

        self.assertEqual(
            env_path.read_text(encoding="utf-8"),
            uploader_env_example_path().read_text(encoding="utf-8"),
        )
        self.assertNotIn(
            "MAGIC_COMPARE_PUBLIC_EXPORT_DIR", env_path.read_text(encoding="utf-8")
        )

    def test_persists_site_url_override_to_work_dir_env(self) -> None:
        config = resolve_uploader_config(self.work_dir)

        persist_config_overrides(config, site_url="https://compare.example.com")

        env_text = (self.work_dir / ".env").read_text(encoding="utf-8")
        self.assertIn(f"{ENV_SITE_URL_NAME}=https://compare.example.com", env_text)

    def test_build_request_headers_allows_local_sites_without_service_token(
        self,
    ) -> None:
        config = resolve_uploader_config(
            self.work_dir, site_url_override="http://localhost:3000"
        )

        self.assertEqual(build_request_headers(config), {})

    def test_build_request_headers_requires_service_token_for_remote_sites(
        self,
    ) -> None:
        config = resolve_uploader_config(
            self.work_dir, site_url_override="https://compare.example.com"
        )

        with self.assertRaisesRegex(RuntimeError, "只支持 Cloudflare Service Token"):
            build_request_headers(config)

    def test_remote_access_config_rejects_partial_service_token(self) -> None:
        env_path = ensure_work_dir_env(self.work_dir)
        env_path.write_text(
            "\n".join(
                [
                    "MAGIC_COMPARE_SITE_URL=https://compare.example.com",
                    f"{ENV_ACCESS_CLIENT_ID_NAME}=client-id",
                    "",
                ]
            ),
            encoding="utf-8",
        )

        config = resolve_uploader_config(self.work_dir)

        with self.assertRaisesRegex(RuntimeError, "缺少 Client Secret"):
            ensure_remote_access_config(config)

    def test_build_request_headers_prefers_service_token_for_remote_sites(self) -> None:
        env_path = ensure_work_dir_env(self.work_dir)
        env_path.write_text(
            "\n".join(
                [
                    "MAGIC_COMPARE_SITE_URL=https://compare.example.com",
                    f"{ENV_ACCESS_CLIENT_ID_NAME}=client-id",
                    f"{ENV_ACCESS_CLIENT_SECRET_NAME}=client-secret",
                    "",
                ]
            ),
            encoding="utf-8",
        )

        config = resolve_uploader_config(self.work_dir)

        self.assertEqual(
            build_request_headers(config),
            {
                "CF-Access-Client-Id": "client-id",
                "CF-Access-Client-Secret": "client-secret",
            },
        )


if __name__ == "__main__":
    unittest.main()
