# DRIVN companion promotional art provenance

`companion_drivn_key_art.webp` is original, text-free raster key art generated
for this repository on 2026-07-14 with OpenAI's built-in image-generation tool.
No reference or source images were supplied. The prompt requested a centered
armed road machine on a ruined interstate at amber dusk, a distant fortified
safehouse and drive-in, an abstract in-vehicle screen glow, a weathered pulp
science-fiction print treatment, and the DRIVN amber/rust/teal/bone/black
palette. It explicitly excluded words, numbers, logos, watermarks, signatures,
real vehicle marks, copyrighted characters, recognizable franchise imagery,
and all purple/violet/magenta hues.

The accepted source was inspected at its native 1536 x 1024 resolution for the
requested subjects, portrait-safe composition, accidental marks or text,
watermarks, and forbidden color. It was converted to a lossless WebP after the
same deterministic purple-to-teal sanitation used by the cover pipeline.

`companion_drivn_promo.webp` is a deterministic 1024 x 1536 derivative built
only from that repository-owned key art and the checked-in Russo One font:

```powershell
python tools/game_deck/build_companion_promo.py
python tools/game_deck/build_companion_promo.py --check
```

The compositor owns the exact title copy, center crop, overlays, border, print
wear, dimensions, title-presence check, forbidden-purple scan, and byte-for-byte
rebuild check. The accepted image was also inspected at a 180 x 270 shelf
thumbnail.

- Key art SHA-256: `5369242EB22002AB0B3759CF938988E35E58B884A3662AC0F6CE1F157D551064`
- Promo SHA-256: `64C5BB2D049DFF23E01CA6D4A89BD7D1AE5FE619D712B63FC62E961A47F9F7C5`
