# Roadstead habitation — actual game screenshot audit

This is verified progress, **not a finished AAA game or authenticated MMO**.
Source is isolated on `codex/america-foundation`. No public upload or main-branch merge.

## What changed after looking at the game

- Corrected the always-on 68% perception dimmer at noon. Daytime now uses a 20.4%
  maximum mask, with broader angular/radial feathering; normal night strength
  remains. CPU sight, wall occlusion and entity culling are unchanged.
- Added real warm, shadow-casting cottage lights, driven by optional property rows.
  The previous emissive lamp mesh did not illuminate the interior.
- Authored an original freight shelter, reclaimed fence and utility lamp using
  the installed **Blender MCP** server through the repository's MCP adapter.
  The hidden localhost session was task-owned and closed after saving the source.
- Placed the assets in the real Roadstead location. Gravel connects the office
  yard, homes and existing street; its tire response matches its appearance.
  Parking marks, freight stacks, fences and practical lamps give the site a use.
- Removed the duplicate floating office name above its actual physical sign.

## Judgment against the mission

The office now reads as a freight/deed stop and the cottages have readable
approaches. Night has pools of domestic light while the surrounding world stays
dark. These are improvements to the road-to-home fantasy in ENGINE.md §2/5/6.

Still below the requested standard: Meridian's older box buildings/characters,
large floating labels, flat sparse road scenery, repetitive house exteriors,
unfinished environmental stories and dense map/character UI. Cartridge artwork
still promises more visual detail than several playable cartridges provide.
The new lamps do not implement an electricity economy. The furnishings do not
yet become usable household activities. Roadstead transactions remain local.

## The 20-piece capture set

All images are original 1280×720 Godot 4.5.1 Compatibility frames on an RTX 4090.
No retouching, generated replacement scene, hidden HUD or substituted renderer.
Normal title/New Game use real UI input. Distant locations are explicitly staged
for photography, the world clock is held, and camera follow is snapped after
staging; this is not coast-to-coast driving proof. Home entry uses real movement.
Four cartridges are explicitly unlocked as throwaway photo-profile fixtures.
Exact positions/camera/time are in the [capture manifest](../renders/habitation-2026-09-06/final/manifest.json).

| Screenshot | What it shows |
|---|---|
| [01 · Title](../renders/habitation-2026-09-06/final/01_title.png) | Normal launch and DRIVN front door |
| [02 · Controls](../renders/habitation-2026-09-06/final/02_title_controls.png) | Real title controls/rebinding panel |
| [03 · Options](../renders/habitation-2026-09-06/final/03_title_options.png) | Real title settings panel |
| [04 · Highway start](../renders/habitation-2026-09-06/final/04_new_game_highway.png) | Correct starter car and first-run HUD |
| [05 · Meridian](../renders/habitation-2026-09-06/final/05_meridian.png) | Existing safehouse/NPCs; exposes remaining old-art and signage weaknesses |
| [06 · Appalachian highway](../renders/habitation-2026-09-06/final/06_appalachian_highway.png) | Continuous I-40 geometry; still sparse/low-detail surroundings |
| [07 · Colorado highway](../renders/habitation-2026-09-06/final/07_colorado_highway.png) | Elevated western terrain and road piece |
| [08 · Road Office](../renders/habitation-2026-09-06/final/08_road_office.png) | New original shelter, parking, freight yard and access |
| [09 · Freight desk](../renders/habitation-2026-09-06/final/09_freight_desk.png) | Real interaction opens local freight/deed workflow |
| [10 · Home porch](../renders/habitation-2026-09-06/final/10_home_porch.png) | New gravel approach, fences, lamp and retained original cottage |
| [11 · Home interior](../renders/habitation-2026-09-06/final/11_home_inside.png) | Actual input-driven doorway traversal and roof cutaway |
| [12 · Backpack](../renders/habitation-2026-09-06/final/12_backpack.png) | Real inventory and starter items |
| [13 · Character sheet](../renders/habitation-2026-09-06/final/13_character_sheet.png) | Existing RPG systems; density remains a polish gap |
| [14 · Route map](../renders/habitation-2026-09-06/final/14_route_map.png) | Existing diegetic GPS and road geography |
| [15 · Console shelf](../renders/habitation-2026-09-06/final/15_console_library.png) | Box covers in the responsive four-column shelf |
| [16 · Waste Heap](../renders/habitation-2026-09-06/final/16_waste_heap_square.png) | Running 1:1 handheld merge board |
| [17 · Bunker Breaker](../renders/habitation-2026-09-06/final/17_bunker_breaker_portrait.png) | Running 9:16 handheld brick-breaker |
| [18 · Last Mile](../renders/habitation-2026-09-06/final/18_last_mile_landscape.png) | Running 16:9 handheld driving cartridge |
| [19 · Rust Runners](../renders/habitation-2026-09-06/final/19_rust_runners_console.png) | Running 16:9 console platform-shooter; not a visual 1:1 Soldat replica |
| [20 · Home at night](../renders/habitation-2026-09-06/final/20_home_at_night.png) | Same real house at 23:00 with actual practical illumination |

Compare the [previous audit](VISUAL_AUDIT_2026_09_06.md) and its unchanged before/after
sets. The first habitation iteration is also retained; the final set removes
its duplicated office text. These are component views, not all-game playthroughs.

## Verification

Ten focused headless scenes: **190 passed, 0 failed**:

| Scene | Passed |
|---|---:|
| daylight_mask_sim | 6 |
| property_light_sim | 10 |
| roadstead_yard_sim | 19 |
| lighting_state_sim | 7 |
| visibility_sim | 8 |
| vision_sim | 6 |
| vision_reach_sim | 8 |
| homestead_asset_sim | 44 |
| road_life_sim | 71 |
| homebase_sim | 11 |

The yard test walks from the lane into and back out of all three homes, reaches
the office through the actual shelter, checks real fence collision and verifies
gravel registration/lifecycle. RoadLife exercises actual cargo, payouts, deeds,
storage, write failure, replay, guest access, controller closing and encounter combat.

Real GPU lighting regression: **32 passed, 0 failed**, exit 0 with the intermittent
three-resource shutdown diagnostic noted below. The test now
measures actual gameplay-mask pixels, not only the unmasked reference. Sampled
noon outer-edge brightness ratio is 0.955; the broader inner feather is 0.986.
A test-only exact legacy-mask mutation gives 0.851 and 1.000 respectively and
fails those two checks (**30 passed, 2 expected failures; exit 1**). Original
production files are never changed by that probe. Normal final tour:
**20 captures, 0 failures**, clean exit.

Python exported-geometry checks: two tests covering all seven original props;
embedded GLB data, actual transformed vertices, scale/origin, cutaway hierarchy,
and triangle budgets pass. New asset counts: shelter 4,368 triangles; fence 1,364;
lamp 484. Draw-call and full-country performance certification remain open.

RED evidence is retained: old daytime mask stayed 0.680; no parcel practicals;
yard/connected gravel absent; three missing GLB exports before creation. A first
render-metric assertion sampled the wrong middle bin of the nonlinear falloff;
the corrected metric checks the early feather and has the failing legacy control.

Review caught a capture-dimension reporting error: the first dedicated lighting
run was actually 1793×1009 despite its launch flags. The corrected fixture now
asserts each PNG is 1280×720; all eight images in `lighting-1280/` pass. The final
20-piece tour was always 1280×720, with a 1920×1080 logical canvas in its manifest.

Diagnostics are not hidden: `vision_reach_sim` and the final 1280×720 normal lighting
run report three resources at shutdown; earlier lighting runs and the final
legacy probe are clean. Import reports the existing Dialogue Manager UID fallbacks.
The new daylight/property/yard final tests and final 20-piece tour exit cleanly.
This focused pass does not replace the previously recorded failing whole-suite sweep.
Raw logs: [habitation verification directory](habitation-2026-09-06/).

## Playable Windows candidate — verified after the visual pass

The [portable Windows ZIP](../../build/DRIVN-0.14.0-48b43d40-20260906-071645-739-d30ed1-win64-local-rc/DRIVN-0.14.0-48b43d40-20260906-071645-739-d30ed1-win64-local-rc.zip)
contains source commit `48b43d40935d668a6fb7c0c931a4d7383cad4940`, with a clean
source tree before and after export. This includes both screenshot-fix milestones.
Extract the entire ZIP, then run `PLAY_DRIVN.bat`; Godot does not need to be installed.
The launcher uses separate evaluation saves. This is an unsigned local-evaluation
build, not a cleared public distribution or an authenticated MMO service.

`BUILD_ROADSTEAD.ps1 -CaptureSmoke` completed successfully. The actual exported
executable passed **85 packaging/UI/resource checks, 0 failures**, with clean
runtime output and two actual 1280×720 captures. All 22 covers and cartridge
interfaces load; these checks are not 22 complete cartridge playthroughs.
The export log explicitly includes all three new Blender models and the yard rows.
Existing Dialogue Manager UID fallback warnings remain in import/export output.

The ZIP was then extracted outside the repository into a fresh temporary folder,
with no source path supplied and a fresh save profile. Its archive checksum and
all **35 payload-file checksums** passed. That extracted executable separately
passed the **19 yard/traversal checks** and the **20-piece GPU screenshot tour**,
both exit 0 with empty stderr. All 20 PNG headers are 1280×720. The packaged yard
and night-home images were visually inspected and retain the actual models and
practical illumination. This is independent extraction on the same machine,
not clean-machine or broad-hardware testing.

Archive size: 181,054,257 bytes. SHA-256:
`9b53053cd7fed7fcd2e89a4ad2de3e5c66115ebcb3b7c08b62df69ae32f63a51`.
The [build manifest](habitation-2026-09-06/packaged-manifest.json),
[85-check acceptance](habitation-2026-09-06/packaged-acceptance.json),
[extracted yard log](habitation-2026-09-06/packaged-extracted-yard.stdout.log),
[extracted tour log](habitation-2026-09-06/packaged-extracted-tour.stdout.log),
and [tour manifest](habitation-2026-09-06/packaged-extracted-tour-manifest.json)
are retained. The second set of actual images is retained in the candidate's
`extracted-evidence/tour/` directory; the source tour above remains versioned.
The candidate's manifest identifies its exact source commit even after this
documentation-only follow-up commit.

## Remaining mission boundary

Authenticated dedicated realms, authoritative movement/combat/economy, independent
client ownership/recovery, national content quality, server/graphics load tests,
usable home activities, all-cartridge quality, accessibility, license clearance,
signed distribution and operations are not completed by this visual pass.
The full-game goal stays active. See [realm acceptance gate](../design/ROADSTEAD_REALM_NEXT.md)
and [foundation status](../AMERICA_FOUNDATION_STATUS.md).
