# MEDIAFORGE — the DRIVN media ingest forge

MP4 in → Theora `.ogv` + poster + manifest row out. This is how the owner's
films, episodes, trailers, and clips get into the game (cinema.md Phases 0/1/8),
and where the radio/game music folders are watched.

**Why Theora?** Godot 4.5 with the `gl_compatibility` renderer plays exactly
one video format: `.ogv` (VideoStreamTheora). MP4 is not playable in-engine —
so everything gets converted on the way in.

## Run

```bash
cd tools/mediaforge
npm install            # one-time: pulls ffmpeg-static (the bundled encoder — nothing to install on the machine)
node server.mjs        # http://localhost:8897   (env MEDIAFORGE_PORT to move it)
```

This is the ONE forge allowed a dependency: `ffmpeg-static` ships a full
ffmpeg 6.1 binary (libtheora + libvorbis + libmp3lame + drawtext all verified
present). Every other forge stays zero-dep.

## The pipeline

1. **Drop** an `.mp4` / `.mov` / `.mkv` / `.webm` into
   `game/media/film|tvshow|trailers|clips/` (top level or a per-title subfolder).
2. **Scan** — the INGEST panel (or `GET /api/scan`) lists every unconverted source.
3. **Convert** — one click (or `POST /api/convert`): encodes
   `game/media/<category>/<id>/<id>.ogv`, extracts `poster.png` (frame at 10%
   runtime), probes `runtime_seconds` from ffmpeg stderr.
4. **Row** — the manifest row is upserted into `game/data/media_manifest.json`
   (written to disk on every mutation).
5. **In-game** — the MediaRegistry reads the manifest; films play on the
   safehouse TV (E) and the drive-in. Sources are never shipped, only `.ogv`.

**Music needs no conversion:** drop `.mp3`s in `game/media/music/radio/`
(radio stations) and `game/media/music/game/` (score/ambient). The folders are
the playlists; the scan panel lists them.

**Prove it before real footage:** `POST /api/testclip` generates a synthetic
12s DRIVN TEST REEL (`clips/test_pattern`) and `POST /api/testmusic` drops two
synthetic beds — so the in-game TV and radio can be tested with zero owned media.

## Encoding settings

| output | settings |
|---|---|
| video `.ogv` | `-codec:v libtheora -qscale:v 6 -codec:a libvorbis -qscale:a 4`, scaled `-vf "scale='min(960,iw)':-2"` (max 960px wide, aspect kept, even height) |
| `poster.png` | frame at 10% of runtime, scaled max 480px wide |
| music `.mp3` (test gen) | `-codec:a libmp3lame -q:a 4` |

## API (`GET /api/help` for the live doc)

| endpoint | does |
|---|---|
| `GET /api/media` | manifest rows + `encoded_exists` / `poster_exists` per row |
| `GET /api/scan` | unconverted sources in the four category folders + mp3s in music/ |
| `POST /api/convert` | `{file, category, title?, id?}` (file relative to `game/media`) → encode + poster + row; responds when done |
| `POST /api/testclip` | generate the synthetic test reel + row |
| `POST /api/testmusic` | generate the two synthetic music beds |
| `GET /api/jobs` | in-memory job log: progress % + ffmpeg stderr tail (poll while converting) |
| `PATCH /api/media?id=X` | edit row fields (`title`, `series`, `season`, `episode`, `unlock_type`, `unlock_region`, `screen_context`, `priority`, `requires_pack`) |
| `DELETE /api/media?id=X` | remove the row — files stay on disk |
| `GET /media/<path>` | serves `game/media` files (poster thumbnails, ogv preview) |

One conversion runs at a time (`409` if busy). Feature-length encodes are slow —
the UI polls `/api/jobs` and shows ffmpeg's own progress.

## The manifest row (`game/data/media_manifest.json`)

| field | meaning |
|---|---|
| `id` | slug, `[a-z0-9_]+`, unique (auto from filename; collisions get `_2`) |
| `category` | `film` \| `tvshow` \| `trailers` \| `clips` |
| `title` | display title |
| `series` / `season` / `episode` | tvshow grouping (`""` / `null` elsewhere) |
| `runtime_seconds` | probed from the source at convert time |
| `encoded_path` | `res://media/<category>/<id>/<id>.ogv` |
| `poster_path` | `res://media/<category>/<id>/poster.png` |
| `source_file` | original dropped filename (also the "already converted" marker for scan) |
| `unlock_type` | `always_available` \| `found_dvd` \| `found_tape` \| `found_reel` \| `quest_reward` \| `regional_channel` \| `world_event` |
| `unlock_region` | state/region gate (`""` = anywhere) |
| `screen_context` | array: `safehouse_tv`, `drive_in`, `public_tv`, `news` |
| `priority` | playlist ordering weight |
| `requires_pack` | `true` = optional Film Vault content; the game shows "not installed" instead of crashing |

## NOTE — local-only by design

**Streaming is planned for a later version.** This version deals in local
files only: sources you drop, `.ogv` the engine plays. No YouTube, no CDN, no
downloads. When the Film Vault packs arrive (cinema.md Phase 8), `requires_pack`
is already on every row.
