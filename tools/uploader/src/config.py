from __future__ import annotations

import ipaddress
import os
import stat
import sys
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import urlparse

from dotenv import dotenv_values, find_dotenv, set_key

ENV_SITE_URL_NAME = "MAGIC_COMPARE_SITE_URL"
ENV_API_URL_NAME = "MAGIC_COMPARE_API_URL"
ENV_ACCESS_CLIENT_ID_NAME = "MAGIC_COMPARE_CF_ACCESS_CLIENT_ID"
ENV_ACCESS_CLIENT_SECRET_NAME = "MAGIC_COMPARE_CF_ACCESS_CLIENT_SECRET"
ENV_UPLOAD_FRAME_WORKERS_NAME = "MAGIC_COMPARE_UPLOAD_FRAME_WORKERS"

PERSISTED_UPLOADER_ENV_KEYS = (
    ENV_SITE_URL_NAME,
    ENV_API_URL_NAME,
    ENV_ACCESS_CLIENT_ID_NAME,
    ENV_ACCESS_CLIENT_SECRET_NAME,
    ENV_UPLOAD_FRAME_WORKERS_NAME,
)

FALLBACK_SITE_URL = "http://localhost:3000"
GROUP_UPLOAD_START_PATH = "/api/ops/group-upload-start"


@dataclass
class UploaderConfig:
    site_url: str
    api_url: str
    env_path: Path | None
    work_dir: Path | None
    service_token_client_id: str | None = None
    service_token_client_secret: str | None = None
    upload_frame_workers: int | None = None

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
            "# Required only when the target site is not local/private.",
            f"{ENV_ACCESS_CLIENT_ID_NAME}=",
            f"{ENV_ACCESS_CLIENT_SECRET_NAME}=",
            "# Optional frame-level upload concurrency. Leave blank to auto-adapt within 1-8.",
            f"{ENV_UPLOAD_FRAME_WORKERS_NAME}=",
            "",
        ]
    )


def uploader_env_example_path() -> Path:
    return _uploader_root(Path(__file__)) / ".env.example"


def ensure_work_dir_env(
    work_dir: Path, *, inherited_values: dict[str, str] | None = None
) -> Path:
    """Seed a new work-dir env and copy the caller's uploader settings into that local runtime snapshot."""
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

    if inherited_values:
        for key in PERSISTED_UPLOADER_ENV_KEYS:
            value = inherited_values.get(key)
            if value:
                # A freshly created work-dir should inherit the caller's uploader context instead
                # of silently falling back to template localhost values and hitting the wrong site.
                set_key(str(env_path), key, value, quote_mode="never")

    return env_path


def _clean_env_values(values: dict[str, str | None]) -> dict[str, str]:
    return {key: value for key, value in values.items() if value is not None}


def _launcher_env_path() -> Path | None:
    """Only probe next to the packaged binary because Python source runs should not inherit the interpreter's directory."""
    if not getattr(sys, "frozen", False):
        return None

    executable_path = Path(sys.executable).resolve()
    env_path = executable_path.parent / ".env"
    return env_path if env_path.exists() else None


def _load_env_values(env_path: Path | None) -> dict[str, str]:
    if not env_path or not env_path.exists():
        return {}
    return _clean_env_values(dotenv_values(env_path))


def _parse_env_flag(value: str | None) -> bool:
    if not value:
        return False
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _parse_upload_frame_workers(value: str | None) -> int | None:
    """Parse the optional frame worker setting once so CLI and env inputs share the same validity rules."""
    if value is None:
        return None

    normalized = value.strip()
    if not normalized:
        return None

    try:
        parsed = int(normalized)
    except ValueError as error:
        raise RuntimeError(
            f"{ENV_UPLOAD_FRAME_WORKERS_NAME} 必须是 1 到 8 之间的整数。"
        ) from error

    if parsed < 1 or parsed > 8:
        raise RuntimeError(
            f"{ENV_UPLOAD_FRAME_WORKERS_NAME} 必须是 1 到 8 之间的整数。"
        )

    return parsed


def internal_site_base_url(api_url: str) -> str:
    marker = "/api/ops/"
    normalized = _normalize_url(api_url)
    if marker not in normalized:
        return normalized
    return normalized.split(marker, maxsplit=1)[0]


def import_sync_url(site_url: str) -> str:
    return f"{_normalize_url(site_url)}{GROUP_UPLOAD_START_PATH}"


def resolve_uploader_config(
    work_dir: Path | None = None,
    *,
    api_url_override: str | None = None,
    site_url_override: str | None = None,
    upload_frame_workers_override: int | None = None,
) -> UploaderConfig:
    """Resolve uploader config with a self-contained work-dir env while still allowing explicit host overrides."""
    launcher_env_path = _launcher_env_path()
    launcher_env_values = _load_env_values(launcher_env_path)
    cwd_dotenv = find_dotenv(usecwd=True)
    cwd_env_path = Path(cwd_dotenv) if cwd_dotenv else None
    cwd_env_values = _load_env_values(cwd_env_path)
    inherited_values: dict[str, str] = {}
    inherited_values.update(launcher_env_values)
    inherited_values.update(cwd_env_values)
    work_env_path = (
        ensure_work_dir_env(work_dir, inherited_values=inherited_values)
        if work_dir
        else None
    )
    work_env_values = _load_env_values(work_env_path)

    merged_values: dict[str, str] = {}
    if launcher_env_values:
        merged_values.update(launcher_env_values)
    if cwd_env_values:
        merged_values.update(cwd_env_values)
    if work_env_values:
        for key, value in work_env_values.items():
            # Connection settings are primarily launcher/cwd concerns; the work-dir copy is a
            # resume fallback and should not silently override the operator's current target.
            if not merged_values.get(key):
                merged_values[key] = value

    for key in (
        ENV_SITE_URL_NAME,
        ENV_API_URL_NAME,
        ENV_ACCESS_CLIENT_ID_NAME,
        ENV_ACCESS_CLIENT_SECRET_NAME,
    ):
        if key in os.environ and os.environ[key]:
            merged_values[key] = os.environ[key]

    raw_api_url = (api_url_override or merged_values.get(ENV_API_URL_NAME, "")).strip()
    raw_site_url = (
        site_url_override or merged_values.get(ENV_SITE_URL_NAME, "")
    ).strip()
    upload_frame_workers = (
        upload_frame_workers_override
        if upload_frame_workers_override is not None
        else _parse_upload_frame_workers(
            merged_values.get(ENV_UPLOAD_FRAME_WORKERS_NAME, "")
        )
    )

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
        service_token_client_id=(
            merged_values.get(ENV_ACCESS_CLIENT_ID_NAME, "") or None
        ),
        service_token_client_secret=(
            merged_values.get(ENV_ACCESS_CLIENT_SECRET_NAME, "") or None
        ),
        upload_frame_workers=upload_frame_workers,
    )


def persist_config_overrides(
    config: UploaderConfig,
    *,
    site_url: str | None = None,
    api_url: str | None = None,
    upload_frame_workers: int | None = None,
) -> None:
    """Persist CLI overrides back into the uploader-owned env so resumed runs stay consistent."""
    if not config.env_path:
        return

    if site_url:
        normalized_site_url = _normalize_url(site_url)
        set_key(
            str(config.env_path),
            ENV_SITE_URL_NAME,
            normalized_site_url,
            quote_mode="never",
        )
        config.site_url = normalized_site_url
    if api_url:
        normalized_api_url = _normalize_url(api_url)
        set_key(
            str(config.env_path),
            ENV_API_URL_NAME,
            normalized_api_url,
            quote_mode="never",
        )
        config.api_url = normalized_api_url
    if upload_frame_workers is not None:
        set_key(
            str(config.env_path),
            ENV_UPLOAD_FRAME_WORKERS_NAME,
            str(upload_frame_workers),
            quote_mode="never",
        )
        config.upload_frame_workers = upload_frame_workers


def ensure_remote_access_config(config: UploaderConfig) -> None:
    """Remote sites now require Service Token credentials so the CLI stays scriptable and deterministic."""
    if config.is_local_site:
        return

    if config.service_token_client_id and not config.service_token_client_secret:
        raise RuntimeError(
            "检测到 Cloudflare Service Token Client ID，但缺少 Client Secret。"
        )
    if config.service_token_client_secret and not config.service_token_client_id:
        raise RuntimeError(
            "检测到 Cloudflare Service Token Client Secret，但缺少 Client ID。"
        )
    if not config.has_service_token:
        raise RuntimeError(
            "远端内部站只支持 Cloudflare Service Token。请在 uploader .env 中配置 "
            "MAGIC_COMPARE_CF_ACCESS_CLIENT_ID 和 MAGIC_COMPARE_CF_ACCESS_CLIENT_SECRET。"
        )
