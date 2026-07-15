# DRIVN: GAME DECK Companion Release Verification

Date: 2026-07-14

Branch: `codex/game-deck-gallery`

Artifact: `build/DRIVN-Game-Deck.exe`

## Release verdict

`DRIVN: GAME DECK` is a standalone, single-player Windows companion arcade
containing all twenty-two DRIVN cartridges. It has its own boot route, save
envelope, shelf, box-art inspection, cartridge insertion transition, controls,
strategy/help, About/license, scoreboards, ejection flow, and promotion for the
larger DRIVN world. It does not replace or redirect the normal DRIVN launch.

The release executable was rebuilt from the final source and independently
launched through its packaged smoke route. The exact artifact is:

```text
Filename:  DRIVN-Game-Deck.exe
Bytes:     247,222,408
SHA-256:   3EFC7734A34267E45563449829DC4F6784BC08BCE4D76CD95F07A933053994A8
Product:   DRIVN: GAME DECK
Company:   Machine Kings Media
Version:   0.14.0.0
```

The Windows executable contains its own seven-resolution icon resource. The
associated Windows icon was extracted from the final EXE and preserved as
`game_deck_companion/windows-associated-icon.png`.

## What ships

The companion is deliberately single-player. Handheld cartridges run one
human and no bots. Console cartridges run one human and fill the game row's
ordinary maximum field with the cartridge's stock AI. This makes every title
immediately playable while preserving its intended match size.

| # | Cartridge | Hardware / aspect | Standalone field | What the player does |
|---:|---|---|---|---|
| 1 | WASTE HEAP | handheld 1:1 | 1 human | Slide the salvage tray, fuse matching parts, and build the largest reactor core before the grid locks. |
| 2 | RADWORM | handheld 1:1 | 1 human | Route a growing worm through lost packets without hitting the firewall, border, or its own tail. |
| 3 | DEAD GROUND | handheld 1:1 | 1 human | Reveal safe ground and use number clues to flag buried ordnance. |
| 4 | PACK RAT | handheld 1:1 | 1 human | Push every crate onto an evacuation bay without deadlocking corners. |
| 5 | BUNKER BREAKER | handheld 9:16 | 1 human | Angle the breaching slug off a paddle and strip every bunker armor layer. |
| 6 | LAST MILE | handheld 16:9 | 1 human | Thread traffic, hold the racing line, and finish the courier route in the lowest time. |
| 7 | IRON DOME | handheld 9:16 | 1 human | Time interceptor bursts, preserve the cities, and ration the defense magazine. |
| 8 | FALL LINE | handheld 9:16 | 1 human | Pulse thrust, kill drift, and settle a supply capsule onto the marked pad. |
| 9 | TILT//SALVAGE | handheld 9:16 | 1 human | Work both flippers, preserve the ball, and light salvage lanes for the jackpot. |
| 10 | RELAY BLOOM | handheld 1:1 | 1 human | Rotate relay tiles until every terminal has a reciprocal route to the source. |
| 11 | CROWN OF ASH | console 16:9 | 1 human + AI to 2 | Command a complete chess army; legal captures resolve as skippable faction executions while the rules remain pure chess. |
| 12 | DIAL TANKS | console 16:9 | 1 human + AI to 4 | Drive, rotate the turret, bank shells through tight arenas, and be the last tank moving. |
| 13 | RED SKY | console 16:9 | 1 human + AI to 4 | Read the wind, choose angle and charge, and erase rival gun crews. |
| 14 | BLACK ORBIT | console 16:9 | 1 human + AI to 4 | Thrust through debris, fight rival claim ships, and bank orbital salvage. |
| 15 | GRIDBREACH | console 16:9 | 1 human + AI to 4 | Plant charges, break walls, trap rivals in blast lanes, and remain online. |
| 16 | RUSTBALL | console 16:9 | 1 human + AI to 4 | Use momentum, rebounds, and body checks to drive the iron ball through the rival gate. |
| 17 | FUEL RUN | console 16:9 | 1 human + AI to 4 | Race for the center can, return it to the pump, and steal rival fuel before time expires. |
| 18 | SKYJOUST | console 16:9 | 1 human + AI to 2 | Burn the rocket rig, take altitude, and strike the rival pilot from above. |
| 19 | FIGHT NIGHT '99 | console 16:9 | 1 human + AI to 2 | Pick a road legend, learn the combo chain, manage guard, and take two rounds. |
| 20 | ASHLAND COMMAND | console 16:9 | 1 human + AI to 2 | Move squads, hold supply, combine fire, and break the enemy command. |
| 21 | RUST RUNNERS | console 16:9 | 1 human + AI to 8 | Move and aim independently, burn jet fuel, swap weapons, and fight fast side-view objective rounds. |
| 22 | BLACK GRID | console 16:9 | 1 human + AI to 16 | Manage momentum, fog, loadout mass, projectiles, vehicles, and field objectives in a top-down combined-arms fight. |

## Player-facing release flow

The accepted GPU journey proves the complete flow rather than isolated
widgets:

1. branded boot and full twenty-two-cartridge shelf;
2. square, portrait, landscape, and console box-art inspection;
3. package, cartridge, and electrical-contact insertion beats;
4. real cartridge play at each hardware aspect ratio;
5. live keyboard/mouse/controller labels, strategy guide, About/license, and
   scoreboards;
6. ejection followed by exact shelf focus restoration;
7. the DRIVN full-world promotion, with an honest "in development" status;
8. reduced-motion cartridge contact presentation.

The theme is a shared DRIVN hardware language: blackened metal, bone text,
amber/rust highlights, muted teal states, and no purple. The cartridge artwork
is shown both on the shelf and during insertion; every game has its own exact
cover.

## Visual proof

The Compatibility renderer captured the real app at an exact 1920x1080 GPU
viewport. The accepted set contains:

- 19 complete UI-journey frames;
- 3 gameplay frames for every cartridge: start, action, and late state;
- 66 gameplay frames total;
- 22 exact box covers;
- 7 labeled contact sheets: one UI journey and six cartridge sheets.

`tools/game_deck/build_companion_contact_sheets.py` re-read every artifact,
verified every frame was 1920x1080, verified the expected cover for each game,
and performed the no-purple image gate:

```text
CONTACT SHEET CHECK PASS: 19 UI + 66 gameplay frames, 22 covers, no purple
```

The machine-readable mapping is
`game_deck_companion/manifest.json`. The full journey is
`game_deck_companion/contact_sheets/00_ui_journey.jpg`; cartridge sheets
`01_games_01_04.jpg` through `06_games_21_22.jpg` pair each box cover with its
three real gameplay frames and lore description.

## Automated verification

The final serial companion regression ran 25 independent Godot scenes and 755
assertions. It includes the release data, isolated save, shelf, inspector,
transition, complete app flow, feature-tag boot route, export contract, both
exact platform catalogs, all twenty-two launch rows, bot-fill policy, ledger,
save, input, controls, licenses, clean-room boundaries, RUST RUNNERS, BLACK
GRID, and the shared shooter controls/kernel.

```text
COMPANION_REGRESSION: PASS - 25 suites, 755 checks, DRIVN save restored byte-for-byte
```

The user's existing `%APPDATA%/Godot/app_userdata/DRIVN/drivn.save` was hashed
before the run, restored in `finally`, and verified byte-for-byte afterward.
Both hashes were:

```text
C7E1F4A055444571A1D034E082EF8D76F4A09E52895FB449DB6307FBF59AE01C
```

The final exported EXE was then launched a second time, independently of the
build script, through its private packaged-app smoke route. It returned exit
code 0, printed 14 passing checkpoints, produced an empty stderr file, and
contained zero warning or error lines. That proof covers all twenty-two packed
cover textures, shelf boot, handheld launch/no-bot policy, console launch/stock
AI policy, cartridge ejection, and the dedicated save envelope.

The ordinary `PLAY.bat` was also launched after the companion export. It
created a separate responsive window titled `DRIVN (DEBUG)` using
`res://proto3d/proto3d.tscn`; only that specifically identified verification
process was closed. The main DRIVN front door remains intact.

The export log contains four existing Dialogue Manager invalid-UID fallback
warnings while importing editor add-on scenes. Godot resolves each by its text
path. They do not occur in either exported-app smoke; both packaged smokes have
zero warnings and zero errors.

## Provenance and legal boundary

All shipped cartridge covers, runtime visuals, maps, units, names, prose, and
presentation are original DRIVN work. MIT-derived rules and implementation
references are pinned in `game/data/game_sources.json`; full texts and change
records ship under `game/third_party/licenses/` and are surfaced in each
cartridge's About screen and in `game/THIRD_PARTY_NOTICES.md`.

RUST RUNNERS uses eligible OpenSoldat MIT implementation knowledge while
excluding the Soldat mark and all upstream base maps, sprites, art, audio,
branding, names, and prose. BLACK GRID is a clean-room implementation of
documented player-facing genre behavior: no Infantry Online or FreeInfantry
code, maps, zone files, art, audio, names, text, branding, or proprietary data
was copied or imported. "Nearly 1:1" therefore applies to the approved control,
response, tactical-verb, physics, mode, and match-rhythm inventories—not to
protected expression.

## Reproduction commands

```powershell
tools\game_deck\run_companion_regressions.ps1

& 'C:\Users\taskm\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' `
  'tools\game_deck\build_companion_contact_sheets.py'

BUILD_GAME_DECK.bat
```

`BUILD_GAME_DECK.bat` imports source assets, runs the companion and shared
release gates, exports only the `Windows Game Deck Companion` preset, verifies
the artifact threshold, launches the packaged smoke route, and prints the
final SHA-256.
