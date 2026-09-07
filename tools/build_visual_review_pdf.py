"""Package the existing screenshot audit without altering screenshot pixels."""
from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path
from xml.sax.saxutils import escape

from PIL import Image
from pypdf import PdfReader
from reportlab.lib.colors import HexColor
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas
from reportlab.platypus import Paragraph

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "docs/verification/MERIDIAN_GAME_GALLERY_2026_09_06.md"
OUTPUT = ROOT / "output/pdf/DRIVN_Visual_Review_2026_09_06.pdf"
QA = ROOT / "output/pdf/DRIVN_Visual_Review_2026_09_06.validation.json"
W, H = 960, 690
INK, PAPER, MUTED, AMBER = map(HexColor, ("#151713", "#EEE8D9", "#A7A99B", "#E7B653"))


def plain(text: str) -> str:
    text = re.sub(r"\[([^]]+)\]\([^)]+\)", r"\1", text)
    return text.replace("**", "").replace("`", "").replace("—", "-").replace("–", "-").replace("‑", "-").strip()


def records() -> tuple[list[dict], list[dict]]:
    sections = re.split(r"^## (\d{2}) — ([^\n]+)\n", SOURCE.read_text(encoding="utf-8"), flags=re.M)
    pieces, frames = [], []
    for index in range(1, len(sections), 3):
        number, title, body = sections[index:index + 3]
        matches = list(re.finditer(r"!\[([^]]+)\]\(([^)]+)\)", body))
        if not matches:
            raise ValueError(f"Piece {number} has no screenshot")
        pieces.append({"number": number, "title": plain(title)})
        previous_end = 0
        for revision, match in enumerate(matches):
            path = (SOURCE.parent / match.group(2)).resolve()
            path.relative_to(ROOT)
            with Image.open(path) as source:
                if source.size != (1280, 720):
                    raise ValueError(f"Unexpected screenshot dimensions: {path}")
                source.load()  # Container/header checks do not validate compressed pixels.
            frames.append({"number": number, "title": plain(title), "revision": revision,
                           "path": path, "caption": plain(body[previous_end:match.start()]),
                           "sha256": hashlib.sha256(path.read_bytes()).hexdigest()})
            previous_end = match.end()
    if len(pieces) != 20 or len(frames) != 22:
        raise ValueError(f"Expected 20 pieces and 22 original/repair frames, got {len(pieces)}/{len(frames)}")
    return pieces, frames


def paragraph(pdf: canvas.Canvas, text: str, x: float, top: float, width: float,
              size: float = 11, color=PAPER, max_height: float = 80) -> None:
    style = ParagraphStyle("review", fontName="Review", fontSize=size, leading=size * 1.35, textColor=color)
    block = Paragraph(escape(text).replace("\n", " "), style)
    _, height = block.wrap(width, max_height)
    if height > max_height:
        raise ValueError(f"Caption exceeds allotted height: {height}: {text}")
    block.drawOn(pdf, x, top - height)


def base(pdf: canvas.Canvas, page: int, total: int) -> None:
    pdf.setFillColor(INK)
    pdf.rect(0, 0, W, H, fill=1, stroke=0)
    pdf.setFillColor(AMBER)
    pdf.setFont("ReviewBold", 9)
    pdf.drawString(32, H - 25, "DRIVN  /  FIELD NOTES")
    pdf.setFillColor(MUTED)
    pdf.setFont("Review", 9)
    pdf.drawRightString(W - 32, H - 25, "06 SEPTEMBER 2026  /  WORK IN PROGRESS")
    pdf.drawString(32, 15, "REAL GAME CAPTURES - NO RETOUCHING")
    pdf.drawRightString(W - 32, 15, f"{page:02d} / {total:02d}")


def build() -> None:
    pieces, frames = records()
    pdfmetrics.registerFont(TTFont("Review", "C:/Windows/Fonts/segoeui.ttf"))
    pdfmetrics.registerFont(TTFont("ReviewBold", "C:/Windows/Fonts/seguisb.ttf"))
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    QA.parent.mkdir(parents=True, exist_ok=True)
    pdf = canvas.Canvas(str(OUTPUT), pagesize=(W, H), pageCompression=1)
    pdf.setTitle("DRIVN - Screenshot Visual Review")
    pdf.setAuthor("DRIVN development review")
    pdf.setSubject("20 actual game pieces and two later interface repairs; unfinished work is identified.")
    total = len(frames) + 1
    base(pdf, 1, total)
    pdf.bookmarkPage("index")
    pdf.addOutlineEntry("Review index", "index", level=0)
    pdf.setFillColor(PAPER)
    pdf.setFont("ReviewBold", 40)
    pdf.drawString(32, 592, "The world, as it actually looks.")
    paragraph(pdf, "20 game pieces / 22 unedited screenshots / two interface repairs", 34, 564, 870, 15, AMBER)
    paragraph(pdf, "The road, home and cartridge-game idea is visible. The current art, world dressing, map presentation and cartridge playfields do not yet deliver the finished world promised by the spec.",
              34, 522, 880, 13, PAPER, 62)
    pdf.setStrokeColor(HexColor("#424737"))
    pdf.line(32, 458, 928, 458)
    pdf.setFillColor(AMBER)
    pdf.setFont("ReviewBold", 10)
    pdf.drawString(34, 436, "CONTENTS - SELECT A PIECE TO JUMP")
    for index, piece in enumerate(pieces):
        column, row = divmod(index, 10)
        x, y = 34 + column * 455, 405 - row * 23
        pdf.setFillColor(AMBER)
        pdf.setFont("ReviewBold", 11)
        pdf.drawString(x, y, piece["number"])
        pdf.setFillColor(PAPER)
        pdf.setFont("Review", 11)
        pdf.drawString(x + 30, y, piece["title"])
        pdf.linkRect("", "piece-" + piece["number"], (x, y - 4, x + 430, y + 14), relative=0, thickness=0)
    paragraph(pdf, "Evidence limits: distant stops were staged for photography; the clock was held; four cartridges were fixture-unlocked. These images are not nationwide driving, full cartridge playthrough or authenticated MMO proof. The tour predates the current traffic repair.",
              34, 162, 884, 10.5, MUTED, 64)
    paragraph(pdf, "Test captures used disposable isolated profiles. The earlier overwritten normal player save remains unrecovered. Original frames are retained beside the later dossier and atlas repairs; no release-readiness claim is made.",
              34, 96, 884, 10.5, MUTED, 54)
    pdf.showPage()
    for page, frame in enumerate(frames, 2):
        base(pdf, page, total)
        suffix = " - REPAIRED VIEW" if frame["revision"] else ""
        title = frame["number"] + " / " + frame["title"] + suffix
        key = f"piece-{frame['number']}" + ("-repair" if frame["revision"] else "")
        pdf.bookmarkPage(key)
        pdf.addOutlineEntry(title, key, level=0)
        pdf.setFont("ReviewBold", 21)
        pdf.setFillColor(PAPER)
        pdf.drawString(32, 627, title)
        pdf.drawImage(str(frame["path"]), 32, 110, width=896, height=504, mask="auto")
        paragraph(pdf, frame["caption"], 32, 96, 896, 10.7, PAPER, 57)
        pdf.setFont("Review", 8)
        pdf.setFillColor(MUTED)
        pdf.drawString(32, 29, "SOURCE  " + frame["path"].name)
        pdf.linkRect("", "index", (25, H - 33, 255, H - 10), relative=0, thickness=0)
        pdf.showPage()
    pdf.save()
    reader = PdfReader(OUTPUT)
    if len(reader.pages) != total:
        raise ValueError("PDF page count mismatch")
    validations = []
    for page, frame in zip(reader.pages[1:], frames):
        images = list(page.images)
        if len(images) != 1:
            raise ValueError("Expected exactly one screenshot per review page")
        with Image.open(frame["path"]) as source:
            expected = source.convert("RGB").tobytes()
        actual = images[0].image.convert("RGB").tobytes()
        if actual != expected:
            raise ValueError(f"Embedded screenshot pixels changed: {frame['path']}")
        if not frame["number"] in page.extract_text():
            raise ValueError("Missing visible piece label")
        validations.append({"source": str(frame["path"].relative_to(ROOT)), "source_sha256": frame["sha256"], "embedded_pixels_identical": True})
    QA.write_text(json.dumps({"pdf": str(OUTPUT), "pages": total, "frames": validations,
                              "pdf_sha256": hashlib.sha256(OUTPUT.read_bytes()).hexdigest()}, indent=2), encoding="utf-8")
    print(json.dumps({"output": str(OUTPUT), "pages": total, "pixel_identical_frames": len(validations), "qa": str(QA)}))


if __name__ == "__main__":
    build()
