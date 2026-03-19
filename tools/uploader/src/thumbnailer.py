from __future__ import annotations

import shutil
import xml.etree.ElementTree as ET
from pathlib import Path

from PIL import Image, ImageChops, ImageEnhance, ImageOps


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


def generate_heatmap(before: Path, after: Path, destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)

    with Image.open(before) as before_image, Image.open(after) as after_image:
        before_rgb = before_image.convert("RGB")
        after_rgb = after_image.convert("RGB")

        if before_rgb.size != after_rgb.size:
            raise ValueError(
                f"热力图生成失败：{before.name} 与 {after.name} 尺寸不一致。"
            )

        difference = ImageChops.difference(before_rgb, after_rgb).convert("L")
        contrast = ImageEnhance.Contrast(ImageOps.autocontrast(difference)).enhance(2.4)
        brightened = contrast.point(lambda value: min(255, int(value * 1.6)))
        heatmap = ImageOps.colorize(
            brightened,
            black="#0b0f17",
            mid="#4f7c99",
            white="#f1b75a",
        )
        heatmap.save(destination)
