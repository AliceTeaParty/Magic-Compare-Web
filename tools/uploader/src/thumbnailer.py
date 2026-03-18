from __future__ import annotations

import shutil
import xml.etree.ElementTree as ET
from pathlib import Path

from PIL import Image


def image_dimensions(source: Path) -> tuple[int, int]:
    if source.suffix.lower() == ".svg":
        root = ET.fromstring(source.read_text(encoding="utf-8"))
        view_box = root.attrib.get("viewBox")
        if view_box:
            _, _, width, height = view_box.split()
            return int(float(width)), int(float(height))
        width = root.attrib.get("width", "1280").replace("px", "")
        height = root.attrib.get("height", "720").replace("px", "")
        return int(float(width)), int(float(height))

    with Image.open(source) as image:
        return image.width, image.height


def build_thumbnail(source: Path, destination: Path, size: tuple[int, int] = (480, 270)) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)

    if source.suffix.lower() == ".svg":
        shutil.copy2(source, destination)
        return

    with Image.open(source) as image:
        thumbnail = image.copy()
        thumbnail.thumbnail(size)
        thumbnail.save(destination)
