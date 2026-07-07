# game/media — the DRIVN media library (cinema.md Phase 0)

This tree holds every film, episode, trailer, clip, and music track the game can
play. **Nothing in here is hardcoded** — video rows live in
`game/data/media_manifest.json`, music is folder-driven.

## How to add VIDEO (films / episodes / trailers / clips)

1. Drop an `.mp4` (or `.mov` / `.mkv` / `.webm`) into one of the four category
   folders below — top level or in its own subfolder, either works.
2. Run **MediaForge**: `node tools/mediaforge/server.mjs` → http://localhost:8897
3. The INGEST panel lists your file. Hit **CONVERT**.
4. MediaForge encodes it to Theora `.ogv` (the ONLY video Godot's
   gl_compatibility renderer plays), extracts a `poster.png`, probes the
   runtime, and writes the manifest row. Done — the game can address it by id.

Converted layout per title: `<category>/<id>/<id>.ogv` + `<category>/<id>/poster.png`.
Source files stay where you dropped them (they are not shipped; only `.ogv` is
used in-engine).

| folder | what goes in it |
|---|---|
| `film/` | full-length features |
| `tvshow/` | episodes (series/season/episode live on the manifest row) |
| `trailers/` | previews that sell long content; drive-in pre-shows |
| `clips/` | short ambient inserts: news pieces, bumpers, loops, commercials |

## How to add MUSIC

Drop `.mp3` files straight into:

- `music/radio/` — tracks for the in-game radio's music stations
- `music/game/` — score / ambient beds (menus, safehouse, moments)

No conversion, no manifest row — the folders ARE the playlist. MediaForge's
scan panel lists what's there.

## Rules

- IDs are slugs: `[a-z0-9_]+`, unique across the whole manifest.
- Missing media must never crash the game (registry warns, UI shows
  "not installed").
- Streaming is a LATER version. This tree is local files only, by design.
