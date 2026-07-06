# DRIVN — Design Pillars (the north star: why players stay)

**Status:** DESIGN PHILOSOPHY (governs all stages) · **Created:** 2026-07-04
**Influences:** GTA Online (loop), Ultima Online (economy + scarcity), GTA2 (territory), Auto Duel
(structure), Project Zomboid (living world). These are the **retention pillars** — every system we
build must serve at least one, and each pillar below carries **enforcing mechanisms** so we can
*audit* whether we actually hit it, not just hope.

> The test for the whole game: **can a player point at the world and read who runs it, feel their
> own reputation change from what they did tonight, and need other players to get what they want?**
> If yes on all three, the game breathes. These pillars make that non-optional.

---

## Pillar 1 — The Reputation Loop IS the Core Loop
GTA Online's secret is a dead-simple spine (pick up → deliver). Ours is **earn respect → spend
respect.** Every activity must feed INTO or OUT OF the **Respect Ledger** (`WORLD_NPCS.md §6`).

**Enforcing mechanisms (so we can't fail this):**
- **The Respect-Delta Rule:** every activity resource (`DataContract`, `DataActivity`) MUST declare
  a `respect_delta` per faction. A **content-lint check fails** any activity with an all-zero
  ledger effect. *If a player grinds 4 hours with unchanged standing, that's a lint bug, not a
  balance tweak.*
- **Spend sinks:** Esteem *buys* things (vendor access, shelter, contracts, Carousel access keys) so
  reputation is a currency you drain, not just a number that climbs.
- **Visible feedback:** the Respect Ledger is always on the HUD; every gain/loss toasts with the
  reason ("+12 Steele — caravan delivered"). The loop is legible second-to-second.

## Pillar 2 — A Real Player-Driven Economy (not a skin shop)
UO worked because **resources only had value once players processed them** — a blacksmith needed a
miner, a miner needed a guard, a guard needed a healer. That interdependence IS the social glue.

**Enforcing mechanisms:**
- **Processing gates:** raw scavenge (ore, fuel crude, scrap, hide) is near-worthless until a
  *player skill* refines it (Mechanics, Chemistry, Cooking, Armoring). No NPC one-click converts
  everything — the value is the player labor.
- **Interdependence by design:** no single build can self-supply. A Tank driver needs a Chemist's
  nitro; a Chemist needs a Ranger's reagents; a Ranger needs a Mechanic's rig. The **700-pt skill
  cap** (`PROGRESSION.md`) enforces this — you *can't* master everything, so you trade.
- **Caravan + player-vendor layer:** goods physically move (the Caravan system) and can be raided;
  players stock **vendor NPC slots** they own. The economy is trucks on roads, not menus.
- **Resource Ledger:** track supply/demand per Barony so prices are real and shortages are events.

## Pillar 3 — Meaningful Territory (the world is a power map)
GTA2's genius: every district felt *owned.* Every Barony must read as politically alive.

**Enforcing mechanisms:**
- **Faction visual kit** (data-driven, per faction): livery on patrols (Barony Steele's tight
  formations), **graffiti/props** on walls (Rust Prophet tags), settlement style (Mutie sewer
  quarters). One `FactionVisualKit` resource stamped by the blueprint system → a zone *looks* owned.
- **Control %, and it shows:** a zone's controlling faction drives patrol density, vendor prices,
  who's hostile, and the visual kit. Shift control → the zone visibly changes hands.
- **Readable at a glance:** a player rolling in should know whose turf it is from the walls and the
  uniforms before anyone speaks — and the world map colors territory.

## Pillar 4 — The Sandbox Has Structure Underneath
GTA Online stays playable because "pick up and deliver" is the skeleton under the chaos. Ours is
the **Auto Duel triangle: Courier ↔ Arena ↔ Faction Contract.**

**Enforcing mechanisms:**
- **The onboarding triangle** is always available and always pays Respect + Scrip: **Courier** (drive
  cargo A→B, escort/raid), **Arena** (fight for purse + rep), **Faction Contract** (bounties,
  defense, sabotage). New players have a clear path in from minute one.
- **Layered depth:** veterans get the political meta-game (territory, vendor empires, alliances) on
  TOP of the triangle. **Chaos is optional, not mandatory** — you can be a quiet courier or a warlord.

## Pillar 5 — The Pedestrian System Is the Immersion Multiplier (the retention hook)
This is what separates DRIVN from Mad Max / Crossout / Twisted Metal — **a world that breathes**
(the PCAS living world, `WORLD_NPCS.md`). The moment a first-timer sees Traders packing up at dusk,
hears a Gaudy whisper about the South Gate, and feels Sec-Men eye their rep badge — they stop
playing a car game and start *living somewhere.*

**Enforcing mechanisms:**
- **Non-negotiable ambient life:** schedules, gossip, and reactive pedestrians ship as part of any
  settlement (not a "later polish"). A town with no living T3+ NPCs is an incomplete town.
- **The world reacts to YOU specifically:** memory + gossip means NPCs reference what you did. That
  personalization is the retention hook; protect it in the T3–T5 sim budget.

## Pillar 6 — No Pay-to-Win. Player Scarcity Instead.
UO housing was the most valuable thing in the game — not because it cost money, but because it was
**scarce relative to the playerbase** and fought over *in-game.*

**Enforcing mechanisms:**
- **Hard-capped scarcity, in-world:** prime Barony **vendor slots**, **Carousel access keys**, rare
  **White Coat schematics**, home/fort plots — limited in number, won and lost through play, never
  purchasable. Scarcity relative to players = things worth scheming over = community.
- **Monetization guardrail (locked):** **no pay-to-win, ever.** If the game ever monetizes, it is
  cosmetic/convenience only, and even cosmetics must not read as power. The economy is protected
  from cash-shop shortcut by design — refined goods, rep, and scarce plots can't be bought.

---

## How the pillars bind to the stages
- **Respect Ledger + factions + PCAS** → Stage 6 (`WORLD_NPCS.md`). Pillars 1,3,5.
- **Economy: processing gates, caravans, vendors, Resource Ledger** → Stage 8 + ports of the 2D
  economy/contracts donor. Pillars 2,4.
- **Onboarding triangle (Courier/Arena/Contract)** → contracts system (2D donor) grown into Stage 6.
  Pillar 4.
- **Scarcity systems (vendor slots, Carousel access keys, schematics, plots)** → Stage 8 + MP (Stage 9).
  Pillar 6.
- **The Respect-Delta lint + content-lint** → part of the Content Pipeline (`CONTENT_PIPELINE.md`).
  Enforces Pillar 1 mechanically.

*This doc is the tiebreaker: when two designs compete, pick the one that serves more pillars.
Cross-refs: `WORLD_NPCS.md`, `PROGRESSION.md`, `STAGES.md`, `CONTENT_PIPELINE.md`.*
