from __future__ import annotations

import ipaddress
import os
import stat
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import urlparse

from dotenv import dotenv_values, find_dotenv, set_key

ENV_SITE_URL_NAME = "MAGIC_COMPARE_SITE_URL"
ENV_API_URL_NAME = "MAGIC_COMPARE_API_URL"
ENV_ACCESS_CLIENT_ID_NAME = "MAGIC_COMPARE_CF_ACCESS_CLIENT_ID"
ENV_ACCESS_CLIENT_SECRET_NAME = "MAGIC_COMPARE_CF_ACCESS_CLIENT_SECRET"
ENV_S3_BUCKET_NAME = "MAGIC_COMPARE_S3_BUCKET"
ENV_S3_REGION_NAME = "MAGIC_COMPARE_S3_REGION"
ENV_S3_ENDPOINT_NAME = "MAGIC_COMPARE_S3_ENDPOINT"
ENV_S3_ACCESS_KEY_ID_NAME = "MAGIC_COMPARE_S3_ACCESS_KEY_ID"
ENV_S3_SECRET_ACCESS_KEY_NAME = "MAGIC_COMPARE_S3_SECRET_ACCESS_KEY"
ENV_S3_FORCE_PATH_STYLE_NAME = "MAGIC_COMPARE_S3_FORCE_PATH_STYLE"
ENV_S3_INTERNAL_PREFIX_NAME = "MAGIC_COMPARE_S3_INTERNAL_PREFIX"

FALLBACK_SITE_URL = "http://localhost:3000"
IMPORT_SYNC_PATH = "/api/ops/import-sync"


@dataclass
class UploaderConfig:
    site_url: str
    api_url: str
    env_path: Path | None
    work_dir: Path | None
    service_token_client_id: str | None = None
    service_token_client_secret: str | None = None
    s3_bucket: str | None = None
    s3_region: str | None = None
    s3_endpoint: str | None = None
    s3_access_key_id: str | None = None
    s3_secret_access_key: str | None = None
    s3_force_path_style: bool = False
    s3_internal_prefix: str = "internal-assets"

    @property
    def is_local_site(self) -> bool:
        hostname = (urlparse(self.site_url).hostname or "").strip()
        if hostname in {"localhost", "127.0.0.1", "::1"}:
            return True
        try:
            address = ipaddress.ip_address(hostname)
        except ValueError:
            return False
        return address.is_loopback or address.is_private

    @property
    def has_service_token(self) -> bool:
        return bool(self.service_token_client_id and self.service_token_client_secret)

    @property
    def has_s3_config(self) -> bool:
        return bool(
            self.s3_bucket
            and self.s3_region
            and self.s3_access_key_id
            and self.s3_secret_access_key
        )


def _uploader_root(current_file: Path) -> Path:
    return current_file.resolve().parents[1]


def _normalize_url(value: str) -> str:
    return value.rstrip("/")


def _default_env_example_text() -> str:
    """Keep a built-in uploader template so the CLI still works outside the repo checkout."""
    return "\n".join(
        [
            "# Magic Compare uploader local configuration",
            "# Internal site homepage used for API derivation and optional remote auth decisions.",
            f"{ENV_SITE_URL_NAME}={FALLBACK_SITE_URL}",
            "# Optional explicit import endpoint. Leave blank to derive from site URL.",
            f"{ENV_API_URL_NAME}=",
            "# S3-compatible internal asset storage.",
            f"{ENV_S3_BUCKET_NAME}=magic-compare-assets",
            f"{ENV_S3_REGION_NAME}=us-east-1",
            f"{ENV_S3_ENDPOINT_NAME}=http://localhost:9000",
            f"{ENV_S3_ACCESS_KEY_ID_NAME}=rustfsadmin",
            f"{ENV_S3_SECRET_ACCESS_KEY_NAME}=rustfsadmin",
            f"{ENV_S3_FORCE_PATH_STYLE_NAME}=true",
            f"{ENV_S3_INTERNAL_PREFIX_NAME}=internal-assets",
            "# Required only when the target site is not local/private.",
            f"{ENV_ACCESS_CLIENT_ID_NAME}=",
            f"{ENV_ACCESS_CLIENT_SECRET_NAME}=",
            "",
        ]
    )


def uploader_env_example_path() -> Path:
    return _uploader_root(Path(__file__)) / ".env.example"


def ensure_work_dir_env(work_dir: Path) -> Path:
    """Seed the uploader work dir from the uploader-local template instead of the website runtime env."""
    work_dir.mkdir(parents=True, exist_ok=True)
    env_path = work_dir / ".env"
    if env_path.exists():
        return env_path

    template_path = uploader_env_example_path()
    if template_path.exists():
        content = template_path.read_text(encoding="utf-8")
    else:
        content = _default_env_example_text()

    env_path.write_text(content, encoding="utf-8")
    env_path.chmod(stat.S_IRUSR | stat.S_IWUSR)
    return env_path


def _clean_env_values(values: dict[str, str | None]) -> dict[str, str]:
    return {key: value for key, value in values.items() if value is not None}


def _parse_env_flag(value: str | None) -> bool:
    if not value:
        return False
    return value.strip().lower() in {"1", "true", "yes", "on"}


def internal_site_base_url(api_url: str) -> str:
    marker = "/api/ops/"
    normalized = _normalize_url(api_url)
    if marker not in normalized:
        return normalized
    return normalized.split(marker, maxsplit=1)[0]


def import_sync_url(site_url: str) -> str:
    return f"{_normalize_url(site_url)}{IMPORT_SYNC_PATH}"


def resolve_uploader_config(
    work_dir: Path | None = None,
    *,
    api_url_override: str | None = None,
    site_url_override: str | None = None,
) -> UploaderConfig:
    """Resolve uploader config with a self-contained work-dir env while still allowing explicit host overrides."""
    cwd_dotenv = find_dotenv(usecwd=True)
    cwd_env_path = Path(cwd_dotenv) if cwd_dotenv else None
    work_env_path = ensure_work_dir_env(work_dir) if work_dir else None

    merged_values: dict[str, str] = {}
    if cwd_env_path and cwd_env_path.exists():
        merged_values.update(_clean_env_values(dotenv_values(cwd_env_path)))
    if work_env_path and work_env_path.exists():
        # The work-dir .env is uploader-owned and should override any generic repo root .env.
        merged_values.update(_clean_env_values(dotenv_values(work_env_path)))

    for key in (
        ENV_SITE_URL_NAME,
        ENV_API_URL_NAME,
        ENV_ACCESS_CLIENT_ID_NAME,
        ENV_ACCESS_CLIENT_SECRET_NAME,
        ENV_S3_BUCKET_NAME,
        ENV_S3_REGION_NAME,
        ENV_S3_ENDPOINT_NAME,
        ENV_S3_ACCESS_KEY_ID_NAME,
        ENV_S3_SECRET_ACCESS_KEY_NAME,
        ENV_S3_FORCE_PATH_STYLE_NAME,
        ENV_S3_INTERNAL_PREFIX_NAME,
    ):
        if key in os.environ and os.environ[key]:
            merged_values[key] = os.environ[key]

    raw_api_url = (api_url_override or merged_values.get(ENV_API_URL_NAME, "")).strip()
    raw_site_url = (site_url_override or merged_values.get(ENV_SITE_URL_NAME, "")).strip()

    if not raw_site_url and raw_api_url:
        raw_site_url = internal_site_base_url(raw_api_url)
    if not raw_site_url:
        raw_site_url = FALLBACK_SITE_URL

    site_url = _normalize_url(raw_site_url)
    api_url = _normalize_url(raw_api_url) if raw_api_url else import_sync_url(site_url)

    return UploaderConfig(
        site_url=site_url,
        api_url=api_url,
        env_path=work_env_path or cwd_env_path,
        work_dir=work_dir,
        service_token_client_id=(merged_values.get(ENV_ACCESS_CLIENT_ID_NAME, "") or None),
        service_token_client_secret=(merged_values.get(ENV_ACCESS_CLIENT_SECRET_NAME, "") or None),
        s3_bucket=(merged_values.get(ENV_S3_BUCKET_NAME, "") or None),
        s3_region=(merged_values.get(ENV_S3_REGION_NAME, "") or "us-east-1"),
        s3_endpoint=(merged_values.get(ENV_S3_ENDPOINT_NAME, "") or None),
        s3_access_key_id=(merged_values.get(ENV_S3_ACCESS_KEY_ID_NAME, "") or None),
        s3_secret_access_key=(merged_values.get(ENV_S3_SECRET_ACCESS_KEY_NAME, "") or None),
        s3_force_path_style=_parse_env_flag(merged_values.get(ENV_S3_FORCE_PATH_STYLE_NAME, "")),
        s3_internal_prefix=(merged_values.get(ENV_S3_INTERNAL_PREFIX_NAME, "") or "internal-assets"),
    )


def persist_config_overrides(
    config: UploaderConfig,
    *,
    site_url: str | None = None,
    api_url: str | None = None,
) -> None:
    """Persist CLI overrides back into the uploader-owned env so resumed runs stay consistent."""
    if not config.env_path:
        return

    if site_url:
        set_key(str(config.env_path), ENV_SITE_URL_NAME, _normalize_url(site_url), quote_mode="never")
        config.site_url = _normalize_url(site_url)
    if api_url:
        set_key(str(config.env_path), ENV_API_URL_NAME, _normalize_url(api_url), quote_mode="never")
        config.api_url = _normalize_url(api_url)


def ensure_remote_access_config(config: UploaderConfig) -> None:
    """Remote sites now require Service Token credentials so the CLI stays scriptable and deterministic."""
    if config.is_local_site:
        return

    if config.service_token_client_id and not config.service_token_client_secret:
        raise RuntimeError("检测到 Cloudflare Service Token Client ID，但缺少 Client Secret。")
    if config.service_token_client_secret and not config.service_token_client_id:
        raise RuntimeError("检测到 Cloudflare Service Token Client Secret，但缺少 Client ID。")
    if not config.has_service_token:
        raise RuntimeError(
            "远端内部站只支持 Cloudflare Service Token。请在 uploader .env 中配置 "
            "MAGIC_COMPARE_CF_ACCESS_CLIENT_ID 和 MAGIC_COMPARE_CF_ACCESS_CLIENT_SECRET。"
        )
