# SoundForge — the game's sound department

Every sound effect in DEATHLANDS is generated from a **text prompt** via the
ElevenLabs sound-generation API, driven by one file: **`manifest.json`**. That
manifest is the customization surface — a sound designer (human or AI) works
here, never in engine code.

```
tools/soundforge/
  manifest.json   ← one entry per sound: id, prompt, duration, prompt_influence
  generate.mjs    ← calls ElevenLabs, writes game/assets/sfx/<id>.mp3
game/assets/sfx/  ← the generated samples (checked in — players don't generate)
```

The game (`game/proto3d/audio.gd`) loads `res://assets/sfx/<id>.mp3` at boot when
it exists and **falls back to the original synthesized sound** when it doesn't —
so the game always runs, assets or not, and call sites never change.

## Setup (once)

Put the API key in `.env` at the repo root (it's gitignored — **never commit it**):

```
ELEVENLABS_API_KEY=sk_...
```

## The customization loop (how you re-roll a sound)

1. **Listen** in game, pick the sound you hate. Find its `id` in `manifest.json`
   (ids match what the code plays: `shot`, `howl`, `engine`, `thunk`...).
2. **Edit its prompt** — describe what you want to hear. More detail = better.
   `prompt_influence` (0–1): higher = follows your text more literally, lower =
   more creative. `duration_seconds`: 0.5–30 (keep one-shots short).
3. **Regenerate just that sound:**
   ```
   node tools/soundforge/generate.mjs howl --force
   ```
4. **Re-import so Godot sees it**, then play:
   ```
   <godot-console> --headless --path game --import
   ```
5. Don't like it? Same command again — every run is a new roll. Like the old
   synth better? Delete `game/assets/sfx/<id>.mp3` and the fallback returns.

`generate.mjs` with no args only generates sounds **missing** on disk, so it's
always safe to run. `--force` re-rolls; naming ids limits the blast radius.

## Adding a NEW sound to the game

1. Add a row to `manifest.json` with a new `id` + prompt.
2. `node tools/soundforge/generate.mjs <new_id>`
3. Play it from code like any other: `audio.play_at("<new_id>", pos)` — ids are
   the contract. (If you also want a synth fallback, add one in
   `ProtoAudio._build_all`; without one the sound simply requires its file.)

## Looping sounds (engine, fire)

Ask for a "seamless loop, no fade in or out" in the prompt AND list the id in
`ProtoAudio.LOOPED` so the MP3 loops at runtime. MP3 loop points aren't sample-
perfect; if a loop clicks, regenerate with a steadier prompt (constant rpm, no
swells) — steady textures loop clean at this fidelity.

## For AI agents

Everything above applies — the manifest is plain JSON, the CLI is deterministic
about what it touches, and `audio_sim` proves the load path. A safe agent loop:
edit one prompt → `generate.mjs <id> --force` → import pass → run
`res://proto3d/tests/audio_sim.tscn` (must stay green) → report.
