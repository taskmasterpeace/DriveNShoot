#!/usr/bin/env python3
"""Build and verify the deterministic DRIVN companion promotional box."""

from __future__ import annotations

import argparse
import colorsys
import hashlib
import io
import random
import sys
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageEnhance, ImageFont, ImageOps


REPO = Path(__file__).resolve().parents[2]
DEFAULT_SOURCE = REPO / "game/assets/game_deck/companion_drivn_key_art.webp"
DEFAULT_OUTPUT = REPO / "game/assets/game_deck/companion_drivn_promo.webp"
DEFAULT_FONT = REPO / "game/assets/fonts/game_deck/RussoOne-Regular.ttf"
SIZE = (1024, 1536)
SOURCE_SIZE = (1536, 1024)
INK = (17, 16, 13)
BONE = (232, 223, 207)
AMBER = (242, 183, 53)
TEAL = (95, 117, 110)
RUST = (200, 120, 50)
TITLE = "DRIVN"
SUBTITLE = "THE FULL WASTELAND"
STRAP = "GAME DECK LIVES INSIDE THIS WORLD"
KICKER = "A DRIVN COMPANION"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--font", type=Path, default=DEFAULT_FONT)
    parser.add_argument("--check", action="store_true")
    return parser.parse_args()


def cover_box(source: Image.Image, size: tuple[int, int]) -> Image.Image:
    source = ImageOps.exif_transpose(source).convert("RGB")
    scale = max(size[0] / source.width, size[1] / source.height)
    resized = source.resize(
        (round(source.width * scale), round(source.height * scale)),
        Image.Resampling.LANCZOS,
    )
    left = (resized.width - size[0]) // 2
    top = (resized.height - size[1]) // 2
    return resized.crop((left, top, left + size[0], top + size[1]))


def remove_forbidden_purple(image: Image.Image) -> Image.Image:
    """Map saturated violet/magenta into DRIVN signal teal."""
    hsv = image.convert("HSV")
    pixels = hsv.load()
    for y in range(hsv.height):
        for x in range(hsv.width):
            hue, saturation, value = pixels[x, y]
            if 191 <= hue <= 227 and saturation >= 89 and value >= 38:
                pixels[x, y] = (132, saturation, value)
    return hsv.convert("RGB")


def forbidden_purple_count(image: Image.Image) -> int:
    count = 0
    for red, green, blue in image.convert("RGB").get_flattened_data():
        hue, saturation, value = colorsys.rgb_to_hsv(
            red / 255.0, green / 255.0, blue / 255.0
        )
        if 270 <= hue * 360 <= 320 and saturation >= 0.35 and value >= 0.15:
            count += 1
    return count


def font_that_fits(
    font_path: Path, text: str, max_width: int, start_size: int, minimum: int = 20
) -> ImageFont.FreeTypeFont:
    for size in range(start_size, minimum - 1, -2):
        font = ImageFont.truetype(str(font_path), size)
        box = font.getbbox(text)
        if box[2] - box[0] <= max_width:
            return font
    raise ValueError(f"text does not fit required width: {text}")


def centered_text(
    draw: ImageDraw.ImageDraw,
    y: int,
    text: str,
    font: ImageFont.FreeTypeFont,
    fill: tuple[int, int, int] | tuple[int, int, int, int],
    stroke_width: int = 0,
    stroke_fill: tuple[int, int, int] = INK,
) -> tuple[int, int, int, int]:
    box = draw.textbbox((0, 0), text, font=font, stroke_width=stroke_width)
    width = box[2] - box[0]
    x = (SIZE[0] - width) // 2 - box[0]
    draw.text(
        (x, y),
        text,
        font=font,
        fill=fill,
        stroke_width=stroke_width,
        stroke_fill=stroke_fill,
    )
    return (x + box[0], y + box[1], x + box[2], y + box[3])


def gradient_rect(
    overlay: Image.Image,
    top: int,
    bottom: int,
    start_alpha: int,
    end_alpha: int,
) -> None:
    draw = ImageDraw.Draw(overlay, "RGBA")
    span = max(1, bottom - top)
    for y in range(top, bottom):
        progress = (y - top) / span
        alpha = round(start_alpha + (end_alpha - start_alpha) * progress)
        draw.line((0, y, SIZE[0], y), fill=(*INK, alpha))


def add_print_wear(image: Image.Image) -> None:
    rng = random.Random(0x445249564E)  # stable "DRIVN" seed
    draw = ImageDraw.Draw(image, "RGBA")
    for _ in range(260):
        x = rng.randrange(SIZE[0])
        y = rng.randrange(SIZE[1])
        radius = rng.choice((1, 1, 1, 2, 3))
        color = (*BONE, rng.randrange(7, 22)) if rng.random() > 0.46 else (*INK, rng.randrange(9, 27))
        draw.ellipse((x - radius, y - radius, x + radius, y + radius), fill=color)
    for _ in range(28):
        x = rng.randrange(18, SIZE[0] - 18)
        y = rng.choice((18, SIZE[1] - 19))
        draw.line(
            (x, y, x + rng.randrange(-18, 19), y + rng.randrange(-14, 15)),
            fill=(*BONE, 30),
            width=rng.randrange(1, 4),
        )


def build_image(source: Image.Image, font_path: Path) -> Image.Image:
    if source.size != SOURCE_SIZE:
        raise ValueError(f"key art is {source.size}, expected exact {SOURCE_SIZE}")
    canvas = cover_box(source, SIZE)
    canvas = ImageEnhance.Color(canvas).enhance(0.90)
    canvas = ImageEnhance.Contrast(canvas).enhance(1.09)
    canvas = ImageEnhance.Sharpness(canvas).enhance(1.06)
    canvas = remove_forbidden_purple(canvas)

    overlay = Image.new("RGBA", SIZE, (0, 0, 0, 0))
    gradient_rect(overlay, 0, 470, 242, 35)
    gradient_rect(overlay, 1120, SIZE[1], 24, 244)
    draw = ImageDraw.Draw(overlay, "RGBA")
    for x in range(150):
        alpha = round(88 * (1.0 - x / 150.0))
        draw.line((x, 0, x, SIZE[1]), fill=(*INK, alpha))
        draw.line((SIZE[0] - 1 - x, 0, SIZE[0] - 1 - x, SIZE[1]), fill=(*INK, alpha))

    draw.rectangle((14, 14, SIZE[0] - 15, SIZE[1] - 15), outline=RUST, width=8)
    draw.rectangle((30, 30, SIZE[0] - 31, SIZE[1] - 31), outline=(*BONE, 145), width=2)
    draw.rectangle((52, 386, SIZE[0] - 53, 394), fill=AMBER)
    draw.rectangle((52, 402, 360, 407), fill=TEAL)

    kicker_font = font_that_fits(font_path, KICKER, 900, 36)
    title_font = font_that_fits(font_path, TITLE, 910, 178)
    subtitle_font = font_that_fits(font_path, SUBTITLE, 900, 58)
    strap_font = font_that_fits(font_path, STRAP, 900, 48)
    centered_text(draw, 54, KICKER, kicker_font, TEAL)
    title_box = centered_text(draw, 94, TITLE, title_font, BONE, 4, INK)
    centered_text(draw, 284, SUBTITLE, subtitle_font, AMBER, 2, INK)
    centered_text(draw, 1381, STRAP, strap_font, BONE, 2, INK)

    if title_box[2] - title_box[0] < 570 or title_box[3] - title_box[1] < 90:
        raise ValueError(f"title rendered too small: {title_box}")
    if (TITLE, SUBTITLE, STRAP) != (
        "DRIVN",
        "THE FULL WASTELAND",
        "GAME DECK LIVES INSIDE THIS WORLD",
    ):
        raise ValueError("required promotional title copy changed")

    canvas = Image.alpha_composite(canvas.convert("RGBA"), overlay).convert("RGB")
    add_print_wear(canvas)
    canvas = remove_forbidden_purple(canvas)
    validate_pixels(canvas)
    return canvas


def encode_webp(image: Image.Image) -> bytes:
    stream = io.BytesIO()
    image.save(stream, "WEBP", lossless=True, quality=100, method=6, exact=True)
    return stream.getvalue()


def validate_pixels(image: Image.Image) -> None:
    if image.size != SIZE:
        raise ValueError(f"promo is {image.size}, expected exact {SIZE}")
    purple = forbidden_purple_count(image)
    if purple:
        raise ValueError(f"promo contains {purple} forbidden purple pixels")
    title_crop = image.crop((120, 120, 904, 275)).convert("RGB")
    bone_pixels = sum(
        1
        for red, green, blue in title_crop.get_flattened_data()
        if red >= 185 and green >= 170 and blue >= 145
    )
    if bone_pixels < 14_000:
        raise ValueError(f"DRIVN title presence check failed: {bone_pixels} light pixels")


def main() -> int:
    args = parse_args()
    if not args.source.is_file():
        raise FileNotFoundError(f"key art missing: {args.source}")
    if not args.font.is_file():
        raise FileNotFoundError(f"font missing: {args.font}")
    with Image.open(args.source) as source:
        source_rgb = source.convert("RGB")
        source_purple = forbidden_purple_count(source_rgb)
        if source_purple:
            raise ValueError(f"key art contains {source_purple} forbidden purple pixels")
        built = build_image(source_rgb, args.font)
    expected_bytes = encode_webp(built)
    if args.check:
        if not args.output.is_file():
            raise FileNotFoundError(f"promo missing: {args.output}")
        actual_bytes = args.output.read_bytes()
        if actual_bytes != expected_bytes:
            with Image.open(io.BytesIO(expected_bytes)) as expected, Image.open(args.output) as actual:
                difference = ImageChops.difference(expected.convert("RGB"), actual.convert("RGB"))
                changed = difference.getbbox() is not None
            raise ValueError(
                "promo differs from deterministic build"
                + (" at decoded pixels" if changed else " in encoded bytes")
            )
        with Image.open(args.output) as actual:
            validate_pixels(actual.convert("RGB"))
        digest = hashlib.sha256(actual_bytes).hexdigest()
        print(f"PROMO CHECK PASS {args.output} {SIZE[0]}x{SIZE[1]} sha256={digest}")
        return 0

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_bytes(expected_bytes)
    with Image.open(args.output) as written:
        validate_pixels(written.convert("RGB"))
    print(f"PROMO BUILT {args.output} {SIZE[0]}x{SIZE[1]}")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"COMPANION PROMO BUILD FAILED: {exc}", file=sys.stderr)
        raise SystemExit(1)
