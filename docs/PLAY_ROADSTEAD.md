# Roadstead — play the local foundation

Double-click `PLAY_ROADSTEAD.bat` in this isolated checkout. It runs the installed Godot 4.5.1 against this checkout's `game/` and sets a separate `APPDATA` under `.roadstead-profile/`. Your ordinary DRIVN save is not used. This is a source-build launcher, not a packaged Windows release; it downloads nothing. If Godot lives elsewhere, edit the launcher path.

## Your first home

1. Choose **NEW GAME**. Keep the existing first-run guide if desired. Find **ROAD OFFICE · JOBS** with **N** (waypoint cycling); the Roadstead objective also shows its distance. The kiosk is on Meridian's west street at `(18, -328)`, just north-west of Roadstead Lane.
2. Park, use **E** to get out, then **E** at the kiosk. Take **MEDICINE**. A sealed freight item appears in your backpack; it must remain there at delivery. Its vendor value is zero.
3. Drive east along Meridian's main street and continue on the existing **CR-meridian-richmond** road. Cycle **N** to **DELIVERY · MEDICINE**. The first receiver is about 190m east of the town's main-street end, on the north shoulder. Park, exit, walk to the kiosk, **E**, then hand over the freight.
4. This pays **160 banked Road Office scrip** and a **Pantry reserve**, exactly once. Banked scrip is a separate deed fund; carried cash does not increase and is not automatically deposited or duplicated.
5. Return to **1 Roadstead Lane**, west of the old safehouse, at `(42, -363)`. Its mailbox sells the deed for **150 banked scrip**. Walk up the center ramp and through the front doorway. The roof cuts away as you enter.
6. Use the mailbox to store/take possessions one at a time. Unpack a carried Pantry reserve there for **three real canned meals**, usable in the ordinary inventory. Store supplies, leave, return, and use **F5/F9** or title **CONTINUE** to verify your run.

Two more one-time jobs extend the same road: **SPARE PARTS** pays 240 plus real repair parts; **LAST LIGHT** pays 320 plus a power cell. A real lurker stalks the last receiver; fight with ordinary weapons or deliver and leave. Its corpse uses ordinary loot. Homes 2 and 3 cost 225/300 and hold 180/240 items; home 1 holds 120. All three jobs total 720 banked scrip, enough for all three deeds (675).

## Controls and recovery

- Keyboard/mouse: WASD move/drive, Shift sprint, Space dive/handbrake; E interact; Tab ordinary inventory; N waypoint; F5 save, F9 load. Shared bindings remain rebindable with F11.
- Controller: left stick move/steer, RT gas / LT brake at the wheel, Y / PlayStation triangle interact, D-pad focus movement in the Roadstead panel, A / cross activate, B / circle close. The visible **×** and **CLOSE** buttons also close; **Esc**, the shared crouch action, and the shared interact action close the panel. Feet and fire are blocked while it is open.
- If freight is lost or left in a car trunk, return to the Road Office. **Reissue missing contract cargo** replaces it in your backpack. **Cancel** asks for confirmation and returns carried cargo without paying; an unpaid job can be accepted again. Spare sealed copies have zero vendor value and cannot be put into parcel storage. They do not permit extra payouts.
- Every successful Roadstead transaction automatically saves the **entire local run**, including backpack, job status, deed ledger and receipts. A failed write reports failure and does not publish the candidate transfer/reward. Booting the title alone does not create/overwrite a save. Old local checkpoints rewind both possessions and backpack together; corrupt present Roadstead data is rejected before applying main run state. A legacy save without this field starts with an empty Roadstead ledger.

## Honest boundaries

This is explicitly **LOCAL AUTHORITY**, not an MMO or shared co-op property system. Roadstead transactions and local checkpoint save/load are blocked while existing co-op networking is online. The local guest key demonstrates ledger storage permissions for a fixed offline guest identity; it is not an authenticated second player, invitation, RPC, or locked physical doorway. Interiors remain walkable regardless of deed ownership; mailbox storage is permission-controlled.

Only these three homes/receivers are in this milestone. Cottage furniture is visual, not a bed/workbench system. No countrywide layout certification, networking adapter, remote authentication, server backup, load-test claim, release installer, or new encounter director is included. The existing world's overexposure/vision cone, plain terrain/road material and unrelated city overlaps remain visible; captures are evidence of integration, not a claim of final art polish. No LOD/performance certification or FPS estimate is asserted.

Actual normal-camera screenshots: `docs/renders/roadstead/`. The photobooth stages positions for photography; the runtime sim separately walks the ramps/doorways and drives using game input.

## Repeat focused verification

Use a disposable process-local `APPDATA`, never your ordinary profile:

```powershell
$env:APPDATA = 'D:/git/carworld/.worktrees/america-foundation/.superpowers/sdd/2026-09-05-america-foundation/task3-test-appdata'
New-Item -ItemType Directory -Force -Path $env:APPDATA | Out-Null
$godot = 'C:/Users/taskm/Downloads/projects/Godot/Godot_v4.5.1-stable_win64_console.exe'
& $godot --headless --path game --import
& $godot --headless --path game res://proto3d/tests/road_life_sim.tscn
& $godot --headless --path game res://proto3d/tests/road_life_sim.tscn -- --restart-check
```

The restart check must follow the main test, in a new Godot process with the same disposable profile. It reloads the earlier process's actual persisted receipt and verifies withdrawal replay cannot duplicate possessions.
