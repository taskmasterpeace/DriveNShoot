# America foundation — build record

Working branch: `codex/america-foundation`, isolated from the original checkout at `f1290de`. This is a foundation milestone toward the larger DRIVN vision, **not a completed MMO or an assigned quality score**.

## Verified foundations

- Typed, single-writer property authority: balances, one-owner parcels, purchase receipts, guests, item storage, strict corrupt-state rejection and verified file replacement. Focused regression: 67 checks passed after the Windows buffered-write fix. This is not authentication, interprocess locking or a public service.
- Original Blender MCP homestead kit: cottage with furnished interior and separate cutaway roof, mailbox, Road Office kiosk, freight crate. Editable `.blend`, source generator and inspected previews are retained. See [asset provenance and contracts](art/HOMESTEAD_KIT.md).
- Real-camera **before** captures from the existing `world_photobooth` tool: 21 saved images, clean output. Examples: [Meridian core](renders/world/roadstead_before/meridian_main.png), [town edge](renders/world/roadstead_before/meridian_edge.png). These show the current surrounding town, not the new assets placed in it.

The baseline also exposes unresolved world-layout problems: the [downtown capture](renders/world/roadstead_before/town_downtown.png) visibly has overlapping road/building geometry and oversized signage. The [Seattle exit capture](renders/world/roadstead_before/seattle_city_exit.png) shows an abrupt road edge and a structure overlapping the approach. These images are evidence of problems to investigate, not a completed reachability diagnosis; existing passing data sims alone do not certify these layouts as polished or driveable.

## In progress

Exact cottage clearance regression and playable RoadLife integration: accept freight, reach the actual destination carrying cargo, receive a one-time reward, purchase an addressed home and move possessions into storage. Jobs, backpack and property must share an atomic local checkpoint. Runtime collision, controller focus, discoverability and actual camera captures must pass before this is presented as playable.

## What is still required for the requested large MMO

1. **Connected country:** certify every town's road connections, driveable approaches and streamed terrain seams; country content needs more than map pins or a distance-compression setting.
2. **Authenticated persistent realms:** dedicated server account identity, authoritative movement/combat/economy, area-of-interest replication, reconnect/session rules and migrations. Current ENet co-op is not that service.
3. **Real multiplayer ownership proof:** independent authenticated clients compete for the same parcel, survive a server restart and respect revoked access. Sequential local ledger commands prove only the component's serialization rules.
4. **Content depth:** varied destinations, enemy tactics, meaningful item sinks, household uses, repeatable contracts, regional progression and consequences. One job-board neighborhood is a first loop, not a nationwide content rollout.
5. **Production operations:** measured load and frame budgets, soak tests, recovery/backups, moderation, telemetry and abuse handling; signed Windows release packaging with asset-license review and real player testing.

Quality will be judged by those playable and measurable results. Neither a design document, a studio render nor a green unit test establishes a finished AAA experience.
