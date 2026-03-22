from __future__ import annotations

import argparse
import platform
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

SUPPORTED_PLATFORMS = {"windows", "linux", "macos"}
SUPPORTED_ARCHES = {"amd64", "arm64"}
SUPPORTED_LAYOUTS = {"onefile", "onedir"}


def _normalize_platform(system_name: str) -> str:
    normalized = system_name.lower()
    if normalized.startswith("win"):
        return "windows"
    if normalized.startswith("darwin"):
        return "macos"
    if normalized.startswith("linux"):
        return "linux"
    raise RuntimeError(f"Unsupported build platform: {system_name}")


def _normalize_arch(machine_name: str) -> str:
    normalized = machine_name.lower()
    if normalized in {"x86_64", "amd64"}:
        return "amd64"
    if normalized in {"arm64", "aarch64"}:
        return "arm64"
    raise RuntimeError(f"Unsupported build architecture: {machine_name}")


def _artifact_basename(target_platform: str, target_arch: str) -> str:
    return f"magic-compare-uploader-{target_platform}-{target_arch}"


def _write_launcher(launcher_path: Path) -> None:
    """Generate a tiny launcher so PyInstaller can import the package the same way editable installs do."""
    launcher_path.write_text(
        "\n".join(
            [
                "from src.cli import app",
                "",
                'if __name__ == "__main__":',
                "    app()",
                "",
            ]
        ),
        encoding="utf-8",
    )


def _build_binary(
    uploader_root: Path,
    *,
    target_platform: str,
    target_arch: str,
    layout: str,
) -> Path:
    """Build one native uploader artifact and make the layout explicit because onefile and onedir have very different startup trade-offs."""
    artifact_basename = _artifact_basename(target_platform, target_arch)
    dist_dir = uploader_root / "dist"
    build_root = uploader_root / ".build" / f"{target_platform}-{target_arch}"
    shutil.rmtree(build_root, ignore_errors=True)
    dist_dir.mkdir(parents=True, exist_ok=True)
    build_flag = "--onefile" if layout == "onefile" else "--onedir"

    with tempfile.TemporaryDirectory(
        prefix="magic-compare-uploader-build-"
    ) as temp_dir_name:
        temp_dir = Path(temp_dir_name)
        launcher_path = temp_dir / "pyinstaller-entry.py"
        _write_launcher(launcher_path)

        subprocess.run(
            [
                sys.executable,
                "-m",
                "PyInstaller",
                "--noconfirm",
                "--clean",
                build_flag,
                "--name",
                artifact_basename,
                "--distpath",
                str(dist_dir),
                "--workpath",
                str(build_root / "work"),
                "--specpath",
                str(build_root / "spec"),
                "--paths",
                str(uploader_root),
                str(launcher_path),
            ],
            check=True,
            cwd=uploader_root,
        )

    suffix = ".exe" if target_platform == "windows" else ""
    if layout == "onedir":
        return dist_dir / artifact_basename / f"{artifact_basename}{suffix}"
    return dist_dir / f"{artifact_basename}{suffix}"


def main() -> int:
    """Build a native uploader artifact and print the executable path for downstream scripts."""
    parser = argparse.ArgumentParser(
        description="Build the Magic Compare uploader binary."
    )
    parser.add_argument(
        "--platform", dest="target_platform", choices=sorted(SUPPORTED_PLATFORMS)
    )
    parser.add_argument("--arch", dest="target_arch", choices=sorted(SUPPORTED_ARCHES))
    parser.add_argument(
        "--layout",
        choices=sorted(SUPPORTED_LAYOUTS),
        default="onefile",
        help="onefile 便于分发；onedir 启动更快，适合本地调试。",
    )
    args = parser.parse_args()

    native_platform = _normalize_platform(platform.system())
    native_arch = _normalize_arch(platform.machine())
    target_platform = args.target_platform or native_platform
    target_arch = args.target_arch or native_arch

    artifact_path = _build_binary(
        Path(__file__).resolve().parents[1],
        target_platform=target_platform,
        target_arch=target_arch,
        layout=args.layout,
    )
    print(artifact_path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
