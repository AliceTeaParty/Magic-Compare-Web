from __future__ import annotations

import json
import shutil
from datetime import datetime
from pathlib import Path

import typer
from rich.console import Console
from rich.panel import Panel
from rich.table import Table
from rich.text import Text

from .api_client import (
    CaseSearchGroup,
    CaseSearchResult,
    delete_group,
    search_cases,
    sync_manifest,
)
from .auth import (
    ENV_API_URL_NAME,
    ENV_SITE_URL_NAME,
    UploaderConfig,
    ensure_user_access_token,
    persist_config_overrides,
    resolve_uploader_config,
)
from .editor import open_in_editor
from .manifest import build_import_manifest, manifest_json
from .naming import build_default_work_dir, build_unique_slug
from .scanner import scan_case_directory
from .source_parser import ParsedSourceGroup, discover_source_group
from .workspace_builder import prepare_workspace

app = typer.Typer(add_completion=False, help="Magic Compare 中文导入工具")
console = Console()


def _resolve_source_dir(path_text: str) -> Path:
    source_dir = Path(path_text).expanduser().resolve()
    if not source_dir.exists() or not source_dir.is_dir():
        raise ValueError(f"素材目录不存在：{source_dir}")
    return source_dir


def _render_source_summary(group: ParsedSourceGroup) -> None:
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
                f"[bold]Frames[/bold]: {len(group.frames)}"
            ),
            title="素材摘要",
            border_style="bright_black",
        )
    )
    console.print(table)


def _render_case_table(results: list[CaseSearchResult], query: str) -> None:
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
    table = Table(title=f"Case {case.title} 的 Groups")
    table.add_column("#", justify="right", style="cyan", no_wrap=True)
    table.add_column("Title", style="bold white")
    table.add_column("Slug", style="green")

    for index, group in enumerate(case.groups, start=1):
        table.add_row(str(index), group.title, group.slug)

    console.print(table)


def _choose_case(config: UploaderConfig, current_year: str) -> CaseSearchResult | None:
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


def _choose_existing_case(config: UploaderConfig, initial_query: str = "") -> CaseSearchResult:
    query = initial_query

    while True:
        with console.status("[bold green]正在请求已有 case 列表...[/]"):
            results = search_cases(config, query, limit=8)

        if not results:
            console.print("[yellow]没有找到匹配的 case。输入 / 重新搜索，或 Ctrl+C 取消。[/]")
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
    config: UploaderConfig,
    case_slug: str | None,
) -> CaseSearchResult:
    if not case_slug:
        return _choose_existing_case(config)

    with console.status("[bold green]正在查询指定 case...[/]"):
        results = search_cases(config, case_slug, limit=20)

    for result in results:
        if result.slug == case_slug:
            return result

    raise ValueError(f"未找到 case：{case_slug}")


def _resolve_group_for_delete(
    case: CaseSearchResult,
    group_slug: str | None,
) -> CaseSearchGroup:
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


def _resolve_work_dir(default_work_dir: Path) -> Path:
    if not default_work_dir.exists():
        return default_work_dir

    console.print(f"[yellow]工作目录已存在：{default_work_dir}[/]")
    choice = console.input(
        "[bold]输入 1 覆盖，2 新建时间戳目录，3 取消 [默认 2]：[/]"
    ).strip() or "2"

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
    console.print(f"[cyan]正在打开 {label}：{path}[/]")
    open_in_editor(path)
    if not typer.confirm(f"{label} 已确认并保存，继续？", default=True):
        raise typer.Abort()


def _prepare_runtime_config(
    work_dir: Path,
    *,
    site_url: str | None,
    api_url: str | None,
) -> UploaderConfig:
    config = resolve_uploader_config(work_dir, site_url_override=site_url, api_url_override=api_url)

    if site_url:
        persist_config_overrides(config, site_url=site_url)
    if api_url:
        persist_config_overrides(config, api_url=api_url)

    return config


def _ensure_remote_auth(config: UploaderConfig) -> None:
    if config.has_service_token or config.is_local_site:
        return
    with console.status("[bold green]正在登录 Cloudflare Access...[/]"):
        ensure_user_access_token(config)


def _ensure_s3_ready(config: UploaderConfig) -> None:
    if config.has_s3_config:
        return
    raise RuntimeError(
        "缺少 S3 配置。请在 .env 中补齐 MAGIC_COMPARE_S3_BUCKET / REGION / ACCESS KEY / SECRET。"
    )


def _run_wizard(
    *,
    site_url: str | None,
    api_url: str | None,
) -> None:
    current_year = str(datetime.now().year)
    console.print(
        Panel(
            Text.from_markup(
                "[bold]Magic Compare Uploader[/bold]\n"
                "一站式中文导入向导：从原始素材到上传完成。"
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
    _ensure_s3_ready(config)
    _ensure_remote_auth(config)

    selected_case = _choose_case(config, current_year)
    group_slug = _resolve_group_slug(source_group.slug, selected_case)

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

    with console.status("[bold green]正在校验整理后的工作目录...[/]"):
        scan_case_directory(prepared.work_dir)

    if not typer.confirm("开始生成 manifest 并上传？", default=True):
        raise typer.Abort()

    with console.status("[bold green]正在生成 manifest、缩略图并上传...[/]"):
        manifest_payload = build_import_manifest(prepared.work_dir, config)
        result = sync_manifest(config, manifest_payload)

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
) -> None:
    """Magic Compare 中文导入工具。"""
    if ctx.invoked_subcommand is not None:
        return

    try:
        _run_wizard(site_url=site_url, api_url=api_url)
    except typer.Abort:
        console.print("[yellow]已取消本次导入。[/]")
        raise typer.Exit(code=1) from None
    except Exception as error:  # pragma: no cover - user-facing guard
        console.print(f"[red]导入失败：{error}[/]")
        raise typer.Exit(code=1) from error


@app.command()
def scan(source: Path) -> None:
    """校验结构化 case 目录并打印摘要。"""
    case_source = scan_case_directory(source)
    typer.echo(f"Case: {case_source.metadata.get('title', case_source.root.name)}")
    typer.echo(f"Groups: {len(case_source.groups)}")
    for group in case_source.groups:
        typer.echo(f"- {group.slug} ({len(group.frames)} frames)")


@app.command()
def manifest(
    source: Path,
    output: Path | None = typer.Option(None, "--output", "-o"),
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
    """生成 import manifest JSON，并执行本地 staging。"""
    config = _prepare_runtime_config(source, site_url=site_url, api_url=api_url)
    _ensure_s3_ready(config)
    manifest_text = manifest_json(source, config)
    if output:
        output.write_text(manifest_text, encoding="utf-8")
        typer.echo(f"已写入 manifest：{output}")
        return

    typer.echo(manifest_text)


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
) -> None:
    """对结构化 case 目录执行 staging 并同步到内部站。"""
    config = _prepare_runtime_config(source, site_url=site_url, api_url=api_url)
    _ensure_s3_ready(config)
    _ensure_remote_auth(config)
    manifest_payload = build_import_manifest(source, config)
    result = sync_manifest(config, manifest_payload)
    typer.echo(json.dumps(result, indent=2, ensure_ascii=False))


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
        config = _prepare_runtime_config(work_dir.resolve(), site_url=site_url, api_url=api_url)
        _ensure_remote_auth(config)

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
    except typer.Abort:
        console.print("[yellow]已取消删除。[/]")
        raise typer.Exit(code=1) from None
    except Exception as error:  # pragma: no cover - user-facing guard
        console.print(f"[red]删除失败：{error}[/]")
        raise typer.Exit(code=1) from error


if __name__ == "__main__":
    app()
