# Release-readiness pass 1 — measured improvements, not certification

Date: 2026-09-05. Isolated branch: `codex/america-foundation`.

This pass addresses reproduced lighting defects, two kinds of road/building
overlap, and a portable Windows evaluation workflow. It does **not** establish
100% completion, AAA quality, authenticated MMO service, or public-distribution
clearance. The earlier 264-scene failed sweep remains part of the record.

## Lighting

The original cottage capture had clipped daylight surfaces and almost black
midnight surfaces. Isolating the vision overlay, sun and environment showed that
the vision shader was not brightening the image. Filmic/default-white grading
and direct light caused the daytime loss; full sky contribution bypassed the
intended ambient night floor. Godot's [Environment reference](https://docs.godotengine.org/en/4.5/classes/class_environment.html)
documents the latter interaction.

The Compatibility renderer now uses range-controlled linear grading and
`world_lighting.json` rows for sun and moon-weighted ambient fill. Twilight,
sun color and sky/fog palettes blend continuously. Deep-night gameplay sight
ranges are unchanged: new moon 0.4, full moon 0.75.

Regression development retained genuine failing controls: original render
16 passed / 5 failed; linear-only 17 / 4; initial palette review exposed a
0.280 maximum minute-to-minute RGB jump. The corrected state sweep reports
7 / 0 and maximum RGB jump 0.017. The rendered checks use the real cottage,
normal camera and physical movement onto the porch, not a studio substitute.

The test's fixed cottage crop measures near-white clipping, mean luminance and
90th-minus-10th percentile detail. These are bounded regression checks, not
a perceptual quality score or proof for every material, monitor and location.
Missing/malformed lighting configuration fallback is implemented but does not
yet have dedicated negative-fixture coverage.

## Road clearance

Runtime anonymous city ruins now reserve every nearby rendered road segment,
including widths and extended ends, local streets, and authored footprints.
The Seattle regression changed from five generated colliders with one road
overlap to four with zero overlaps. Named buildings and loot were not deleted.
The focused runtime suite improved from 11 passed / 15 failed to 26 / 0.

Town generation defers building placement until exit and road geometry is
final. A bounded, deterministic repair moves only eligible generated Peach
Combine Depot rows. Independent review confirmed exactly 16 position-only
changes among 2,459 placements, with stable IDs, payloads, ordering and roads.
After the geometry corrections below, review also caught that this preliminary
16-row migration was stale. Recomputing from the original `677241b` map with
the final planner gives **15 nearest-first position-only moves**, maximum
30.806 m, including restoration of an unnecessarily moved building. Independent
readback confirms exact planner output and no unrelated changes. The repair stages all changes in memory before
applying them; its file write is not a power-failure-safe transaction.

Independent review additionally caught road-end extensions and default exit
lane widths missing from the first JavaScript implementation. Both now have
failing-then-passing fixtures. The final helper uses the actual extended road
rectangle, not an overly conservative end-circle. All 13 Node tests pass;
Peach's subsequent repair dry-run proposes zero moves.

This does not certify every settlement or biome. The new 20-location real
camera sweep still shows unfinished street ends, oversized signs and sparse
blockout art. District generation, other biome clutter, terrain seams and
countrywide driveability remain separate work.

## Evidence handling

`release-pass-1/` contains the initial focused raw logs. An initial
`focused-results.json` was discarded: an empty-stderr aggregation bug produced
null/stale rows. It was not a successful batch. The corrected sequential
reruns are retained as `final-<scene>.stdout.log` and `.stderr.log`.

| Final check | Passed / failed | Diagnostics |
|---|---:|---|
| Runtime road clearance | 26 / 0 | Clean |
| Lighting state, full 24-hour sweep | 7 / 0 | Clean |
| Road lanes | 26 / 0 | Shutdown resource leaks |
| World | 11 / 0 | Clean in batch; shutdown leaks on final-map repeat |
| City layout | 17 / 0 | Clean |
| Town grid | 10 / 0 | Clean |
| Roadstead jobs / home loop | 71 / 0 | Clean |
| Vision | 6 / 0 | Shutdown resource leak |
| Vision reach | 8 / 0 | Clean |
| Weather effects | 12 / 0 | Shutdown resource leak |
| Feel | 9 / 0 | Shutdown resource leaks |
| Darkness | 17 / 0 | Shutdown resource leak |
| Real-GPU cottage lighting | 21 / 0 | Clean |
| Real-GPU vision characterization | 12 / 0 | Clean |
| Map generation / bounded migration, Node | 13 tests / 0 | Clean |

All 12 headless scenes exited 0 without watchdog termination: **220 assertions
passed**, with shutdown diagnostics in five scenes. This is a focused pass,
not a new whole-game sweep and not an all-clean runtime certification. After
the final 15-row migration, world/city/town were repeated; that world repeat
reported two resources still in use at shutdown. This nondeterministic cleanup
diagnostic remains unresolved, not hidden by the earlier clean run.

Final real-render measurements (near-white fraction / mean / detail): noon
0.001 / 0.649 / 0.436; dusk 0 / 0.245 / 0.336; new moon 0 / 0.135 / 0.109;
full moon 0 / 0.178 / 0.129. Original noon was 0.373 / 0.906; original new-moon
mean was 0.002 with zero measured detail. Before frames retain their originally
frozen HUD time; final frames update the HUD to the tested time.

See the unedited [final daytime frame](../renders/lighting/verified/noon_gameplay.png),
[new-moon frame](../renders/lighting/verified/new_moon_gameplay.png),
[Seattle exit](../renders/world/release-pass-1-final/seattle_city_exit.png) and
[Peach town](../renders/world/release-pass-1-final/town_downtown.png). All 20 world
photobooth outputs exist, are nonempty, and reported successful PNG writes.
The final photobooth reports one resource still in use at shutdown; the
captures are valid, but that run is not diagnostically clean. As a world
survey it allows the live clock/camera to evolve; only the lighting fixture
locks its comparison conditions.

## Portable packaging regression

The original preset exported an executable but omitted raw license/notice
files. Running the new acceptance scene **inside that embedded executable**
produced 28 passed / 30 failed. It also revealed that cartridge cover checks
incorrectly used raw-file existence for imported WebP resources. The real
title and NEW GAME keyboard transition already passed that baseline run.

The corrected preset explicitly includes required notices; cover validation
uses Godot resource existence, with all cover textures loaded in the packaged
acceptance check. The fresh build workflow retains logs, uses an isolated
evaluation profile, extracts engine notices from the actual runtime, and
refuses to create the zip unless packaged acceptance passes. It performs no
downloads, signing or upload. Editor recovery mode avoids unrelated plugin
startup/update traffic during export.

Two subsequent build attempts were correctly rejected before ZIP creation:
recovery mode exposed an editor-only Dialogue Manager widget calling a disabled
tool-script method; then a functionally passing 84-check rendered smoke emitted
three resource leaks at shutdown. The preset now mirrors the addon's editor
widget exclusions while retaining runtime dialogue dependencies. The harness
explicitly frees its own main scene, checks a weak reference after four frames,
and defers final quit until coroutine locals release. A source-render probe
reports 84 passed and the single **expected** editor-not-template rejection,
with clean stderr. The intermittent leak's exact resource cause was not proven;
the exported candidate still must pass the unchanged strict diagnostic gate.

Source-side cartridge regressions also pass cleanly: registry 19 / 0, license
12 / 0, covers 15 / 0. Independent reviews accepted lighting, runtime ruins,
final map geometry/migration and packaging/harness changes within their scopes.
These reviews are not whole-game or redistribution approvals.

## Accepted portable local candidate

Built successfully from clean commit `02d4187a823a05206882e3d39d9210955891e9df`:
`DRIVN-0.14.0-02d4187a-20260906-033457-655-a70b5d-win64-local-rc`.
The manifest records zero dirty entries before and after the build. Build exit
0; actual exported/rendered acceptance **85 passed / 0 failed**, clean stderr.
Import/export retain pre-existing addon UID fallback warnings, not errors.

The ZIP was then extracted to a fresh temporary directory **outside the
repository**. All **35 payload hashes** matched. The extracted executable was
run from its own extracted folder, with no source project path and fresh
profiles: headless **83 / 0**, rendered **85 / 0**, both exit 0 with empty stderr.
This verifies packaging independence on this Windows machine, not a separate
clean-machine or broad hardware certification. Exact acceptance, manifest,
captures and repeat logs are in [packaging-green/](release-pass-1/packaging-green/).

- ZIP: 180,473,848 bytes (about 180 MB).
- ZIP SHA256: `5ab0c83af15e6ba5d11714a23e712ec59591f6a2979635296e045b3b5b74c63c`.
- Executable SHA256: `00ecb71aaeefb996593766a86168ae6e80edc7915cb9d6c9e38bc528a1c85f34`.
- Local artifact: `build/DRIVN-0.14.0-02d4187a-20260906-033457-655-a70b5d-win64-local-rc/DRIVN-0.14.0-02d4187a-20260906-033457-655-a70b5d-win64-local-rc.zip`.
- Play: extract the whole ZIP and double-click **PLAY_DRIVN.bat**. Godot is
  embedded in the executable; the evaluation launcher keeps saves separate.

This is **unsigned and local-evaluation-only**. The packaged checks establish
availability of 22 cartridge interfaces/covers, four homestead models and
required rows/notices/fonts, plus real title/NEW GAME input and owned-scene
cleanup. They are not 22 complete game playthroughs, controller certification,
a finished MMO, or asset redistribution clearance. The earlier rejected builds
and intermittent shutdown diagnostic remain recorded; these clean repeats do
not certify every shutdown path in the full game.

## Remaining release gates

- Dedicated authenticated authority with two independent clients, persistence,
  reconnect/revocation, movement/combat/economy validation, and restart proof.
- Nationwide authored encounters, progression, home uses and item sinks;
  regional travel and meaningful repeatable play beyond the local job loop.
- Countrywide geometry/driveability audit and a coherent final art, animation,
  lighting, audio and UI pass; controller and accessibility playtesting.
- Resolve the recorded whole-game failures and diagnostics, then rerun the full
  suite plus measured frame/load budgets, long-session soak and save recovery.
- Asset provenance review, signed installer/build, clean-machine validation,
  hosting/backups/moderation/abuse operations, and external player testing.

A portable local evaluation build is not a substitute for those gates.
