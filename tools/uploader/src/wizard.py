from __future__ import annotations

import shutil
from datetime import datetime
from pathlib import Path

import typer
from rich.panel import Panel
from rich.table import Table
from rich.text import Text

from .api_client import CaseSearchResult, search_cases, sync_manifest
from .commands import (
    _ensure_s3_ready,
    _render_execution_summary,
    _prepare_runtime_config,
    _resolve_source_dir,
    _write_runtime_report,
    console,
    render_plan_summary,
)
from .config import UploaderConfig, ensure_remote_access_config
from .editor import open_in_editor
from .manifest import build_import_manifest_from_case
from .naming import build_default_work_dir, build_unique_slug
from .plan import build_case_plan, build_flat_source_plan, write_plan_report
from .source_parser import ParsedSourceGroup, discover_source_group
from .upload_executor import execute_upload_plan
from .workspace_builder import prepare_workspace


def _render_source_summary(group: ParsedSourceGroup) -> None:
    """Preview parsed frames before any workspace write so filename heuristics stay auditable."""
    table = Table(title="解析到的帧")
    table.add_column("#", justify="right", style="cyan", no_wrap=True)
    table.add_column("Frame", style="bold white")
    table.add_column("Before", style="green")
    table.add_column("After", style="yellow")
    table.add_column("Misc", justify="right", style="magenta")
    table.add_column("Heatmap", style="blue")

    for frame in group.frames:
        table.add_row(
            str(frame.order + 1),
            frame.title,
            frame.before.original_name,
            frame.after.original_name,
            str(len(frame.misc)),
            "显式文件" if frame.explicit_heatmap else "自动生成",
        )

    console.print(
        Panel(
            Text.from_markup(
                f"[bold]Group[/bold]: {group.title}\n"
                f"[bold]Slug[/bold]: {group.slug}\n"
                f"[bold]Frames[/bold]: {len(group.frames)}\n"
                f"[bold]Ignored[/bold]: {len(group.ignored_files)}"
            ),
            title="素材摘要",
            border_style="bright_black",
        )
    )
    console.print(table)


def _render_case_table(results: list[CaseSearchResult], query: str) -> None:
    """Keep case selection visual because the wizard is optimized for manual operators, not memorized slugs."""
    table = Table(title=f"已有 Case 候选：{query or '最近更新'}")
    table.add_column("#", justify="right", style="cyan", no_wrap=True)
    table.add_column("Title", style="bold white")
    table.add_column("Slug", style="green")
    table.add_column("Status", style="yellow")
    table.add_column("Updated", style="magenta")
    table.add_column("Groups", justify="right", style="blue")

    for index, result in enumerate(results, start=1):
        table.add_row(
            str(index),
            result.title,
            result.slug,
            result.status,
            result.updated_at or "-",
            str(result.group_count),
        )

    console.print(table)


def _choose_case(config: UploaderConfig, current_year: str) -> CaseSearchResult | None:
    """Prefer reusing the current-year case when possible so upload sessions accumulate under one predictable slug."""
    query = current_year

    while True:
        with console.status("[bold green]正在请求已有 case 列表...[/]"):
            results = search_cases(config, query, limit=8)

        _render_case_table(results, query)
        choice = console.input(
            f"[bold]输入编号复用已有 case，回车使用当前年份 case（{current_year}），输入 / 重新搜索：[/]"
        ).strip()

        if not choice:
            existing_year_case = next((item for item in results if item.slug == current_year), None)
            if existing_year_case:
                console.print(
                    f"[yellow]检测到已有 {current_year} case，将直接复用：{existing_year_case.title}[/]"
                )
                return existing_year_case
            return None

        if choice == "/":
            query = typer.prompt("新的搜索关键词", default=query).strip()
            continue

        if choice.isdigit():
            index = int(choice)
            if 1 <= index <= len(results):
                return results[index - 1]

        console.print("[red]输入无效，请重新选择。[/]")


def _resolve_work_dir(default_work_dir: Path) -> Path:
    """Guard existing work dirs because upload sessions and edited metadata should not be blown away silently."""
    if not default_work_dir.exists():
        return default_work_dir

    console.print(f"[yellow]工作目录已存在：{default_work_dir}[/]")
    choice = console.input("[bold]输入 1 覆盖，2 新建时间戳目录，3 取消 [默认 2]：[/]").strip() or "2"

    if choice == "1":
        if default_work_dir.is_dir():
            shutil.rmtree(default_work_dir)
        else:
            default_work_dir.unlink()
        return default_work_dir

    if choice == "2":
        timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
        return default_work_dir.with_name(f"{default_work_dir.name}-{timestamp}")

    raise typer.Abort()


def _resolve_group_slug(base_slug: str, selected_case: CaseSearchResult | None) -> str:
    """Ask before reusing a conflicting slug so operators can choose overwrite versus side-by-side imports."""
    if not selected_case:
        return base_slug

    existing_slugs = {group.slug for group in selected_case.groups}
    if base_slug not in existing_slugs:
        return base_slug

    suggested_slug = build_unique_slug(base_slug, existing_slugs)
    console.print(
        f"[yellow]目标 case 下已存在同名 group：{base_slug}[/]\n"
        f"[bold]1[/] 覆盖已有 group\n"
        f"[bold]2[/] 使用新 slug：{suggested_slug}"
    )
    choice = console.input("[bold]请选择 [默认 2]：[/]").strip() or "2"
    if choice == "1":
        return base_slug
    if choice == "2":
        return suggested_slug
    raise typer.Abort()


def _confirm_editor(path: Path, label: str) -> None:
    """Pause after opening metadata so the wizard never uploads files that the operator has not reviewed."""
    console.print(f"[cyan]正在打开 {label}：{path}[/]")
    open_in_editor(path)
    if not typer.confirm(f"{label} 已确认并保存，继续？", default=True):
        raise typer.Abort()


def run_wizard(
    *,
    site_url: str | None,
    api_url: str | None,
    report_json: Path | None = None,
) -> None:
    """Run the interactive uploader flow with an upfront plan step before any remote upload starts."""
    current_year = str(datetime.now().year)
    console.print(
        Panel(
            Text.from_markup(
                "[bold]Magic Compare Uploader[/bold]\n"
                "一站式中文导入向导：先预演计划，再上传同步。"
            ),
            border_style="bright_black",
        )
    )

    source_input = typer.prompt("素材目录", default=str(Path.cwd()))
    source_dir = _resolve_source_dir(source_input)

    with console.status("[bold green]正在解析素材文件名...[/]"):
        source_group = discover_source_group(source_dir)

    _render_source_summary(source_group)
    work_dir = _resolve_work_dir(build_default_work_dir(source_dir))
    config = _prepare_runtime_config(work_dir, site_url=site_url, api_url=api_url)

    selected_case = _choose_case(config, current_year)
    group_slug = _resolve_group_slug(source_group.slug, selected_case)
    preview_report = build_flat_source_plan(
        source_group,
        case_slug=selected_case.slug if selected_case else current_year,
        group_slug=group_slug,
    )
    render_plan_summary(preview_report)
    if report_json:
        write_plan_report(preview_report, report_json)
    if preview_report.status == "error":
        raise RuntimeError("预演计划存在阻塞错误，请先修正后再继续。")

    with console.status("[bold green]正在生成工作目录与 metadata...[/]"):
        prepared = prepare_workspace(
            source_group=source_group,
            work_dir=work_dir,
            existing_case=selected_case,
            current_year=current_year,
            group_slug=group_slug,
        )

    if selected_case:
        console.print(
            Panel(
                Text.from_markup(
                    f"[bold]复用已有 case[/bold]\n"
                    f"Title: {selected_case.title}\n"
                    f"Slug: {selected_case.slug}\n"
                    "本次不会覆盖 case 的标题、摘要、tags 或 status。"
                ),
                border_style="bright_black",
                title="Case",
            )
        )
    else:
        _confirm_editor(prepared.case_yaml, "case.yaml")

    _confirm_editor(prepared.group_yaml, "group.yaml")

    structured_plan = build_case_plan(prepared.work_dir)
    render_plan_summary(structured_plan.report)
    if structured_plan.report.status == "error":
        _write_runtime_report(structured_plan.report, report_json)
        raise RuntimeError("结构化工作目录仍存在阻塞错误，请修正后再上传。")

    if not typer.confirm("开始上传并同步到 internal-site？", default=True):
        raise typer.Abort()

    _ensure_s3_ready(config)
    ensure_remote_access_config(config)
    with console.status("[bold green]正在上传对象...[/]"):
        execution_summary = execute_upload_plan(structured_plan, config)
    _render_execution_summary(execution_summary)
    if not execution_summary.succeeded:
        _write_runtime_report(structured_plan.report, report_json, execution_summary=execution_summary)
        raise RuntimeError("上传阶段存在失败对象，请修正后再次执行，session 会自动续传。")

    manifest_payload = build_import_manifest_from_case(structured_plan.case_source)
    with console.status("[bold green]正在同步 manifest 到 internal-site...[/]"):
        result = sync_manifest(config, manifest_payload)
    _write_runtime_report(
        structured_plan.report,
        report_json,
        execution_summary=execution_summary,
        sync_result=result,
    )

    viewer_url = f"{config.site_url}/cases/{result['slug']}/groups/{prepared.group_slug}"
    console.print(
        Panel(
            Text.from_markup(
                "[bold green]上传成功[/]\n"
                f"Case slug: {result['slug']}\n"
                f"Group slug: {prepared.group_slug}\n"
                f"工作目录: {prepared.work_dir}\n"
                f"内部查看: {viewer_url}"
            ),
            border_style="green",
            title="完成",
        )
    )
