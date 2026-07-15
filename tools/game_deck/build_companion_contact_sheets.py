#!/usr/bin/env python3
"""Build labeled visual-review sheets from the real Game Deck GPU captures."""

from __future__ import annotations

import argparse
import colorsys
import json
import textwrap
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageOps


REPO = Path(__file__).resolve().parents[2]
DEFAULT_ROOT = REPO / "docs/verification/game_deck_companion"
FONT_PATH = REPO / "game/assets/fonts/game_deck/RussoOne-Regular.ttf"
PAGE_SIZE = (2240, 2170)
INK = (17, 16, 13)
CARD = (36, 32, 25)
BONE = (232, 223, 207)
AMBER = (242, 183, 53)
TEAL = (95, 117, 110)
RUST = (200, 120, 50)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=DEFAULT_ROOT)
    return parser.parse_args()


def fit(image: Image.Image, size: tuple[int, int], background=INK) -> Image.Image:
    canvas = Image.new("RGB", size, background)
    contained = ImageOps.contain(image.convert("RGB"), size, Image.Resampling.LANCZOS)
    canvas.paste(contained, ((size[0] - contained.width) // 2, (size[1] - contained.height) // 2))
    return canvas


def purple_pixels(image: Image.Image) -> int:
    count = 0
    sampled = image.convert("RGB").resize(
        (max(1, image.width // 4), max(1, image.height // 4)), Image.Resampling.BOX
    )
    for red, green, blue in sampled.get_flattened_data():
        hue, saturation, value = colorsys.rgb_to_hsv(red / 255, green / 255, blue / 255)
        if 270 <= hue * 360 <= 320 and saturation >= 0.40 and value >= 0.18:
            count += 1
    return count * 16


def load_rows() -> dict[str, dict]:
    data = json.loads((REPO / "game/data/games.json").read_text(encoding="utf-8"))
    return {row["id"]: row for row in data["games"]}


def build_page(root: Path, games: list[dict], rows: dict[str, dict], page: int) -> Image.Image:
    image = Image.new("RGB", PAGE_SIZE, INK)
    draw = ImageDraw.Draw(image)
    title_font = ImageFont.truetype(str(FONT_PATH), 45)
    game_font = ImageFont.truetype(str(FONT_PATH), 31)
    meta_font = ImageFont.truetype(str(FONT_PATH), 18)
    body_font = ImageFont.truetype(str(FONT_PATH), 17)
    label_font = ImageFont.truetype(str(FONT_PATH), 16)

    draw.text((40, 28), "DRIVN: GAME DECK // CARTRIDGE PROOF", font=title_font, fill=AMBER)
    draw.text(
        (40, 82),
        f"SHEET {page:02d} // BOX ART + START + ACTION + LATE // REAL 1920x1080 GPU FRAMES",
        font=meta_font,
        fill=TEAL,
    )
    draw.line((40, 118, PAGE_SIZE[0] - 40, 118), fill=RUST, width=4)

    for local_index, game in enumerate(games):
        row_y = 135 + local_index * 505
        draw.rounded_rectangle(
            (24, row_y, PAGE_SIZE[0] - 24, row_y + 485),
            radius=14,
            fill=CARD,
            outline=RUST,
            width=2,
        )
        game_row = rows[game["id"]]
        cover_path = REPO / "game" / game["cover_path"].removeprefix("res://")
        with Image.open(cover_path) as cover:
            cover_box = fit(cover, (260, 390), CARD)
        image.paste(cover_box, (45, row_y + 70))
        draw.rectangle((43, row_y + 68, 307, row_y + 462), outline=BONE, width=2)

        draw.text((330, row_y + 22), f"{game['order']:02d} // {game['title']}", font=game_font, fill=BONE)
        meta = f"{game['platform'].upper()} // {game['aspect']} // SINGLE PLAYER"
        if game["platform"] == "console":
            meta += " // STOCK AI FIELD"
        draw.text((330, row_y + 59), meta, font=meta_font, fill=AMBER)
        description = str(game_row.get("about_world", game_row.get("help", ""))).replace("\n", " ")
        wrapped = textwrap.wrap(description, width=118)[:2]
        draw.multiline_text((330, row_y + 83), "\n".join(wrapped), font=body_font, fill=BONE, spacing=4)

        for frame_index, (frame_path, label) in enumerate(zip(game["frames"], ("START", "ACTION", "LATE"))):
            x = 330 + frame_index * 625
            y = row_y + 137
            with Image.open(root / frame_path) as frame:
                shot = fit(frame, (600, 338))
            image.paste(shot, (x, y))
            draw.rectangle((x - 2, y - 2, x + 602, y + 340), outline=TEAL, width=2)
            draw.rectangle((x, y, x + 100, y + 28), fill=INK)
            draw.text((x + 10, y + 5), label, font=label_font, fill=AMBER)
    return image


def build_ui_page(ui_paths: list[Path]) -> Image.Image:
    row_count = (len(ui_paths) + 2) // 3
    size = (2040, 155 + row_count * 375)
    image = Image.new("RGB", size, INK)
    draw = ImageDraw.Draw(image)
    title_font = ImageFont.truetype(str(FONT_PATH), 43)
    label_font = ImageFont.truetype(str(FONT_PATH), 16)
    draw.text((35, 24), "DRIVN: GAME DECK // COMPLETE UI JOURNEY", font=title_font, fill=AMBER)
    draw.text(
        (35, 75),
        f"{len(ui_paths)} REAL 1920x1080 COMPATIBILITY-RENDERER FRAMES",
        font=label_font,
        fill=TEAL,
    )
    draw.line((35, 108, size[0] - 35, 108), fill=RUST, width=4)
    for index, path in enumerate(ui_paths):
        column = index % 3
        row = index // 3
        x = 35 + column * 665
        y = 135 + row * 375
        with Image.open(path) as source:
            frame = fit(source, (640, 360))
        image.paste(frame, (x, y))
        draw.rectangle((x - 2, y - 2, x + 642, y + 362), outline=TEAL, width=2)
        label = path.stem.replace("_", " ").upper()
        draw.rectangle((x, y, x + min(620, 16 + len(label) * 10), y + 28), fill=INK)
        draw.text((x + 8, y + 5), label, font=label_font, fill=AMBER)
    return image


def main() -> int:
    args = parse_args()
    root = args.root.resolve()
    manifest = json.loads((root / "manifest.json").read_text(encoding="utf-8"))
    games = manifest["games"]
    if manifest.get("game_count") != 22 or len(games) != 22:
        raise ValueError(f"expected 22 captured games, found {len(games)}")
    frame_paths = [root / frame for game in games for frame in game["frames"]]
    if len(frame_paths) != 66 or any(not path.is_file() for path in frame_paths):
        raise ValueError("all 66 named gameplay frames are required")
    dimensions = set()
    forbidden: dict[str, int] = {}
    for path in frame_paths:
        with Image.open(path) as frame:
            dimensions.add(frame.size)
            count = purple_pixels(frame)
            if count:
                forbidden[str(path.relative_to(root))] = count
    if dimensions != {(1920, 1080)}:
        raise ValueError(f"gameplay frame dimensions are not exact: {dimensions}")
    if forbidden:
        worst = sorted(forbidden.items(), key=lambda item: item[1], reverse=True)[:10]
        raise ValueError(f"forbidden purple found in gameplay frames: {worst}")

    ui_paths = sorted(root.glob("[0-9][0-9]_*.png"))
    if len(ui_paths) != 19:
        raise ValueError(f"expected 19 UI journey frames, found {len(ui_paths)}")
    for path in ui_paths:
        with Image.open(path) as frame:
            if frame.size != (1920, 1080):
                raise ValueError(f"{path.name} has wrong dimensions: {frame.size}")
            count = purple_pixels(frame)
            if count:
                raise ValueError(f"{path.name} contains about {count} forbidden purple pixels")

    rows = load_rows()
    output = root / "contact_sheets"
    output.mkdir(parents=True, exist_ok=True)
    ui_sheet = build_ui_page(ui_paths)
    ui_path = output / "00_ui_journey.jpg"
    ui_sheet.save(ui_path, "JPEG", quality=91, subsampling=0, optimize=True)
    print(f"UI CONTACT SHEET: {ui_path}")
    for page_index, start in enumerate(range(0, len(games), 4), 1):
        page_games = games[start : start + 4]
        sheet = build_page(root, page_games, rows, page_index)
        path = output / f"{page_index:02d}_games_{start + 1:02d}_{start + len(page_games):02d}.jpg"
        sheet.save(path, "JPEG", quality=91, subsampling=0, optimize=True)
        print(f"CONTACT SHEET {page_index}: {path}")
    print("CONTACT SHEET CHECK PASS: 19 UI + 66 gameplay frames, 22 covers, no purple")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
