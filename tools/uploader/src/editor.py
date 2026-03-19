from __future__ import annotations

import os
import shlex
import shutil
import subprocess
import sys
from pathlib import Path


def _editor_command(path: Path) -> list[str]:
    for env_name in ("VISUAL", "EDITOR"):
        value = os.environ.get(env_name)
        if value:
            return [*shlex.split(value), str(path)]

    if sys.platform == "darwin":
        return ["open", "-t", str(path)]

    if os.name == "nt":
        return ["notepad", str(path)]

    for executable in ("sensible-editor", "xdg-open"):
        if shutil.which(executable):
            return [executable, str(path)]

    raise RuntimeError(
        "未找到可用的系统编辑器。请设置 VISUAL 或 EDITOR 环境变量后重试。"
    )


def open_in_editor(path: Path) -> None:
    command = _editor_command(path)
    try:
        subprocess.Popen(  # noqa: S603
            command,
            start_new_session=True,
        )
    except OSError as error:
        raise RuntimeError(f"无法打开编辑器：{' '.join(command)}") from error
