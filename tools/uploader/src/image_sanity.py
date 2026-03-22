from __future__ import annotations

import xml.etree.ElementTree as ET
from pathlib import Path


def _validate_svg(path: Path) -> None:
    text = path.read_text(encoding="utf-8")
    if "<svg" not in text:
        raise ValueError("缺少 <svg> 根节点。")
    ET.fromstring(text)


def _validate_raster(path: Path) -> tuple[int, int]:
    # Pillow is only needed when we actually inspect images; keeping the import lazy trims binary
    # cold-start time for help/version/metadata-only commands.
    from PIL import Image

    with Image.open(path) as image:
        image.verify()

    with Image.open(path) as image:
        image.load()
        return image.width, image.height


def validate_local_image(path: Path) -> tuple[int, int]:
    """Fail fast on broken local assets so large uploads do not waste time on obviously bad inputs."""
    suffix = path.suffix.lower()
    if suffix == ".svg":
        _validate_svg(path)
        return (0, 0)

    return _validate_raster(path)
