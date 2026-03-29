from __future__ import annotations

import os
import sys
from pathlib import Path

import typer

from .auth import ENV_API_URL_NAME, ENV_SITE_URL_NAME
from .commands import (
    _normalize_path_text as _normalize_path_text,
    _resolve_source_dir as _resolve_source_dir,
    console,
    handle_delete_case,
    handle_delete_group,
    handle_list_cases,
    handle_list_groups,
    handle_plan,
    handle_sync,
)
from .wizard import run_wizard


def _configure_windows_stdio_for_unicode() -> None:
    """Force UTF-8 stdio on Windows so Rich/Typer help text can print Chinese copy even when the parent shell defaults to a legacy code page."""
    if os.name != "nt":
        return

    for stream in (sys.stdout, sys.stderr):
        reconfigure = getattr(stream, "reconfigure", None)
        if callable(reconfigure):
            # Git Bash on GitHub Actions still exposes a non-UTF console by default.
            # Reconfiguring here keeps the frozen binary usable without asking operators
            # to change their terminal locale just to read built-in help output.
            reconfigure(encoding="utf-8", errors="replace")


_configure_windows_stdio_for_unicode()


app = typer.Typer(
    add_completion=False,
    help="Magic Compare 中文导入工具",
    epilog="主要命令只有 plan 和 sync。其余命令只用于排查、查看或清理 remote 状态。",
)


def _handle_top_level_error(error: Exception, *, default_message: str) -> None:
    """Map unexpected command failures to exit code 2 so automation can distinguish runtime errors from plan errors."""
    console.print(f"[red] {default_message}:{error}[/]")
    raise typer.Exit(code=2) from error


@app.callback(invoke_without_command=True)
def main(
    ctx: typer.Context,
    site_url: str | None = typer.Option(
        None,
        "--site-url",
        help=f"internal-site 首页地址；优先读取 {ENV_SITE_URL_NAME}。",
    ),
    api_url: str | None = typer.Option(
        None,
        "--api-url",
        help=f"group-upload-start 接口地址；留空时优先读取 {ENV_API_URL_NAME}，否则从 site_url 推断。",
    ),
    report_json: Path | None = typer.Option(
        None,
        "--report-json",
        help="把预演或同步结果写成 JSON 报告。",
    ),
) -> None:
    """不带子命令时进入中文向导。"""
    if ctx.invoked_subcommand is not None:
        return

    try:
        run_wizard(site_url=site_url, api_url=api_url, report_json=report_json)
    except typer.Abort:
        console.print("[yellow] 已取消本次导入。[/]")
        raise typer.Exit(code=1) from None
    except Exception as error:  # pragma: no cover - user-facing guard
        _handle_top_level_error(error, default_message="导入失败")


@app.command(rich_help_panel="主要命令")
def plan(
    source: Path,
    report_json: Path | None = typer.Option(None, "--report-json"),
    case_slug: str | None = typer.Option(None, "--case-slug"),
    group_slug: str | None = typer.Option(None, "--group-slug"),
) -> None:
    """预演素材目录，检查命名、坏图和目标路径，不上传。"""
    try:
        report = handle_plan(
            source, report_json=report_json, case_slug=case_slug, group_slug=group_slug
        )
    except Exception as error:
        _handle_top_level_error(error, default_message="预演失败")

    if report.exit_code != 0:
        raise typer.Exit(code=report.exit_code)


@app.command(rich_help_panel="主要命令")
def sync(
    source: Path,
    site_url: str | None = typer.Option(
        None,
        "--site-url",
        help=f"internal-site 首页地址；优先读取 {ENV_SITE_URL_NAME}。",
    ),
    api_url: str | None = typer.Option(
        None,
        "--api-url",
        help=f"group-upload-start 接口地址；留空时优先读取 {ENV_API_URL_NAME}，否则从 site_url 推断。",
    ),
    report_json: Path | None = typer.Option(None, "--report-json"),
    dry_run: bool = typer.Option(
        False, "--dry-run", help="只跑预演，不上传，也不调用 remote 接口。"
    ),
    reset_session: bool = typer.Option(
        False, "--reset-session", help="忽略已有 upload session，从头开始这次同步。"
    ),
) -> None:
    """对结构化 case 目录执行预演、直传和服务端提交。"""
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
        console.print("[yellow] 已取消本次同步。[/]")
        raise typer.Exit(code=1) from None
    except Exception as error:
        _handle_top_level_error(error, default_message="同步失败")

    if report.exit_code != 0:
        raise typer.Exit(code=report.exit_code)
    if execution_summary and not execution_summary.succeeded:
        raise typer.Exit(code=1)


@app.command("delete-group", rich_help_panel="杂项命令")
def delete_group_command(
    case_slug: str | None = typer.Option(
        None, "--case-slug", help="要删除 group 所在的 case slug。"
    ),
    group_slug: str | None = typer.Option(
        None, "--group-slug", help="要删除的 group slug。"
    ),
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
    """删除 internal-site 某个 case 下的 group，并清理关联资产。"""
    try:
        handle_delete_group(
            case_slug=case_slug,
            group_slug=group_slug,
            work_dir=work_dir,
            site_url=site_url,
            api_url=api_url,
        )
    except typer.Abort:
        console.print("[yellow] 已取消删除。[/]")
        raise typer.Exit(code=1) from None
    except Exception as error:
        _handle_top_level_error(error, default_message="删除失败")


@app.command("list-cases", rich_help_panel="杂项命令")
def list_cases_command(
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
        help=f"内部站点 group-upload-start 接口，优先读取 {ENV_API_URL_NAME}。",
    ),
) -> None:
    """列出 internal-site 当前全部 case。"""
    try:
        handle_list_cases(
            work_dir=work_dir,
            site_url=site_url,
            api_url=api_url,
        )
    except Exception as error:
        _handle_top_level_error(error, default_message="列出 case 失败")


@app.command("list-groups", rich_help_panel="杂项命令")
def list_groups_command(
    case_slug: str | None = typer.Option(
        None, "--case-slug", help="要查看的 case slug；留空时交互选择。"
    ),
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
        help=f"内部站点 group-upload-start 接口，优先读取 {ENV_API_URL_NAME}。",
    ),
) -> None:
    """列出某个 case 下当前全部 group。"""
    try:
        handle_list_groups(
            case_slug=case_slug,
            work_dir=work_dir,
            site_url=site_url,
            api_url=api_url,
        )
    except typer.Abort:
        console.print("[yellow] 已取消查看。[/]")
        raise typer.Exit(code=1) from None
    except Exception as error:
        _handle_top_level_error(error, default_message="列出 group 失败")


@app.command("delete-case", rich_help_panel="杂项命令")
def delete_case_command(
    case_slug: str | None = typer.Option(
        None, "--case-slug", help="要删除的空 case slug。"
    ),
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
        help=f"内部站点 group-upload-start 接口，优先读取 {ENV_API_URL_NAME}。",
    ),
) -> None:
    """删除一个当前没有任何 group 的 case。"""
    try:
        handle_delete_case(
            case_slug=case_slug,
            work_dir=work_dir,
            site_url=site_url,
            api_url=api_url,
        )
    except typer.Abort:
        console.print("[yellow] 已取消删除。[/]")
        raise typer.Exit(code=1) from None
    except Exception as error:
        _handle_top_level_error(error, default_message="删除失败")


if __name__ == "__main__":
    app()
