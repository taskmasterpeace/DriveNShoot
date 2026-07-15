# DRIVN: GAME DECK Companion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce and verify a distributable single-player Windows companion app, `build/DRIVN-Game-Deck.exe`, that presents all twenty-two canonical Game Deck cartridges through a polished DRIVN-branded shelf, box-inspection, insertion/ejection, play, score, and save journey.

**Architecture:** A feature-tagged boot router selects either normal DRIVN or a dedicated companion root inside the same Godot project. The companion composes small shelf, inspector, cartridge-transition, save-store, and promotion components around the existing `ProtoGameDeck`, registry, ledger, cartridge scenes, semantic input router, covers, help, controls, and license surfaces.

**Tech Stack:** Godot 4.5.1, GDScript 2.0 with static typing, JSON data rows, generated WebP key art with deterministic title composition, Windows Desktop export with embedded PCK, headless sims plus Compatibility GPU inspection.

## Global Constraints

- `res://` is `game/`; never use `res://game/`.
- Godot executable: `C:/Users/taskm/Downloads/projects/Godot/Godot_v4.5.1-stable_win64.exe`; console build uses the sibling `_console.exe`.
- Product title is `DRIVN: GAME DECK`; subtitle is `A DRIVN COMPANION`; artifact is `build/DRIVN-Game-Deck.exe`.
- All twenty-two catalog games are transiently unlocked; DRIVN ownership and save data are never read or modified.
- Companion is single-player: one human; console rows with `ai: true` fill to catalog `players.max` with stock AI; no lobby, host, join, invitation, spectator, or second-human UI.
- Canonical cartridge code, covers, controls, data, source notices, help, About, score rules, and aspect ratios remain shared with DRIVN.
- Cover and gameplay art uses keep-aspect presentation. 1:1, 9:16, and 16:9 output is never stretched or cropped.
- Cartridge changing is a deterministic shared UI transition, not a prerendered video and not twenty-two bespoke paths.
- The shelf has twenty-two game cards plus one non-cartridge DRIVN promotional card; the promo never enters registry, ledger, score, or installed counts.
- Companion data lives only at `user://game_deck_companion_save.json`; corrupt data is renamed `.bad` and replaced.
- Purple is forbidden. UI uses carbon, bone, amber, rust, signal teal, and restrained emergency red.
- Required original promo art contains no generated text, real platform mark, borrowed game art, watermark, or trademark; exact copy is composed deterministically.
- Every feature begins with a failing focused sim, passes it, retains affected Game Deck regressions, and lands in a focused commit without co-author lines.
- New `class_name` scripts require a Godot `--headless --path game --import` before headless runs.

## File map

- Create `game/data/game_deck_companion.json`: product/release/promo copy and optional URL.
- Create `game/proto3d/games/companion/companion_save.gd`: isolated schema-versioned atomic persistence.
- Create `game/proto3d/games/companion/companion_theme.gd`: shared no-purple style factories.
- Create `game/proto3d/games/companion/companion_shelf.gd`: filters, 22 cover cards, promo card, focus restoration.
- Create `game/proto3d/games/companion/companion_inspector.gd`: large box art, facts, live controls, Insert/Back.
- Create `game/proto3d/games/companion/companion_transition.gd`: shared insert/eject state machine and reduced-motion path.
- Create `game/proto3d/games/companion/game_deck_companion.gd` and `.tscn`: app orchestration, branded boot, deck/shell integration, save policy, quit.
- Create `game/proto3d/boot/boot_router.gd` and `.tscn`: feature-tag route selection.
- Modify `game/proto3d/games/game_shell.gd`: explicit companion play-shell mode and change/quit signals without changing DRIVN defaults.
- Modify `game/project.godot`: boot router as exported main scene.
- Modify `game/export_presets.cfg`: companion release preset.
- Create `BUILD_GAME_DECK.bat`: import, test, export, artifact, and smoke gates.
- Create `game/assets/game_deck/companion_drivn_key_art.webp`: original DRIVN promo art.
- Create `game/assets/game_deck/companion_drivn_promo.webp`: deterministic titled promo card.
- Create `tools/game_deck/build_companion_promo.py`: exact lettering/promo compositor and validation.
- Create focused sims: `game_companion_data_sim`, `game_companion_save_sim`, `game_companion_shelf_sim`, `game_companion_inspector_sim`, `game_companion_transition_sim`, `game_companion_flow_sim`, `game_companion_boot_sim`, and `game_companion_export_sim` (`.gd/.tscn` pairs).
- Create `docs/verification/GAME_DECK_COMPANION.md`: final commands, results, renders, executable size/hash, and launch proof.

---

### Task 1: Release data and isolated save store

**Files:**
- Create: `game/data/game_deck_companion.json`
- Create: `game/proto3d/games/companion/companion_save.gd`
- Create: `game/proto3d/tests/game_companion_data_sim.gd`
- Create: `game/proto3d/tests/game_companion_data_sim.tscn`
- Create: `game/proto3d/tests/game_companion_save_sim.gd`
- Create: `game/proto3d/tests/game_companion_save_sim.tscn`

**Interfaces:**
- Consumes: `ProtoGameRegistry`, `ProtoScoreLedger.serialize()/restore()`.
- Produces: `ProtoCompanionSave.load_into(ledger) -> Dictionary`, `save_from(ledger, ui_state) -> Error`, `recover_corrupt() -> bool`; release data with `product_title`, `subtitle`, `version`, `promo`, and `full_game_url`.

- [ ] Write `game_companion_data_sim` first. It must fail until release data exists and prove exact title/subtitle, non-empty promo headline/body/features/art path, optional URL type, version, and exactly twenty-two registry IDs with ten handheld/twelve console.

- [ ] Run the data sim; expect exit 1 with `release row exists` failing.

- [ ] Add this complete release row:

```json
{
  "schema": 1,
  "product_title": "DRIVN: GAME DECK",
  "subtitle": "A DRIVN COMPANION",
  "version": "0.14.0",
  "promo": {
    "headline": "DRIVN // THE FULL WASTELAND",
    "strap": "GAME DECK LIVES INSIDE THIS WORLD",
    "body": "This arcade is one room in a much bigger world: top-down vehicular combat and road survival across the Divided States of America.",
    "features": ["ROAD SURVIVAL", "ARMED VEHICLES", "CREW + DOGS", "SAFEHOUSES", "MEDIA + GAME DECK"],
    "status": "FULL GAME IN DEVELOPMENT",
    "art_path": "res://assets/game_deck/companion_drivn_promo.webp"
  },
  "full_game_url": ""
}
```

- [ ] Write `game_companion_save_sim` first. Use a temporary absolute path injected into the store; assert a submitted WASTE HEAP result, `last_game_id`, filter, volume, fullscreen, reduced motion, and `seen_insert` round-trip; a separate DRIVN fixture file remains byte-identical; malformed JSON is renamed `.bad`; all registry IDs remain unlocked after restore.

- [ ] Run the save sim; expect exit 1 because `ProtoCompanionSave` is missing.

- [ ] Implement a typed store with this persisted envelope and atomic temp replacement:

```gdscript
class_name ProtoCompanionSave
extends RefCounted

const SCHEMA := 1
const DEFAULT_PATH := "user://game_deck_companion_save.json"
var path := DEFAULT_PATH

func payload(ledger: ProtoScoreLedger, ui_state: Dictionary) -> Dictionary:
    return {"schema": SCHEMA, "ledger": ledger.serialize(),
        "ui": {"last_game_id": String(ui_state.get("last_game_id", "waste_heap")),
        "filter": String(ui_state.get("filter", "all")),
        "volume": clampf(float(ui_state.get("volume", 1.0)), 0.0, 1.0),
        "fullscreen": bool(ui_state.get("fullscreen", false)),
        "reduced_motion": bool(ui_state.get("reduced_motion", false)),
        "seen_insert": bool(ui_state.get("seen_insert", false))}}
```

`load_into()` validates dictionary/schema/ledger/ui types, calls `ledger.restore`, then unlocks every `ledger.registry.order` ID transiently. `save_from()` writes UTF-8 JSON to `<path>.tmp`, flushes/closes, removes only the prior exact target, and renames the temp file. Parse/type failure renames the exact corrupt target to `<path>.bad.<unix_time>` and returns defaults.

- [ ] Run both sims; expect all checks passed. Run `game_ledger_sim` and `game_save_sim` to prove shared ledger/main-save behavior remains green.

- [ ] Commit: `feat: add isolated Game Deck companion data`.

---

### Task 2: Shared companion theme and art-first shelf

**Files:**
- Create: `game/proto3d/games/companion/companion_theme.gd`
- Create: `game/proto3d/games/companion/companion_shelf.gd`
- Modify: `game/proto3d/games/game_cover_card.gd`
- Create: `game/proto3d/tests/game_companion_shelf_sim.gd`
- Create: `game/proto3d/tests/game_companion_shelf_sim.tscn`

**Interfaces:**
- Consumes: registry order, release promo, `ProtoGameCoverCard.create(row, available, owned, presentation)`, cover textures.
- Produces: signals `game_selected(game_id: String)`, `promo_selected()`, `quit_requested()`; methods `configure(registry, release_row)`, `set_filter(filter_id)`, `restore_focus(game_id)`, `snapshot_ui()`.

- [ ] Write the shelf sim first. Assert card order is registry order followed by `PromoCard_DRIVN`, counts are 23/10/12 by filter, all games enabled/unlocked in companion presentation, every cover uses keep-aspect, promo is absent from registry/ledger, keyboard focus reaches all cards, and `restore_focus("black_grid")` focuses BLACK GRID.

- [ ] Run the shelf sim; expect missing `companion_shelf.gd` failure.

- [ ] Extend `ProtoGameCoverCard.create` with a defaulted fourth parameter so existing callers remain source-compatible:

```gdscript
static func create(row: Dictionary, available: bool, owned: bool,
        presentation: Dictionary = {}) -> Button:
    var card: Button = (load("res://proto3d/games/game_cover_card.gd") as GDScript).new()
    card._setup(row, available, owned, presentation)
    return card
```

When `presentation.companion == true`, hide PWR/NET marketing, display `SINGLE
PLAYER` and `AI OPPONENTS` from the row, preserve semantic accessibility text,
and expose `cover_texture_rect` unchanged. Existing DRIVN calls produce the
current card exactly.

- [ ] Implement `ProtoCompanionTheme` factories for panel/button/badge/focus styles using only `11100d`, `242019`, `e8dfcf`, `f2b735`, `5f756e`, `c87832`, and `c94f3d`; use 10-pixel radii, focus borders at least 3 pixels, hover shadow, and 0.2-second transitions.

- [ ] Implement the responsive shelf: branded header, All/Handheld/Console pills, scrollable four-column grid at 1280+, two columns below 1000, 22 shared cover cards, one custom promo card with the configured art, and footer actions. Preserve exact cover ratios with `STRETCH_KEEP_ASPECT_CENTERED`.

- [ ] Run shelf sim plus `game_cover_sim` and `game_shell_sim`; expect all green.

- [ ] Commit: `feat: add Game Deck companion cartridge shelf`.

---

### Task 3: Box-art inspector and DRIVN promotion surface

**Files:**
- Create: `game/proto3d/games/companion/companion_inspector.gd`
- Create: `game/proto3d/tests/game_companion_inspector_sim.gd`
- Create: `game/proto3d/tests/game_companion_inspector_sim.tscn`

**Interfaces:**
- Consumes: game row, release row, `ProtoArcadeInputRouter.help_labels(profile)`.
- Produces: signals `insert_requested(game_id)`, `back_requested()`, `follow_requested(url)`; methods `show_game(row, controls)`, `show_promo(release_row)`, `snapshot_ui()`.

- [ ] Write the inspector sim first. For WASTE HEAP, BUNKER BREAKER, LAST MILE, and CROWN OF ASH prove exact cover, title, help, lore, platform, aspect, score direction, single-player/AI badges, and live keyboard/pad controls; prove keep-aspect for 1:1, 9:16, 16:9, and 2:3 art; Insert emits the correct ID only after inspection.

- [ ] Add promo assertions: headline/strap/body/features/status visible, no Insert button, no registry ID, missing URL hides Follow entirely, configured HTTPS URL emits only that URL.

- [ ] Run the sim; expect missing inspector failure.

- [ ] Implement inspector with a 38% art rail and 62% information rail at desktop width, stacking vertically below 900 pixels. Use one scroll container for copy/controls, `INSERT CARTRIDGE` primary, `BACK TO SHELF` secondary, and exact runtime labels. Promo mode replaces game facts/actions with configured DRIVN copy and optional Follow.

- [ ] Run inspector, input, and cover sims; expect all green.

- [ ] Commit: `feat: add cartridge inspection and DRIVN promotion`.

---

### Task 4: Cartridge insertion/ejection transition

**Files:**
- Create: `game/proto3d/games/companion/companion_transition.gd`
- Create: `game/proto3d/tests/game_companion_transition_sim.gd`
- Create: `game/proto3d/tests/game_companion_transition_sim.tscn`

**Interfaces:**
- Consumes: selected cover texture, aspect/device family, reduced-motion flag.
- Produces: signals `insert_contact()`, `insert_finished()`, `eject_finished()`; methods `insert(row, texture, reduced_motion)`, `eject(reduced_motion)`, `skip_after_contact()`; enum state `IDLE/PACKAGE/CARTRIDGE/SLOT/CONTACT/SCREEN/EJECT`.

- [ ] Write the transition sim first using manual `_advance(delta)` so it is deterministic without wall-clock tweens. Assert ordered state sequence, contact emitted exactly once at 0.62 seconds, finish by 1.15 seconds, skip before contact does nothing, skip after contact reaches screen safely, eject reverses to idle, and reduced motion emits contact/finish through two 0.1-second fades.

- [ ] Run the transition sim; expect missing transition failure.

- [ ] Implement one component with a cover package `TextureRect`, masked cartridge label using the same texture, slot panels, four contact lights, and powered-screen overlay. Drive transforms/alpha/light index from elapsed state time in `_process` and expose `_advance` for tests. Do not launch the cartridge until `insert_contact`.

- [ ] Run the focused sim and inspect one temporary GPU transition frame sequence for a square label and console box.

- [ ] Commit: `feat: add physical Game Deck cartridge transition`.

---

### Task 5: Companion application flow and shared play shell

**Files:**
- Create: `game/proto3d/games/companion/game_deck_companion.gd`
- Create: `game/proto3d/games/companion/game_deck_companion.tscn`
- Modify: `game/proto3d/games/game_shell.gd`
- Create: `game/proto3d/tests/game_companion_flow_sim.gd`
- Create: `game/proto3d/tests/game_companion_flow_sim.tscn`

**Interfaces:**
- Consumes: Tasks 1-4, `ProtoGameDeck`, `ProtoGameShell`.
- Produces: app states `BOOT/SHELF/INSPECT/INSERT/PLAY/EJECT/PROMO/QUIT`; `open_shelf`, `inspect_game`, `insert_game`, `change_cartridge`, `restart_game`, `request_quit`, `save_now`.

- [ ] Write the flow sim first. Drive real button signals and real deck methods. Prove skippable 2.2-second branded boot; all-unlocked shelf; selection-before-launch; insert contact launches; handheld context uses one human/no bots; each console context uses one human, `bots_enabled=true`, `actor_count=players.max`; all twenty-two launch; shell screen texture is the deck texture; Change stops/saves/ejects/restores focus; Restart changes seed; Quit follows stop/save; promo never launches; DRIVN save fixture remains unchanged.

- [ ] Add explicit assertions that no lobby, Host, Join, invitation, spectator, second-seat, PWR, or NET action/copy is reachable in companion state.

- [ ] Run the flow sim; expect missing root scene failure.

- [ ] Add companion mode to `ProtoGameShell` without changing defaults:

```gdscript
signal companion_change_requested
signal companion_quit_requested
var companion_mode := false

func set_companion_mode(enabled: bool) -> void:
    companion_mode = enabled
    _power_button.text = "CHANGE CARTRIDGE" if enabled else "■ POWER"
    _close_button.text = "QUIT" if enabled else "✕"
```

In companion mode, Power emits change and Close emits quit. Library/Match tabs
are hidden, Help/Controls/About/Scores remain, status reads `A DRIVN COMPANION`,
and `open_game` still owns real deck launch/start. DRIVN mode retains current
power/close/library/lobby behavior byte-for-byte at the observable surface.

- [ ] Implement the app root: load release data; create deck and transient unlocks; load companion save; build shelf/inspector/transition/shell; route signals; generate one random stock seed per launch/restart; persist result signal and UI settings; handle window close notification through orderly quit.

- [ ] Run flow, shell, catalog, handheld catalog, console catalog, bot-fill, input, save, and license sims; expect all green.

- [ ] Commit: `feat: build standalone Game Deck companion flow`.

---

### Task 6: Original DRIVN promotional artwork

**Files:**
- Create: `game/assets/game_deck/companion_drivn_key_art.webp`
- Create: `game/assets/game_deck/companion_drivn_promo.webp`
- Create: `tools/game_deck/build_companion_promo.py`
- Modify: `game/proto3d/tests/game_companion_data_sim.gd`

**Interfaces:**
- Consumes: approved art brief, release row, existing Russo One font and palette law.
- Produces: text-free original 3:2 key art and exact titled 2:3 promotional card.

- [ ] Generate text-free original key art with the image-generation skill: top-down armed road machine crossing the Divided States at dusk, distant safehouse and drive-in glow, small handheld/console light inside the vehicle, screen-printed pulp science-fiction energy, amber/rust/teal/bone/black, no purple, words, numbers, logos, platform marks, copyrighted characters, watermark, or signature.

- [ ] Inspect the generated original at full resolution for prompt fit, vehicle/readability, accidental text/logo/watermark, copied marks, and forbidden purple; regenerate until accepted.

- [ ] Write the deterministic Pillow compositor first with a `--check` mode. It must center-crop to 1024 x 1536, add `DRIVN`, `THE FULL WASTELAND`, and `GAME DECK LIVES INSIDE THIS WORLD` using the checked-in font, preserve dominant subject, add restrained print wear, convert forbidden purple to signal teal, and fail if title/pixel dimensions/purple checks fail.

- [ ] Run compositor, inspect the final at full size and 180-pixel thumbnail, then extend data sim to load it as `Texture2D` and prove 2:3 dimensions.

- [ ] Commit: `art: add DRIVN companion promotion`.

---

### Task 7: Feature-tagged boot routing

**Files:**
- Create: `game/proto3d/boot/boot_router.gd`
- Create: `game/proto3d/boot/boot_router.tscn`
- Modify: `game/project.godot`
- Create: `game/proto3d/tests/game_companion_boot_sim.gd`
- Create: `game/proto3d/tests/game_companion_boot_sim.tscn`

**Interfaces:**
- Consumes: feature list or `OS.has_feature("game_deck_companion")`.
- Produces: pure `route_for_features(features: Array[String]) -> String`, runtime deferred scene change.

- [ ] Write boot sim first. Assert empty/windows/editor features route to `res://proto3d/proto3d.tscn`, exact companion feature routes to the companion scene, mixed features still select companion, both target scenes exist, and the normal DRIVN scene remains the `PLAY.bat` explicit path.

- [ ] Run boot sim; expect missing router failure.

- [ ] Implement pure routing and deferred change:

```gdscript
static func route_for_features(features: Array[String]) -> String:
    return "res://proto3d/games/companion/game_deck_companion.tscn" \
        if features.has("game_deck_companion") else "res://proto3d/proto3d.tscn"
```

At runtime assemble only the relevant feature flag, set `run/main_scene` to the
boot scene, and leave `PLAY.bat` unchanged.

- [ ] Run import, boot sim, direct companion headless smoke, direct proto3d headless smoke, and normal `game_catalog_sim`.

- [ ] Commit: `feat: route Game Deck companion exports`.

---

### Task 8: Windows export and one-click release build

**Files:**
- Modify: `game/export_presets.cfg`
- Create: `BUILD_GAME_DECK.bat`
- Create: `game/proto3d/tests/game_companion_export_sim.gd`
- Create: `game/proto3d/tests/game_companion_export_sim.tscn`

**Interfaces:**
- Consumes: boot feature, all required runtime resources/notices.
- Produces: preset `Windows Game Deck Companion`, embedded `build/DRIVN-Game-Deck.exe`, automated source/export smoke switches.

- [ ] Write export sim first. Parse `export_presets.cfg` as text and assert preset name, `custom_features="game_deck_companion"`, exact output, embedded PCK, x86_64, product/file description/company/version, no public console wrapper, and explicit inclusion of JSON/notices/covers/fonts/dynamic cartridge scenes.

- [ ] Run export sim; expect missing preset failure.

- [ ] Add the companion preset using the installed Windows release template and a separate product icon. Start with all resources for correctness; record size after export. Do not trim until an exported executable launches all twenty-two dynamically loaded rows in the smoke harness.

- [ ] Implement `BUILD_GAME_DECK.bat` using the established `BUILD.bat` template: verify Godot/templates, import, run the eight companion sims plus catalog/cover/input/license, delete only the exact prior companion exe, export release, verify file exists and exceeds 20 MB, run `DRIVN-Game-Deck.exe --companion-smoke`, require exit 0, print size and SHA-256.

- [ ] Run export sim and `BUILD_GAME_DECK.bat`; expect one embedded executable and smoke success.

- [ ] Commit: `build: export DRIVN Game Deck companion`.

---

### Task 9: GPU journey inspection and complete regression evidence

**Files:**
- Create: `game/proto3d/tools/render_game_companion.gd`
- Create: `game/proto3d/tools/render_game_companion.tscn`
- Create: `docs/verification/GAME_DECK_COMPANION.md`

**Interfaces:**
- Consumes: final source app and exported executable.
- Produces: ten required GPU frames, full test evidence, executable size/hash, independent launch proof.

- [ ] Implement a deterministic Compatibility-renderer visual harness that drives real shelf buttons and companion transitions and writes the ten spec-required frames under `docs/verification/game_deck_companion/`: boot, full shelf, square/portrait/console inspection, three insertion beats, three gameplay aspects, eject/restored focus, promo, and reduced-motion proof. Where this exceeds ten files, retain every uniquely required proof rather than collapsing evidence.

- [ ] Run non-headless at 1920 x 1080. Inspect every frame for exact covers/titles, DRIVN branding, no purple, no clipping/stretching, meaningful focus, readable controls/copy, physical cartridge continuity, and correct aspect bezels. Fix source defects and repeat until accepted.

- [ ] Run all eight companion sims plus the affected existing registry, catalog, shell, cover, input, handheld catalog, console catalog, bot fill, ledger, save, lobby policy, license, clean-room, RUST RUNNERS, BLACK GRID, shooter controls, and shooter kernel sims serially. Require exit 0 and each suite's own zero-failure verdict.

- [ ] Rebuild the release artifact after final fixes. Launch the exported executable outside the editor; automated smoke opens shelf, starts WASTE HEAP, ejects, starts AI-filled RUST RUNNERS, ejects, validates the companion save, and quits. Launch normal `PLAY.bat` and verify it still opens DRIVN.

- [ ] Write verification with exact commands, pass totals, GPU frame paths, executable size/SHA-256, independent-launch result, all-22 count, AI evidence, save isolation evidence, and any expected engine teardown lines. Do not claim unrun evidence.

- [ ] Run final audit:

```powershell
$base = git merge-base origin/main HEAD
git diff --check "$base..HEAD"
git status --short
git log --oneline --decorate origin/main..HEAD
Get-FileHash build/DRIVN-Game-Deck.exe -Algorithm SHA256
```

- [ ] Commit: `docs: verify DRIVN Game Deck companion`.

## Completion audit

Before claiming completion, map every design requirement to direct evidence:

- executable existence/independent launch/branding -> exported artifact and smoke log;
- 22 covers/inspect/insert/eject/play -> focused sims plus GPU journey;
- single-player/AI/no multiplayer -> flow snapshot and all console launches;
- DRIVN promo/art/no dead URL -> data/inspector sims and visual frame;
- aspect ratios -> cover/catalog sims and 1:1/9:16/16:9 frames;
- isolated/corrupt-safe persistence -> companion save sim and filesystem evidence;
- normal DRIVN preservation -> boot/direct-launch regressions;
- legal/provenance -> license/clean-room/export gates;
- no corners cut -> all focused, affected regression, GPU, exported-build, hash, and clean-worktree gates green.
