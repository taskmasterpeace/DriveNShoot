# film/ — full-length features

**Drop here:** feature films as `.mp4` / `.mov` / `.mkv` / `.webm` — top level
or in a per-title subfolder.

**What MediaForge does:** encodes each source to `film/<id>/<id>.ogv`
(Theora/Vorbis, max 960px wide — the only video Godot plays), extracts
`film/<id>/poster.png`, probes the runtime, and writes a `category: "film"`
row to `game/data/media_manifest.json`.

In-game: features play on the safehouse TV (E) and headline the drive-in.
Unlock rules (found DVD, quest reward, ...) are edited on the row in the
MediaForge UI — http://localhost:8897 after `node tools/mediaforge/server.mjs`.
