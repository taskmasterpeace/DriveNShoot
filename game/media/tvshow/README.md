# tvshow/ — series episodes

**Drop here:** TV/show episodes as `.mp4` / `.mov` / `.mkv` / `.webm` — top
level or in a per-episode subfolder. One file = one episode = one row.

**What MediaForge does:** encodes each source to `tvshow/<id>/<id>.ogv`
(Theora/Vorbis), extracts `poster.png`, probes the runtime, and writes a
`category: "tvshow"` row to `game/data/media_manifest.json`. Set `series`,
`season`, and `episode` on the row in the MediaForge UI so the in-game TV can
group them.

Tip: name files so the auto-id sorts (`roadwatch_s01e01.mp4` →
id `roadwatch_s01e01`).
