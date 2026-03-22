from __future__ import annotations

from .config import (
    ENV_ACCESS_CLIENT_ID_NAME,
    ENV_ACCESS_CLIENT_SECRET_NAME,
    ENV_API_URL_NAME,
    ENV_S3_ACCESS_KEY_ID_NAME,
    ENV_S3_BUCKET_NAME,
    ENV_S3_ENDPOINT_NAME,
    ENV_S3_FORCE_PATH_STYLE_NAME,
    ENV_S3_INTERNAL_PREFIX_NAME,
    ENV_S3_REGION_NAME,
    ENV_S3_SECRET_ACCESS_KEY_NAME,
    ENV_SITE_URL_NAME,
    UploaderConfig,
    ensure_remote_access_config,
    ensure_work_dir_env,
    import_sync_url,
    internal_site_base_url,
    persist_config_overrides,
    resolve_uploader_config,
    uploader_env_example_path,
)


def build_request_headers(config: UploaderConfig) -> dict[str, str]:
    """Only attach Service Token headers for remote sites so local development stays zero-config."""
    ensure_remote_access_config(config)
    if config.is_local_site:
        return {}

    return {
        "CF-Access-Client-Id": config.service_token_client_id or "",
        "CF-Access-Client-Secret": config.service_token_client_secret or "",
    }
