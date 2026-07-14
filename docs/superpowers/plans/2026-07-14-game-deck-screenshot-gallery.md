# Game Deck Screenshot Gallery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a complete offline review package for all twenty-two Game Deck titles containing the existing cover, exact catalog copy, multiplayer and control information, three real gameplay captures, one standalone sheet per game, and one browsable gallery.

**Architecture:** A data-only choreography manifest drives a Godot GPU capture harness through the existing `ProtoGameDeck` lifecycle and semantic input router. The harness writes native-ratio PNG frames plus exact runtime metadata; a deterministic Pillow compositor validates those inputs and produces optimized WebP screenshots, 1920 x 1080 sheets, a contact sheet, and static HTML/CSS/JavaScript.

**Tech Stack:** Godot 4.5.1/GDScript 2.0, JSON, Python 3 with Pillow, static HTML/CSS/vanilla JavaScript, Godot headless sims, Compatibility GPU rendering.

## Global Constraints

- `res://` is `game/`; never use `res://game/`.
- Use the existing `ProtoGameDeck.launch()`, `start()`, `feed_event()`, and `process_tick()` path; do not create a second cartridge runtime.
- Every gameplay image must come from the real Godot cartridge `SubViewport`; no AI images, recreated UI, debug-state mutation, teleport, or hand-built mock screenshot.
- Preserve declared native output: console 16:9; handheld 1:1, 9:16, or 16:9; never stretch or crop gameplay.
- Use fixed seeds, stock rules, stock AI, normal semantic inputs, and real process/render frames.
- Final count is exactly twenty-two covers, sixty-six gameplay screenshots, twenty-two standalone sheets, one HTML gallery, and one contact sheet.
- Presentation colors are carbon black, warm bone, oxidized amber, signal teal, and restrained emergency red. Purple is forbidden.
- Gallery output has no server, framework, CDN, external font, analytics, or network dependency.
- Titles, help, lore, aspect, player range, AI, local, and online values come from `game/data/games.json`.
- Control labels come from `ProtoArcadeInputRouter.help_labels()` so keyboard/mouse and controller copy agrees with the running game.
- Keep temporary raw PNG captures outside `res://`; commit only optimized review artifacts.
- Any new `class_name` script requires a Godot `--import` before headless sims.
- Every implementation task ends with a focused green test and a clean, focused commit with no co-author line.

## File map

- Create `tools/game_deck/gallery_capture.json`: checked-in seeds and legal semantic input choreography for three frames per game.
- Create `game/proto3d/tests/game_gallery_contract_sim.gd`: catalog/manifest/control-profile contract test.
- Create `game/proto3d/tests/game_gallery_contract_sim.tscn`: focused Godot test entry point.
- Create `game/proto3d/tools/game_gallery_capture.gd`: real Game Deck launch, semantic input playback, viewport capture, and runtime metadata writer.
- Create `game/proto3d/tools/game_gallery_capture.tscn`: GPU capture entry point.
- Create `tools/game_deck/build_gallery.py`: validation, WebP conversion, sheet/contact-sheet composition, manifest, and HTML generation.
- Create `tools/game_deck/tests/test_build_gallery.py`: Python unit/integration tests with temporary synthetic frames.
- Create `tools/game_deck/gallery_assets/gallery.css`: checked-in no-purple responsive gallery presentation.
- Create `tools/game_deck/gallery_assets/gallery.js`: keyboard-safe platform filtering and lightbox behavior.
- Generate `docs/verification/game_deck_gallery/`: final gallery, metadata, 66 captures, 22 sheets, and contact sheet.
- Create `docs/verification/GAME_DECK_SCREENSHOT_GALLERY.md`: exact production commands, counts, test evidence, and visual review record.

---

### Task 1: Lock the capture choreography contract

**Files:**
- Create: `tools/game_deck/gallery_capture.json`
- Create: `game/proto3d/tests/game_gallery_contract_sim.gd`
- Create: `game/proto3d/tests/game_gallery_contract_sim.tscn`

**Interfaces:**
- Consumes: `ProtoGameRegistry.load_catalog()`, `ProtoArcadeInputRouter.PROFILES`, and `game/data/game_devices.json`.
- Produces: one JSON row per catalog ID with `id: String`, `seed: int`, `shots: Array[Dictionary]`; each shot has `label: String` and `ops: Array[Dictionary]` using `tap`, `hold`, `pointer`, or `wait`.

- [ ] **Step 1: Write the failing manifest contract sim**

Create the scene with the standard project test shape:

```ini
[gd_scene load_steps=2 format=3]

[ext_resource type="Script" path="res://proto3d/tests/game_gallery_contract_sim.gd" id="1"]

[node name="GameGalleryContractSim" type="Node"]
script = ExtResource("1")
```

Create a test that loads `res://../tools/game_deck/gallery_capture.json` through
`ProjectSettings.globalize_path()`, then checks all of the following explicitly:

```gdscript
const EXPECTED_LABELS := ["OPENING", "MID-RUN", "MONEY SHOT"]
const ALLOWED_OPS := ["tap", "hold", "pointer", "wait"]
const BANNED_FIELDS := ["state", "set", "debug", "teleport", "snapshot"]

func _valid_op(op: Dictionary, legal_semantics: Array) -> bool:
    var kind := String(op.get("op", ""))
    if kind not in ALLOWED_OPS or BANNED_FIELDS.any(func(key: String) -> bool: return op.has(key)):
        return false
    if kind in ["tap", "hold"]:
        var names: Array = op.get("semantics", [String(op.get("semantic", ""))])
        if names.is_empty() or names.any(func(name: Variant) -> bool:
                return String(name) not in legal_semantics):
            return false
        if kind == "tap":
            return true
    if kind == "hold":
        return int(op.get("ticks", 0)) > 0
    if kind == "pointer":
        var point: Array = op.get("point", [])
        return point.size() == 2 and float(point[0]) >= 0.0 and float(point[0]) <= 1.0 \
            and float(point[1]) >= 0.0 and float(point[1]) <= 1.0
    return int(op.get("ticks", 0)) > 0
```

The sim must also launch and start every row through a real `ProtoGameDeck`,
prove `help_labels(controls_profile)` is non-empty, and report a nonzero exit
when any catalog ID, exact shot label, seed, op, profile, or device ratio is
invalid.

- [ ] **Step 2: Run the focused sim and confirm RED**

Run:

```powershell
& 'C:\Users\taskm\Downloads\projects\Godot\Godot_v4.5.1-stable_win64_console.exe' --headless --path game res://proto3d/tests/game_gallery_contract_sim.tscn
```

Expected: exit 1 with `GAME_GALLERY_CONTRACT: FAIL - capture manifest exists`.

- [ ] **Step 3: Add the complete twenty-two-row manifest**

Use this exact schema; `OPENING` always waits six ticks, while later shots
accumulate real inputs from the preceding state:

```json
{
  "version": 1,
  "games": [
    {
      "id": "waste_heap",
      "seed": 2201,
      "shots": [
        {"label": "OPENING", "ops": [{"op": "wait", "ticks": 6}]},
        {"label": "MID-RUN", "ops": [{"op": "tap", "semantic": "move_left"}, {"op": "tap", "semantic": "move_down"}, {"op": "tap", "semantic": "move_right"}, {"op": "tap", "semantic": "move_up"}, {"op": "wait", "ticks": 3}]},
        {"label": "MONEY SHOT", "ops": [{"op": "tap", "semantic": "move_left"}, {"op": "tap", "semantic": "move_down"}, {"op": "tap", "semantic": "move_left"}, {"op": "tap", "semantic": "move_up"}, {"op": "tap", "semantic": "move_right"}, {"op": "wait", "ticks": 4}]}
      ]
    }
  ]
}
```

Populate the remaining rows using these exact seed/action intentions; encode
every comma-separated action as a separate `tap`, `hold`, `pointer`, or `wait`
op, never as an internal state edit:

| ID | Seed | MID-RUN | MONEY SHOT |
|---|---:|---|---|
| `radworm` | 2202 | right 10 ticks, down tap, wait 8 | left tap, wait 8, up tap, wait 8 |
| `dead_ground` | 2203 | pointer .28/.28 + primary, pointer .50/.50 + primary | pointer .72/.28 + secondary, pointer .72/.50 + primary |
| `pack_rat` | 2204 | right, down, left, up, wait 3 | right, right, down, left, wait 4 |
| `bunker_breaker` | 2205 | primary, left 18 ticks | right 34 ticks, left 16 ticks, wait 20 |
| `last_mile` | 2206 | move up 50 ticks + left 12 ticks | move up 80 ticks + right 24 ticks + left 18 ticks |
| `iron_dome` | 2207 | pointer .35/.35 + primary, pointer .68/.28 + primary | pointer .50/.18 + primary, pointer .78/.42 + primary, wait 18 |
| `fall_line` | 2208 | left 12 ticks + primary 20 ticks | right 18 ticks + primary 34 ticks + left 8 ticks |
| `tilt_salvage` | 2209 | primary, left 8 ticks, right 8 ticks | primary 6 ticks, secondary 6 ticks, alternating flippers twice, wait 18 |
| `relay_bloom` | 2210 | pointer .25/.25 + primary, .50/.25 + primary, .75/.50 + primary | .25/.75 + primary, .50/.50 + primary twice, .75/.75 + primary |
| `crown_of_ash` | 2211 | down twice, primary, up twice, primary | right twice, down once, primary, up twice, primary, wait 8 |
| `dial_tanks` | 2212 | move right 24, aim up 12, primary | move down 20, aim right 14, secondary, primary twice |
| `red_sky` | 2213 | move up 18, move right 14, primary | move left 12, move up 20, primary, wait 30 |
| `black_orbit` | 2214 | move up/right 24, aim left 12, primary twice | move left 24, aim down 12, secondary, primary twice |
| `gridbreach` | 2215 | move right 18, primary, move down 15 | primary, move left 18, move up 12, primary, wait 28 |
| `rustball` | 2216 | move right 24, primary twice | move up/right 34, mobility, primary three times, wait 18 |
| `fuel_run` | 2217 | move up 36, move right 18, primary | move left 22, move up 44, secondary, primary, wait 18 |
| `skyjoust` | 2218 | move up/right 28, mobility, primary | move left/up 32, mobility twice, primary twice, wait 20 |
| `fight_night_99` | 2219 | move right 20, primary twice, secondary | stance 12, move left 10, mobility, primary three times |
| `ashland_command` | 2220 | right twice, down, primary, right, primary | secondary, left, up, primary, down twice, primary, wait 12 |
| `rust_runners` | 2221 | move right 32 + aim right, primary 18, mobility 12 | weapon next, move left 20 + aim up/right, primary 24, secondary, scoreboard, wait 12 |
| `black_grid` | 2222 | move right/up 30 + aim right, primary 18, interact | move down/right 28 + aim up/left, primary 22, secondary, mobility, scoreboard, wait 14 |

For simultaneous directions, use adjacent held actions over the same tick
window via a `holds` array on one op:

```json
{"op": "hold", "semantics": ["move_up", "move_right"], "ticks": 24}
```

The validator accepts either `semantic: String` or a non-empty
`semantics: Array[String]`, and confirms every named semantic belongs to the
row's control profile.

- [ ] **Step 4: Run the focused sim and confirm GREEN**

Run the command from Step 2.

Expected: exit 0, twenty-two unique IDs, sixty-six exact shot labels, all
choreography ops legal, all cartridges launch/start, and every profile returns
live control labels.

- [ ] **Step 5: Commit the contract**

```powershell
git add tools/game_deck/gallery_capture.json game/proto3d/tests/game_gallery_contract_sim.gd game/proto3d/tests/game_gallery_contract_sim.tscn
git commit -m "test: define Game Deck gallery capture contract"
```

---

### Task 2: Build the real GPU capture harness

**Files:**
- Create: `game/proto3d/tools/game_gallery_capture.gd`
- Create: `game/proto3d/tools/game_gallery_capture.tscn`
- Modify: `game/proto3d/tests/game_gallery_contract_sim.gd`

**Interfaces:**
- Consumes: `gallery_capture.json`, `ProtoGameDeck.create()`, semantic action names from `ProtoArcadeInputRouter.ACTIONS`, and `ProtoGameDeck.texture()`.
- Produces: `<raw>/<game_id>_01.png` through `_03.png` plus `<raw>/metadata.json`; supports `--output <absolute-path>` and optional `--only <game_id>`.

- [ ] **Step 1: Extend the contract sim to fail until the harness surface exists**

Load `res://proto3d/tools/game_gallery_capture.gd`, instantiate it, and assert
the methods `run_capture`, `play_ops`, `feed_semantic`, `capture_frame`, and
`write_metadata` exist. Assert the `.tscn` exists and instantiates as `Node`.

- [ ] **Step 2: Run the sim and confirm RED**

Expected: exit 1 naming the missing capture script/scene.

- [ ] **Step 3: Implement the capture scene and command-line harness**

Use a plain `Node` scene and this lifecycle in `run_capture()`:

```gdscript
var deck: Node = ProtoGameDeck.create()
add_child(deck)
for capture_row_value in capture_rows:
    var capture_row: Dictionary = capture_row_value
    var game_id := String(capture_row["id"])
    var game_row: Dictionary = deck.registry.get_game(game_id)
    var players: Dictionary = game_row["players"]
    var context := {
        "source": "gallery_capture",
        "bots_enabled": bool(players.get("ai", false)),
        "actor_count": int(players.get("max", 1)) if bool(players.get("ai", false)) else 1,
        "session_id": "gallery:%s:%d" % [game_id, int(capture_row["seed"])],
    }
    assert(deck.launch(game_id, context))
    assert(deck.start(int(capture_row["seed"]), [{"seat": 0, "device": -1, "profile_id": "gallery"}]))
    for shot_index in range(3):
        await play_ops(deck, (capture_row["shots"] as Array)[shot_index].get("ops", []))
        await wait_render_frames(4)
        capture_frame(deck, game_id, shot_index + 1)
    metadata_games.append(build_metadata(deck, game_row, capture_row))
    deck.stop("gallery_next")
write_metadata(metadata_games)
get_tree().quit(0)
```

`feed_semantic()` must create `InputEventAction` events whose action is looked
up from `ProtoArcadeInputRouter.ACTIONS`, feed press/release through
`deck.feed_event()`, and call `deck.process_tick()` between real
`process_frame` waits. Pointer ops feed `InputEventMouseMotion.position` as
normalized coordinates multiplied by `deck.viewport.size`. Multi-hold ops
press every semantic, advance the declared ticks, then release every semantic.

`capture_frame()` must read `deck.texture().get_image()`, reject an empty or
wrong-size image, and save PNG with an error-checked return code. Metadata must
include catalog copy, players, aspect, device resolution, `cover_path`, exact
shot labels, output filenames, and `deck.input_router.help_labels(profile)`.

- [ ] **Step 4: Import, run the contract sim, then capture one real game**

```powershell
$godot = 'C:\Users\taskm\Downloads\projects\Godot\Godot_v4.5.1-stable_win64_console.exe'
& $godot --headless --path game --import
& $godot --headless --path game res://proto3d/tests/game_gallery_contract_sim.tscn
$raw = Join-Path $env:TEMP 'drivn-game-deck-gallery-raw'
& $godot --path game --rendering-method gl_compatibility res://proto3d/tools/game_gallery_capture.tscn -- --output $raw --only waste_heap
```

Expected: contract sim exit 0; GPU command exit 0; three 640 x 640 PNGs and one
metadata file; console prints `CAPTURED waste_heap 3/3`.

- [ ] **Step 5: Inspect the three WASTE HEAP frames**

Open all three images and confirm a real rendered board, native 1:1 ratio,
distinct tile states, no capture UI, and no blank/black frame. If they fail,
fix render-frame timing or semantic playback and repeat Step 4.

- [ ] **Step 6: Commit the harness**

```powershell
git add game/proto3d/tools/game_gallery_capture.gd game/proto3d/tools/game_gallery_capture.tscn game/proto3d/tests/game_gallery_contract_sim.gd
git commit -m "feat: add deterministic Game Deck gallery capture"
```

---

### Task 3: Build and test the deterministic gallery compositor

**Files:**
- Create: `tools/game_deck/build_gallery.py`
- Create: `tools/game_deck/tests/test_build_gallery.py`
- Create: `tools/game_deck/gallery_assets/gallery.css`
- Create: `tools/game_deck/gallery_assets/gallery.js`

**Interfaces:**
- Consumes: raw `metadata.json`, raw PNGs, `game/data/games.json`, existing covers, and `RussoOne-Regular.ttf`.
- Produces: validated optimized screenshots, 1920 x 1080 sheets, contact sheet, `manifest.json`, `index.html`, copied CSS, and copied JavaScript.

- [ ] **Step 1: Write failing Python tests for catalog and capture validation**

Use `unittest`, `tempfile.TemporaryDirectory`, and Pillow-created patterned
fixtures. The test module defines this fixture writer and these exact tests:

```python
REPO = Path(__file__).resolve().parents[3]
LABELS = ["OPENING", "MID-RUN", "MONEY SHOT"]

def write_fixture(rows: list[dict], raw: Path) -> list[dict]:
    devices = {row["id"]: row for row in json.loads(
        (REPO / "game/data/game_devices.json").read_text(encoding="utf-8")
    )["devices"]}
    metadata: list[dict] = []
    for game_index, row in enumerate(rows):
        width, height = devices[row["device_id"]]["resolution"]
        shots = []
        for shot_index, label in enumerate(LABELS, 1):
            name = f"{row['id']}_{shot_index:02d}.png"
            image = Image.new("RGB", (width, height), (20 + game_index, 25, 18))
            draw = ImageDraw.Draw(image)
            draw.rectangle(
                (shot_index * width // 8, height // 4,
                 shot_index * width // 8 + width // 5, 3 * height // 4),
                fill=(180, 90 + shot_index * 20, 30),
            )
            image.save(raw / name)
            shots.append({"label": label, "file": name})
        metadata.append({
            "id": row["id"], "title": row["title"], "platform": row["platform"],
            "aspect": row["aspect"], "resolution": [width, height],
            "help": row["help"], "about_world": row["about_world"],
            "players": row["players"], "cover_path": row["cover_path"],
            "controls": [{"semantic": "primary", "label": "Primary",
                          "keyboard": "Enter", "pad": "RT"}],
            "shots": shots,
        })
    (raw / "metadata.json").write_text(
        json.dumps({"games": metadata}, indent=2), encoding="utf-8"
    )
    return metadata

class GalleryBuilderTests(unittest.TestCase):
    def setUp(self) -> None:
        self.rows = build_gallery.load_catalog(REPO / "game/data/games.json")
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.raw = self.root / "raw"
        self.out = self.root / "out"
        self.raw.mkdir()
        self.metadata = write_fixture(self.rows, self.raw)

    def tearDown(self) -> None:
        self.temp.cleanup()

    def test_catalog_has_exactly_22_unique_games(self) -> None:
        self.assertEqual(22, len(self.rows))
        self.assertEqual(22, len({row["id"] for row in self.rows}))

    def test_multiplayer_copy_distinguishes_challenge_from_live_play(self) -> None:
        handheld = next(row for row in self.rows if row["id"] == "waste_heap")
        console = next(row for row in self.rows if row["id"] == "rust_runners")
        self.assertIn("Single-player run", build_gallery.multiplayer_copy(handheld))
        self.assertNotIn("Join locally", build_gallery.multiplayer_copy(handheld))
        self.assertIn("Join locally", build_gallery.multiplayer_copy(console))
        self.assertIn("stock AI", build_gallery.multiplayer_copy(console))

    def test_validate_rejects_missing_blank_duplicate_and_wrong_ratio_frames(self) -> None:
        self.assertEqual([], build_gallery.validate_capture_set(
            self.rows, self.metadata, self.raw))
        target = self.raw / "waste_heap_01.png"
        target.unlink()
        self.assertTrue(any("missing" in error for error in
            build_gallery.validate_capture_set(self.rows, self.metadata, self.raw)))
        write_fixture(self.rows, self.raw)
        Image.new("RGB", (320, 180), "black").save(target)
        errors = build_gallery.validate_capture_set(self.rows, self.metadata, self.raw)
        self.assertTrue(any(word in " ".join(errors) for word in ["ratio", "blank"]))
        shutil.copyfile(self.raw / "waste_heap_02.png", target)
        self.assertTrue(any("duplicate" in error for error in
            build_gallery.validate_capture_set(self.rows, self.metadata, self.raw)))

    def test_build_writes_complete_package(self) -> None:
        build_gallery.build(self.raw, self.out)
        self.assertEqual(66, len(list((self.out / "screenshots").glob("*.webp"))))
        self.assertEqual(22, len(list((self.out / "sheets").glob("*.webp"))))
        for name in ["index.html", "gallery.css", "gallery.js", "manifest.json",
                     "GAME_DECK_GALLERY_CONTACT_SHEET.webp"]:
            self.assertTrue((self.out / name).is_file(), name)

    def test_html_is_complete_local_and_accessible(self) -> None:
        build_gallery.build(self.raw, self.out)
        html = (self.out / "index.html").read_text(encoding="utf-8")
        self.assertTrue(all(row["title"] in html for row in self.rows))
        self.assertNotRegex(html, r"https?://")
        self.assertEqual(66, html.count("data-full="))
        self.assertGreaterEqual(html.count("alt="), 88)

    def test_generated_palette_contains_no_forbidden_purple(self) -> None:
        build_gallery.build(self.raw, self.out)
        css = (self.out / "gallery.css").read_text(encoding="utf-8").lower()
        self.assertNotIn("purple", css)
        self.assertNotRegex(css, r"oklch\([^)]+\s(?:2[7-9][0-9]|3[01][0-9])\)")
        with Image.open(self.out / "GAME_DECK_GALLERY_CONTACT_SHEET.webp") as sheet:
            self.assertEqual(0, build_gallery.forbidden_purple_count(sheet))
```

The integration fixture uses the real twenty-two catalog rows and creates
three small patterned images per expected ratio; change a colored stripe by
shot index so perceptual-difference validation can pass without relying on
production captures.

- [ ] **Step 2: Run tests and confirm RED**

```powershell
& 'C:\Users\taskm\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' tools/game_deck/tests/test_build_gallery.py -v
```

Expected: import failure for missing `tools.game_deck.build_gallery`.

- [ ] **Step 3: Implement validation and copy generation**

Define these exact functions and validation algorithm:

```python
def load_catalog(path: Path) -> list[dict]:
    rows = json.loads(path.read_text(encoding="utf-8")).get("games", [])
    ids = [str(row.get("id", "")) for row in rows]
    if len(rows) != 22 or len(set(ids)) != 22 or any(not game_id for game_id in ids):
        raise ValueError("catalog must contain exactly 22 unique game IDs")
    return rows

def load_metadata(path: Path) -> list[dict]:
    rows = json.loads(path.read_text(encoding="utf-8")).get("games", [])
    if not isinstance(rows, list):
        raise ValueError("metadata games must be an array")
    return rows

def forbidden_purple_count(image: Image.Image) -> int:
    count = 0
    for red, green, blue in image.convert("RGB").get_flattened_data():
        hue, saturation, value = colorsys.rgb_to_hsv(red / 255, green / 255, blue / 255)
        if 270 <= hue * 360 <= 320 and saturation >= .35 and value >= .15:
            count += 1
    return count

def frame_difference(left: Image.Image, right: Image.Image) -> float:
    a = ImageOps.fit(left.convert("RGB"), (160, 90))
    b = ImageOps.fit(right.convert("RGB"), (160, 90))
    mean = ImageStat.Stat(ImageChops.difference(a, b)).mean
    return sum(mean) / (3 * 255)

def validate_capture_set(rows: list[dict], metadata: list[dict], raw_dir: Path) -> list[str]:
    errors: list[str] = []
    by_id = {row.get("id"): row for row in metadata}
    for row in rows:
        game_id = row["id"]
        meta = by_id.get(game_id)
        if meta is None:
            errors.append(f"{game_id}: missing metadata")
            continue
        shots = meta.get("shots", [])
        if [shot.get("label") for shot in shots] != ["OPENING", "MID-RUN", "MONEY SHOT"]:
            errors.append(f"{game_id}: wrong shot labels")
            continue
        images: list[Image.Image] = []
        for shot in shots:
            path = raw_dir / str(shot.get("file", ""))
            if not path.is_file():
                errors.append(f"{game_id}: missing {path.name}")
                continue
            image = Image.open(path).convert("RGB")
            if list(image.size) != list(meta["resolution"]):
                errors.append(f"{game_id}: wrong ratio or resolution for {path.name}")
            if ImageStat.Stat(image).extrema == [(0, 0), (0, 0), (0, 0)]:
                errors.append(f"{game_id}: blank {path.name}")
            images.append(image)
        if len(images) == 3 and min(frame_difference(images[a], images[b])
                for a, b in [(0, 1), (0, 2), (1, 2)]) <= .01:
            errors.append(f"{game_id}: duplicate gameplay frames")
        if not meta.get("controls"):
            errors.append(f"{game_id}: missing controls")
        for field in ["title", "help", "about_world", "aspect", "players", "cover_path"]:
            if meta.get(field) != row.get(field):
                errors.append(f"{game_id}: metadata mismatch for {field}")
    if len(by_id) != 22:
        errors.append("metadata must contain exactly 22 unique games")
    return errors
```

`render_sheet()` creates an RGB 1920 x 1080 canvas, places the cover with
`ImageOps.contain(cover, (420, 720))` at `(72, 150)`, places the three gameplay
frames with `ImageOps.contain(frame, (420, 360))` in wells starting at x=540,
990, and 1440, and draws the title, exact shot labels, help/lore, multiplayer
copy, aspect/player badges, and wrapped controls. `render_contact_sheet()`
places the twenty-two final sheets in an 11 x 2 grid of 480 x 270 thumbnails
with title labels. `render_index()` HTML-escapes all catalog text and emits one
`article.game-card` per row with local cover/frame paths, descriptive `alt`
text, badges, controls, and `data-platform`. `build()` refuses non-empty
validation errors, recreates only the requested output directory, writes the
optimized images at WebP quality 92/method 6, writes manifest/HTML/assets, then
asserts the exact file counts before returning.

`multiplayer_copy()` uses these exact rules:

```python
if online == "challenge":
    return "Single-player run; scores and times can be compared through challenges and leaderboards."
if local and online == "same_session":
    return f"{minimum}-{maximum} players. Join locally at the same in-world system or through the shared DRIVN session; stock AI fills open slots." if ai else f"{minimum}-{maximum} players. Join locally at the same in-world system or through the shared DRIVN session."
return f"{minimum}-{maximum} players; {online.replace('_', ' ')}."
```

Validation checks exact counts, dimensions against device resolution, blank
pixel extrema, pairwise normalized image difference above 0.01, cover
existence, exact metadata copy, three labels, control rows, and no forbidden
purple in generated UI assets. The sheet uses `ImageOps.contain()` for all
cover and frame wells; it never uses `ImageOps.fit()` on gameplay.

- [ ] **Step 4: Implement accessible static gallery assets**

CSS uses the approved no-purple palette and native-ratio art wells:

```css
:root { --ink: oklch(0.18 0.02 70); --card: oklch(0.23 0.025 70); --bone: oklch(0.9 0.025 80); --amber: oklch(0.72 0.16 72); --teal: oklch(0.68 0.11 190); --red: oklch(0.58 0.18 28); --border: oklch(0.34 0.035 70); }
.game-card { border: 1px solid var(--border); border-radius: .625rem; transition: transform .2s, box-shadow .2s, border-color .2s; }
.game-card:hover, .game-card:focus-within { transform: translateY(-2px); border-color: var(--amber); box-shadow: 0 1rem 2.5rem oklch(0.08 0.02 70 / .45); }
.gameplay-frame img, .cover img { width: 100%; height: 100%; object-fit: contain; }
:focus-visible { outline: 3px solid var(--teal); outline-offset: 3px; }
```

JavaScript provides All/Handheld/Console buttons, `aria-pressed`, Escape-close,
arrow-key lightbox navigation, and click-to-open full-resolution frames. It
must not fetch data or contact a network; the generated HTML contains the
complete card data.

- [ ] **Step 5: Run Python tests and confirm GREEN**

Run Step 2's command.

Expected: all six tests pass; the temporary integration output reports 66
screenshots and 22 sheets.

- [ ] **Step 6: Commit the tested compositor**

```powershell
git add tools/game_deck/build_gallery.py tools/game_deck/tests/test_build_gallery.py tools/game_deck/gallery_assets/gallery.css tools/game_deck/gallery_assets/gallery.js
git commit -m "feat: build Game Deck screenshot gallery"
```

---

### Task 4: Capture and visually accept all sixty-six real frames

**Files:**
- Modify when visual correction requires it: `tools/game_deck/gallery_capture.json`
- Temporary only: `$env:TEMP/drivn-game-deck-gallery-raw/`

**Interfaces:**
- Consumes: the accepted harness and choreography.
- Produces: twenty-two metadata rows and sixty-six native-resolution raw PNGs ready for deterministic packaging.

- [ ] **Step 1: Clear only the dedicated temporary capture directory and capture all games**

Verify the resolved path is under `$env:TEMP`, remove only that exact directory,
recreate it, then run:

```powershell
$raw = Join-Path $env:TEMP 'drivn-game-deck-gallery-raw'
$godot = 'C:\Users\taskm\Downloads\projects\Godot\Godot_v4.5.1-stable_win64_console.exe'
& $godot --path game --rendering-method gl_compatibility res://proto3d/tools/game_gallery_capture.tscn -- --output $raw
```

Expected: exit 0, `CAPTURE COMPLETE: 22 games, 66 frames`, and no unexpected
script/runtime errors.

- [ ] **Step 2: Run raw-set validation before composition**

```powershell
$python = 'C:\Users\taskm\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe'
& $python tools/game_deck/build_gallery.py --raw-dir $raw --output-dir docs/verification/game_deck_gallery --check-raw
```

Expected: `RAW VALIDATION: 22 games, 66 distinct frames, 0 failures`.

- [ ] **Step 3: Build a temporary capture contact sheet and inspect every title**

Use the compositor's `--raw-contact-sheet` option to write a temporary sheet,
then visually inspect it. Open individual full-resolution frames for all four
aspect/family samples (`waste_heap`, `bunker_breaker`, `last_mile`,
`rust_runners`) and both golden-goose games (`rust_runners`, `black_grid`).

Reject and recapture a game if any frame is blank, duplicates another shot,
shows a finished/error screen, hides the core playfield, lacks meaningful
action, stretches the image, or gives a weaker `MONEY SHOT` than `MID-RUN`.

- [ ] **Step 4: Correct only failing choreography rows and recapture them**

For each rejected title, change only seed/timing/legal semantic ops in its JSON
row and run `--only <game_id>`. Do not add debug methods or state mutation.
Repeat raw validation and visual inspection until all twenty-two pass.

- [ ] **Step 5: Commit any accepted choreography tuning**

```powershell
git add tools/game_deck/gallery_capture.json
git commit -m "fix: tune Game Deck gallery action captures"
```

Skip this commit only if Task 1's choreography required no edits.

---

### Task 5: Generate the final review package

**Files:**
- Generate: `docs/verification/game_deck_gallery/index.html`
- Generate: `docs/verification/game_deck_gallery/gallery.css`
- Generate: `docs/verification/game_deck_gallery/gallery.js`
- Generate: `docs/verification/game_deck_gallery/manifest.json`
- Generate: `docs/verification/game_deck_gallery/screenshots/*.webp`
- Generate: `docs/verification/game_deck_gallery/sheets/*.webp`
- Generate: `docs/verification/game_deck_gallery/GAME_DECK_GALLERY_CONTACT_SHEET.webp`

**Interfaces:**
- Consumes: accepted raw frames, metadata, covers, font, and gallery assets.
- Produces: the exact offline package promised by the design.

- [ ] **Step 1: Generate all final artifacts**

```powershell
$raw = Join-Path $env:TEMP 'drivn-game-deck-gallery-raw'
$python = 'C:\Users\taskm\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe'
& $python tools/game_deck/build_gallery.py --raw-dir $raw --output-dir docs/verification/game_deck_gallery
```

Expected: `BUILT: 22 games, 66 screenshots, 22 sheets, 1 gallery, 1 contact sheet`.

- [ ] **Step 2: Run immutable-output verification**

```powershell
& $python tools/game_deck/build_gallery.py --raw-dir $raw --output-dir docs/verification/game_deck_gallery --check
```

Expected: every expected path exists, contents match a fresh deterministic
build, all local HTML references resolve, no remote URL exists, ratios/counts
match, and there are zero purple pixels in composed sheets/contact sheet.

- [ ] **Step 3: Inspect the final contact sheet and representative sheets**

Open the contact sheet plus the sheets for WASTE HEAP, BUNKER BREAKER, LAST
MILE, CROWN OF ASH, RUST RUNNERS, and BLACK GRID. Verify exact titles, readable
copy, uncropped covers, three labeled true-ratio frames, controls, player/network
copy, and strong Phase 2 spectacle.

- [ ] **Step 4: Inspect the HTML gallery locally**

Open `docs/verification/game_deck_gallery/index.html`, exercise All/Handheld/
Console filters, keyboard focus, frame lightbox, arrow navigation, Escape, and
full-resolution links. Verify the page works with network disconnected.

- [ ] **Step 5: Commit the final package**

```powershell
git add docs/verification/game_deck_gallery
git commit -m "docs: add complete Game Deck screenshot gallery"
```

---

### Task 6: Run regression gates and publish verification evidence

**Files:**
- Create: `docs/verification/GAME_DECK_SCREENSHOT_GALLERY.md`

**Interfaces:**
- Consumes: final capture package and all affected Game Deck contracts.
- Produces: reproducible evidence with command lines, counts, pass totals, visual findings, branch commit, and artifact entry points.

- [ ] **Step 1: Run focused Python and Godot gates serially**

Run the Python suite, then these Godot scenes one at a time:

```powershell
$tests = @(
  'game_gallery_contract_sim', 'game_registry_sim', 'game_catalog_sim',
  'game_shell_sim', 'game_input_sim', 'handheld_catalog_sim',
  'console_catalog_sim', 'game_lobby_sim', 'game_cover_sim',
  'game_license_sim', 'rust_runners_sim', 'black_grid_sim',
  'game_shooter_controls_sim', 'game_shooter_kernel_sim', 'game_cleanroom_sim'
)
foreach ($test in $tests) {
  & $godot --headless --path game ("res://proto3d/tests/$test.tscn")
  if ($LASTEXITCODE -ne 0) { throw "$test failed" }
}
```

Expected: every process exits 0 with its own `ALL CHECKS PASSED` line.

- [ ] **Step 2: Re-run final artifact verification and count files**

Expected count assertions:

```powershell
(Get-ChildItem docs/verification/game_deck_gallery/screenshots -Filter '*.webp').Count # 66
(Get-ChildItem docs/verification/game_deck_gallery/sheets -Filter '*.webp').Count      # 22
```

Run compositor `--check` again after all tests.

- [ ] **Step 3: Write the verification report**

Record the design/plan links, capture command, compositor command, exact file
counts, focused test results, baseline `game_catalog_sim` 158/158 and
`game_shell_sim` 22/22, aspect-family inspection, all twenty-two-sheet contact
sheet review, RUST RUNNERS/BLACK GRID spectacle findings, and the offline HTML
entry point. Do not claim a visual or test result that was not actually run.

- [ ] **Step 4: Perform the final branch audit**

```powershell
$base = git merge-base origin/main HEAD
git diff --check "$base..HEAD"
git status --short
git log --oneline --decorate origin/main..HEAD
```

Expected: no whitespace errors; only the intended verification report remains
uncommitted before the final commit; no generated `.import` or temporary PNG
files are included.

- [ ] **Step 5: Commit the evidence**

```powershell
git add docs/verification/GAME_DECK_SCREENSHOT_GALLERY.md
git commit -m "docs: verify Game Deck screenshot gallery"
```

- [ ] **Step 6: Verify clean completion**

Run `git status --short` and the compositor `--check` one last time.

Expected: clean worktree and zero validation failures.
