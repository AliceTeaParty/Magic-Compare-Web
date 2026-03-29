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

from .api_client import CaseListResult, CaseSearchResult, list_cases, search_cases
from .branding import ISSUES_URL, REPO_URL, load_logo_text, uploader_version
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
from .scanner import scan_case_directory
from .source_parser import (
    NonFlatSourceLayout,
    ParsedSourceGroup,
    discover_source_group,
    discover_source_group_from_layout,
    suggest_nonflat_source_layout,
)
from .upload_executor import (
    UploadExecutionSummary,
    UploadProgressEvent,
    execute_upload_plan,
)
from .workspace_builder import PreparedWorkspace, prepare_workspace


@dataclass
class WizardUploadProgressState:
    stage_status: str
    frame_status: str
    stats_line: str
    momentum_status: str


WIZARD_STEPS = (
    "读取本地素材",
    "选择或创建 case",
    "预演并生成工作目录",
    "打开 metadata 编辑",
    "上传并同步",
)


def _event_stage_label(event: UploadProgressEvent) -> str:
    """Map structured upload events to short Chinese stage labels for the wizard."""
    if event.kind == "job_started":
        return "准备上传"
    if event.kind == "frame_resumed":
        return "续传检查"
    if event.kind == "frame_prepared":
        return "申请上传"
    if event.kind in {"file_uploaded", "file_failed"}:
        return "文件上传"
    if event.kind == "frame_committed":
        return "服务端提交"
    if event.kind == "job_completed":
        return "同步完成"
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
    """Keep upload progress readable by separating protocol phase, active frame, and counters into stable lines."""
    return Group(
        progress,
        Text(state.stage_status, style="bold white"),
        Text(state.frame_status, style="cyan"),
        Text(state.stats_line, style="magenta"),
        Text(state.momentum_status, style="bright_black"),
    )


def _render_stage_header(step_index: int, detail: str) -> None:
    """Print one stable stage header before each wizard phase so operators can always tell where they are in the flow."""
    title = WIZARD_STEPS[step_index - 1]
    console.rule(f"[bold]{step_index}/5 · {title}[/bold]", style="bright_black")
    console.print(Text(detail, style="bright_black"))


def _render_startup_banner() -> None:
    """Show brand and support info up front so the wizard feels like a maintained tool instead of an opaque script prompt."""
    console.print(Text(load_logo_text(), style="bright_black"))
    console.print(Text("Magic Compare Uploader", style="bold white"))
    console.print(Text(f"Version {uploader_version()}", style="cyan"))
    console.print(Text(f"GitHub: {REPO_URL}", style="bright_blue"))
    console.print(Text(f"Issues: {ISSUES_URL}", style="bright_blue"))
    console.print(Text("License: GPLv3 · Copyright notices in repository license", style="bright_black"))
    console.print(Text("问题反馈请走 GitHub Issues", style="bright_black"))
    console.print()


def _render_target_site_summary(config: UploaderConfig) -> None:
    """Surface the current remote target before remote queries so a wrong .env is obvious before operators reuse the wrong case."""
    local_site = "是" if config.is_local_site else "否"
    access_token = "已配置" if config.has_service_token else "未配置"
    console.print(
        Panel(
            Text.from_markup(
                f"[bold]site_url[/bold]: {config.site_url}\n"
                f"[bold]api_url[/bold]: {config.api_url}\n"
                f"[bold]本地站点[/bold]: {local_site}\n"
                f"[bold]Cloudflare Access[/bold]: {access_token}"
            ),
            title="当前目标站点",
            border_style="bright_black",
        )
    )


def _stage_status_line(event: UploadProgressEvent) -> str:
    """Keep the upload protocol stage visible because file counts alone do not tell operators whether they are waiting on prepare, PUT, or commit."""
    return f"阶段：{_event_stage_label(event)}"


def _progress_percent(event: UploadProgressEvent) -> int:
    """Convert file progress into a stable integer percentage so operators can judge momentum at a glance."""
    if event.total_files <= 0:
        return 0
    return min(100, max(0, round((event.completed_files / event.total_files) * 100)))


def _momentum_status_line(event: UploadProgressEvent) -> str:
    """Add a calm goal-gradient style progress note so long uploads feel advancing instead of static."""
    percent = _progress_percent(event)
    if event.kind == "job_started":
        return "进度：0% · 已建立上传会话，马上开始传第一批文件。"
    if event.kind == "job_completed":
        return "进度：100% · 本组素材已全部同步到 internal-site。"
    if percent < 25:
        return f"进度：{percent}% · 已进入上传阶段，先把前几帧稳定送上去。"
    if percent < 50:
        return f"进度：{percent}% · 第一段进度已经建立起来，继续保持当前节奏。"
    if percent < 75:
        return f"进度：{percent}% · 已经过半，后面的同步会更快有感。"
    return f"进度：{percent}% · 已到最后一段，收尾后就能直接打开 viewer。"


def _format_remote_error(action: str, error: Exception, config: UploaderConfig) -> RuntimeError:
    """Wrap remote failures with recovery hints so operators can distinguish address, server, and auth problems without reading tracebacks."""
    message = str(error)
    if "localhost" in config.site_url or "127.0.0.1" in config.site_url:
        hint = "请确认 internal-site 已启动，并且当前机器能访问这个 localhost 地址。"
    elif config.has_service_token:
        hint = "请确认站点地址正确，Cloudflare Access 凭证仍有效，且目标 internal-site 可访问。"
    else:
        hint = "请确认站点地址正确；如果目标站点受 Cloudflare Access 保护，还需要配置 Service Token。"

    return RuntimeError(f"{action}失败。\n{hint}\n\n{message}")


def _render_completion_links(workspace_url: str, viewer_url: str) -> None:
    """Print success URLs as raw lines so terminals can copy the full link without Rich panel borders clipping selections."""
    console.print(Text("Workspace URL", style="bright_black"))
    console.print(workspace_url)
    console.print(Text("Viewer URL", style="bright_black"))
    console.print(viewer_url)


def _render_next_step_note(workspace_url: str, viewer_url: str) -> None:
    """Turn success into a clear next-step cue so completion feels actionable, not just decorative."""
    console.print(
        Panel(
            Text.from_markup(
                "[bold green]这次上传已经落地。[/]\n"
                f"先打开 viewer 核对画面：{viewer_url}\n"
                f"需要调整公开状态或继续发布，再回 workspace：{workspace_url}"
            ),
            title="下一步",
            border_style="bright_black",
        )
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
    table = Table(title=f"可复用的 Case：{query or '最近更新'}")
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


def _render_all_case_table(results: list[CaseListResult]) -> None:
    """Show the full remote case list only on explicit request so default case selection stays focused and uncluttered."""
    table = Table(title="全部 Case")
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


def _resolve_case_by_slug(config: UploaderConfig, slug: str) -> CaseSearchResult:
    """Hydrate a selected case slug back into the richer search result shape because the wizard later needs group slugs for conflict decisions."""
    results = search_cases(config, slug, limit=20)
    for result in results:
        if result.slug == slug:
            return result
    raise RuntimeError(f"无法重新读取 case：{slug}")


def _choose_case(config: UploaderConfig, current_year: str) -> CaseSearchResult | None:
    """Offer case selection with options for reuse, creation, or search."""
    query = current_year

    while True:
        try:
            with console.status("[bold green]正在请求已有 case 列表...[/]"):
                results = search_cases(config, query, limit=8)
        except RuntimeError as error:
            raise _format_remote_error("读取 case 列表", error, config) from error

        if results:
            _render_case_table(results, query)
            prompt = (
                f"[bold]输入编号直接复用；回车默认尝试复用 {current_year} case；"
                "输入 all 查看全部；输入 c 新建；输入 / 重新搜索：[/]"
            )
        else:
            console.print(f"[yellow]没有找到与“{query}”匹配的 case。[/]")
            prompt = (
                f"[bold]回车默认尝试复用 {current_year} case；"
                "输入 all 查看全部；输入 c 新建；输入 / 重新搜索：[/]"
            )

        choice = console.input(prompt).strip()

        if choice == "c":
            console.print("[yellow]将新建 case；稍后会打开 case.yaml 给你确认。[/]")
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
            console.print("[yellow]没有找到同 slug 的年度 case；将改为新建 case。[/]")
            return None

        if choice == "all":
            try:
                with console.status("[bold green]正在请求全部 case 列表...[/]"):
                    all_cases = list_cases(config)
            except RuntimeError as error:
                raise _format_remote_error("读取全部 case 列表", error, config) from error

            if not all_cases:
                console.print("[yellow]当前 internal-site 还没有任何 case，可直接新建。[/]")
                continue

            _render_all_case_table(all_cases)
            all_choice = console.input(
                "[bold]输入编号直接复用；直接回车返回搜索；输入 c 新建：[/]"
            ).strip()
            if all_choice == "c":
                console.print("[yellow]将新建 case；稍后会打开 case.yaml 给你确认。[/]")
                return None
            if not all_choice:
                continue
            if all_choice.isdigit():
                index = int(all_choice)
                if 1 <= index <= len(all_cases):
                    return _resolve_case_by_slug(config, all_cases[index - 1].slug)
            console.print("[red]输入无效，请重新选择。[/]")
            continue

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
            "[bold]输入 replace 覆盖旧目录；timestamp 新建时间戳目录（推荐）；cancel 取消 [默认 timestamp]：[/]"
        ).strip()
        or "timestamp"
    )

    if choice in {"replace", "1"}:
        if default_work_dir.is_dir():
            shutil.rmtree(default_work_dir)
        else:
            default_work_dir.unlink()
        return default_work_dir

    if choice in {"timestamp", "2"}:
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
        f"[bold]1[/] 直接覆盖已有 group\n"
        f"[bold]2[/] 改用新 slug：{suggested_slug}"
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
    if not typer.confirm(f"{label} 已确认并保存。继续下一步？", default=True):
        raise typer.Abort()


def _confirm_new_case_metadata(prepared: PreparedWorkspace) -> None:
    """Re-open case.yaml until its slug passes local validation so users fix URL-breaking values before the upload stage starts."""
    while True:
        _confirm_editor(prepared.case_yaml, "case.yaml")
        try:
            scan_case_directory(prepared.work_dir)
            return
        except ValueError as error:
            console.print(f"[red]case.yaml 仍有问题：{error}[/]")
            console.print("[yellow]请重新编辑 case.yaml，修正 slug 后再继续。[/]")


def _show_wizard_intro() -> None:
    """Render the startup identity and support links before any prompts so operators know which tool and support channel they are using."""
    _render_startup_banner()


def _resolve_child_directory_input(
    source_root: Path,
    raw_value: str,
    *,
    label: str,
) -> Path | None:
    """Resolve nested-folder inputs relative to the source root so drag-and-drop paths and short folder names both work."""
    normalized = raw_value.strip()
    if not normalized:
        return None

    candidate = Path(normalized.strip("'\"")).expanduser()
    if not candidate.is_absolute():
        candidate = (source_root / candidate).resolve()
    else:
        candidate = candidate.resolve()

    if not candidate.exists() or not candidate.is_dir():
        raise ValueError(f"{label} 不存在：{candidate}")

    return candidate


def _resolve_directory_list_input(
    source_root: Path,
    raw_value: str,
    *,
    label: str,
) -> tuple[Path, ...]:
    """Allow comma-separated nested-folder input so users can point multiple after or misc folders at once without repeating prompts."""
    items = [item.strip() for item in raw_value.split(",")]
    resolved: list[Path] = []
    seen: set[Path] = set()
    for item in items:
        path = _resolve_child_directory_input(source_root, item, label=label)
        if not path or path in seen:
            continue
        resolved.append(path)
        seen.add(path)
    return tuple(resolved)


def _layout_hint_text(paths: tuple[Path, ...]) -> str:
    return ", ".join(path.name for path in paths) if paths else ""


def _prompt_nonflat_layout(source_root: Path) -> NonFlatSourceLayout:
    """Fallback to explicit folder prompts only when auto-detection cannot confidently find a usable before/after layout."""
    suggestion = suggest_nonflat_source_layout(source_root)
    console.print(
        "[yellow]检测到根目录不是平铺素材，切换到子文件夹匹配模式。[/]"
    )
    console.print(
        "[bright_black]会先按 before/after/misc 常见目录名自动猜；不完整时再让你补目录。[/]"
    )

    while True:
        try:
            before_input = typer.prompt(
                "before 文件夹",
                default=suggestion.before_dir.name if suggestion.before_dir else "",
                show_default=bool(suggestion.before_dir),
            )
            after_input = typer.prompt(
                "after 文件夹（可多个，用逗号分隔）",
                default=_layout_hint_text(suggestion.after_dirs),
                show_default=bool(suggestion.after_dirs),
            )
            misc_input = typer.prompt(
                "misc 文件夹（可多个，没有就直接回车）",
                default=_layout_hint_text(suggestion.misc_dirs),
                show_default=bool(suggestion.misc_dirs),
            )

            before_dir = _resolve_child_directory_input(
                source_root,
                before_input,
                label="before 文件夹",
            )
            after_dirs = _resolve_directory_list_input(
                source_root,
                after_input,
                label="after 文件夹",
            )
            misc_dirs = _resolve_directory_list_input(
                source_root,
                misc_input,
                label="misc 文件夹",
            )
        except ValueError as error:
            console.print(f"[red]目录输入无效：{error}[/]")
            console.print("[yellow]请重新输入子文件夹路径，支持相对目录名或拖拽后的绝对路径。[/]")
            continue

        if not before_dir:
            console.print("[red]before 文件夹不能为空。[/]")
            continue
        if not after_dirs:
            console.print("[red]至少需要一个 after 文件夹。[/]")
            continue

        return NonFlatSourceLayout(
            before_dir=before_dir,
            after_dirs=after_dirs,
            misc_dirs=misc_dirs,
        )


def _should_offer_nonflat_mode(source_dir: Path, error: ValueError) -> bool:
    """Only switch to nested-folder prompts when the root folder itself lacks a viable flat layout and subdirectories exist to inspect."""
    message = str(error)
    if "根目录没有符合平铺导入命名规则的图片文件" in message:
        return True
    if "中没有可导入的图片文件" in message and any(
        path.is_dir() for path in source_dir.iterdir()
    ):
        return True
    return False


def _discover_source_group() -> ParsedSourceGroup:
    """Keep source-path entry retryable because local path mistakes are common and should not abort the whole wizard."""
    while True:
        source_input = typer.prompt("素材目录", default=str(Path.cwd()))
        source_dir: Path | None = None
        try:
            source_dir = _resolve_source_dir(source_input)
            with console.status("[bold green]正在解析素材文件名...[/]"):
                source_group = discover_source_group(source_dir)
        except ValueError as error:
            if source_dir and _should_offer_nonflat_mode(source_dir, error):
                try:
                    layout = _prompt_nonflat_layout(source_dir)
                    with console.status("[bold green]正在按子文件夹匹配素材...[/]"):
                        source_group = discover_source_group_from_layout(
                            source_dir, layout
                        )
                except ValueError as layout_error:
                    console.print(f"[red]子文件夹模式解析失败：{layout_error}[/]")
                    console.print("[yellow]请调整目录选择，或回到上一级目录重新输入素材路径。[/]")
                    continue
                _render_source_summary(source_group)
                return source_group

            console.print(f"[red]素材目录无效：{error}[/]")
            console.print("[yellow]请直接重输目录路径。支持拖拽路径，也支持带引号路径。[/]")
            continue
        except RuntimeError as error:
            console.print(f"[red]解析素材失败：{error}[/]")
            console.print("[yellow]请先修复本地 uploader 环境或素材命名问题，再继续。[/]")
            continue

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
        _confirm_new_case_metadata(prepared)

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
        stage_status="阶段：准备上传",
        frame_status="当前 frame：等待开始",
        stats_line=f"文件：0/{total_files} | frame：0/0 | skipped：0 | retried：0 | failed：0",
        momentum_status="进度：0% · 正在准备这次上传。",
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
            state.stage_status = _stage_status_line(event)
            state.frame_status = _frame_status_line(event)
            state.stats_line = _stats_line(event)
            state.momentum_status = _momentum_status_line(event)
            live.update(_render_upload_progress(progress, state))

        try:
            return execute_upload_plan(
                structured_plan,
                config,
                on_progress_event=_on_progress_event,
            )
        except RuntimeError as error:
            raise _format_remote_error("上传并同步", error, config) from error


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
        raise RuntimeError("上传未完成。存在失败对象，请修正后再次执行，session 会自动续传。")

    result = execution_summary.completion_result or {}
    _write_runtime_report(
        structured_plan.report,
        report_json,
        execution_summary=execution_summary,
        sync_result=result,
    )

    workspace_url = f"{config.site_url}/cases/{result['caseSlug']}"
    viewer_url = (
        f"{config.site_url}/cases/{result['caseSlug']}/groups/{prepared.group_slug}"
    )
    console.print(
        Panel(
            Text.from_markup(
                "[bold green]上传成功。[/]\n"
                "本组素材已同步到 internal-site。\n"
                f"Case slug: {result['caseSlug']}\n"
                f"Group slug: {prepared.group_slug}\n"
                f"工作目录: {prepared.work_dir}"
            ),
            border_style="green",
            title="完成",
        )
    )
    _render_next_step_note(workspace_url, viewer_url)
    _render_completion_links(workspace_url, viewer_url)


def run_wizard(
    *,
    site_url: str | None,
    api_url: str | None,
    report_json: Path | None = None,
) -> None:
    """Run the interactive uploader flow with an upfront plan step before any remote upload starts."""
    current_year = str(datetime.now().year)
    _show_wizard_intro()

    _render_stage_header(1, "先解析本地素材，确认命名和帧分组都可用。")
    source_group = _discover_source_group()
    work_dir = _resolve_work_dir(build_default_work_dir(source_group.source_root))
    config = _prepare_runtime_config(work_dir, site_url=site_url, api_url=api_url)

    _render_stage_header(2, "确认目标站点后，再复用已有 case 或创建新 case。")
    _render_target_site_summary(config)
    selected_case = _choose_case(config, current_year)
    group_slug = _resolve_group_slug(source_group.slug, selected_case)

    _render_stage_header(3, "先做预演，确认目标 slug 与工作目录都没有阻塞问题。")
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
    _render_stage_header(4, "打开 metadata 文件确认标题、说明和公开信息。")
    _confirm_workspace_metadata(prepared, selected_case)

    _render_stage_header(5, "开始上传对象并通知 internal-site 完成同步。")
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
