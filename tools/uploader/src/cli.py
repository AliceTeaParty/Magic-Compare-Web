from __future__ import annotations

from pathlib import Path

import typer

from .auth import ENV_API_URL_NAME, ENV_SITE_URL_NAME
from .commands import (
    _normalize_path_text,
    _resolve_source_dir,
    console,
    handle_delete_group,
    handle_manifest,
    handle_plan,
    handle_sync,
)
from .wizard import run_wizard

app = typer.Typer(add_completion=False, help="Magic Compare 中文导入工具")


def _handle_top_level_error(error: Exception, *, default_message: str) -> None:
    """Map unexpected command failures to exit code 2 so automation can distinguish runtime errors from plan errors."""
    console.print(f"[red]{default_message}：{error}[/]")
    raise typer.Exit(code=2) from error


@app.callback(invoke_without_command=True)
def main(
    ctx: typer.Context,
    site_url: str | None = typer.Option(
        None,
        "--site-url",
        help=f"内部站点主页，优先读取 {ENV_SITE_URL_NAME}。",
    ),
    api_url: str | None = typer.Option(
        None,
        "--api-url",
        help=f"内部站点导入接口，优先读取 {ENV_API_URL_NAME}。",
    ),
    report_json: Path | None = typer.Option(
        None,
        "--report-json",
        help="把当前计划/执行结果写成机器可读 JSON。",
    ),
) -> None:
    """Magic Compare 中文导入工具。"""
    if ctx.invoked_subcommand is not None:
        return

    try:
        run_wizard(site_url=site_url, api_url=api_url, report_json=report_json)
    except typer.Abort:
        console.print("[yellow]已取消本次导入。[/]")
        raise typer.Exit(code=1) from None
    except Exception as error:  # pragma: no cover - user-facing guard
        _handle_top_level_error(error, default_message="导入失败")


@app.command()
def plan(
    source: Path,
    report_json: Path | None = typer.Option(None, "--report-json"),
    case_slug: str | None = typer.Option(None, "--case-slug"),
    group_slug: str | None = typer.Option(None, "--group-slug"),
) -> None:
    """只做扫描、校验和计划生成，不上传也不写远端。"""
    try:
        report = handle_plan(source, report_json=report_json, case_slug=case_slug, group_slug=group_slug)
    except Exception as error:
        _handle_top_level_error(error, default_message="预演失败")

    if report.exit_code != 0:
        raise typer.Exit(code=report.exit_code)


@app.command()
def scan(source: Path) -> None:
    """兼容旧入口：等价于 `plan`，但只打印摘要。"""
    try:
        report = handle_plan(source)
    except Exception as error:
        _handle_top_level_error(error, default_message="扫描失败")

    if report.exit_code != 0:
        raise typer.Exit(code=report.exit_code)


@app.command()
def manifest(
    source: Path,
    output: Path | None = typer.Option(None, "--output", "-o"),
    site_url: str | None = typer.Option(  # kept for CLI compatibility; manifest generation is now local-only.
        None,
        "--site-url",
        help=f"内部站点主页，优先读取 {ENV_SITE_URL_NAME}。",
    ),
    api_url: str | None = typer.Option(
        None,
        "--api-url",
        help=f"内部站点导入接口，优先读取 {ENV_API_URL_NAME}。",
    ),
) -> None:
    """生成 import manifest JSON，但不执行上传。"""
    _ = site_url, api_url
    try:
        handle_manifest(source, output=output)
    except Exception as error:
        _handle_top_level_error(error, default_message="Manifest 生成失败")


@app.command()
def sync(
    source: Path,
    site_url: str | None = typer.Option(
        None,
        "--site-url",
        help=f"内部站点主页，优先读取 {ENV_SITE_URL_NAME}。",
    ),
    api_url: str | None = typer.Option(
        None,
        "--api-url",
        help=f"内部站点导入接口，优先读取 {ENV_API_URL_NAME}。",
    ),
    report_json: Path | None = typer.Option(None, "--report-json"),
    dry_run: bool = typer.Option(False, "--dry-run", help="只执行 plan，不上传也不调用 sync 接口。"),
    reset_session: bool = typer.Option(False, "--reset-session", help="忽略已有 upload session，从头重建。"),
) -> None:
    """对结构化 case 目录执行 plan、上传和同步。"""
    try:
        report, execution_summary, _sync_result = handle_sync(
            source,
            site_url=site_url,
            api_url=api_url,
            report_json=report_json,
            dry_run=dry_run,
            reset_session=reset_session,
        )
    except typer.Abort:
        console.print("[yellow]已取消本次同步。[/]")
        raise typer.Exit(code=1) from None
    except Exception as error:
        _handle_top_level_error(error, default_message="同步失败")

    if report.exit_code != 0:
        raise typer.Exit(code=report.exit_code)
    if execution_summary and not execution_summary.succeeded:
        raise typer.Exit(code=1)


@app.command("delete-group")
def delete_group_command(
    case_slug: str | None = typer.Option(None, "--case-slug", help="要删除 group 所在的 case slug。"),
    group_slug: str | None = typer.Option(None, "--group-slug", help="要删除的 group slug。"),
    work_dir: Path = typer.Option(
        Path.cwd(),
        "--work-dir",
        help="用于读取工作目录 .env 的目录。",
    ),
    site_url: str | None = typer.Option(
        None,
        "--site-url",
        help=f"内部站点主页，优先读取 {ENV_SITE_URL_NAME}。",
    ),
    api_url: str | None = typer.Option(
        None,
        "--api-url",
        help=f"内部站点导入接口，优先读取 {ENV_API_URL_NAME}。",
    ),
) -> None:
    """删除内部站某个 case 下的 group，并清理关联资产。"""
    try:
        handle_delete_group(
            case_slug=case_slug,
            group_slug=group_slug,
            work_dir=work_dir,
            site_url=site_url,
            api_url=api_url,
        )
    except typer.Abort:
        console.print("[yellow]已取消删除。[/]")
        raise typer.Exit(code=1) from None
    except Exception as error:
        _handle_top_level_error(error, default_message="删除失败")


if __name__ == "__main__":
    app()
