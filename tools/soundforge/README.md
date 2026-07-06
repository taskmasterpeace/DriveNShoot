# SoundForge — the game's sound department

Every sound effect in the DIVIDED STATES is generated from a **text prompt** via the
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

## Voices (TTS)

Character dialogue is generated the same way SFX are — from one manifest,
**`voices.json`**, via the ElevenLabs text-to-speech API (`voices.mjs`). Each
character owns a stock **voice_id**, and every line they ever speak is rendered
with it, so Mercy always sounds like Mercy.

```
tools/soundforge/
  voices.json   ← per character: voice_id + voice_name + lines {id: text}
  voices.mjs    ← calls ElevenLabs TTS, writes game/assets/sfx/vo_<char>_<line>.mp3
```

Output lands in the same `game/assets/sfx/` dir, so ProtoAudio auto-loads each
line as a normal stream id: `vo_mercy_greet` plays via
`audio.play_at("vo_mercy_greet", pos)`. No engine changes needed per line.

### THE ONE RULE

**Never change a character's `voice_id`.** The whole point is voice consistency
— one character, one voice, forever. Re-word lines freely, add lines freely,
but if you swap the voice you must regenerate EVERY line that character has
(`voices.mjs <char> --force`) and you've still broken continuity with anything
already shipped. New characters get a NEW, unused stock voice (list them with
`GET https://api.elevenlabs.io/v1/voices`, xi-api-key header).

### Adding a line

1. Add `"line_id": "The words."` under the character's `lines` in `voices.json`.
2. `node tools/soundforge/voices.mjs <char>_<line_id>` (character name alone
   does all of that character's missing lines; `--force` re-rolls a take).
3. Import pass so Godot sees it: `<godot-console> --headless --path game --import`
4. Play it from code: `audio.play_at("vo_<char>_<line_id>", npc_pos)`.
   `audio_sim` must stay green (it checks files == streams).

### Wiring (where the starter lines belong)

Play the `vo_*` id **at the speaker's position** in the same spot the text
toast fires, so voice and subtitle land together:

- `npc.gd` `interact()` — greet/refuse toasts → `vo_<archetype>_greet` /
  `vo_<archetype>_refuse`; the TRUSTED tier greeting → `vo_mercy_trusted`;
  Sam's hire pitch is his greet → `vo_sam_hire`.
- `proto3d.gd` bounty payout ("Clean work…") → `vo_bridger_clean`.
- `companion.gd` combat bark ("Contact! On me!") → `vo_sam_contact`; and
  `board()` when he takes the passenger seat → `vo_sam_wheel`.
- `events.gd` nightly roll → `vo_radio_blood_moon` / `vo_radio_war` (radio
  lines are non-positional — play at the player/camera, or through the same
  path the radio uses).

## For AI agents

Everything above applies — the manifest is plain JSON, the CLI is deterministic
about what it touches, and `audio_sim` proves the load path. A safe agent loop:
edit one prompt → `generate.mjs <id> --force` → import pass → run
`res://proto3d/tests/audio_sim.tscn` (must stay green) → report.
