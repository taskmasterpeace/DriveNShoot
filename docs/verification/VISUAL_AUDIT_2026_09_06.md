# DRIVN — visual audit and screenshot gallery

2026-09-06 · isolated `codex/america-foundation` checkout

20 final, unretouched runtime screenshots were captured and inspected. The road-trip premise and shared device UI are clearer after this pass. **I would not sign off the world or cartridge art as finished/AAA.** The remaining visual gaps are listed per image below, rather than hidden behind passing tests.

The audit followed [ENGINE](../ENGINE.md), [WORLD_PILLARS](../WORLD_PILLARS.md), and [UI_DESIGN_LANGUAGE](../design/UI_DESIGN_LANGUAGE.md): continuous readable roads, meaningful places to stop, visible interactions, amber/bone/ink panels, controller focus and reliable exits. The debugging, test-first and independent-review skills drove the reproduce → fix → retake sequence; they also caught controller problems that screenshots alone could not establish.

## What changed

- Corrected starter registration: New Game enters the highway Scavenger at `(2.5,390)`. The Meridian sedan keeps its own lock/loot; the motor-pool motorcycle is no longer accidentally locked.
- Streamed every nearby road segment, not only the nearest leg of each road. The missing I-40 asphalt at an internal vertex is repaired without changing traffic/GPS nearest-road semantics.
- Rebuilt the title bezel and explicit Controls/Options ownership, focus restoration and close paths. Fixed the clipped first Controls row and clicking close during a key/pad rebind.
- Blocked local car/foot/aim/zoom/wait polling in the covered modal flows without pausing the world or changing AI driver ownership. Added the missing A/✕ UI-confirm action while preserving Enter, keypad Enter and Space.
- Made the backpack opaque, padded, focusable and closable by pointer/Esc/B/keyboard pack toggle. D-pad Down navigates instead of closing; using the handheld yields focus to GameDeck. Solo THEIRS is hidden and transaction feedback remains visible.
- Bounded the cartridge shelf to its actual available width. Covers reflow on resize, preserve ratios, and keep a lower focused card visible; vertical controller navigation skips locked cards.

## Before / after

### The road gap

Before: one nearby leg was omitted entirely.

![Before — missing I-40 geometry](D:/git/carworld/.worktrees/america-foundation/docs/renders/visual-audit-2026-09-06/before/06_appalachian_highway.png)

After: both carriageways continue through the photographed bend.

![After — continuous I-40 geometry](D:/git/carworld/.worktrees/america-foundation/docs/renders/visual-audit-2026-09-06/after/06_appalachian_highway.png)

### Cartridge shelf

Before: the library extended off the right side of the screen.

![Before — clipped shelf](D:/git/carworld/.worktrees/america-foundation/docs/renders/visual-audit-2026-09-06/before/15_console_library.png)

After: the full four-column shelf fits.

![After — bounded cartridge shelf](D:/git/carworld/.worktrees/america-foundation/docs/renders/visual-audit-2026-09-06/after/15_console_library.png)

## All 20 pieces — click any name for the original PNG

| Piece | Judgment | Review |
|---|---|---|
| [Title screen](D:/git/carworld/.worktrees/america-foundation/docs/renders/visual-audit-2026-09-06/after/01_title.png) | Fixed | Opaque ink and amber framing stop gameplay HUD bleed. Still a restrained terminal screen, not a finished cinematic front end. |
| [Controls and rebinding](D:/git/carworld/.worktrees/america-foundation/docs/renders/visual-audit-2026-09-06/after/02_title_controls.png) | Fixed | Readable first row, visible close, keyboard/pad focus, capture cancellation and pointer close now work. |
| [Options](D:/git/carworld/.worktrees/america-foundation/docs/renders/visual-audit-2026-09-06/after/03_title_options.png) | Fixed | Appears above the title and returns focus correctly. Settings remain functional; visual hierarchy could be more distinctive. |
| [New Game / driving HUD](D:/git/carworld/.worktrees/america-foundation/docs/renders/visual-audit-2026-09-06/after/04_new_game_highway.png) | Fixed | Starts in the intended road car, not the motor pool. The road-trip premise is finally visible at launch; surrounding terrain is still sparse. |
| [Meridian safehouse and residents](D:/git/carworld/.worktrees/america-foundation/docs/renders/visual-audit-2026-09-06/after/05_meridian.png) | Needs art pass | Building functions and residents are visible, but floating labels compete, crowds feel arranged, and the street lacks authored detail. |
| [Appalachian I-40 bend](D:/git/carworld/.worktrees/america-foundation/docs/renders/visual-audit-2026-09-06/after/06_appalachian_highway.png) | Fixed | Both incoming carriageways now have continuous asphalt at the photographed bend. Trees, shoulders and material transitions remain visibly provisional. |
| [Colorado I-25](D:/git/carworld/.worktrees/america-foundation/docs/renders/visual-audit-2026-09-06/after/07_colorado_highway.png) | Needs art pass | Settled camera shows the actual road instead of a teleport-smoothed horizon. Regional landmarks and terrain detail still need authorship. |
| [Road Office exterior](D:/git/carworld/.worktrees/america-foundation/docs/renders/visual-audit-2026-09-06/after/08_road_office.png) | Needs layout pass | The kiosk is recognizable, but sits in too much empty ground. It needs a believable forecourt, access path and surrounding activity. |
| [Freight desk / road jobs](D:/git/carworld/.worktrees/america-foundation/docs/renders/visual-audit-2026-09-06/after/09_freight_desk.png) | Functional | Clear local funds, job choices and close controls. Green panel styling and unused space are less cohesive than the amber/ink device grammar. |
| [Roadstead cottage exterior](D:/git/carworld/.worktrees/america-foundation/docs/renders/visual-audit-2026-09-06/after/10_home_porch.png) | Promising asset | Porch, roof and mailbox read as a place to own. The repeated plots and bare ground do not yet feel like a lived-in neighborhood. |
| [Walk-in cottage interior](D:/git/carworld/.worktrees/america-foundation/docs/renders/visual-audit-2026-09-06/after/11_home_inside.png) | Functional | Real movement through the doorway reveals the cutaway interior. Furniture density, room lighting and front-wall visibility need another pass. |
| [Backpack](D:/git/carworld/.worktrees/america-foundation/docs/renders/visual-audit-2026-09-06/after/12_backpack.png) | Fixed | Opaque padded panel, focused item actions and close controls. Solo view no longer shows an empty THEIRS column; actual trade/loot behavior is preserved. |
| [Character sheet](D:/git/carworld/.worktrees/america-foundation/docs/renders/visual-audit-2026-09-06/after/13_character_sheet.png) | Needs UI pass | The information exists, but dense prose, a tiny body diagram and background notification bleed fall short of the shared panel standard. |
| [Handheld GPS / route map](D:/git/carworld/.worktrees/america-foundation/docs/renders/visual-audit-2026-09-06/after/14_route_map.png) | Mixed | Physical device framing fits the fiction. Labels pile up around the town and the map needs better hierarchy and scale-aware decluttering. |
| [Console cartridge library / box art](D:/git/carworld/.worktrees/america-foundation/docs/renders/visual-audit-2026-09-06/after/15_console_library.png) | Fixed | All four columns fit, covers keep their aspect ratio, and lower-row controller focus stays visible during resize. Locked/owned states remain real. |
| [WASTE HEAP — handheld 1:1](D:/git/carworld/.worktrees/america-foundation/docs/renders/visual-audit-2026-09-06/after/16_waste_heap_square.png) | Functional | Clear square merge-board layout and score. The shell is coherent; the game art still reads as simple geometric UI. |
| [BUNKER BREAKER — handheld 9:16](D:/git/carworld/.worktrees/america-foundation/docs/renders/visual-audit-2026-09-06/after/17_bunker_breaker_portrait.png) | Functional | Portrait playfield is preserved without stretching. The actual game launches; this screenshot is not a full playthrough or balance judgment. |
| [LAST MILE — handheld 16:9](D:/git/carworld/.worktrees/america-foundation/docs/renders/visual-audit-2026-09-06/after/18_last_mile_landscape.png) | Needs game-art pass | Widescreen road view fits the system and fiction, but the vehicle, skyline and HUD remain basic silhouettes. |
| [RUST RUNNERS — console 16:9](D:/git/carworld/.worktrees/america-foundation/docs/renders/visual-audit-2026-09-06/after/19_rust_runners_console.png) | Needs game-art pass | Running arena and combat HUD are visible. The geometry and characters are clearly prototype-level; this is not a visual 1:1 Soldat replica. |
| [Cottage at 23:00](D:/git/carworld/.worktrees/america-foundation/docs/renders/visual-audit-2026-09-06/after/20_home_at_night.png) | Needs lighting pass | Porch light and torch establish darkness, but the interior is too murky and the hard-edged visibility cone looks artificial. |

## Verification and limits

Final focused verification: **14 scenes, 447 assertions passed, 0 assertion failures; all scene exit codes 0.** The set covers starter input/driving, segment/elevation coverage, title/modals, inventory/transactions, controller input, shelf resizing, traffic and physical game-device integration. This is not the whole-game suite.

| Scene | Passed |
|---|---:|
| starter_spawn_sim | 25 |
| road_segment_coverage_sim | 22 |
| title_modal_sim | 49 |
| modal_poll_sim | 16 |
| container_modal_sim | 47 |
| game_shell_layout_sim | 130 |
| menu_sim | 7 |
| options_sim | 23 |
| pad_sim | 15 |
| road_lane_sim | 28 |
| traffic_sim | 34 |
| game_device_sim | 15 |
| game_shell_sim | 22 |
| container_sim | 14 |

The final rendered tour saved and decoded all **20 PNGs at 1280×720**, with the project's normal 1920×1080 logical canvas scaling. Layout regressions separately exercised 1280×720, 1280×800 and 960×720 logical viewports.

**Shutdown is not cleanly certified:** seven final headless scenes emitted resource/RID shutdown diagnostics, and the final rendered tour reported ObjectDB leakage / two resources still in use at exit. The earlier full rendered retake exited without those diagnostics. They are intermittent and remain unresolved; assertion success is not a clean memory/soak certificate. Raw final logs are preserved in this evidence directory.

The real title and New Game use injected UI input. Distant world positions are photographic staging on actual ground/road height, with the normal camera snapped after settling. The cottage interior is entered with movement input. The clock is held at 11:00 for world comparisons and set to 23:00 for the night image. No HUD values, meshes or screenshots were painted over; travel toasts and actual scene clutter remain visible.

The four cartridge photographs use explicit owned-cartridge fixtures and fixed solo seeds in a throwaway profile. Launch and start must succeed or the tour fails. These are not all-cartridge playthroughs, network demonstrations or balance proofs. Baseline images 17–19 show the genuine LOCKED screen because the first photo fixture omitted ownership; their metadata has been corrected. They are not presented as game-art before/after improvements.

Two legacy tests had stale assumptions: the I-35 fixture contains two intersecting segments, so it now checks two distinct 9.2 m slabs; the chest test now selects actual food stock and proves transfer/consumption rather than assuming the first root chest is named Chest or contains meat.

No new artwork was generated in this pass. Existing covers and the existing Blender-authored homestead assets are shown as they are. No paid services, public deployment, merge to main or new Windows package was performed.

## What should be next visually

1. Author the starting settlement: connected walks, believable parking/forecourt space, boundaries, utility details and fewer oversized floating labels.
2. Replace hard-edged visibility lighting with a more coherent world-lighting treatment; improve cottage interior practical lights and night navigation readability.
3. Bring the character sheet, GPS label hierarchy and freight desk into the same readable UI grammar, including smaller-window text scaling.
4. Give the cartridge gameplay original, finished art and animation. The box covers currently promise substantially more visual detail than the running games deliver.

## Play this corrected source

Double-click [PLAY_ROADSTEAD.bat](D:/git/carworld/.worktrees/america-foundation/PLAY_ROADSTEAD.bat). It launches this isolated checkout and uses its separate Roadstead save profile. The previous portable ZIP does **not** contain this pass.

The final capture manifest is [here](D:/git/carworld/.worktrees/america-foundation/docs/renders/visual-audit-2026-09-06/after/manifest.json); the diagnostic scene is [visual_audit.tscn](D:/git/carworld/.worktrees/america-foundation/game/proto3d/tools/visual_audit.tscn).
