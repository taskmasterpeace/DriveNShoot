# THE CAROUSEL — earned fast-travel as the meta-game

**Fantasy:** Project CAROUSEL — the government's continuity network: gate rings under military
bases, still humming. The states divided; the ring still turns. Every ruler wants it; nobody
holds the whole loop. You can.

**The one rule that protects the game:** the gate takes FLESH, not steel. You, your pack
(weight-capped — STRENGTH matters), your dog. **Never your rig.** Driving stays the core verb.
Killer wrinkle that falls out: **per-base garages** — ferry a bike to a node the long way once
and you've got wheels stationed there forever. Cross-country logistics = endgame for free.

**The arc (the carousel pun is the mechanic):**
1. **THE PAIR** — first two nodes link point-to-point (tutorial).
2. **THE ROULETTE** — fried targeting: a jump lands on a RANDOM active node. Risky, cheap,
   thrilling; forces exploration organically. *(Fight hardest for this tier — not choosing is a
   story generator.)*
3. **THE DIAL** — repair the targeting core (quest chain, Cheyenne Mountain capstone) → choose
   your destination.

**Node anatomy — every base is a dungeon:** the approach (vehicular) → the surface (occupier by
row: raiders/howlers/ruler troops (respect-negotiable)/automated) → the descent (objective:
power haul / codes via town standing / purge) → **THE SPIN-UP** (loud ~3-min wave defense; then
the node is permanently yours: safe room, stash, garage slot). Alternate solutions everywhere:
buy codes with scrip, earn with standing, take with steel.

**Costs & friction:** power cells per jump (scrip sink); jump sickness (stress spike + vision
blur; endurance reduces); the dog balks at its first jump (kinship check).

**Retention spine:** each node = visible permanent progress on the atlas. "One more base."
Weekly events write themselves (node under siege, ring instability, ruler seized a node).

**All data (MASTER_PLAN strategy):** `game/data/carousel.json` — bases as rows (this is
MapForge v2's authored-placement layer's first real customer; compounds assemble from a
"military" template set; rewards key into the item/vehicle catalogs).

**Build rungs (each with a sim):**
1. Data spine: carousel.json + loader; 10 seeded bases tied to DIVIDED_STATES landmarks.
   Sim: rows load, land in the right states (usmap.state_at).
2. Gate-room prefab: ring, terminal, power socket; fuel → boot → active. Sim proves it.
3. The jump: fade → arrive; car stays; cell consumed; sickness applies; pack cap enforced.
   Sim: player moved, car didn't, cell spent.
4. First dungeon (proof case): one authored base an hour from Meridian — approach, hostiles,
   power objective, spin-up defense. Sims: waves spawn, node persists.
5. Roulette tier → targeting-core quest → the Dial. Atlas Carousel layer (nodes + links).
6. Garages + events once saves exist.

Start with rungs 1–3. Seed data: `game/data/carousel.json` (schema + 10 bases, checked in).
