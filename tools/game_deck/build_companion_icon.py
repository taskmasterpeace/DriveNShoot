#!/usr/bin/env python3
"""Build and verify the deterministic Windows icon for DRIVN: GAME DECK."""

from __future__ import annotations

import argparse
import hashlib
import io
import sys
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFont


REPO = Path(__file__).resolve().parents[2]
DEFAULT_OUTPUT = REPO / "game/assets/game_deck/game_deck.ico"
DEFAULT_FONT = REPO / "game/assets/fonts/game_deck/RussoOne-Regular.ttf"
CANVAS = 256
SIZES = (16, 24, 32, 48, 64, 128, 256)
INK = (17, 16, 13, 255)
CARD = (36, 32, 25, 255)
BONE = (232, 223, 207, 255)
AMBER = (242, 183, 53, 255)
TEAL = (95, 117, 110, 255)
RUST = (200, 120, 50, 255)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--font", type=Path, default=DEFAULT_FONT)
    parser.add_argument("--check", action="store_true")
    return parser.parse_args()


def build_icon(font_path: Path) -> Image.Image:
    image = Image.new("RGBA", (CANVAS, CANVAS), INK)
    draw = ImageDraw.Draw(image, "RGBA")
    draw.rounded_rectangle((5, 5, 250, 250), radius=31, fill=CARD, outline=AMBER, width=8)
    draw.rounded_rectangle((18, 18, 237, 237), radius=22, outline=RUST, width=3)

    # A dead-straight divided highway makes the icon read as DRIVN even at 16 px.
    draw.polygon(((80, 238), (115, 21), (141, 21), (176, 238)), fill=(12, 12, 10, 255))
    draw.line((128, 34, 128, 224), fill=AMBER, width=5)
    for y in range(50, 225, 36):
        draw.rectangle((105, y, 109, min(y + 18, 225)), fill=BONE)
        draw.rectangle((147, y, 151, min(y + 18, 225)), fill=BONE)

    # Four universal cartridge contacts echo the physical insertion screen.
    for x in (41, 63, 193, 215):
        draw.rounded_rectangle((x - 7, 205, x + 7, 221), radius=4, fill=TEAL)

    font = ImageFont.truetype(str(font_path), 97)
    box = draw.textbbox((0, 0), "D", font=font, stroke_width=5)
    width = box[2] - box[0]
    height = box[3] - box[1]
    draw.text(
        ((CANVAS - width) // 2 - box[0], 77 - box[1] - height // 2),
        "D",
        font=font,
        fill=BONE,
        stroke_width=5,
        stroke_fill=INK,
    )
    return image


def encode_ico(image: Image.Image) -> bytes:
    stream = io.BytesIO()
    image.save(stream, "ICO", sizes=[(size, size) for size in SIZES])
    return stream.getvalue()


def validate(image: Image.Image) -> None:
    if image.size != (CANVAS, CANVAS):
        raise ValueError(f"icon is {image.size}, expected {(CANVAS, CANVAS)}")
    colors = image.convert("RGB").getcolors(CANVAS * CANVAS) or []
    if len(colors) < 5:
        raise ValueError("icon palette detail is missing")
    center = image.convert("RGB").crop((82, 70, 174, 165))
    light_pixels = sum(1 for rgb in center.get_flattened_data() if sum(rgb) > 500)
    if light_pixels < 1_000:
        raise ValueError(f"center D mark is not legible: {light_pixels} light pixels")


def main() -> int:
    args = parse_args()
    if not args.font.is_file():
        raise FileNotFoundError(f"font missing: {args.font}")
    built = build_icon(args.font)
    validate(built)
    expected = encode_ico(built)
    if args.check:
        if not args.output.is_file():
            raise FileNotFoundError(f"icon missing: {args.output}")
        actual = args.output.read_bytes()
        if actual != expected:
            with Image.open(io.BytesIO(expected)) as wanted, Image.open(args.output) as found:
                changed = ImageChops.difference(
                    wanted.convert("RGBA"), found.convert("RGBA")
                ).getbbox() is not None
            raise ValueError(
                "icon differs from deterministic build"
                + (" at decoded pixels" if changed else " in encoded bytes")
            )
        with Image.open(args.output) as existing:
            available = set(existing.ico.sizes())
            required = {(size, size) for size in SIZES}
            if not required.issubset(available):
                raise ValueError(f"icon sizes missing: {sorted(required - available)}")
            validate(existing.ico.getimage((CANVAS, CANVAS)).convert("RGBA"))
        print(
            f"ICON CHECK PASS {args.output} sizes={','.join(map(str, SIZES))} "
            f"sha256={hashlib.sha256(actual).hexdigest()}"
        )
        return 0

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_bytes(expected)
    print(f"ICON BUILT {args.output} sizes={','.join(map(str, SIZES))}")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"COMPANION ICON BUILD FAILED: {exc}", file=sys.stderr)
        raise SystemExit(1)
