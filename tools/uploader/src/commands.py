from __future__ import annotations

import json
from dataclasses import asdict
from pathlib import Path

import typer
from rich.console import Console
from rich.panel import Panel
from rich.table import Table
from rich.text import Text

from .api_client import (
    CaseSearchGroup,
    CaseSearchResult,
    delete_case,
    delete_group,
    search_cases,
)
from .config import (
    UploaderConfig,
    ensure_remote_access_config,
    persist_config_overrides,
    resolve_uploader_config,
)
from .manifest import manifest_json
from .plan import PlanReport, build_case_plan, build_path_plan, write_plan_report
from .upload_executor import UploadExecutionSummary, execute_upload_plan

console = Console()


def _normalize_path_text(path_text: str) -> str:
    normalized = path_text.strip()

    while (
        len(normalized) >= 2
        and normalized[0] == normalized[-1]
        and normalized[0] in {"'", '"'}
    ):
        normalized = normalized[1:-1].strip()

    return normalized


def _resolve_source_dir(path_text: str) -> Path:
    source_dir = Path(_normalize_path_text(path_text)).expanduser().resolve()
    if not source_dir.exists() or not source_dir.is_dir():
        raise ValueError(f"素材目录不存在：{source_dir}")
    return source_dir


def _prepare_runtime_config(
    work_dir: Path,
    *,
    site_url: str | None,
    api_url: str | None,
) -> UploaderConfig:
    """Persist explicit CLI overrides so resumed runs keep targeting the same site and endpoint."""
    config = resolve_uploader_config(
        work_dir, site_url_override=site_url, api_url_override=api_url
    )

    if site_url or api_url:
        persist_config_overrides(config, site_url=site_url, api_url=api_url)

    return config


def _render_issue_table(report: PlanReport) -> None:
    """Show blocking issues and warnings together because plan mode is only useful when users can fix inputs quickly."""
    if not report.issues:
        return

    table = Table(title="Plan Issues")
    table.add_column("Severity", style="bold")
    table.add_column("Code", style="cyan")
    table.add_column("Path", style="magenta")
    table.add_column("Message", style="white")

    for issue in report.issues:
        severity_style = "red" if issue.severity == "error" else "yellow"
        table.add_row(
            f"[{severity_style}]{issue.severity}[/{severity_style}]",
            issue.code,
            issue.path,
            issue.message,
        )

    console.print(table)


def _render_ignored_table(report: PlanReport) -> None:
    """Ignored files must stay visible so input cleaning is explainable instead of feeling like silent data loss."""
    if not report.ignored_files:
        return

    table = Table(title="Ignored Files")
    table.add_column("Reason", style="yellow")
    table.add_column("Path", style="magenta")

    for ignored in report.ignored_files:
        table.add_row(ignored.reason, ignored.path.as_posix())

    console.print(table)


def render_plan_summary(report: PlanReport) -> None:
    """Render a concise preflight summary so users can decide before any upload starts."""
    title_style = {"ok": "green", "warning": "yellow", "error": "red"}[report.status]
    console.print(
        Panel(
            Text.from_markup(
                f"[bold]Status[/bold]: [{title_style}]{report.status}[/{title_style}]\n"
                f"[bold]Case slug[/bold]: {report.summary.case_slug}\n"
                f"[bold]Groups[/bold]: {report.summary.group_count}\n"
                f"[bold]Frames[/bold]: {report.summary.frame_count}\n"
                f"[bold]Upload ops[/bold]: {report.summary.upload_file_count}\n"
                f"[bold]Ignored[/bold]: {report.summary.ignored_file_count}\n"
                f"[bold]Issues[/bold]: {report.summary.issue_count}"
            ),
            title="Plan Summary",
            border_style=title_style,
        )
    )
    _render_issue_table(report)
    _render_ignored_table(report)


def _render_execution_summary(summary: UploadExecutionSummary) -> None:
    """Summarize upload outcomes in one place so retry/resume decisions do not require opening the session JSON."""
    failure_lines = "\n".join(
        f"- {failure.target_url}: {failure.message}" for failure in summary.failures
    )
    body = (
        f"[bold]Uploaded[/bold]: {summary.uploaded_count}\n"
        f"[bold]Skipped[/bold]: {summary.skipped_count}\n"
        f"[bold]Retried[/bold]: {summary.retried_count}\n"
        f"[bold]Failed[/bold]: {summary.failed_count}\n"
        f"[bold]Session[/bold]: {summary.session_path}\n"
        f"[bold]Duration[/bold]: {summary.duration_seconds:.2f}s"
    )
    if failure_lines:
        body += f"\n[bold]Failures[/bold]:\n{failure_lines}"

    console.print(
        Panel(
            Text.from_markup(body),
            title="Upload Summary",
            border_style="green" if summary.succeeded else "red",
        )
    )


def _write_runtime_report(
    report: PlanReport,
    output_path: Path | None,
    *,
    execution_summary: UploadExecutionSummary | None = None,
    sync_result: dict | None = None,
) -> None:
    """Write one structured report only on demand so CLI automation gets machine output without cluttering local runs."""
    if not output_path:
        return

    payload = report.to_dict()
    if execution_summary:
        payload["execution"] = {
            "uploadedCount": execution_summary.uploaded_count,
            "skippedCount": execution_summary.skipped_count,
            "failedCount": execution_summary.failed_count,
            "retriedCount": execution_summary.retried_count,
            "durationSeconds": execution_summary.duration_seconds,
            "sessionPath": execution_summary.session_path.as_posix(),
            "failures": [asdict(item) for item in execution_summary.failures],
        }
    if sync_result is not None:
        payload["syncResult"] = sync_result

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(
        json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8"
    )


def handle_plan(
    source: Path,
    *,
    report_json: Path | None = None,
    case_slug: str | None = None,
    group_slug: str | None = None,
) -> PlanReport:
    """Run the shared plan builder for either flat or structured input and optionally persist the JSON report."""
    report = build_path_plan(source, case_slug=case_slug, group_slug=group_slug)
    render_plan_summary(report)
    if report_json:
        write_plan_report(report, report_json)
    return report


def handle_manifest(source: Path, *, output: Path | None = None) -> None:
    """Emit the group-upload-start payload shape without touching remote storage."""
    manifest_text = manifest_json(source)
    if output:
        output.write_text(manifest_text, encoding="utf-8")
        typer.echo(f"已写入 manifest：{output}")
        return

    typer.echo(manifest_text)


def handle_sync(
    source: Path,
    *,
    site_url: str | None,
    api_url: str | None,
    report_json: Path | None = None,
    dry_run: bool = False,
    reset_session: bool = False,
) -> tuple[PlanReport, UploadExecutionSummary | None, dict | None]:
    """Run the structured-case sync flow through one shared plan so dry-run and real sync see the same issues."""
    source_root = source.resolve()
    case_plan = build_case_plan(source_root)
    render_plan_summary(case_plan.report)

    if case_plan.report.status == "error" or dry_run:
        _write_runtime_report(case_plan.report, report_json)
        return case_plan.report, None, None

    config = _prepare_runtime_config(source_root, site_url=site_url, api_url=api_url)
    ensure_remote_access_config(config)

    with console.status("[bold green]正在上传对象...[/]"):
        execution_summary = execute_upload_plan(
            case_plan, config, reset_session=reset_session
        )
    _render_execution_summary(execution_summary)
    if not execution_summary.succeeded:
        _write_runtime_report(
            case_plan.report, report_json, execution_summary=execution_summary
        )
        return case_plan.report, execution_summary, None

    sync_result = execution_summary.completion_result
    _write_runtime_report(
        case_plan.report,
        report_json,
        execution_summary=execution_summary,
        sync_result=sync_result,
    )
    return case_plan.report, execution_summary, sync_result


def _render_case_table(results: list[CaseSearchResult], query: str) -> None:
    """Show remote case choices as a small table so the wizard can stay keyboard-driven."""
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


def _render_group_table(case: CaseSearchResult) -> None:
    """List group choices before destructive deletion so the confirmation step has concrete context."""
    table = Table(title=f"Case {case.title} 的 Groups")
    table.add_column("#", justify="right", style="cyan", no_wrap=True)
    table.add_column("Title", style="bold white")
    table.add_column("Slug", style="green")

    for index, group in enumerate(case.groups, start=1):
        table.add_row(str(index), group.title, group.slug)

    console.print(table)


def _choose_existing_case(
    config: UploaderConfig, initial_query: str = ""
) -> CaseSearchResult:
    """Resolve one remote case interactively so delete-group does not rely on users remembering exact slugs."""
    query = initial_query

    while True:
        with console.status("[bold green]正在请求已有 case 列表...[/]"):
            results = search_cases(config, query, limit=8)

        if not results:
            console.print(
                "[yellow]没有找到匹配的 case。输入 / 重新搜索，或 Ctrl+C 取消。[/]"
            )
        else:
            _render_case_table(results, query)

        choice = console.input(
            "[bold]输入编号选择 case，输入 / 重新搜索，输入 q 取消：[/]"
        ).strip()

        if choice.lower() == "q":
            raise typer.Abort()

        if choice == "/":
            query = typer.prompt("新的搜索关键词", default=query).strip()
            continue

        if choice.isdigit():
            index = int(choice)
            if 1 <= index <= len(results):
                return results[index - 1]

        console.print("[red]输入无效，请重新选择。[/]")


def _resolve_case_for_delete(
    config: UploaderConfig, case_slug: str | None
) -> CaseSearchResult:
    """Resolve the delete target case from either an explicit slug or an interactive remote lookup."""
    if not case_slug:
        return _choose_existing_case(config)

    with console.status("[bold green]正在查询指定 case...[/]"):
        results = search_cases(config, case_slug, limit=20)

    for result in results:
        if result.slug == case_slug:
            return result

    raise ValueError(f"未找到 case：{case_slug}")


def _resolve_group_for_delete(
    case: CaseSearchResult, group_slug: str | None
) -> CaseSearchGroup:
    """Force one concrete group selection before deletion so operators never delete by fuzzy context."""
    if group_slug:
        for group in case.groups:
            if group.slug == group_slug:
                return group
        raise ValueError(f"在 case {case.slug} 下未找到 group：{group_slug}")

    if not case.groups:
        raise ValueError(f"case {case.slug} 下没有可删除的 group。")

    _render_group_table(case)
    choice = console.input("[bold]输入要删除的 group 编号，输入 q 取消：[/]").strip()
    if choice.lower() == "q":
        raise typer.Abort()
    if choice.isdigit():
        index = int(choice)
        if 1 <= index <= len(case.groups):
            return case.groups[index - 1]

    raise ValueError("输入无效，无法确定要删除的 group。")


def handle_delete_group(
    *,
    case_slug: str | None,
    group_slug: str | None,
    work_dir: Path,
    site_url: str | None,
    api_url: str | None,
) -> dict:
    """Delete-group stays interactive, but it now shares the same service-token-only runtime config path."""
    config = _prepare_runtime_config(
        work_dir.resolve(), site_url=site_url, api_url=api_url
    )
    ensure_remote_access_config(config)

    selected_case = _resolve_case_for_delete(config, case_slug)
    selected_group = _resolve_group_for_delete(selected_case, group_slug)

    console.print(
        Panel(
            Text.from_markup(
                f"[bold]Case[/bold]: {selected_case.title} ({selected_case.slug})\n"
                f"[bold]Group[/bold]: {selected_group.title} ({selected_group.slug})\n"
                "此操作会删除 group、frame、asset，以及关联的内部图片目录。"
            ),
            border_style="red",
            title="确认删除",
        )
    )

    if not typer.confirm("确认删除这个 group？", default=False):
        raise typer.Abort()

    with console.status("[bold red]正在删除 group...[/]"):
        result = delete_group(config, selected_case.slug, selected_group.slug)

    public_cleanup = "已清理" if result.get("removedPublishedBundle") else "无公开产物"
    console.print(
        Panel(
            Text.from_markup(
                "[bold green]删除成功[/]\n"
                f"Case slug: {result['caseSlug']}\n"
                f"Group slug: {result['groupSlug']}\n"
                f"公开产物: {public_cleanup}"
            ),
            border_style="green",
            title="完成",
        )
    )
    return result


def handle_delete_case(
    *,
    case_slug: str | None,
    work_dir: Path,
    site_url: str | None,
    api_url: str | None,
) -> dict:
    """Delete-case only succeeds for empty cases, so the CLI surfaces that constraint before calling the API."""
    config = _prepare_runtime_config(
        work_dir.resolve(), site_url=site_url, api_url=api_url
    )
    ensure_remote_access_config(config)
    selected_case = _resolve_case_for_delete(config, case_slug)

    console.print(
        Panel(
            Text.from_markup(
                f"[bold]Case[/bold]: {selected_case.title} ({selected_case.slug})\n"
                "此操作只允许删除没有任何 group 的 case。"
            ),
            border_style="red",
            title="确认删除 Case",
        )
    )

    if not typer.confirm("确认删除这个 case？", default=False):
        raise typer.Abort()

    with console.status("[bold red]正在删除 case...[/]"):
        result = delete_case(config, selected_case.slug)

    console.print(
        Panel(
            Text.from_markup(
                "[bold green]删除成功[/]\n"
                f"Case slug: {result['caseSlug']}"
            ),
            border_style="green",
            title="完成",
        )
    )
    return result
