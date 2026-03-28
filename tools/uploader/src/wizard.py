from __future__ import annotations

import shutil
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

import typer
from rich.console import Group
from rich.live import Live
from rich.panel import Panel
from rich.progress import (
    BarColumn,
    MofNCompleteColumn,
    Progress,
    TextColumn,
    TimeElapsedColumn,
)
from rich.table import Table
from rich.text import Text

from .api_client import CaseSearchResult, search_cases
from .commands import (
    _prepare_runtime_config,
    _render_execution_summary,
    _resolve_source_dir,
    _write_runtime_report,
    console,
    render_plan_summary,
)
from .config import UploaderConfig, ensure_remote_access_config
from .editor import open_in_editor
from .naming import build_default_work_dir, build_unique_slug
from .plan import PreparedCasePlan, build_case_plan, build_flat_source_plan, write_plan_report
from .source_parser import ParsedSourceGroup, discover_source_group
from .upload_executor import (
    UploadExecutionSummary,
    UploadProgressEvent,
    execute_upload_plan,
)
from .workspace_builder import PreparedWorkspace, prepare_workspace


@dataclass
class WizardUploadProgressState:
    frame_status: str
    stats_line: str


def _event_stage_label(event: UploadProgressEvent) -> str:
    """Map structured upload events to short Chinese stage labels for the wizard."""
    if event.kind == "job_started":
        return "准备上传"
    if event.kind == "frame_resumed":
        return "续传跳过"
    if event.kind == "frame_prepared":
        return "已申请上传"
    if event.kind in {"file_uploaded", "file_failed"}:
        return "上传中"
    if event.kind == "frame_committed":
        return "已提交"
    if event.kind == "job_completed":
        return "上传完成"
    return event.stage


def _progress_description(event: UploadProgressEvent) -> str:
    """Keep the progress bar title stage-focused so the secondary lines can describe the active frame."""
    return f"正在{_event_stage_label(event)}..."


def _frame_status_line(event: UploadProgressEvent) -> str:
    """Show the active frame in one line so operators can tell whether the uploader is preparing, uploading, or committing."""
    if event.kind == "job_started":
        return "当前 frame：等待开始"
    if event.kind == "job_completed":
        return "当前 frame：全部完成"
    if event.frame_order is None or event.frame_title is None:
        return f"当前 frame：{_event_stage_label(event)}"

    return (
        f"当前 frame：{event.frame_order + 1}/{event.total_frames} "
        f"{event.frame_title} · {_event_stage_label(event)}"
    )


def _stats_line(event: UploadProgressEvent) -> str:
    """Keep the most important counters visible without making operators open the JSON session file."""
    return (
        f"文件：{event.completed_files}/{event.total_files} | "
        f"frame：{event.completed_frames}/{event.total_frames} | "
        f"skipped：{event.skipped_files} | "
        f"retried：{event.retried_count} | "
        f"failed：{event.failed_count}"
    )


def _render_upload_progress(
    progress: Progress,
    state: WizardUploadProgressState,
) -> Group:
    """Render the file bar plus the current frame and stats lines as one Live group."""
    return Group(
        progress,
        Text.from_markup(f"[cyan]{state.frame_status}[/]"),
        Text.from_markup(f"[magenta]{state.stats_line}[/]"),
    )


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
    """Offer case selection with options for reuse, creation, or search."""
    query = current_year

    while True:
        with console.status("[bold green]正在请求已有 case 列表...[/]"):
            results = search_cases(config, query, limit=8)

        _render_case_table(results, query)
        choice = console.input(
            f"[bold]输入编号复用已有 case，回车使用 {current_year} case，输入 c 创建新 case，输入 / 重新搜索：[/]"
        ).strip()

        if choice == "c":
            console.print("[yellow]将创建新 case，稍后可编辑 case.yaml[/]")
            return None

        if not choice:
            existing_year_case = next(
                (item for item in results if item.slug == current_year), None
            )
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
    choice = (
        console.input(
            "[bold]输入 1 覆盖，2 新建时间戳目录，3 取消 [默认 2]：[/]"
        ).strip()
        or "2"
    )

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


def _show_wizard_intro() -> None:
    """Render the fixed entry panel once so the rest of the wizard can focus on operator decisions."""
    console.print(
        Panel(
            Text.from_markup(
                "[bold]Magic Compare Uploader[/bold]\n"
                "一站式中文导入向导：先预演计划，再上传同步。"
            ),
            border_style="bright_black",
        )
    )


def _discover_source_group() -> ParsedSourceGroup:
    """Resolve and parse the source directory before any remote lookup so the wizard can show a concrete local summary first."""
    source_input = typer.prompt("素材目录", default=str(Path.cwd()))
    source_dir = _resolve_source_dir(source_input)

    with console.status("[bold green]正在解析素材文件名...[/]"):
        source_group = discover_source_group(source_dir)

    _render_source_summary(source_group)
    return source_group


def _plan_flat_import(
    source_group: ParsedSourceGroup,
    selected_case: CaseSearchResult | None,
    current_year: str,
    group_slug: str,
    report_json: Path | None,
) -> None:
    """Run the flat-source preview before writing a workspace so operators can stop on naming or parse issues."""
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


def _prepare_structured_workspace(
    source_group: ParsedSourceGroup,
    current_year: str,
    group_slug: str,
    selected_case: CaseSearchResult | None,
    work_dir: Path,
) -> PreparedWorkspace:
    """Materialize the editable workspace only after the flat preview passed, so the work dir reflects a viable import."""
    with console.status("[bold green]正在生成工作目录与 metadata...[/]"):
        return prepare_workspace(
            source_group=source_group,
            work_dir=work_dir,
            existing_case=selected_case,
            current_year=current_year,
            group_slug=group_slug,
        )


def _confirm_workspace_metadata(
    prepared: PreparedWorkspace,
    selected_case: CaseSearchResult | None,
) -> None:
    """Guide the operator through metadata review while keeping existing-case behavior explicit and non-destructive."""
    if selected_case:
        console.print(
            Panel(
                Text.from_markup(
                    f"[bold]复用已有 case[/bold]\n"
                    f"Title: {selected_case.title}\n"
                    f"Slug: {selected_case.slug}\n"
                    "本次不会覆盖 case 的标题、摘要、tags 或公开状态。"
                ),
                border_style="bright_black",
                title="Case",
            )
        )
    else:
        _confirm_editor(prepared.case_yaml, "case.yaml")

    _confirm_editor(prepared.group_yaml, "group.yaml")


def _build_structured_plan(
    prepared: PreparedWorkspace,
    report_json: Path | None,
) -> PreparedCasePlan:
    """Validate the structured workspace before upload so the remote flow never runs on stale or broken metadata."""
    structured_plan = build_case_plan(prepared.work_dir)
    render_plan_summary(structured_plan.report)
    if structured_plan.report.status == "error":
        _write_runtime_report(structured_plan.report, report_json)
        raise RuntimeError("结构化工作目录仍存在阻塞错误，请修正后再上传。")
    return structured_plan


def _run_upload_with_progress(
    structured_plan: PreparedCasePlan,
    config: UploaderConfig,
) -> UploadExecutionSummary:
    """Execute uploads behind a file-level progress display with current-frame and retry/failure counters."""
    ensure_remote_access_config(config)
    total_files = structured_plan.report.summary.upload_file_count
    progress = Progress(
        TextColumn("[bold green]{task.description}"),
        BarColumn(),
        MofNCompleteColumn(),
        TimeElapsedColumn(),
        console=console,
        transient=False,
    )
    upload_task = progress.add_task(
        "准备上传...",
        total=max(total_files, 1),
        completed=0,
    )
    state = WizardUploadProgressState(
        frame_status="当前 frame：等待开始",
        stats_line=f"文件：0/{total_files} | frame：0/0 | skipped：0 | retried：0 | failed：0",
    )

    with Live(
        _render_upload_progress(progress, state),
        console=console,
        refresh_per_second=12,
    ) as live:

        def _on_progress_event(event: UploadProgressEvent) -> None:
            progress.update(
                upload_task,
                description=_progress_description(event),
                total=max(event.total_files, 1),
                completed=event.completed_files,
            )
            state.frame_status = _frame_status_line(event)
            state.stats_line = _stats_line(event)
            live.update(_render_upload_progress(progress, state))

        return execute_upload_plan(
            structured_plan,
            config,
            on_progress_event=_on_progress_event,
        )


def _handle_upload_result(
    prepared: PreparedWorkspace,
    structured_plan: PreparedCasePlan,
    execution_summary: UploadExecutionSummary,
    config: UploaderConfig,
    report_json: Path | None,
) -> None:
    """Persist the final machine-readable report and render the success panel only after the server completion payload exists."""
    _render_execution_summary(execution_summary)
    if not execution_summary.succeeded:
        _write_runtime_report(
            structured_plan.report, report_json, execution_summary=execution_summary
        )
        raise RuntimeError(
            "上传阶段存在失败对象，请修正后再次执行，session 会自动续传。"
        )

    result = execution_summary.completion_result or {}
    _write_runtime_report(
        structured_plan.report,
        report_json,
        execution_summary=execution_summary,
        sync_result=result,
    )

    viewer_url = (
        f"{config.site_url}/cases/{result['caseSlug']}/groups/{prepared.group_slug}"
    )
    console.print(
        Panel(
            Text.from_markup(
                "[bold green]上传成功[/]\n"
                f"Case slug: {result['caseSlug']}\n"
                f"Group slug: {prepared.group_slug}\n"
                f"工作目录: {prepared.work_dir}\n"
                f"内部查看: {viewer_url}"
            ),
            border_style="green",
            title="完成",
        )
    )


def run_wizard(
    *,
    site_url: str | None,
    api_url: str | None,
    report_json: Path | None = None,
) -> None:
    """Run the interactive uploader flow with an upfront plan step before any remote upload starts."""
    current_year = str(datetime.now().year)
    _show_wizard_intro()

    source_group = _discover_source_group()
    work_dir = _resolve_work_dir(build_default_work_dir(source_group.source_root))
    config = _prepare_runtime_config(work_dir, site_url=site_url, api_url=api_url)

    selected_case = _choose_case(config, current_year)
    group_slug = _resolve_group_slug(source_group.slug, selected_case)
    _plan_flat_import(
        source_group,
        selected_case,
        current_year,
        group_slug,
        report_json,
    )

    prepared = _prepare_structured_workspace(
        source_group,
        current_year,
        group_slug,
        selected_case,
        work_dir,
    )
    _confirm_workspace_metadata(prepared, selected_case)

    structured_plan = _build_structured_plan(prepared, report_json)
    if not typer.confirm("开始上传并同步到 internal-site？", default=True):
        raise typer.Abort()

    execution_summary = _run_upload_with_progress(structured_plan, config)
    _handle_upload_result(
        prepared,
        structured_plan,
        execution_summary,
        config,
        report_json,
    )
