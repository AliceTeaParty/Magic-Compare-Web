from __future__ import annotations

import ipaddress
import os
import shutil
import stat
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import urlparse

from dotenv import dotenv_values, find_dotenv, set_key, unset_key

ENV_SITE_URL_NAME = "MAGIC_COMPARE_SITE_URL"
ENV_API_URL_NAME = "MAGIC_COMPARE_API_URL"
ENV_ACCESS_TOKEN_NAME = "MAGIC_COMPARE_CF_ACCESS_TOKEN"
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
    access_token: str | None = None
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


def _repo_root(current_file: Path) -> Path:
    return current_file.resolve().parents[3]


def _normalize_url(value: str) -> str:
    return value.rstrip("/")


def _default_env_example_text() -> str:
    return "\n".join(
        [
            "# Magic Compare uploader local configuration",
            "# Internal site homepage protected by Cloudflare Access.",
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
            "# Human login token. CLI writes this automatically after cloudflared login.",
            f"{ENV_ACCESS_TOKEN_NAME}=",
            "# Optional Cloudflare Access service token for CI/automation.",
            f"{ENV_ACCESS_CLIENT_ID_NAME}=",
            f"{ENV_ACCESS_CLIENT_SECRET_NAME}=",
            "",
        ]
    )


def repo_env_example_path() -> Path:
    return _repo_root(Path(__file__)) / ".env.example"


def ensure_work_dir_env(work_dir: Path) -> Path:
    work_dir.mkdir(parents=True, exist_ok=True)
    env_path = work_dir / ".env"
    if env_path.exists():
        return env_path

    template_path = repo_env_example_path()
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
    cwd_dotenv = find_dotenv(usecwd=True)
    cwd_env_path = Path(cwd_dotenv) if cwd_dotenv else None
    work_env_path = ensure_work_dir_env(work_dir) if work_dir else None

    merged_values: dict[str, str] = {}
    if cwd_env_path and cwd_env_path.exists():
        merged_values.update(_clean_env_values(dotenv_values(cwd_env_path)))
    if work_env_path and work_env_path.exists():
        merged_values.update(_clean_env_values(dotenv_values(work_env_path)))

    for key in (
        ENV_SITE_URL_NAME,
        ENV_API_URL_NAME,
        ENV_ACCESS_TOKEN_NAME,
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
        access_token=(merged_values.get(ENV_ACCESS_TOKEN_NAME, "") or None),
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
    if not config.env_path:
        return

    if site_url:
        set_key(str(config.env_path), ENV_SITE_URL_NAME, _normalize_url(site_url), quote_mode="never")
        config.site_url = _normalize_url(site_url)
    if api_url:
        set_key(str(config.env_path), ENV_API_URL_NAME, _normalize_url(api_url), quote_mode="never")
        config.api_url = _normalize_url(api_url)


def clear_access_token(config: UploaderConfig) -> None:
    config.access_token = None
    if config.env_path and config.env_path.exists():
        unset_key(str(config.env_path), ENV_ACCESS_TOKEN_NAME, quote_mode="never")


def persist_access_token(config: UploaderConfig, token: str) -> None:
    config.access_token = token
    if config.env_path:
        set_key(str(config.env_path), ENV_ACCESS_TOKEN_NAME, token, quote_mode="never")
        config.env_path.chmod(stat.S_IRUSR | stat.S_IWUSR)


def ensure_cloudflared_installed() -> str:
    existing = shutil.which("cloudflared")
    if existing:
        return existing

    if sys.platform != "darwin":
        raise RuntimeError("未检测到 cloudflared。v1 仅支持 macOS 自动安装，请先手动安装后重试。")

    brew = shutil.which("brew")
    if not brew:
        raise RuntimeError("未检测到 cloudflared，且系统中没有 Homebrew。请先安装 Homebrew 或手动安装 cloudflared。")

    install_result = subprocess.run([brew, "install", "cloudflared"], check=False)
    if install_result.returncode != 0:
        raise RuntimeError("自动安装 cloudflared 失败。请先手动执行 `brew install cloudflared` 后重试。")

    installed = shutil.which("cloudflared")
    if not installed:
        raise RuntimeError("已执行 cloudflared 安装，但当前 shell 仍未找到该命令，请重新打开终端后重试。")
    return installed


def fetch_access_token_via_cloudflared(config: UploaderConfig) -> str:
    executable = ensure_cloudflared_installed()

    login_result = subprocess.run([executable, "access", "login", config.site_url], check=False)
    if login_result.returncode != 0:
        raise RuntimeError("Cloudflare Access 登录失败，请确认内部站地址和 Zero Trust 配置后重试。")

    token_result = subprocess.run(
        [executable, "access", "token", f"-app={config.site_url}"],
        check=False,
        capture_output=True,
        text=True,
    )
    token = token_result.stdout.strip()
    if token_result.returncode != 0 or not token:
        stderr = token_result.stderr.strip()
        detail = f"：{stderr}" if stderr else "。"
        raise RuntimeError(f"无法获取 Cloudflare Access token{detail}")

    persist_access_token(config, token)
    return token


def ensure_user_access_token(config: UploaderConfig, *, force_refresh: bool = False) -> str | None:
    if config.has_service_token or config.is_local_site:
        return None

    if config.access_token and not force_refresh:
        return config.access_token

    if force_refresh:
        clear_access_token(config)

    return fetch_access_token_via_cloudflared(config)


def build_request_headers(
    config: UploaderConfig,
    *,
    force_refresh_access_token: bool = False,
) -> dict[str, str]:
    if config.service_token_client_id and not config.service_token_client_secret:
        raise RuntimeError("检测到 Cloudflare Service Token Client ID，但缺少 Client Secret。")
    if config.service_token_client_secret and not config.service_token_client_id:
        raise RuntimeError("检测到 Cloudflare Service Token Client Secret，但缺少 Client ID。")

    if config.has_service_token:
        return {
            "CF-Access-Client-Id": config.service_token_client_id or "",
            "CF-Access-Client-Secret": config.service_token_client_secret or "",
        }

    access_token = ensure_user_access_token(config, force_refresh=force_refresh_access_token)
    if access_token:
        return {"cf-access-token": access_token}

    return {}
