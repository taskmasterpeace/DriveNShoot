# trailers/ — previews

**Drop here:** trailers as `.mp4` / `.mov` / `.mkv` / `.webm`. Trailers sell
or preview long content — they are NOT ambient filler (that's `clips/`).

**What MediaForge does:** encodes each source to `trailers/<id>/<id>.ogv`
(Theora/Vorbis), extracts `poster.png`, probes runtime, writes a
`category: "trailers"` row to `game/data/media_manifest.json`.

In-game: trailers run before drive-in features and as TV promo slots.
