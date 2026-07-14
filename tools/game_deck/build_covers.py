#!/usr/bin/env python3
"""Deterministically package approved text-free Game Deck key art."""

from __future__ import annotations

import argparse
import colorsys
import hashlib
import json
import random
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageEnhance, ImageFont, ImageOps


REPO = Path(__file__).resolve().parents[2]
DEFAULT_MANIFEST = Path(__file__).with_name("cover_manifest.json")
DEFAULT_FONT = REPO / "game/assets/fonts/game_deck/RussoOne-Regular.ttf"
INK = "#11100D"
BONE = "#E8DFCF"
DIM = "#918675"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--key-art-dir", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--manifest", type=Path, default=DEFAULT_MANIFEST)
    parser.add_argument("--font", type=Path, default=DEFAULT_FONT)
    parser.add_argument("--contact-sheet", type=Path)
    parser.add_argument("--only")
    return parser.parse_args()


def load_manifest(path: Path) -> list[dict]:
    data = json.loads(path.read_text(encoding="utf-8"))
    games = data.get("games", [])
    if not isinstance(games, list) or len(games) != 22:
        raise ValueError("cover manifest must contain exactly 22 games")
    ids = [str(row.get("id", "")) for row in games]
    if any(not game_id for game_id in ids) or len(set(ids)) != 22:
        raise ValueError("cover manifest IDs must be non-empty and unique")
    return games


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
    """Map saturated purple/magenta into the established signal-teal family."""
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
        hue, saturation, value = colorsys.rgb_to_hsv(red / 255, green / 255, blue / 255)
        degrees = hue * 360
        if 270 <= degrees <= 320 and saturation >= 0.35 and value >= 0.15:
            count += 1
    return count


def font_that_fits(font_path: Path, text: str, max_width: int, start_size: int) -> ImageFont.FreeTypeFont:
    size = start_size
    while size >= 16:
        font = ImageFont.truetype(str(font_path), size)
        box = font.getbbox(text)
        if box[2] - box[0] <= max_width:
            return font
        size -= 2
    return ImageFont.truetype(str(font_path), 16)


def add_print_wear(image: Image.Image, game_id: str) -> None:
    seed = int.from_bytes(hashlib.sha256(game_id.encode("utf-8")).digest()[:8], "big")
    rng = random.Random(seed)
    draw = ImageDraw.Draw(image, "RGBA")
    width, height = image.size
    for _ in range(max(80, (width * height) // 9000)):
        x = rng.randrange(width)
        y = rng.randrange(height)
        radius = rng.choice((1, 1, 2, 3))
        color = (232, 223, 207, rng.randrange(8, 25)) if rng.random() > 0.45 else (17, 16, 13, rng.randrange(10, 32))
        draw.ellipse((x - radius, y - radius, x + radius, y + radius), fill=color)
    inset = max(7, round(min(width, height) * 0.012))
    for _ in range(18):
        side = rng.randrange(4)
        if side < 2:
            x = inset if side == 0 else width - inset
            y = rng.randrange(height)
            draw.line((x, y, x + rng.randrange(-10, 11), y + rng.randrange(8, 34)), fill=(232, 223, 207, 35), width=rng.randrange(1, 4))
        else:
            x = rng.randrange(width)
            y = inset if side == 2 else height - inset
            draw.line((x, y, x + rng.randrange(8, 34), y + rng.randrange(-10, 11)), fill=(232, 223, 207, 35), width=rng.randrange(1, 4))


def build_cover(row: dict, source_path: Path, output_path: Path, font_path: Path) -> None:
    width, height = (int(value) for value in row["size"])
    with Image.open(source_path) as raw:
        canvas = cover_box(raw, (width, height))
    canvas = ImageEnhance.Color(canvas).enhance(0.92)
    canvas = ImageEnhance.Contrast(canvas).enhance(1.08)
    canvas = remove_forbidden_purple(canvas)

    overlay = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay, "RGBA")
    rail_h = max(46, round(height * 0.055))
    title_h = max(150, round(height * 0.17))
    border = max(8, round(min(width, height) * 0.012))
    accent = row["accent"]

    draw.rectangle((0, 0, width, rail_h), fill=(17, 16, 13, 238))
    draw.rectangle((0, height - title_h, width, height), fill=(17, 16, 13, 232))
    draw.rectangle((border, border, width - border - 1, height - border - 1), outline=accent, width=max(3, border // 3))
    draw.rectangle((border * 2, border * 2, width - border * 2 - 1, height - border * 2 - 1), outline=(232, 223, 207, 150), width=max(1, border // 7))
    draw.rectangle((0, rail_h - max(4, rail_h // 12), width, rail_h), fill=accent)

    family = "SAFEHOUSE CONSOLE" if row["platform"] == "console" else "POCKET GAME DECK"
    family_font = ImageFont.truetype(str(font_path), max(17, round(rail_h * 0.42)))
    badge_font = ImageFont.truetype(str(font_path), max(16, round(rail_h * 0.38)))
    pad = max(22, round(width * 0.035))
    draw.text((pad, rail_h * 0.20), family, font=family_font, fill=BONE)
    badge_text = str(row["aspect"])
    badge_box = draw.textbbox((0, 0), badge_text, font=badge_font)
    draw.text((width - pad - (badge_box[2] - badge_box[0]), rail_h * 0.22), badge_text, font=badge_font, fill=accent)

    title = str(row["title"])
    title_font = font_that_fits(font_path, title, width - pad * 2, max(44, round(title_h * 0.37)))
    title_box = draw.textbbox((0, 0), title, font=title_font)
    title_y = height - title_h + max(12, round(title_h * 0.14))
    draw.text((pad, title_y), title, font=title_font, fill=BONE, stroke_width=max(1, width // 700), stroke_fill=INK)
    rule_y = title_y + (title_box[3] - title_box[1]) + max(10, round(title_h * 0.06))
    draw.rectangle((pad, rule_y, width - pad, rule_y + max(3, height // 500)), fill=accent)

    facts = f"{row['players']}  //  {row['network']}"
    facts_font = font_that_fits(font_path, facts, width - pad * 2, max(18, round(title_h * 0.15)))
    draw.text((pad, rule_y + max(12, round(title_h * 0.09))), facts, font=facts_font, fill=DIM)

    canvas = Image.alpha_composite(canvas.convert("RGBA"), overlay).convert("RGB")
    add_print_wear(canvas, str(row["id"]))
    purple = forbidden_purple_count(canvas)
    if purple:
        raise ValueError(f"{row['id']}: {purple} forbidden purple pixels remain")
    output_path.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(output_path, "WEBP", quality=94, method=6)
    with Image.open(output_path) as written:
        if written.size != (width, height):
            raise ValueError(f"{row['id']}: wrote {written.size}, expected {(width, height)}")


def fit_inside(image: Image.Image, box: tuple[int, int]) -> Image.Image:
    copy = image.copy()
    copy.thumbnail(box, Image.Resampling.LANCZOS)
    return copy


def build_contact_sheet(rows: list[dict], output_dir: Path, path: Path, font_path: Path) -> None:
    sheet_w = 3600
    margin = 90
    header_h = 110
    gap = 34
    handheld_cell = (600, 470)
    console_cell = (500, 760)
    handheld = [row for row in rows if row["platform"] == "handheld"]
    console = [row for row in rows if row["platform"] == "console"]
    hand_rows = (len(handheld) + 4) // 5
    console_rows = (len(console) + 5) // 6
    hand_h = hand_rows * handheld_cell[1]
    console_h = console_rows * console_cell[1]
    sheet_h = margin + header_h + hand_h + header_h + console_h + margin
    sheet = Image.new("RGB", (sheet_w, sheet_h), INK)
    draw = ImageDraw.Draw(sheet)
    heading = ImageFont.truetype(str(font_path), 64)
    label = ImageFont.truetype(str(font_path), 30)
    draw.text((margin, margin), "POCKET GAME DECK // 10 CARTRIDGES", font=heading, fill=BONE)

    y0 = margin + header_h
    for index, row in enumerate(handheld):
        col, grid_row = index % 5, index // 5
        cell_x = margin + col * ((sheet_w - margin * 2) // 5)
        cell_y = y0 + grid_row * handheld_cell[1]
        with Image.open(output_dir / f"{row['id']}.webp") as art:
            thumb = fit_inside(art.convert("RGB"), (540, 380))
        x = cell_x + (540 - thumb.width) // 2
        sheet.paste(thumb, (x, cell_y))
        draw.text((cell_x, cell_y + 392), row["title"], font=label, fill=row["accent"])

    console_y = y0 + hand_h
    draw.text((margin, console_y), "SAFEHOUSE CONSOLE // 12 BOXES", font=heading, fill=BONE)
    y1 = console_y + header_h
    cell_span = (sheet_w - margin * 2) // 6
    for index, row in enumerate(console):
        col, grid_row = index % 6, index // 6
        cell_x = margin + col * cell_span
        cell_y = y1 + grid_row * console_cell[1]
        with Image.open(output_dir / f"{row['id']}.webp") as art:
            thumb = fit_inside(art.convert("RGB"), (430, 650))
        x = cell_x + (430 - thumb.width) // 2
        sheet.paste(thumb, (x, cell_y))
        draw.text((cell_x, cell_y + 665), row["title"], font=label, fill=row["accent"])

    path.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(path, "WEBP", quality=92, method=6)


def main() -> int:
    args = parse_args()
    rows = load_manifest(args.manifest)
    if not args.font.is_file():
        raise FileNotFoundError(f"font missing: {args.font}")
    selected = [row for row in rows if args.only is None or row["id"] == args.only]
    if args.only and not selected:
        raise ValueError(f"unknown game ID: {args.only}")
    for row in selected:
        source = args.key_art_dir / f"{row['id']}.png"
        if not source.is_file():
            raise FileNotFoundError(f"{row['id']}: key art missing: {source}")
        build_cover(row, source, args.output_dir / f"{row['id']}.webp", args.font)
        print(f"BUILT {row['id']}")
    if args.contact_sheet:
        if len(selected) != 22:
            raise ValueError("contact sheet requires all 22 covers")
        build_contact_sheet(rows, args.output_dir, args.contact_sheet, args.font)
        print(f"CONTACT SHEET {args.contact_sheet}")
    print(f"{len(selected)} covers built, 0 validation failures")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:  # one concise asset-production failure line
        print(f"COVER BUILD FAILED: {exc}", file=sys.stderr)
        raise SystemExit(1)
