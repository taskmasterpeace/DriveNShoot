# DRIVN — The Living World: NPCs, Factions & Society (PCAS)

**Status:** DESIGN (deep-future — Stage 6) · **Created:** 2026-07-04 · **Source:** user design 2026-07-04
**Pedestrian Classification & Adaptive Simulation.** Tone: gritty, permadeath. Influences:
Divided States (setting), GTA2 "Respect Is Everything" (social loop), Project Zomboid (off-screen NPC
sim + memory), Ultima Online (schedules + reputation duality).

> **Honest scope:** this is the most ambitious pillar and a genuine "deep thought" area — the
> off-screen simulation + memory + gossip at scale (and in multiplayer) is the hard engineering.
> The **tiered simulation (T1–T5)** below is the answer to making it affordable. Captured now so
> the design is preserved; built after the world/character/combat stages exist.

---

## 1. The World Structure

| Place | What | Role |
|---|---|---|
| **Baronies** | Fortified city-states, 100–1,000+, ruled by powerful/deranged Barons | major hubs, zoned like GTA2 (Commercial/Residential/Industrial) |
| **Holdouts** | Small towns, 10–100, under a sec-boss or council | minor hubs, trade, shelter |
| **The Wastelands** | Open highways, dead cities, acid-rain badlands | between settlements — the drive |
| **Carousel Stations** | Pre-Fracture underground bases: rare tech, weapons, **the Carousel teleport** | dungeons + fast-travel network (see `DIVIDED_STATES.md`) |

**Economy:** **Scrip** — stamped soft-metal currency, exchange rates favor the issuing Barony.
Military tech + ammunition are the most valued goods; wealth ≈ "bullets owned."
**Zoning (GTA2 model):** each Barony's zones determine which archetypes spawn, which patrols
operate, and what economy is present.

---

## 2. Pedestrian Simulation Tiers (the affordability engine)

Tier = simulation depth. T1–T2 run on a lightweight **Crowd Engine** (parallel, cheap); T3–T5 on
the **Living World Engine** (per-entity state machine + DB persistence, PZ-style off-screen sim).

| Tier | Name | Depth | Memory | Count/zone |
|---|---|---|---|---|
| T1 | Background Ambient | visual/audio only | none | unlimited |
| T2 | Reactive Ambient | reacts to sound/danger/player | session-only | 50–200 |
| T3 | Living Pedestrian | full schedule, barter, dialogue | persistent 30d | 10–40 |
| T4 | Named Civilian | story-adjacent, relationships | full persistent | 3–8/Barony |
| T5 | Faction Key NPC | drives economy, quests, politics | full + server log | 1–3/faction |

**Engine note:** Tier is a LOD dial — NPCs promote/demote by proximity & importance. This is what
makes "a living world" run without simulating thousands of full agents.

---

## 3. The Twelve Archetypes (behavior/economy/threat)

**Civil (Holdouts & Baronies):** Scavver (junk trader, skittish) · Trader (core economy node) ·
Sec-Man (law/bounties, hostile if rep<0) · Holdout Worker (crafter/skill trainer) · White Coat
(pre-Fracture tech, upgrades/Carousel-Station lore) · Gaudy (performer/info broker/spy — the disinfo vector).

**Wasteland (outside walls):** Road Rat (nomad, vehicle parts) · Mutie (mutated, rare reagents,
ostracized) · War-Boy (Barony raider, hostile, drops scrip/weapons) · Pilgrim (long-range cargo,
escort quests) · Drifter (factionless, hirable — **companion candidate**) · Cannie (cannibal,
always hostile, drops meat/gear).

*(Archetype = a data resource: behavior tree + dialogue set + economic role + threat. Adding one
= a data file. Ties to the companion system: Drifters/Road Rats are recruitable.)*

---

## 4. Memory System (the tech pillar of the Living World Engine)

Every T3+ NPC keeps a 3-layer memory stack (per player GUID):
- **Short-term (last ~4h game-time):** player sightings (who/action/weapon-drawn), nearby
  violence, overheard dialogue (keyword-tagged), active transactions.
- **Long-term (7–30 real days by tier):** reputation score, known facts ("Player X killed a
  Sec-Man in District 3"), trade history, relationship web, safe/danger locations.
- **Decay:** events fade unless reinforced by gossip; trauma persists 2×; illness/injury/rads
  accelerate forgetting; T4/T5 can retain indefinitely via the Gossip Network.

### 4.1 The Gossip Network (what makes it feel alive, esp. in MP)
T3+ NPCs swap memory packets at taverns/markets/gates/campfires:
- **Factual** (verified events) · **Rumor** (distorted/unverified) · **Reputation** (your fame/
  infamy spreading).
- Propagation = social-network logic: faster in high-traffic zones; **accuracy degrades per hop**
  (3rd-hand info gains error); players can **plant disinformation** via the Gaudy archetype.

---

## 5. Daily Schedule & Off-Screen Life (Ultima-style)

**Clock:** 2h real = 24h in-game. Every T3+ NPC runs a Daily Life Script:
Dawn (prep) → Morning (peak trade) → Midday (rest/gossip) → Afternoon (work/patrol) → Dusk
(wind down, seek shelter) → Night (curfew, higher hostile spawns, Gaudy active).

**Off-screen (no player within ~300m):** T3–T5 keep simulating at reduced tick — inventories
deplete/restock via faction supply chains; Drifters join crews; War-Boys raid trade posts;
Cannies ambush caravans; grudges/friendships/romances form. Events log to the **World State DB**
and become **discoverable content** — arrive to find the aftermath; survivors recount it.

---

## 6. Faction Reputation — The Respect Ledger (GTA2 × UO)

Per-faction score on the HUD, three pools:
| Pool | From | Effect |
|---|---|---|
| **Esteem** | contracts, protecting caravans, donating scrip | opens missions, lowers prices, unlocks shelter |
| **Infamy** | killing members, robbing, failed contracts | closes missions, raises prices, bounties |
| **Notoriety** | \|all actions\| combined | how *known* you are (fame + infamy both build it) |

**Pedestrian response scales with your Esteem:** Hero (80+) → salutes, combat aid, discounts,
quest offers. Trusted (40–79) → standard, ignores minor crimes. Neutral (0–39) → guarded, avoids
eye contact. Suspect (<0) → hand on weapon, refuses trade, calls Sec-Men. (Gaining respect with
one faction costs it with rivals — GTA2 rule.)

---

## 7. How this hangs on the engine (multi-use payoffs)
- **Perception cone** (shared w/ player + MP culling) = NPC awareness + what they can witness/remember.
- **Blueprint system** = Baronies/Holdouts stamped from town templates (Stage 5 pipeline).
- **Container + economy** = Trader stock, Scrip, vendor loops (ports 2D economy donor).
- **Companion system** (Stage 7) = recruiting Drifters/Road Rats/tamed animals off this same
  archetype/behavior spine.
- **Dialogue** = ports the 2D DialogueManager donor.

## 8. Deep-thought threads (unsolved — flag before building)
- Off-screen sim + memory + gossip **cost at scale**, and **reconciling it across multiplayer
  shards** (authoritative server owns the World State DB).
- Persistence storage model (per-NPC rows, decay jobs) — likely the 2D save system generalized.
- Preventing gossip/reputation feedback loops from softlocking a player out of all factions.

*Cross-refs: `STAGES.md` (Stage 6), `PROGRESSION.md` (Animal Handling/companions), `ENGINE.md`
(M6 AI & Life, perception cone), `systems/INTERFACE_AND_BODY.md` (Respect Ledger HUD).*
