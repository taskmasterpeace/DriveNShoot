# Task 3 — Roadstead runtime report

Date: 2026-09-05. Isolated checkout: `D:/git/carworld/.worktrees/america-foundation`. Branch: `codex/america-foundation`.

Implementation commit: `781f390e0ba653e3bd09aff8fb11ab7d8e7e7705`. Parent-owned documentation commits during this task are not runtime work. No push, subagent, unrelated checkout edit, asset rewrite, paid service, or user-profile save operation was performed.

## Delivered behavior and decisions

The real `proto3d.tscn` attaches one focused `ProtoRoadLife`. Its office, three receivers and three cottage/mailbox parcels exist in normal play; no console command is necessary. The new objective and the existing N waypoint ring expose them. The objective is rendered on CanvasLayer 3, above the existing vision dimmer, in cream on a dark backing. The existing first-run/menu/game-deck systems remain separate.

The office sits at `(18,-328)`, west of Meridian's west street. Cottages stand at `(42,-363)`, `(60,-363)`, `(78,-363)` with a simple gravel approach. Their individual real-input doorway traversals pass. They do not replace the old safehouse or alter `usmap.json`/`world_stream.gd`.

Receivers derive their positions from the **existing** `CR-meridian-richmond` polyline, at fractions 0.85/0.55/0.25. The road's shared geometry width plus an 8m shoulder offset determines their lateral placement. MEDICINE pays 160 banked scrip plus Pantry reserve; SPARE PARTS pays 240 plus usable repair parts; LAST LIGHT pays 320 plus a power cell. All three one-time fees total 720; all three existing deed prices total 675. Cargo must be in the backpack, the job must be active, and the player must be on foot at the receiver. A completed job's receipt returns historical success without duplicating either currency or bonus supply.

Banked Road Office scrip is explicitly distinct from carried cash. There is no automatic pocket/bank duplication, deposit, free opening balance, or conversion. Cargo prices are explicit zero-value rows. A regression exposed the existing trade-price minimum of one: the narrow main hook now honors explicit zero prices, preventing sell/reissue minting of pocket cash. Lost cargo can be explicitly reissued at the office; cancelling asks for confirmation and allows an unpaid job to be accepted again. Extra sealed copies have no resale value, no extra payout and no parcel-storage path.

Pantry reserve is a real household item: the owned mailbox can unpack a carried reserve into three ordinary canned meals in the same checkpoint. Mailboxes expose one-item store/take actions. The fixed offline `local_guest` key is grantable/revocable and changes ledger access; it is visibly local, not an authenticated second player. Physical cottage entry remains open; storage access is permission-controlled.

LAST LIGHT materializes an existing `ProtoLurker` when an active courier approaches within 55m. It uses the existing `Damageable`, movement, targeting and weapon paths. The runtime sim kills it using actual weapon inputs and observes its existing `ProtoCorpse` loot with two scrip. This is one bespoke job-related encounter, not a countrywide encounter director.

The four shipped Blender GLBs are consumed unchanged. Cottage roof nodes are found by `Roof` prefix (numeric suffixes allowed). Separate simple wall/floor/porch collision leaves the 1.4m door opening; a convex 0.4m-over-2m ramp joins ground to porch. The real character walks through all three doorways. The existing furniture is visual. Generic primitive visual fallback avoids a missing model preventing scene construction; it is a degraded fallback, not a replacement authored cottage kit or visual-parity claim.

## Atomic authority and API

`ProtoPropertyLedger.open_embedded(parcels, snapshot, writer)` is the only new ledger adapter. It validates through the existing Task 1 schema before replacing live authority, normalizes numbers, and delegates candidate commits to the trusted writer. Standalone `open(path, parcels)` and its tested I/O remain intact; returning to standalone mode clears the embedded writer. Existing receipt responses stay exactly `{ok:true,error:""}`; no replay flag was added. Full snapshots remain trusted authority-side data, never a client projection/RPC.

`ProtoRoadLifeState` owns jobs, account `local_driver`, the ledger, and pending backpack/job candidates. Its public local operations are `accept`, `cancel`, `recover`, `deliver`, `purchase`, `transfer`, `guest`, and `unpack_pantry`; `record`, `valid_record`, and `restore` serve checkpoint integration. No arbitrary-account network command surface exists.

Commit ordering:

1. Validate the local action/authority and stage detached backpack and job candidates.
2. Run the existing ledger command. On a new receipt, the embedded writer captures the full existing run and substitutes the pending backpack, jobs and candidate ledger into that **one** record.
3. `ProtoAtomicCheckpoint.write` serializes with `var_to_str` (preserving Vector3/Color), writes a same-directory unique temporary file, checks the write/error state, flushes/closes, reopens and compares the complete closed bytes, then renames over the destination. It never deletes the prior checkpoint first.
4. Only after verified replacement succeeds are pending backpack/jobs published; the ledger publishes before returning success. Backpack notifications occur afterward. No event is emitted between the two live publications.

Historical transfer receipts are detected **before** computing backpack deltas; the original ledger validates the historical payload or rejects receipt conflict. Replaying a withdrawal therefore cannot credit backpack again, including in a fresh process. Failed writes leave candidate jobs/cargo/fund/ownership unpublished and can be retried.

The main change separates `capture_save()` from `save_game()` and adds narrow attach/input/modal/load hooks. Capturing no longer mutates the live world's last-played timestamp. Ordinary F5 now uses the same verified replacement helper. Boot/title construction does not save. A missing RoadLife field migrates to an empty local ledger; a corrupt present field, including an empty malformed record, is rejected before `player_restore` or any other main-state application. Loading an older local checkpoint restores old storage, receipts, jobs and backpack together.

`net.online` blocks all local Roadstead commands and main save/load/apply-save entry points. The UI closes when the session becomes online. This deliberate local-authority limitation prevents a peer from writing a purported shared ownership checkpoint. There is no authentication, account RPC, MMO service, or dedicated realm in this milestone.

## UI/input

The Roadstead panel is a focused CanvasLayer modal with keyboard/GUI activation, mouse purchase, controller B/circle close, the shared interact/crouch actions, Esc, a fixed visible ×, and a bottom CLOSE button. Deferred rebuild and immediate button disabling prevent one event from activating a newly rebuilt button. The main's shared `player.input_locked` computation includes the panel; opening clears pending fist/fire latches. Gameplay input returns early while the panel is open. The test holds movement while open, purchases using an actual mouse event, verifies no leaked fist hold, and exercises keyboard/GUI, E-close, physical pad B and Escape.

The test mouse must transform logical UI coordinates through `Viewport.get_final_transform()`: Godot's headless window was 64px wide while the logical UI was 1920px wide. This was measured, not bypassed with a direct purchase callback.

## Files in implementation commit

- `.gitignore`, `PLAY_ROADSTEAD.bat`, `docs/PLAY_ROADSTEAD.md`.
- `game/data/road_jobs.json`; additive item/price rows in `items.json`/`prices.json`; placement fields only in `properties.json`.
- `game/proto3d/proto3d.gd` (40 additions, 6 removals); `game/proto3d/realm/property_ledger.gd` (18 additions, 1 removal).
- New `realm/atomic_checkpoint.gd`, `property_panel.gd`, `property_site.gd`, `road_job_board.gd`, `road_life.gd`, `road_life_state.gd`, with their generated `.gd.uid` companions.
- `game/proto3d/tests/road_life_sim.gd`, `.gd.uid`, `.tscn`.
- `game/proto3d/tools/roadstead_photobooth.gd`, `.gd.uid`, `.tscn`.
- Five actual runtime PNGs under `docs/renders/roadstead/`, listed below.

32 implementation files, 1,149 insertions, 7 deletions. Parent-owned `docs/verification/AMERICA_FOUNDATION_2026-09-05.md` was left unstaged and untouched. This report is a separate documentation-only follow-up.

## Tests — actual RED and GREEN evidence

Working directory for all commands: the isolated checkout. Godot console:

`C:/Users/taskm/Downloads/projects/Godot/Godot_v4.5.1-stable_win64_console.exe`

All main-scene runs used process-local `APPDATA` under this task's scratch directory, never ordinary `user://drivn.save`. The runtime/restart pair use `.../task3-test-appdata`; each focused regression uses `.../task3-regression-<sim>`. New global classes were imported with `--headless --path game --import`.

Initial RED, before implementation:

```text
--headless --path game res://proto3d/tests/road_life_sim.tscn
ROAD LIFE: FAIL - real road-life component exists
ROAD LIFE: 0 passed, 1 failed
exit 1
```

Subsequent real-path REDs and resolutions:

- Delivery approach: 24/2, measured distance **3.661752m** against the game's **3.4m** interact range. The fixture now walks the remainder using input; the production range was not expanded.
- Online direct apply-save: 39/3, with the missing online guard causing a changed backpack and consequent overloaded traversal failures. Adding the guard restored 42/0.
- Zero-value cargo: the regression reported `replacement freight cannot mint vendor cash` because existing `trade_price` rounded zero up to one. Explicit-zero support fixes this without changing ordinary prices.
- Actual mouse purchase: measured headless viewport transform `X=(0.033333,0), Y=(0,0.033333), O=(0,14)` explained a missed button. Correct physical-window event coordinates make the actual GUI purchase work.
- A first photobooth office capture remained at spawn because physics frames could advance before an input event's process pass. Awaiting process frames after the exit input fixed it; final logged actual office position `(18,0.000327,-323)` matches the staged `(18,0.2,-323)`.
- The initial new HUD sat below the pre-existing vision-cone dimmer. CanvasLayer 3 and a backed cream label fix the actual captured contrast; no global lighting rewrite was made.

Final runtime commands and results (new processes):

```text
--headless --path game --import
exit 0 (existing dialogue-manager invalid-UID fallback warnings)

--headless --path game res://proto3d/tests/road_life_sim.tscn
ROAD LIFE: 56 passed, 0 failed
exit 0, final runtime output clean

--headless --path game res://proto3d/tests/road_life_sim.tscn -- --restart-check
ROAD LIFE: 5 passed, 0 failed
exit 0; final repeat has MP3/ObjectDB exit diagnostics (not claimed clean)
```

Final logs: `task3-import.log`, `task3-runtime-final.log`, `task3-restart-final.log` beside this report. Runtime was repeated through the development sequence; the 56/0 and separate-process 5/0 pair also passed cleanly before the final repeat. The test has a 120s watchdog and a reached-completion assertion so a script interruption cannot masquerade as completion. It does not change `Engine.time_scale`.

Focused regression command for each row: `--headless --path game res://proto3d/tests/<name>.tscn`. Each ran in its own disposable profile, sequentially. Logs are `task3-<name>.log` beside this report.

| Sim | Result | Exit / diagnostics |
|---|---:|---|
| property_ledger_sim | 67 passed / 0 failed | 0, clean |
| homestead_asset_sim | 44 / 0 | 0, clean |
| save_sim | 21 / 0 | 0, MP3/ObjectDB exit diagnostics |
| input_map_sim | 15 / 0 | 0, clean |
| homebase_sim | 11 / 0 | 0, MP3/ObjectDB exit diagnostics |
| world_sim | 11 / 0 | 0, clean |
| items_sim | **26 / 1** | **1**, existing missing prices for `game_cart_rust_runners` and `game_cart_black_grid` |
| data_sim | 19 / 0 | 0, clean |
| spine_sim | 17 / 0 | 0, MP3/ObjectDB exit diagnostics |
| item_bridge_sim | 10 / 0 | 0, clean |

The items failure is not concealed or repaired by unrelated edits. All four new item IDs have explicit matching price rows. A verbose save rerun (`task3-save-verbose.log`) identifies remaining resources as **AudioStreamMP3** `amb_plains.mp3`, `car_door.mp3`, `dog_whine.mp3`, `vo_radio_blood_moon.mp3` and their playback objects, not RoadLife/ledger script instances. Baseline runs were sometimes clean, so this report records the observed diagnostics rather than calling every run clean.

The parent owns independent review and the broader suite sweep; this report does not claim the whole game or all simulations are green.

## Actual runtime images and observations

Non-headless GUI Godot was launched with `Start-Process -WindowStyle Hidden`, `--audio-driver Dummy`, the isolated worktree path, this photobooth scene and a separate `task3-capture-appdata`. Only task-owned processes were started; none remain at handoff. The final capture process was PID 35592. Logs: `task3-capture.stdout.log` and `.stderr.log`.

- `docs/renders/roadstead/01_road_office.png` — actual kiosk exterior, player 5m away; corrected from the earlier invalid spawn shot.
- `docs/renders/roadstead/02_freight_desk.png` — readable local-authority desk, banked vs carried balances and the three actual contract buttons, with fixed × close.
- `docs/renders/roadstead/03_cottage_porch.png` — real cottage frontage and separate ramp; second cottage also visible.
- `docs/renders/roadstead/04_cottage_inside.png` — actual player walked inside, roof hidden, authored interior/furniture visible.
- `docs/renders/roadstead/05_last_light_receiver.png` — real road shoulder, receiver/crate, active objective and existing lurker actor.

All five were opened and inspected. They are direct Godot viewport PNGs with the normal camera, not Blender studio renders, composited mockups, headless images, or generated art. Positions are photographic staging; movement proof is separately in the sim. The final five saves reported `error=0`; final capture stderr was empty.

Observed final capture/readback+PNG-save durations were **481, 109, 337, 361, 311ms**, respectively. Object monitors were **10,997, 11,020, 11,035, 11,053, 14,375**. These are capture operation times and total engine objects, **not FPS, draw calls, frame budgets, or MMO capacity measurements**. Renderer identified OpenGL 3.3 Compatibility on an NVIDIA GeForce RTX 4090.

Existing sunlight/vision-cone overexposure, broad plain ground/road surfaces, and generic wider-world city issues remain visible. The new HUD contrast is fixed; no claim of final world-art polish is made.

## Launcher and remaining boundaries

`PLAY_ROADSTEAD.bat` resolves `%~dp0game`, uses the installed GUI Godot sibling, and sets child `APPDATA=%~dp0.roadstead-profile`. It guards the engine/runtime paths and never downloads an engine. `.roadstead-profile/` is ignored. The child inherits that isolated environment before `endlocal`. Documentation explains the walkthrough, keyboard/pad paths, separate bank fund, recovery, save behavior, local guest semantics and known limitations. This is not a distributable release package.

Known limits: three authored homes and three one-shot routes only; no authenticated network authority, realm process, client projection, account RPC, secure guest identity, locked house doors, MMO capacity test, countrywide layout audit, rollback-resistant local saves, server backups, furniture gameplay, or measured LOD budget. Old local checkpoints intentionally rewind the whole local run. Generic primitive missing-model fallback is degraded. Encounters may be rematerialized for an active contract on a later local run; existing ordinary world persistence is not replaced by a new encounter ledger. No terrain/road/lighting refactor was attempted.

## Self-review

- Reviewed staged file list and `git diff --cached --check`; only owned implementation files were committed, with no unrelated parent documentation or user assets.
- Reviewed the ledger diff: existing standalone persistence/validation/replay API preserved, embedded writer is narrow, no account-string RPC or replay flag.
- Verified checkpoint order and notification order, receipt replay before backpack mutation, failed reward/store writes, actual disk/restart receipts, old-checkpoint storage/backpack rewind, corrupt-present refusal, legacy migration and online guards.
- Confirmed discovery/UI input paths and actual travel/doorway/weapon inputs, not reward/purchase teleports as functional behavior. Staging exceptions are comments in the test.
- Confirmed final captures are real and corrected the faulty initial shot and HUD layering. Existing visual and exit-diagnostic limitations remain explicit.
- Independent parent review remains required; no self-assigned quality score or broader-suite success claim.
