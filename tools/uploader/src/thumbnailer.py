from __future__ import annotations

import shutil
import xml.etree.ElementTree as ET
from pathlib import Path

from PIL import Image, ImageChops, ImageFilter, ImageOps


def _interpolate_color(
    left: tuple[int, int, int],
    right: tuple[int, int, int],
    progress: float,
) -> tuple[int, int, int]:
    return tuple(
        int(round(left[index] + (right[index] - left[index]) * progress)) for index in range(3)
    )


def _build_heatmap_palette() -> list[int]:
    stops = [
        (0, (9, 13, 27)),
        (36, (22, 69, 89)),
        (86, (57, 154, 110)),
        (140, (202, 206, 84)),
        (196, (241, 149, 58)),
        (255, (216, 54, 39)),
    ]

    palette: list[int] = []

    for value in range(256):
        for index in range(len(stops) - 1):
            left_value, left_color = stops[index]
            right_value, right_color = stops[index + 1]

            if value <= right_value:
                span = max(right_value - left_value, 1)
                progress = (value - left_value) / span
                color = _interpolate_color(left_color, right_color, progress)
                palette.extend(color)
                break

    return palette


HEATMAP_PALETTE = _build_heatmap_palette()


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
        lifted = difference.point(lambda value: int(round(((value / 255) ** 0.72) * 255)))

        core = lifted.filter(ImageFilter.GaussianBlur(radius=1.1))
        halo = lifted.filter(ImageFilter.GaussianBlur(radius=4.6)).point(
            lambda value: min(255, int(value * 0.82))
        )
        intensity = ImageChops.lighter(core, halo)

        palette_image = intensity.convert("P")
        palette_image.putpalette(HEATMAP_PALETTE)
        thermal = palette_image.convert("RGB")

        glow = thermal.filter(ImageFilter.GaussianBlur(radius=3.4))
        diffused = Image.blend(glow, thermal, 0.66)
        diffused.save(destination)
