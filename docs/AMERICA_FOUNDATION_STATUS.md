# America foundation — build record

Working branch: `codex/america-foundation`, isolated from the original checkout at `f1290de`. This is a foundation milestone toward the larger DRIVN vision, **not a completed MMO or an assigned quality score**.

## Test-save incident - recovery unresolved

An unisolated regression overwrote the existing normal player save. The
[incident record](verification/TEST_SAVE_ISOLATION_INCIDENT_2026_09_06.md) documents
the confirmed write and preserved affected files, which are not pre-test backups.
The original playthrough has not been recovered. A fail-closed road-life harness
guard now passes its local safety checks and independent task review. The final
purchase milestone corrections were approved at `26a5407`; recovery is still open.
All future verification must explicitly isolate both profile paths. Reviewed fix
`6374687` resolves the current-source editor/import hold by confining both MCP
listeners to loopback; the [live gate](verification/MCP_LOOPBACK_2026_09_06.md)
passed 20 checks. Earlier exposure remains unaudited, and recovery remains open.

## Current-source screenshot follow-up — 2026-09-06

The [ramp profile audit](verification/RAMP_PROFILE_VISUAL_AUDIT_2026_09_06.md)
adds four before/after comparisons, repairs 207 ramp height profiles and closes
short-segment pavement gaps. Independent review verifies original XZ vertices,
collinear insertions and unrelated data are preserved. Final checks: 61/0 GPU,
20/0 Node and **260/3 focused headless**. The open failures are two physical
median crossings and the original baseline billboard assertion. The separate
profile gate is 25/0 GPU and 21/0 headless; it does not replace the broader
**15/2** obstruction gate. Final evidence review accepted this bounded repair. No finished
interchange, nationwide completion, newer ZIP or save recovery is claimed.

The [Seattle roadside audit](verification/ROADSIDE_VISUAL_AUDIT_2026_09_06.md)
adds three new real captures and three baselines. Grounded poles/posts and
road/building-aware strip clipping now include local streets reserved before
streaming decoration. Independent review closed the construction-order finding.
At that checkpoint, focused checks were 36/0 GPU and 157/0 headless, clean logs.
The then-failing **9/3** ramp probe exposed terrain burial and a median crossing;
the newer profile audit above supersedes that result. Neither pass certifies a
finished interchange or USA. No newer ZIP or save recovery.

The [route atlas audit](verification/ATLAS_VISUAL_AUDIT_2026_09_06.md) adds seven
new real views and an unchanged-source baseline. Wide planning, readable and
clickable labels, retained GPS/portrait phone formats and shared modal controls
now pass independent review. Final checks: 76/0 GPU, 190/0 focused headless;
navigation/horse retain two-/four-resource exit diagnostics. Coarse map art and
discovery presentation remain open. No new ZIP was built, and this does not
certify nationwide content, public multiplayer or save recovery.

The [driver dossier audit](verification/CHARACTER_SHEET_VISUAL_AUDIT_2026_09_06.md)
shows five new real views and the prior baseline. The K screen now has readable
width, a separate wound diagram, explicit close/scroll controls and a real
gameplay-input gate. Final verification: 67/0 GPU and 119/0 focused headless.
Dossier/title logs are clean; the older body-doll scene retains exit-resource
diagnostics. The review's input-transition findings are fixed; final visual
re-review approved this bounded UI repair with no remaining source findings;
the full-game goal and save recovery remain open, and no new ZIP was built.

## Latest playable candidate — 2026-09-06

The [habitation audit](verification/HABITATION_VISUAL_AUDIT_2026_09_06.md#playable-windows-candidate--verified-after-the-visual-pass)
links the rebuilt Windows ZIP from clean source commit `48b43d4`, including the
new Blender yard, real cottage lights and both screenshot-led correction passes.
Packaged acceptance: 85/0. Independently extracted app: yard traversal 19/0 and
20 actual 1280×720 game captures, clean exits. Extract all files and use
`PLAY_DRIVN.bat`. Local evaluation only; all mission gates below still apply.

## Release-readiness follow-up — 2026-09-05

The [measured follow-up](verification/RELEASE_READINESS_PASS_1.md) fixes cottage
daylight clipping, unreadable midnight ambient light and palette jumps; prevents
anonymous city ruins from intersecting roads; and repairs 15 generated Peach
building positions with stable IDs and payloads. Real render checks and a fresh
20-location visual survey are retained. The survey still shows unfinished world
art and road ends; passing footprint tests do not certify the entire country.

`BUILD_ROADSTEAD.ps1 -CaptureSmoke` is the new portable Windows evaluation
workflow. It uses installed build tools, includes the runtime in the executable,
checks the actual packaged title/New Game/resources, and only then creates an
unsigned ZIP with notices, hashes and evidence. Players use the ZIP's
`PLAY_DRIVN.bat` for separate evaluation saves, with no installed Godot required.
Consult the verification record for the actual candidate result and remaining
asset-provenance restrictions. No public upload or signed-release claim is made.

## Verified foundations

- Typed, single-writer property authority: balances, one-owner parcels, purchase receipts, guests, item storage, strict corrupt-state rejection and verified file replacement. Focused regression: 67 checks passed after the Windows buffered-write fix. This is not authentication, interprocess locking or a public service.
- Original Blender MCP homestead kit: cottage with furnished interior and separate cutaway roof, mailbox, Road Office kiosk, freight crate. Editable `.blend`, source generator and inspected previews are retained. See [asset provenance and contracts](art/HOMESTEAD_KIT.md).
- Exported-geometry checks: 44 Godot assertions passed, plus the independent Python four-asset contract. The cottage doorway measures 1.40m wide with 2.28m headroom above its actual finished floor; deliberately narrowed, shrunken and floating negative controls fail. Separate runtime proof below covers the collision, ramp, doorway and full visible porch width.
- Real-camera **before** captures from the existing `world_photobooth` tool: 21 saved images, clean output. Examples: [Meridian core](renders/world/roadstead_before/meridian_main.png), [town edge](renders/world/roadstead_before/meridian_edge.png). These show the current surrounding town, not the new assets placed in it.

The baseline also exposes unresolved world-layout problems: the [downtown capture](renders/world/roadstead_before/town_downtown.png) visibly has overlapping road/building geometry and oversized signage. The [Seattle exit capture](renders/world/roadstead_before/seattle_city_exit.png) shows an abrupt road edge and a structure overlapping the approach. These images are evidence of problems to investigate, not a completed reachability diagnosis; existing passing data sims alone do not certify these layouts as polished or driveable.

## Playable local loop implemented

The real main scene now includes the Road Office, three freight contracts and three addressed cottages. Deliver actual cargo on foot for a one-time reward, buy a deed, store/take possessions and unpack household provisions. All three ramps and doorways have real-input traversal checks; a roof cutaway exposes each furnished interior. LAST LIGHT uses an existing lurker and real corpse loot.

Launch this isolated source build with [PLAY_ROADSTEAD.bat](../PLAY_ROADSTEAD.bat); follow the [walkthrough and controls](PLAY_ROADSTEAD.md). It uses the installed Godot engine and a separate save profile. This is not an installer or distributable release package.

Runtime task review accepted the implementation after fixing a polled WAIT input leak. The final reviewed runtime suite reports 71 passed / 0 failed, plus a separate-process restart probe with 5 / 0. It also checks both outer porch edges, row-driven prices/selection and encounter disabling. Real-camera [cottage exterior](renders/roadstead/03_cottage_porch.png), [interior](renders/roadstead/04_cottage_inside.png) and [freight desk](renders/roadstead/02_freight_desk.png) show actual integration, not final world-art polish. Some regression runs still emit audio-resource shutdown diagnostics.

## Whole-game verification

The whole-branch review is complete: all five findings were fixed in `a0ff3cd`, and the scoped re-review found no remaining issues in that fix diff. The independent **264-scene sweep completed: 199 clean assertion passes, 44 passes with diagnostics, 21 failures**. All new Roadstead tests passed; a fresh process then recovered the actual checkpoint, 5 / 0.

Nineteen failing scenes also failed in a separately imported clean `f1290de` snapshot, though individual symptoms varied in several runs. Two discrepancies, drag and dock-remote input tests, were traced to assertions running before queued key events reached the gameplay handler. The reviewed test-only correction `ba1cab8` passes both scenarios repeatedly (12 / 0 and 29 / 0), including an independent run with the original sweep's exact driver settings. Missing-event controls still fail. No gameplay controls changed. The original sweep remains recorded as a failed run, not retroactively green. See the [verification record](verification/AMERICA_FOUNDATION_2026-09-05.md).

Final title-only boot: 120 real main-scene frames, exit 0, no diagnostics and no save created. Local milestone review is complete; the remaining failures and production gates below still prevent a release-ready or global-completion claim.

The banked Road Office fund is deliberately separate from carried scrip. Network sessions must not present the local ledger as a shared server economy. The [persistent-realm acceptance gate](design/ROADSTEAD_REALM_NEXT.md) is now partially implemented: independent loopback clients authenticate to a dedicated purchase authority and race for a parcel, replay receipts, handle failed writes and recover after server termination. The [process proof](verification/REALM_PURCHASE_2026_09_06.md) passes 57 checks twice, plus another 57/0 after the final broadcast correction. This uses explicit test credentials, not public login; the player-facing property panel remains local. Earlier isolated component assertions passed 241/0 with disclosed port-bind/exit-resource diagnostics; the final link/protocol/ledger checks pass 68/49/67 with clean runtime logs. Whole-milestone review and scoped corrections are approved at `26a5407`, without clearing the save incident or remaining mission gates.

## What is still required for the requested large MMO

Latest visual progress: [Roadstead habitation audit](verification/HABITATION_VISUAL_AUDIT_2026_09_06.md)
records the original Blender MCP shelter/fence/lamp, navigable gravel yard and
home approaches, real local practical lights, and daylight-aware perception mask.
190 focused headless assertions and 32 GPU checks pass; 20 actual game captures
are retained. The following mission gates remain open.

1. **Connected country:** certify every town's road connections, driveable approaches and streamed terrain seams; country content needs more than map pins or a distance-compression setting.
2. **Authenticated persistent realms:** dedicated server account identity, authoritative movement/combat/economy, area-of-interest replication, reconnect/session rules and migrations. Current ENet co-op is not that service.
3. **Complete multiplayer ownership integration:** the independent purchase race and restart are now proven for the loopback test service. Player-facing connection/purchase UI, authoritative world access, revoked guest access and interrupted backpack/storage recovery remain unproven over the network.
4. **Content depth:** varied destinations, enemy tactics, meaningful item sinks, household uses, repeatable contracts, regional progression and consequences. One job-board neighborhood is a first loop, not a nationwide content rollout.
5. **Production operations:** measured load and frame budgets, soak tests, recovery/backups, moderation, telemetry and abuse handling; signed Windows release packaging with asset-license review and real player testing.

Quality will be judged by those playable and measurable results. Neither a design document, a studio render nor a green unit test establishes a finished AAA experience.
