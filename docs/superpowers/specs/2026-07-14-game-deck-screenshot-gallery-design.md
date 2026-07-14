# Game Deck Screenshot Gallery Design

Date: 2026-07-14

Status: approved production direction

## Goal

Deliver a complete, owner-reviewable presentation of the twenty-two playable
Game Deck cartridges: the existing box or cartridge cover, the exact game
name, a concise in-world description, multiplayer capability, controls, and
three real gameplay screenshots for every title.

The package must make it easy to judge the whole collection at once and to
open any one game at full size. It is documentation and proof of the playable
software, not concept art. Every gameplay image must come from the real Godot
cartridge scene.

## Chosen package

Produce both formats the owner requested to see:

1. an offline HTML gallery containing all twenty-two games, grouped into
   Pocket Game Deck and Safehouse Console families; and
2. twenty-two standalone presentation sheets, one per game, suitable for
   opening or sharing without the gallery.

Each game entry and sheet contains:

- exact catalog title and platform;
- the existing final cover art;
- three gameplay screenshots labeled `OPENING`, `MID-RUN`, and `MONEY SHOT`;
- the catalog help text and in-world provenance;
- screen aspect, player count, AI, local-play, and network mode badges;
- a plain-language multiplayer explanation; and
- the keyboard/mouse and controller control summary for its control profile.

The gallery is a static artifact with no web server, external font, CDN,
analytics, or network requirement. Opening `index.html` is enough.

## Visual direction

The gallery should feel like a recovered mail-order cartridge catalog: carbon
black, warm bone, oxidized amber, faded signal teal, and restrained emergency
red. Purple is forbidden. The established Game Deck cover art remains the
visual star.

Cards have clear hover and keyboard-focus states, subtle depth, ten-pixel
corners, readable system labels, and no generic gray dashboard treatment. The
console and handheld families share one visual language but retain their own
headings and hardware labels.

Gameplay frames are always shown with `object-fit: contain` behavior against a
dark art well. A 1:1, 9:16, or 16:9 image is never stretched, cropped, or
forced into another ratio. Safehouse Console games remain 16:9. Pocket Game
Deck games retain the aspect declared by their catalog row.

Each standalone sheet uses a landscape 1920 x 1080 canvas. Cover art occupies
the left rail; the three true-ratio gameplay frames occupy the main field; and
title, description, multiplayer, aspect, and controls occupy a protected text
band. Portrait and square captures receive deliberate letterboxing rather than
cropping.

## Screenshot truth contract

All sixty-six gameplay images come from the real running cartridge output.
They must not use AI generation, reconstructed UI, hand-painted mockups,
teleports, debug geometry, or a fake screenshot frame.

A reusable Godot capture harness loads each cartridge through the shared Game
Deck runtime, starts it with its normal lifecycle, sends semantic inputs
through the cartridge input contract, waits real process frames, and reads the
cartridge `SubViewport` texture. The harness uses a fixed seed and a checked-in
capture choreography manifest so output is reproducible.

The three frames prove different states:

1. `OPENING` shows the recognizable starting board, arena, course, or match;
2. `MID-RUN` shows meaningful play after a short deterministic input sequence;
   and
3. `MONEY SHOT` shows the strongest readable action state the deterministic
   sequence can produce: combat, scoring pressure, near-landing, dense puzzle,
   objective contest, or equivalent spectacle.

The two Phase 2 titles must visibly demonstrate their golden-goose identities:
`RUST RUNNERS` needs a busy side-view jet-belt firefight, and `BLACK GRID`
needs a readable top-down squad/vehicle objective fight. Multiplayer games run
with their stock AI roster so the screenshots show an actual contested match,
not an empty arena. Single-player games remain single-player in the capture;
their challenge/leaderboard capability is described in metadata rather than
misrepresented as live multiplayer.

The harness captures only the game display, not the capture tool or editor.
Final WebP files preserve the native viewport ratio and are large enough to
inspect at 1:1 display size.

## Capture choreography

The capture manifest stores three ordered, semantic action sequences per game.
Actions use the same shared verbs available to real keyboard/mouse and
controller players: move, aim, primary, secondary, confirm, cancel, weapon
cycle, and profile-specific verbs. Pointer titles receive deterministic
viewport coordinates expressed as normalized positions.

The manifest may vary timing and actions by game because a chess position, a
pinball table, a racing course, and a twin-stick firefight do not reach a good
frame the same way. It may not mutate internal cartridge state merely to make a
picture. Fixed seeds, stock rules, and stock AI keep the set repeatable.

Capture runs use the Compatibility renderer in a real GPU window. The harness
waits several rendered frames after launch and before every texture read, and
restores any engine timing state it changes.

## Output structure

The committed review package lives under:

```text
docs/verification/game_deck_gallery/
  index.html
  gallery.css
  gallery.js
  manifest.json
  screenshots/
    <game_id>_01.webp
    <game_id>_02.webp
    <game_id>_03.webp
  sheets/
    <game_id>.webp
  GAME_DECK_GALLERY_CONTACT_SHEET.webp
```

The gallery references the checked-in covers at
`game/assets/game_covers/<game_id>.webp`; it does not duplicate them. All paths
are relative so the artifact remains portable with the repository.

`manifest.json` is generated from `game/data/games.json` plus the capture
choreography. It is the single source for gallery cards, sheets, accessible alt
text, badges, and file validation. The checked-in HTML, CSS, and JavaScript are
small deterministic output with no build-time framework.

## Descriptions and multiplayer language

The main description combines the existing `help` and `about_world` fields so
the gallery explains both what the game is and why it exists inside DRIVN.
Copy remains exact or deterministically formatted; the gallery generator does
not invent a second lore source.

Multiplayer labels translate catalog data consistently:

- `challenge`: single-player run with score/time comparison and leaderboard
  challenge support, not simultaneous play;
- `same_session` plus `local`: players in the same DRIVN session can join the
  match; local players must be at the same in-world device, while networked
  players use the shared lobby/session path;
- `ai: true`: empty human slots can be filled by stock AI; and
- player minimum/maximum: the supported active roster, never an inferred
  marketing number.

Controls come from the catalog control profile and the shared control-label
contract. The text names both keyboard/mouse and controller equivalents and
must agree with the in-game controls/menu surfaces.

## Deterministic compositor

A repository tool builds optimized screenshot WebP files, presentation sheets,
the contact sheet, manifest, and HTML assets. It reads the JSON catalog and
never requires manually copying game titles or capabilities. Temporary raw PNG
captures may live outside `res://` during the build, but only optimized review
artifacts are committed.

The compositor uses the redistributable Game Deck font already stored in the
repository, with a system fallback for the HTML viewer. Text is rendered by the
compositor rather than baked by an image model. Re-running the tool from the
same catalog, manifest, and captures must produce the same content.

## Testing contract

Add focused validation before producing the final package. It must prove:

- the catalog contains exactly twenty-two unique game IDs;
- every game has one loadable cover and exactly three captured frames;
- exactly sixty-six screenshot files and twenty-two sheet files exist;
- each screenshot has the expected 1:1, 9:16, or 16:9 ratio within a one-pixel
  tolerance;
- every screenshot is nonblank and differs materially from that game's other
  two frames;
- every game appears once in the generated manifest and gallery;
- title, description, player count, network mode, aspect, and controls are
  present for every entry;
- every local asset reference resolves with the gallery opened from disk; and
- the contact sheet contains all twenty-two named sheets.

Run the existing Game Deck registry, shell, input, handheld catalog, console
catalog, lobby, cover, license, and complete-suite sims after the focused test.

Visual review must inspect all twenty-two sheets through the contact sheet and
open at least one raw frame from each aspect family. Check for blank viewports,
duplicate frames, unreadable action, incorrect title, clipped cover art,
stretched gameplay, forbidden purple, missing controls, and misleading
multiplayer claims.

## Completion gate

The request is complete only when the branch contains all sixty-six real
screenshots, all twenty-two standalone sheets, the browsable offline gallery,
the contact sheet, the deterministic capture/composition tools, passing focused
and regression tests, and visual proof that every title is named, described,
covered, and shown in three distinct playable states.
