# America foundation — build record

Working branch: `codex/america-foundation`, isolated from the original checkout at `f1290de`. This is a foundation milestone toward the larger DRIVN vision, **not a completed MMO or an assigned quality score**.

## Verified foundations

- Typed, single-writer property authority: balances, one-owner parcels, purchase receipts, guests, item storage, strict corrupt-state rejection and verified file replacement. Focused regression: 67 checks passed after the Windows buffered-write fix. This is not authentication, interprocess locking or a public service.
- Original Blender MCP homestead kit: cottage with furnished interior and separate cutaway roof, mailbox, Road Office kiosk, freight crate. Editable `.blend`, source generator and inspected previews are retained. See [asset provenance and contracts](art/HOMESTEAD_KIT.md).
- Exported-geometry checks: 44 Godot assertions passed, plus the independent Python four-asset contract. The cottage doorway measures 1.40m wide with 2.28m headroom above its actual finished floor; deliberately narrowed, shrunken and floating negative controls fail. These asset checks do not replace the pending runtime collision and traversal test.
- Real-camera **before** captures from the existing `world_photobooth` tool: 21 saved images, clean output. Examples: [Meridian core](renders/world/roadstead_before/meridian_main.png), [town edge](renders/world/roadstead_before/meridian_edge.png). These show the current surrounding town, not the new assets placed in it.

The baseline also exposes unresolved world-layout problems: the [downtown capture](renders/world/roadstead_before/town_downtown.png) visibly has overlapping road/building geometry and oversized signage. The [Seattle exit capture](renders/world/roadstead_before/seattle_city_exit.png) shows an abrupt road edge and a structure overlapping the approach. These images are evidence of problems to investigate, not a completed reachability diagnosis; existing passing data sims alone do not certify these layouts as polished or driveable.

## Playable local loop implemented

The real main scene now includes the Road Office, three freight contracts and three addressed cottages. Deliver actual cargo on foot for a one-time reward, buy a deed, store/take possessions and unpack household provisions. All three ramps and doorways have real-input traversal checks; a roof cutaway exposes each furnished interior. LAST LIGHT uses an existing lurker and real corpse loot.

Launch this isolated source build with [PLAY_ROADSTEAD.bat](../PLAY_ROADSTEAD.bat); follow the [walkthrough and controls](PLAY_ROADSTEAD.md). It uses the installed Godot engine and a separate save profile. This is not an installer or distributable release package.

Runtime task review accepted the implementation after fixing a polled WAIT input leak. The covering runtime suite reports 60 passed / 0 failed, plus a separate-process restart probe with 5 / 0. Real-camera [cottage exterior](renders/roadstead/03_cottage_porch.png), [interior](renders/roadstead/04_cottage_inside.png) and [freight desk](renders/roadstead/02_freight_desk.png) show actual integration, not final world-art polish. Some regression runs still emit audio-resource shutdown diagnostics.

## Final verification in progress

The whole-branch review and broad simulation sweep are not finished. The preliminary sweep found failures in audio, vehicle, container, co-op rules and creature tests; the item-pricing check also fails for two existing cartridge IDs. All six failures reproduced with the same symptoms in an independently imported clean `f1290de` snapshot. They predate Roadstead but still prevent an all-green or global-completion claim. See the [verification record](verification/AMERICA_FOUNDATION_2026-09-05.md).

The banked Road Office fund is deliberately separate from carried scrip. Network sessions must not present the local ledger as a shared server economy. The [next persistent-realm acceptance gate](design/ROADSTEAD_REALM_NEXT.md) records the missing two-client, dedicated-authority proof and failure cases; that gate is not yet implemented.

## What is still required for the requested large MMO

1. **Connected country:** certify every town's road connections, driveable approaches and streamed terrain seams; country content needs more than map pins or a distance-compression setting.
2. **Authenticated persistent realms:** dedicated server account identity, authoritative movement/combat/economy, area-of-interest replication, reconnect/session rules and migrations. Current ENet co-op is not that service.
3. **Real multiplayer ownership proof:** independent authenticated clients compete for the same parcel, survive a server restart and respect revoked access. Sequential local ledger commands prove only the component's serialization rules.
4. **Content depth:** varied destinations, enemy tactics, meaningful item sinks, household uses, repeatable contracts, regional progression and consequences. One job-board neighborhood is a first loop, not a nationwide content rollout.
5. **Production operations:** measured load and frame budgets, soak tests, recovery/backups, moderation, telemetry and abuse handling; signed Windows release packaging with asset-license review and real player testing.

Quality will be judged by those playable and measurable results. Neither a design document, a studio render nor a green unit test establishes a finished AAA experience.
