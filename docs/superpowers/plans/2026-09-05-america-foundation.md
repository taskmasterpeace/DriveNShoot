# America Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Build the first durable home-ownership authority and a visibly improved, playable road-to-home loop using Blender MCP assets.

**Architecture:** Typed authoritative ledger separated from world/UI and networking adapters. Data-driven RoadLife content consumes it through the real game. Blender exports provide visuals with runtime-owned collision and cutaway.

**Tech Stack:** Godot 4.5.1, GDScript 2.0, JSON, installed Blender 5.1 + Blender MCP, GLB.

**Spec:** docs/superpowers/specs/2026-09-05-america-foundation-design.md

## Global Constraints

- Work only in `D:/git/carworld/.worktrees/america-foundation` on `codex/america-foundation`.
- Preserve the existing game and all parent-checkout changes. No shared-branch push or publishing.
- Godot res:// is game/. Static typing, data rows, shared input actions, real-path sims.
- No purple. No paid asset providers. Use Blender MCP for the new 3D assets.
- Successful persistence precedes acknowledgment. No invented security, performance, MMO-capacity, or quality claims.

### Task 1: Durable property authority

**Files:** Create game/proto3d/realm/property_ledger.gd, game/proto3d/tests/property_ledger_sim.gd and .tscn, game/data/properties.json. Task owns only these files and a test report. No runtime or Blender edits.

**Interfaces:** Produces `ProtoPropertyLedger`, a RefCounted authority component. Exact public API: `open(path: String, parcels: Array) -> Error`, `ensure_account(account_id: String) -> Dictionary`, `credit(account_id: String, amount: int, receipt_id: String) -> Dictionary`, `purchase(account_id: String, parcel_id: String, request_id: String) -> Dictionary`, `set_guest(owner_id: String, parcel_id: String, guest_id: String, allowed: bool, request_id: String) -> Dictionary`, `store_item(account_id: String, parcel_id: String, item_id: String, quantity: int, request_id: String) -> Dictionary`, `take_item(account_id: String, parcel_id: String, item_id: String, quantity: int, request_id: String) -> Dictionary`, `snapshot() -> Dictionary`, `can_access(account_id: String, parcel_id: String) -> bool`. Mutation results contain `ok: bool` and `error: String`. `credit`, storage movements, and account creation are trusted server-side APIs, never RPCs. Item storage validates IDs against the existing catalog. Runtime inventory transfer owns backpack debit/credit; do not falsely present store_item as complete inventory anti-duplication. Positive integer amounts only; bounded IDs and request sizes. Initial accounts have zero scrip; content rewards fund purchases.

- [x] Write real behavior tests first: two accounts credited 200 each compete for a 150-scrip parcel; only one owns it and only that account is debited. Replay the winning receipt leaves balances unchanged; altered payload under that receipt is rejected. Reload from disk preserves ownership/balances/receipts. Guest may access storage until revoked; non-owner cannot grant access. Invalid quantities/items/IDs rejected. Storage addition and removal conserve counts. Corrupt input and a non-writable path do not silently reset or mutate authority state.
- [x] Run the sim and record its expected initial failure before implementation. Use dynamic load with an explicit missing-component assertion so this is a useful failing test, not a parser typo.
- [x] Implement the ledger using private working-copy mutation, validate before commit, atomic replace of one versioned JSON state file, and no successful response after a failed write. Do not introduce arbitrary broad framework abstractions.
- [x] Add three parcel rows with immutable IDs and prices; coordinates and runtime model integration belong to Task 3. Minimum schema: id, name, price, item_capacity, model (`res://assets/models/homestead/roadstead_cottage.glb`).
- [x] Run focused sim and existing save/homebase regressions; inspect diff, commit only owned files. Report RED and GREEN output, limitations, and file list.

### Task 2: Blender MCP homestead kit

**Files:** tools/blenderforge/mcp_bootstrap.py, tools/blenderforge/mcp_client.py, tools/blenderforge/gen_homestead.py, tools/blenderforge/tests/test_homestead_contract.py, tools/blenderforge/sources/homestead_kit.blend and sources/.gitignore, game/assets/models/homestead/*.glb and their new import files, game/proto3d/tests/homestead_asset_sim.gd and .tscn, tools/blenderforge/previews/homestead/*, docs/art/HOMESTEAD_KIT.md. Godot-generated UID companions belong with their scripts.

**Interfaces:** Consumes the installed addon and MCP Python SDK. Produces four GLBs: roadstead_cottage, parcel_mailbox, freight_kiosk, delivery_crate. Export contract comes verbatim from the spec. MCP client starts the installed stdio server, initializes MCP, lists tool schemas, and calls execute_blender_code / get_scene_info. Bind addon only to loopback on a task-specific port; disable MCP telemetry for this child process only. Do not edit user MCP config.

- [x] Write an asset-contract test that fails on missing GLBs, parses the GLB JSON chunk and verifies metre-scale bounds, mesh/material presence, cottage roof nodes and independently authored door gap test in Blender generation validation.
- [x] Start a separate hidden GUI Blender session (addon refuses background mode); call through real MCP SDK, not a socket-only imitation. Verify scene query succeeds.
- [x] Author original assets in Blender via execute_blender_code; export GLB and a new .blend source, render useful views. Inspect images and iterate. No overwriting existing vehicle models or user scenes.
- [x] Run asset contract, Godot import, and runtime checks; document provenance, MCP call evidence, triangle counts, materials, axes, and limitations. Commit owned files.

### Task 3: Real road-life runtime integration

**Files:** game/proto3d/realm/road_life.gd, road_life_state.gd (transaction/checkpoint responsibility), atomic_checkpoint.gd if needed to share verified I/O without duplication, property_panel.gd, property_site.gd, road_job_board.gd, focused embedded-mode extension to property_ledger.gd if needed, game/data/road_jobs.json, placement fields in properties.json, new freight/household rows in items.json and matching prices.json rows, game/proto3d/proto3d.gd (small attach/save/input hooks), game/proto3d/tests/road_life_sim.gd and .tscn plus transaction regression if needed, game/proto3d/tools/roadstead_photobooth.gd and .tscn for actual runtime captures under docs/renders/roadstead/, docs/PLAY_ROADSTEAD.md and PLAY_ROADSTEAD.bat, a .gitignore entry for the launcher's isolated local profile. Godot-generated UID companions belong with their scripts.

**Interfaces:** Consumes property ledger API and homestead models. First build remains explicitly local-authority until a separately verified authenticated network adapter exists. Do not graft insecure account-string RPCs onto co-op. User saves and authoritative-ledger transactions must agree across restart. Prefer one atomic full-run checkpoint containing ledger, jobs and backpack over two separately acknowledged files: stage candidate state, verify closed bytes and replace before publishing live state. A narrow embedded-ledger persistence callback is allowed so validation/command logic remains shared with Task1. If separate files are used instead, record incomplete inventory transfers and recover before allowing more commands. UI must plainly label local authority status. An old local checkpoint may rewind the entire local run consistently; it must never rewind only the backpack while retaining later storage/rewards. Preserve existing saves; missing RoadLife fields migrate to an empty local ledger only, never silently discard corrupt present fields. Co-op must not present this unnetworked ledger as shared or allow local checkpoint overwrites on behalf of peers.

- [ ] Inspect existing input, actor, item, save, objective, and interact conventions; write real-path tests for job acceptance, destination/cargo requirement, one-time reward, purchase, storage and restart recovery.
- [ ] Attach a compact RoadLife component to the main game; place discoverable kiosk and three collision-safe parcel sites near the starting town. Use existing road geometry for job destinations. Implement focused inventory/storage UI with pad focus and three close affordances.
- [ ] Add a small set of freight/household item rows and reuse real actors for a road encounter. Tie risk/reward to jobs without claiming a new countrywide encounter director.
- [ ] Load Blender GLBs with procedural fallback, roof cutaway, and separate collision. Test physical doorway/porch traversal and capture the real Godot camera.
- [ ] Run ledger, runtime, save, input, homebase and relevant world regressions; record actual performance observations without invented FPS claims. Provide a direct Windows launcher to this isolated build, with controls and known limitations.

### Task 4: Review and next milestone ledger

- [ ] Independent task review of ledger and runtime changes; fix correctness/security/persistence issues and rerun covering tests.
- [ ] Final integration review, original-worktree status check, and honest have-versus-remaining report.
- [ ] Keep country connectivity, authenticated dedicated realms, multi-process purchase contention, and capacity testing as uncompleted until actually implemented and proven.
