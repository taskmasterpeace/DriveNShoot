# Meridian signage and refreshed game screenshots

The game is still below the requested finished-world standard. This pass fixes
two oversized destination banners and a cutaway defect found by looking at real
frames. It does not certify a completed game, MMO, or public release.

## What changed

The SAFEHOUSE and STRAYS banners were camera-facing Label3D objects, with no
physical backing. They dominated the older Meridian scene. Their replacements
are two data-authored, shaded, depth-tested signboards: one above the house door,
one on the existing kennel posts. Names, dimensions, attachment and placement
live in `game/data/meridian_signage.json`. No additional collision or input path
was added. Existing waypoints, readable notices, and adoption prompts remain.

The first kennel layout overflowed vertically; a single larger line now fits.
Inspection of the entry frame then caught the safehouse sign floating over its
vanished facade. The house now owns frontage details and hides/restores them
with its existing inside/outside cutaway state. The regression enters and leaves
through actual movement and checks both transitions.

## Look at the results

- [All 20 refreshed game pieces, named and judged](MERIDIAN_GAME_GALLERY_2026_09_06.md)
- [Before: safehouse and kennel banners](../renders/meridian-signage-2026-09-06/before/01_safehouse_front.png)
- [After: physical signage](../renders/meridian-signage-2026-09-06/after/01_safehouse_front.png)
- [Kennel approach](../renders/meridian-signage-2026-09-06/after/03_kennel_front.png)
- [Night](../renders/meridian-signage-2026-09-06/after/04_safehouse_night.png)
- [Entry: no floating facade sign](../renders/meridian-signage-2026-09-06/after/05_safehouse_entry.png)
- [Exit: sign returns](../renders/meridian-signage-2026-09-06/after/06_safehouse_exit.png)

The preserved set contains 5 before, 6 after, and 20 full-tour PNGs. All 31 were
checked as 1280x720 and byte-identical to the original engine output when copied.
No retouching, hidden HUD, generated replacement scene, or substituted renderer.
Godot 4.5.1 Compatibility, RTX 4090. Compressed in-memory previews were used only
to inspect large images; the saved and linked evidence remains the original PNG.

Location staging and a held clock are disclosed photographic fixtures, not
cross-country driving proof. Door movement and front-door UI use actual input.
Four cartridges are deliberately unlocked in the disposable photography profile;
these are running views, not complete playthroughs or a Soldat fidelity claim.
Exact positions, camera, clock and staging notes are in each capture manifest.

## Judgment against the spec

ENGINE.md section 6 calls for readable enterable buildings and working cutaways;
UI_DESIGN_LANGUAGE.md prioritizes world objects before widgets. The new signage
fits those principles better, with no camera-spanning tutorial text or interior
occlusion from its own facade sign. This remains a small visual improvement.

The next visible gaps, not cleared by this work:

1. Meridian: crude building shells, noisy wall texture, empty commercial rooms,
   persistent NPC labels and a portal effect that overpowers domestic scenery.
2. Country roads: few regional landmarks, repetitive ground, abrupt shoulder
   forms and insufficient environmental storytelling at these sampled locations.
3. Character sheet/map: crowded text, tiny map labels, weak information hierarchy;
   the sheet has no visible header/close affordance in the captured view.
4. Roadstead: better authored cottages/yard, but repetitive homes and sparse
   household activities. Freight remains explicitly local, not a realm UI.
5. Cartridges: box art is much richer than the sparse playable fields. Square,
   portrait and landscape formats work visually; content polish does not follow
   automatically from correct aspect ratios. Last Mile's status text overlaps
   the car area in the sampled frame. Rust Runners is still primitive visually.
6. Title/options: coherent amber/ink palette and visible controls, but large empty
   areas and limited presentation do not yet sell the road-survival fantasy.

## Verification and retained failures

Every invocation used fresh explicit APPDATA and LOCALAPPDATA under the current
checkout's build directory. The runner refuses reparse ancestors, records its
environment, launches hidden task-owned children, bounds waits, and preserves
logs/results. The new scene also refuses a non-build profile before loading main.
No editor/import, network connection, normal-player save access, or public upload
was needed. All captured process handles exited; none timed out.

Run with PowerShell 7:

```powershell
pwsh -NoProfile -File tools/meridian_signage_check.ps1 -Capture
pwsh -NoProfile -File tools/meridian_signage_check.ps1 -Scene sign_sim
pwsh -NoProfile -File tools/meridian_signage_check.ps1 -Scene sign_reader_sim
pwsh -NoProfile -File tools/meridian_signage_check.ps1 -Scene homebase_sim
pwsh -NoProfile -File tools/meridian_signage_check.ps1 -Capture -Scene visual_audit
```

| Evidence folder under build/ | Result |
|---|---|
| meridian-signage-89986895737847cd8c8e317d8d5367ba | Initial GPU RED: 18 passed, 6 failed; original banners |
| meridian-signage-ab4d457d58424314b7b56c5f644f9b42 | First layout: 25 passed, 1 failed; kennel text overflow |
| meridian-signage-6d45581c7c7d4847ae73eee6044cba13 | Cutaway RED: 17 passed, 1 failed; floating facade sign |
| meridian-signage-155e3da52c624aff91d612e68aa9afea | Final GPU: 31 passed, 0 failed; 6 images; empty stderr |
| meridian-signage-c9c0e7c404004c69b910ce5cc31a1b71 | Final signage: 18 passed, 0 failed; empty stderr |
| meridian-signage-93ad2e9991764801a8abe983089597b8 | Final sign: 6 passed, 0 failed; empty stderr |
| meridian-signage-20226588d81a443185166ad4b966a5f8 | Final sign reader: 5 passed, 0 failed; ObjectDB / 3-resource exit diagnostic |
| meridian-signage-0b6892f46c4b48e8ba894dd320ed78f7 | Final home base: 11 passed, 0 failed; ObjectDB / 2-resource exit diagnostic |
| meridian-signage-798c61341e664f1182861c9c1bea7f97 | Final full tour: 20 captures, 0 failures; empty stderr |

The focused headless assertion total is 40/0, but **not a clean diagnostic gate**.
The two older scenes had clean earlier runs in this pass and reported exit
resources in the final rerun. Their diagnostics are retained, not suppressed or
declared fixed. The new signage scene and both final GPU workflows exit cleanly.
This does not replace the previously failed whole-game suite.

Independent review approved production commit `6f5d104`, with two minor test
suggestions. The regression now requires exactly one of each destination, keeps
a non-optional safehouse assertion path, checks shaded lettering, and rejects
collision descendants. Three test-only negative controls alter disposable scene
nodes, never production files or saved screenshots:

| Post-review evidence under build/ | Result |
|---|---|
| meridian-signage-3fac4b80ea8741d99fc35711f44f72da | Duplicate kennel / missing house: 19 passed, 4 expected failures |
| meridian-signage-88fb2d6b12c74a1498ae26270516cf38 | Unshaded lettering: 22 passed, 1 expected failure |
| meridian-signage-b4f37b6fe4444e5680d9bc01a9059bbb | Added collider: 22 passed, 1 expected failure |
| meridian-signage-d6b9f390ec204cb082301978aa70cfe9 | Normal GPU: 36 passed, 0 failed, six captures |
| meridian-signage-d0ca27d86e2a44a8a077be70fc2bb337 | Normal headless signage: 23 passed, 0 failed |

All five post-review runs have empty stderr, expected exit codes, fresh isolated
profiles and terminal owned processes. These add five assertions to the signage
gate; they do not change production rendering or clear the two older scenes'
resource diagnostics. The original before/after/tour evidence above stays intact.
The scoped test-hardening re-review is pending.

No new Windows export was produced; the
earlier playable ZIP still identifies its older source commit. The full-game
goal remains active. The [normal-save incident](TEST_SAVE_ISOLATION_INCIDENT_2026_09_06.md)
is still unresolved: preserved affected copies are not recovered pre-test progress.
