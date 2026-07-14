# DRIVN: GAME DECK Companion Design

Date: 2026-07-14

Status: approved production direction

## Goal

Ship the twenty-two Game Deck cartridges as a polished, distributable Windows
companion game that can be downloaded and played without launching the DRIVN
world. The companion must make the relationship to DRIVN unmistakable while
remaining a complete single-player product rather than a debug menu, gallery,
or technology demo.

The release artifact is one Windows executable:

```text
build/DRIVN-Game-Deck.exe
```

The product name shown by Windows and inside the application is `DRIVN: GAME
DECK`. Its persistent subtitle is `A DRIVN COMPANION`.

## Chosen architecture

Use one canonical Godot project and one canonical Game Deck runtime. Add a
feature-tagged companion entry point and a second Windows export preset to the
existing project. Do not copy or fork the cartridge implementations into a
separate project.

A tiny boot router becomes the exported-project entry scene:

- an export containing the `game_deck_companion` feature opens the companion;
- every normal DRIVN launch opens `res://proto3d/proto3d.tscn`; and
- the source `PLAY.bat` remains an explicit direct launch of the DRIVN scene.

The companion instantiates the existing `ProtoGameDeck`, registry, score
ledger, semantic input router, cartridge scenes, cover-card component, and
shell presentation. It adds only companion ownership, navigation, branding,
save, and packaging policy. A fix to a cartridge, shared control, aspect ratio,
cover, source notice, or help surface therefore benefits both products.

## Release scope

The first companion release is deliberately single-player:

- all ten handheld cartridges start with one human seat;
- all twelve console cartridges start with one human seat and their maximum
  supported stock AI roster;
- no local lobby, second human seat, host, join, matchmaking, invitation,
  spectator, or internet session UI appears;
- challenge and house leaderboard material remains clearly labeled as offline
  comparison content; and
- no screen implies simultaneous human multiplayer is available in this
  companion build.

The cartridge rules remain stock. The companion may choose player/AI seats and
launch context, but it may not add companion-only cheats or mutate internal
game state.

## Player journey

### 1. Boot identity

The application opens on a short, skippable two-beat boot:

1. `DRIVN` appears over a dark road-line horizon; and
2. `GAME DECK // A DRIVN COMPANION` powers on beneath it.

The boot lasts no more than 2.2 seconds and skips immediately on keyboard,
mouse, or controller input. It never repeats when returning from a cartridge.
The next screen is the live cartridge shelf, not another title-menu gate.

### 2. The cartridge shelf

The shelf is an art-first library containing the twenty-two real catalog
games plus one visually distinct DRIVN promotional card. The promotional card
is not counted as a cartridge and cannot enter scores, ownership, controls, or
game launch paths.

The default `ALL` filter shows:

- `POCKET GAME DECK // 10`;
- `SAFEHOUSE CONSOLE // 12`; and
- one `DRIVN // THE FULL WASTELAND` promotional card after the games.

Pill filters switch between `ALL`, `HANDHELD`, and `CONSOLE`. Keyboard arrows,
mouse, and controller can focus every card. Each game card preserves its final
box or label art without stretching or cropping, shows title and aspect, and
uses a restrained focus halo plus physical lift rather than obscuring the art.
No cartridge is locked in the companion.

The shelf header permanently carries `DRIVN: GAME DECK` and `A DRIVN
COMPANION`. The footer exposes `SELECT`, `CONTROLS`, `ABOUT DRIVN`, `FULLSCREEN`,
and `QUIT` with live keyboard/controller labels.

### 3. Box inspection

Selecting a game does not instantly dump the player into a running scene. It
opens a focused cartridge-inspection surface:

- large, uncropped final cover art;
- exact title, platform, screen aspect, and score direction;
- one-sentence play objective from catalog `help`;
- in-world provenance from `about_world`;
- `SINGLE PLAYER` and `AI OPPONENTS` capability badges where true;
- the live control summary for that row's `controls_profile`;
- `INSERT CARTRIDGE` as the primary action; and
- `BACK TO SHELF` as the secondary action.

The inspection surface is the packaging moment. Square, portrait, landscape,
and 2:3 box covers occupy format-aware wells and are never normalized into one
crop.

### 4. Cartridge changing

`INSERT CARTRIDGE` performs a real, brief device ritual before play:

1. the selected package shifts forward;
2. an original cartridge or memory-card silhouette bearing the same cover art
   slides from the package;
3. the universal deck slot opens;
4. the cartridge enters, contact lights chase once, and the display boots; and
5. the real cartridge viewport replaces the boot screen.

The sequence lasts 0.9 to 1.25 seconds and can be fast-forwarded after its
first half without skipping initialization. It is built from deterministic
2D transforms, masks, lights, and the checked-in cover—not a prerendered video
and not twenty-two bespoke code paths.

While playing, `ESC` or controller Start opens the existing Game Deck shell
menu. `CHANGE CARTRIDGE` stops the current match through
`ProtoGameDeck.stop("companion_eject")`, commits the companion score/save,
plays the reverse slot/eject beat, and returns focus to the same cover on the
shelf. `RESTART` launches a new stock seed. `CONTROLS`, `HELP`, `ABOUT`, and
`SCORES` retain their shared runtime content.

Quitting while a cartridge is running uses the same orderly eject/save path.
There is no abandoned background match and no hidden DRIVN world simulation.

## DRIVN full-game promotional placeholder

The user's requested placeholder is a finished promotional surface, not empty
coming-soon scaffolding.

The shelf card reads:

```text
DRIVN
THE FULL WASTELAND
GAME DECK LIVES INSIDE THIS WORLD
```

It uses original DRIVN key art: a top-down armed road machine crossing the
Divided States at dusk, a distant safehouse and drive-in glow, and a small
handheld/console light inside the vehicle. It shares the companion's printed
ink, bone, amber, rust, and signal-teal language. It contains no external
trademark, fake platform logo, generated lettering, purple, watermark, or
borrowed game art; exact wording is added deterministically after the key art
is accepted.

Opening the card presents:

- `THIS ARCADE IS ONE ROOM IN A MUCH BIGGER WORLD`;
- a concise description of DRIVN as top-down vehicular combat and survival in
  the Divided States of America;
- a small feature strip for road survival, vehicles, crew/dogs, safehouses,
  media, and the Game Deck itself;
- `FULL GAME IN DEVELOPMENT`; and
- an optional `FOLLOW DRIVN` link driven by companion release data.

When no release URL is configured, no dead or placeholder button is rendered.
The release-data row owns the URL so adding the public destination later does
not require UI code.

Every boot, shelf, inspection, pause, About, and quit surface retains at least
one visible DRIVN identity mark. The companion never presents the cartridges
as an unrelated arcade bundle.

## Presentation system

Use the existing Game Deck carbon, bone, amber, rust, and signal-teal family;
purple is forbidden. The companion adds subtle road-map contour lines, stamped
system labels, contact-pin light chases, physical card depth, and a low moving
scanline on powered displays. Effects remain restrained enough for cover and
gameplay readability.

The primary target is a responsive 16:9 window with a 1280 x 720 minimum and a
1920 x 1080 reference layout. Window resizing and fullscreen preserve the
shell. Game output always uses keep-aspect presentation:

- console and landscape handheld: 16:9;
- square handheld: 1:1; and
- portrait handheld: 9:16.

Letterbox/pillarbox space becomes a deliberate physical bezel. It never
stretches or crops the cartridge viewport.

All actionable controls have hover, focus, pressed, and disabled states. Focus
is never color-only. Text meets readable contrast against the dark surfaces.
Boot and cartridge movement respect a reduced-motion setting that replaces
travel with short fades while preserving the same state transitions.

## Data and save isolation

Add one companion release-data row containing product title, subtitle, build
version, promotional copy, optional full-game URL, and promotional art path.
Game facts continue to come exclusively from `game/data/games.json` and
`game/data/game_devices.json`.

At boot, the companion creates a transient unlock set containing all twenty-two
registry IDs. It does not write those unlocks to DRIVN ownership or save data.

Companion persistence uses:

```text
user://game_deck_companion_save.json
```

It stores schema version, per-game score ledger, last-focused cartridge,
selected shelf filter, volume, fullscreen, reduced motion, and first-insert
ritual state. It never reads or writes the main DRIVN save. Corrupt companion
data is renamed with a `.bad` suffix, a fresh save is created, and the shelf
still opens with all cartridges playable.

The shared rebind system remains available. Companion changes use the same
Game Deck action IDs as DRIVN so displayed controls and runtime behavior cannot
drift.

## Error handling

- A missing or disabled cartridge remains visible with its cover darkened and
  `CARTRIDGE UNAVAILABLE`; inspection explains the registry error and launch is
  disabled.
- A missing cover uses the established deterministic fallback card and fails
  the focused release test.
- A cartridge launch error stays inside the shell with `BACK TO SHELF`; it does
  not crash the executable.
- A failed save reports one nonblocking warning and keeps the current session
  playable.
- A missing optional promotional URL simply omits the link.
- Missing required promotional art or legal/source notice fails the companion
  export gate.

## Windows packaging

Add a second export preset named `Windows Game Deck Companion` with:

- custom feature `game_deck_companion`;
- output `../build/DRIVN-Game-Deck.exe`;
- embedded PCK;
- x86-64 Windows release template;
- product name `DRIVN: GAME DECK`;
- file description `A standalone arcade companion to DRIVN`;
- Machine Kings Media company metadata;
- the companion icon and version synchronized with project release data; and
- no debug console wrapper in the public artifact.

`BUILD_GAME_DECK.bat` performs import, focused tests, release export, artifact
existence/size verification, and a launch smoke test. It must fail loudly when
the template, a required resource, a source notice, or the executable is
missing. The result is ready to zip and upload to a storefront or download
page without the repository or local Godot installation.

The initial release prioritizes correctness over speculative micro-trimming,
then records the real executable size. Packaging may exclude world-only assets
only after an exported-build test proves all twenty-two dynamically loaded
cartridge scenes, covers, fonts, data rows, notices, and shared scripts remain
present. No size optimization may silently remove a game.

## Testing contract

Focused Godot sims must prove:

- the boot router selects DRIVN without the feature and companion with it;
- the companion registry contains exactly twenty-two playable games;
- every game is transiently unlocked without modifying a DRIVN save fixture;
- shelf order contains ten handheld games, twelve console games, then one
  non-cartridge DRIVN promo card;
- every game card shows loadable, keep-aspect cover art;
- selecting a cover opens inspection before launch;
- inspection copy, badges, and controls match the catalog/input router;
- `INSERT CARTRIDGE` performs the shared state sequence and launches through
  the real deck;
- handheld games start one human, while console games start one human plus the
  declared maximum stock AI roster;
- no lobby, host, join, invitation, or second-human action is reachable;
- `CHANGE CARTRIDGE` stops, saves, ejects, and restores focus to the same card;
- square, portrait, and landscape cartridge viewports remain keep-aspect;
- the promo card never appears in the registry, ledger, or score counts;
- optional URL absence produces no dead button;
- companion save round-trip preserves scores/settings/focus and never touches
  the DRIVN save fixture;
- corrupt companion save recovery opens a playable shelf; and
- missing cartridge/cover/promo/legal resources fail or degrade according to
  the explicit error contract.

Retain the existing Game Deck registry, catalog, shell, cover, input, handheld,
console, lobby-policy, license, clean-room, Phase 2 flagship, and complete
catalog suites. The normal DRIVN launch and export path require a regression
smoke test after the boot router lands.

GPU visual proof must capture and inspect:

1. branded boot at 1920 x 1080;
2. full 22-cover shelf plus DRIVN promotional card;
3. square handheld inspection;
4. portrait handheld inspection;
5. 2:3 console-box inspection;
6. cartridge insertion at package, slot, and powered-screen beats;
7. live 1:1, 9:16, and 16:9 games in their bezels;
8. change-cartridge eject and restored shelf focus;
9. the DRIVN full-game promotional surface; and
10. reduced-motion equivalents.

The exported `DRIVN-Game-Deck.exe` itself must be launched outside the editor.
An automated smoke driver opens the library, launches one handheld game and
one AI-filled console game, returns to the shelf, validates the dedicated save,
and exits cleanly.

## Completion gate

The companion is complete only when the single Windows executable builds,
launches without Godot or the repository, visibly identifies itself as part of
DRIVN, shows all twenty-two real covers, provides polished inspection and
cartridge insertion/ejection, runs every game through the canonical runtime,
keeps all output ratios correct, fills console opposition with stock AI,
persists only companion data, exposes no multiplayer UI, passes focused and
regression tests, passes exported-executable smoke testing, and has accepted
GPU evidence for the entire player journey.
