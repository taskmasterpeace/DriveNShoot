# Game Deck Cover Library Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce, integrate, display, and verify original cover art for all twenty-two Game Deck cartridges.

**Architecture:** Each catalog row points to one final WebP cover. Twenty-two separately generated text-free illustrations are passed through one deterministic Python/Pillow compositor that adds exact packaging typography and system rails. A focused `ProtoGameCoverCard` renders the assets in the existing shell while the registry, deck, lobby, and cartridge lifecycles remain unchanged.

**Tech Stack:** Godot 4.5.1, GDScript 2.0, JSON catalog rows, Python 3 + Pillow 12.2, built-in image generation, WebP, SIL OFL Russo One font.

## Global Constraints

- `res://` is `game/`; never use `res://game/`.
- Work only in `D:/git/carworld/.worktrees/game-deck-build` on `codex/game-deck-build`.
- Exactly ten handheld and twelve console games receive covers.
- Console box fronts are 1024 x 1536 (2:3).
- Handheld labels are 1024 x 1024 (1:1), 864 x 1536 (9:16), or 1536 x 864 (16:9), matching each row.
- No purple, real console marks, upstream game art, copied maps, watermarks, or generated lettering.
- Generated key art is text-free; deterministic composition adds exact titles and badges.
- Every runtime behavior change follows red-green TDD and leaves a sim.
- All cards remain keyboard, mouse, and controller focusable.
- Console selection still opens MATCH; handheld selection still opens PLAY.
- Commit each independently green feature without `Co-Authored-By` lines.

---

### Task 1: Define the failing cover contract

**Files:**
- Create: `game/proto3d/tests/game_cover_sim.gd`
- Create: `game/proto3d/tests/game_cover_sim.tscn`

**Interfaces:**
- Consumes: `ProtoGameRegistry.load_catalog()`, `row.cover_path`, `Image.load_from_file()`.
- Produces: a focused sim that validates catalog coverage, uniqueness, loadability, dimensions, and packaging ratios.

- [ ] **Step 1: Create the scene harness**

```ini
[gd_scene load_steps=2 format=3]

[ext_resource type="Script" path="res://proto3d/tests/game_cover_sim.gd" id="1"]

[node name="GameCoverSim" type="Node"]
script = ExtResource("1")
```

- [ ] **Step 2: Write the asset-first failing assertions**

Create a watchdog-equipped Godot sim using the repository's `_check(label, ok)` pattern. Iterate `registry.order`, collect `cover_path`, load each with `Image.load_from_file(ProjectSettings.globalize_path(path))`, and assert:

```gdscript
const EXPECTED_SIZE := {
    "console": Vector2i(1024, 1536),
    "1:1": Vector2i(1024, 1024),
    "9:16": Vector2i(864, 1536),
    "16:9": Vector2i(1536, 864),
}

_check("all twenty-two rows declare unique cover paths",
    rows.size() == 22 and paths.size() == 22)
_check("all declared cover files load", all_loaded)
_check("all console boxes are 2:3", console_dimensions_ok)
_check("all handheld labels match their screen aspect", handheld_dimensions_ok)
```

Use `row.platform` to select console dimensions; use `row.aspect` only for handheld dimensions. Print `GAME_COVER RESULTS` and exit nonzero on failure.

- [ ] **Step 3: Run RED and confirm the reason**

Run:

```powershell
& 'C:/Users/taskm/Downloads/projects/Godot/Godot_v4.5.1-stable_win64_console.exe' --headless --path game res://proto3d/tests/game_cover_sim.tscn
```

Expected: FAIL because current rows have no `cover_path`; no parse or harness error.

---

### Task 2: Build the deterministic cover production tool

**Files:**
- Create: `tools/game_deck/cover_manifest.json`
- Create: `tools/game_deck/build_covers.py`
- Create: `game/assets/fonts/game_deck/RussoOne-Regular.ttf`
- Create: `game/assets/fonts/game_deck/OFL.txt`

**Interfaces:**
- Consumes: one generated PNG per game at `--key-art-dir/<game_id>.png` and the 22-row manifest.
- Produces: `game/assets/game_covers/<game_id>.webp` plus `docs/verification/GAME_DECK_COVERS_CONTACT_SHEET.webp`.

- [ ] **Step 1: Add the exact 22-row production manifest**

Each row contains:

```json
{
  "id": "waste_heap",
  "title": "WASTE HEAP",
  "platform": "handheld",
  "aspect": "1:1",
  "players": "1 PLAYER",
  "network": "CHALLENGE",
  "size": [1024, 1024],
  "accent": "#D28A32"
}
```

Use catalog order. Console rows use `[1024, 1536]`; handheld rows use the three exact size laws. Capability text derives from `games.json`, not artistic judgment.

- [ ] **Step 2: Add and license the compositor font**

Download the official Google Fonts Russo One binary and OFL notice:

```powershell
Invoke-WebRequest 'https://raw.githubusercontent.com/google/fonts/main/ofl/russoone/RussoOne-Regular.ttf' -OutFile 'game/assets/fonts/game_deck/RussoOne-Regular.ttf'
Invoke-WebRequest 'https://raw.githubusercontent.com/google/fonts/main/ofl/russoone/OFL.txt' -OutFile 'game/assets/fonts/game_deck/OFL.txt'
```

Verify both files are non-empty and the notice states `SIL OPEN FONT LICENSE Version 1.1`.

- [ ] **Step 3: Implement deterministic composition**

`build_covers.py` must:

```python
def cover_box(source: Image.Image, size: tuple[int, int]) -> Image.Image:
    scale = max(size[0] / source.width, size[1] / source.height)
    resized = source.resize((round(source.width * scale), round(source.height * scale)), Image.Resampling.LANCZOS)
    left = (resized.width - size[0]) // 2
    top = (resized.height - size[1]) // 2
    return resized.crop((left, top, left + size[0], top + size[1])).convert("RGB")
```

Add a 4% ink rail, 15% protected title band, 1.2% double border, exact family label, exact title, aspect badge, and capability line. Use a SHA-256-derived seed per ID for sparse dust and edge-rub marks so rebuilds are byte-stable. No random global state is allowed.

Save with:

```python
canvas.save(output_path, "WEBP", quality=94, method=6)
```

The tool validates manifest count, IDs, duplicate output paths, source existence, output dimensions, and forbidden magenta-like pixels where hue is 270-320 degrees with saturation above 0.35. It exits nonzero with the game ID on any failure.

- [ ] **Step 4: Implement the contact sheet**

Build separate labeled handheld and console sections on an ink background. Fit each final without distortion, add the exact title below it, and save `docs/verification/GAME_DECK_COVERS_CONTACT_SHEET.webp` at no more than 3840 pixels wide.

- [ ] **Step 5: Verify the tool against one temporary synthetic input**

Create the temporary input with Pillow in the OS temp directory, run the tool in `--only waste_heap` mode, inspect output dimensions, then delete the synthetic output before generation. Expected: one 1024 x 1024 WebP and exit 0.

---

### Task 3: Generate and package all twenty-two covers

**Files:**
- Create: `game/assets/game_covers/waste_heap.webp`
- Create: `game/assets/game_covers/radworm.webp`
- Create: `game/assets/game_covers/dead_ground.webp`
- Create: `game/assets/game_covers/pack_rat.webp`
- Create: `game/assets/game_covers/bunker_breaker.webp`
- Create: `game/assets/game_covers/last_mile.webp`
- Create: `game/assets/game_covers/iron_dome.webp`
- Create: `game/assets/game_covers/fall_line.webp`
- Create: `game/assets/game_covers/tilt_salvage.webp`
- Create: `game/assets/game_covers/relay_bloom.webp`
- Create: `game/assets/game_covers/crown_of_ash.webp`
- Create: `game/assets/game_covers/dial_tanks.webp`
- Create: `game/assets/game_covers/red_sky.webp`
- Create: `game/assets/game_covers/black_orbit.webp`
- Create: `game/assets/game_covers/gridbreach.webp`
- Create: `game/assets/game_covers/rustball.webp`
- Create: `game/assets/game_covers/fuel_run.webp`
- Create: `game/assets/game_covers/skyjoust.webp`
- Create: `game/assets/game_covers/fight_night_99.webp`
- Create: `game/assets/game_covers/ashland_command.webp`
- Create: `game/assets/game_covers/rust_runners.webp`
- Create: `game/assets/game_covers/black_grid.webp`
- Create: `docs/verification/GAME_DECK_COVERS_CONTACT_SHEET.webp`

**Interfaces:**
- Consumes: the approved art briefs in `docs/superpowers/specs/2026-07-13-game-deck-cover-library-design.md`.
- Produces: twenty-two original runtime-ready final covers and one complete review sheet.

- [ ] **Step 1: Generate each key art as a distinct built-in image-generation call**

Use this shared prompt scaffold, replacing the bracketed values with the exact approved row brief:

```text
Use case: stylized-concept
Asset type: text-free key art for an original fictional post-apocalyptic video-game cartridge cover
Primary request: [approved dominant image]
Style/medium: original screen-printed pulp science-fiction illustration, bold readable silhouettes, halftone ink texture, late-1980s to late-1990s game-box energy without imitating any named artist
Composition/framing: [square / tall portrait / wide landscape / portrait box], one dominant silhouette, one secondary gameplay cue, center-safe subject, clear top and bottom negative space for later packaging typography
Color palette: [approved palette]
Constraints: original DRIVN designs; no real brands; no upstream characters, maps, uniforms, insignia, or package layouts; no purple
Avoid: all text, letters, numbers, logos, UI, borders, title bands, signatures, watermarks, duplicated limbs, malformed machinery
```

Issue one call per game, never one multi-title image. Copy the resulting file to an OS-temp key-art directory with the exact `<game_id>.png` name.

- [ ] **Step 2: Inspect every raw key art**

Use local image inspection at original detail. Reject and regenerate only the affected game if it contains accidental text, a watermark, purple, a copied mark, broken anatomy/machinery, a clipped dominant subject, or weak thumbnail silhouette.

- [ ] **Step 3: Build final covers and contact sheet**

Run:

```powershell
& 'C:/Users/taskm/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe' tools/game_deck/build_covers.py --key-art-dir '<OS temp key art dir>' --output-dir game/assets/game_covers --contact-sheet docs/verification/GAME_DECK_COVERS_CONTACT_SHEET.webp
```

Expected: `22 covers built`, `0 validation failures`, contact sheet written.

- [ ] **Step 4: Inspect every final and the contact sheet**

Confirm all exact titles, family rails, aspects, subject legibility, no purple, no trademarks, no distortion, and visibly coherent product-family treatment.

- [ ] **Step 5: Remove temporary key art**

Delete only the explicitly named OS-temp key-art directory after all twenty-two finals pass. Do not delete anything under the repository except rejected/generated intermediates created by this task.

---

### Task 4: Wire covers into the catalog and turn RED green

**Files:**
- Modify: `game/data/games.json`
- Modify: `game/proto3d/games/game_registry.gd`
- Modify: `game/proto3d/tests/game_cover_sim.gd`

**Interfaces:**
- Consumes: final `res://assets/game_covers/<id>.webp` files.
- Produces: validated `cover_path` rows and registry warnings for missing/invalid paths without a boot crash.

- [ ] **Step 1: Add one unique cover path to every row**

Use the exact form:

```json
"cover_path": "res://assets/game_covers/waste_heap.webp"
```

- [ ] **Step 2: Add non-fatal registry validation**

After the ordinary row has passed `_game_error`, call:

```gdscript
func cover_error(row: Dictionary) -> String:
    var path := String(row.get("cover_path", ""))
    if path == "":
        return "game '%s' lacks cover_path" % String(row.get("id", ""))
    if not FileAccess.file_exists(path):
        return "game '%s' cover is missing: %s" % [String(row.get("id", "")), path]
    return ""
```

Record the message in `load_warnings` but retain the game row so missing art cannot block DRIVN. The focused sim remains the shipping gate.

- [ ] **Step 3: Import assets**

Run:

```powershell
& 'C:/Users/taskm/Downloads/projects/Godot/Godot_v4.5.1-stable_win64_console.exe' --headless --path game --import
```

- [ ] **Step 4: Run GREEN**

Run `game_cover_sim.tscn`. Expected: all asset assertions pass and exit 0.

- [ ] **Step 5: Run registry and catalog regressions**

Run `game_registry_sim.tscn`, `handheld_catalog_sim.tscn`, `console_catalog_sim.tscn`, and `game_catalog_sim.tscn`. Expected: all exit 0 with zero failed checks.

- [ ] **Step 6: Commit the green cover asset contract**

```powershell
git add game/data/games.json game/proto3d/games/game_registry.gd game/proto3d/tests/game_cover_sim.gd game/proto3d/tests/game_cover_sim.tscn game/assets/game_covers game/assets/fonts/game_deck tools/game_deck docs/verification/GAME_DECK_COVERS_CONTACT_SHEET.webp
git commit -m "feat: add complete Game Deck cover collection"
```

---

### Task 5: Build the focusable cover-card library

**Files:**
- Create: `game/proto3d/games/game_cover_card.gd`
- Modify: `game/proto3d/games/game_shell.gd`
- Modify: `game/proto3d/tests/game_cover_sim.gd`

**Interfaces:**
- Consumes: a game row, `available`, `owned`, and its `Texture2D`.
- Produces: `ProtoGameCoverCard.create(row, available, owned) -> Button`, `cover_texture_rect`, `art_loaded`, and unchanged searchable `text`.

- [ ] **Step 1: Extend the sim before creating the component**

Construct the real deck/shell as `game_shell_sim` does, open handheld and console libraries, and assert:

```gdscript
_check("all catalog rows become focusable cover cards", card_count == 22 and all_focusable)
_check("all cover cards preserve searchable accessibility text", semantics_ok)
_check("all art wells keep aspect without crop", all_keep_aspect)
_check("locked cover art remains visible but cannot launch", lock_visible and lock_disabled)
_check("handheld cover presses PLAY while console cover presses MATCH", routes_ok)
```

Add a missing-art row directly to `ProtoGameCoverCard.create` and assert the fallback is visible and `art_loaded == false`.

- [ ] **Step 2: Run RED**

Expected: parse/load failure for absent `game_cover_card.gd` or failed component/card assertions—not an unrelated shell failure.

- [ ] **Step 3: Implement `ProtoGameCoverCard`**

The class extends `Button`, keeps `focus_mode = FOCUS_ALL`, and exposes:

```gdscript
class_name ProtoGameCoverCard
extends Button

var cover_texture_rect: TextureRect
var art_loaded := false

static func create(row: Dictionary, available: bool, owned: bool) -> ProtoGameCoverCard
func configure(row: Dictionary, available: bool, owned: bool) -> void
func semantic_text() -> String
```

The art well uses `TextureRect.STRETCH_KEEP_ASPECT_CENTERED`; the fallback is a deterministic ink/amber `GradientTexture2D`. The title, aspect, power, network, and lock state remain in `button.text` and tooltip/accessibility copy. Use text plus color for `OWNED`, `LOCKED - FIND CARTRIDGE`, and `NOT INSTALLED`.

- [ ] **Step 4: Replace only the library list construction**

Change `_library_box` to a `GridContainer`, set four columns at wide size and two at the minimum, and replace `Button.new()` with `ProtoGameCoverCard.create(row, available, owned)`. Preserve catalog order, `first_library_button`, focus grabbing, `_library_context`, and the existing pressed callback verbatim.

- [ ] **Step 5: Run GREEN and shell regressions**

Run `game_cover_sim.tscn`, `game_shell_sim.tscn`, `game_acquisition_sim.tscn`, and `game_lobby_sim.tscn`. Expected: all checks pass.

- [ ] **Step 6: Commit the green library UI**

```powershell
git add game/proto3d/games/game_cover_card.gd game/proto3d/games/game_shell.gd game/proto3d/tests/game_cover_sim.gd
git commit -m "feat: show cartridge covers in Game Deck library"
```

---

### Task 6: Visual verification and complete regression

**Files:**
- Create: `docs/verification/GAME_DECK_COVERS.md`
- Create during capture, then remove: `game/proto3d/tests/game_cover_visual.gd`
- Create during capture, then remove: `game/proto3d/tests/game_cover_visual.tscn`

**Interfaces:**
- Consumes: complete catalog, cover grid, physical handheld/console shell.
- Produces: fresh proof of all assets and runtime routes with no temporary capture harness left behind.

- [ ] **Step 1: Capture the four required Compatibility frames**

Capture Pocket library, Safehouse Console library, WASTE HEAP at 720 x 600, and RUST RUNNERS at 1280 x 720 followed by MATCH. Save accepted proof frames under `docs/verification/game_deck_covers/` and inspect them at original detail.

- [ ] **Step 2: Run focused and inherited regressions serially**

Run at minimum:

```text
game_cover_sim
game_registry_sim
handheld_catalog_sim
console_catalog_sim
game_shell_sim
game_acquisition_sim
game_device_sim
game_lobby_sim
game_save_sim
game_input_sim
game_license_sim
game_catalog_sim
```

Then run the Game Deck lobby loopback command. Every process must exit 0 and every suite must report zero failures.

- [ ] **Step 3: Write the evidence document**

Record exact asset count, formats, test counts, commands, visual frame names, font/source license, built-in generation path, and the originality/no-upstream-art boundary. Do not claim evidence that was not freshly observed.

- [ ] **Step 4: Remove the temporary capture harness and verify the diff**

Run `git diff --check`, confirm no `game_cover_visual.*` remains, confirm exactly twenty-two final WebPs, and inspect `git status --short` for unrelated changes.

- [ ] **Step 5: Commit verification**

```powershell
git add docs/verification/GAME_DECK_COVERS.md docs/verification/game_deck_covers
git commit -m "test: verify complete Game Deck cover library"
```

- [ ] **Step 6: Apply the completion gate**

Re-read the design specification and this plan line by line. Only after all files, tests, visual frames, contact sheet, and clean status are freshly verified may the branch be handed off through the finishing-a-development-branch workflow.
