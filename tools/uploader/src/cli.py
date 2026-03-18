from __future__ import annotations

import json
from pathlib import Path

import typer

from .api_client import sync_manifest
from .manifest import build_import_manifest, manifest_json
from .scanner import scan_case_directory

app = typer.Typer(add_completion=False, help="Magic Compare local importer")


@app.command()
def scan(source: Path) -> None:
    """Validate a local case directory and print its structure summary."""
    case_source = scan_case_directory(source)
    typer.echo(f"Case: {case_source.metadata.get('title', case_source.root.name)}")
    typer.echo(f"Groups: {len(case_source.groups)}")
    for group in case_source.groups:
        typer.echo(f"- {group.slug} ({len(group.frames)} frames)")


@app.command()
def manifest(
    source: Path,
    output: Path | None = typer.Option(None, "--output", "-o"),
) -> None:
    """Stage assets and emit an import manifest JSON document."""
    manifest_text = manifest_json(source)
    if output:
        output.write_text(manifest_text, encoding="utf-8")
        typer.echo(f"Wrote manifest to {output}")
        return

    typer.echo(manifest_text)


@app.command()
def sync(
    source: Path,
    api_url: str = typer.Option(
        "http://localhost:3000/api/ops/import-sync",
        help="Internal site import endpoint.",
    ),
) -> None:
    """Stage local assets and push the manifest into the internal site."""
    manifest_payload = build_import_manifest(source)
    result = sync_manifest(api_url, manifest_payload)
    typer.echo(json.dumps(result, indent=2, ensure_ascii=True))


if __name__ == "__main__":
    app()
