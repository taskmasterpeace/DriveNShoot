# WORLD PILLARS — The Divided States, Locked In

**Status:** DESIGN (banked from side-chat brief, 2026-07-06) · *Progress since: Law 1's road-row delta SHIPPED (danger→ambush odds, toll billing, family read — `road_sim`); Law 2's law-profile slice SHIPPED (`data/law_profiles.json`, `law_profile_sim` — the seven FAMILIES themselves remain unbuilt). See HANDOFF §0 banner.*
**Reads with:** `DESIGN_PILLARS.md` (retention pillars — the *why players stay*), `DIVIDED_STATES.md` (the lore bible), `STAGES.md` (the build roadmap). This doc is the **world pillars** — what the game is ABOUT. Everything ships against these five.

House law respected throughout: the world persists; dogs permadie; player death takes a toll and leaves evidence; everything is a ROW; every rung lands with a headless sim.

---

## THE EIGHT LAWS (the upgrades that matter)

Each law is one sentence, its current state in the engine, and the delta. The pillars below expand them.

1. **Roads are characters.** A road has a reputation you learn, fear, and gossip about. *Today:* usmap.json interstates/exits, road pirates already roll on fast asphalt (`_update_pirates`), weather taxes grip. *Delta:* per-road rows — danger, family, toll, nickname — and the atlas + radio speak about roads by name.

2. **Factions control rules, not just territory.** Crossing a border changes how you *behave*, not just who shoots. *Today:* rulers.json per-state rulers, standing ledger (SUSPECT/TRUSTED/HERO), welcome signs, bounty_hunted. *Delta:* seven faction FAMILIES layered over the state rulers; each family carries a **law profile** (tolls, curfews, contraband, wanted rules, prices, radio, music).

3. **The dog is a survival partner.** Emotional AND mechanical. *Today:* this is our deepest system — bond tiers, permadeath, whistle commands ×1–4, SHIELD, seek, guard pings, graves, memorial, metaworld records. *Delta:* fear, refusal, distraction, and the carry — the moments where you choose between the dog and the odds.

4. **Death leaves evidence.** *Today:* your rig stays where it fell; crew drop corpse chests; fallen dogs leave graves + collars; deaths counter rides the save. *Delta:* the death toll doesn't vanish — it becomes a recoverable cache in the world; factions steal abandoned rigs; NPCs and the radio talk about where you went down.

5. **Vehicles are personal.** Your rig is your horse. *Today:* named rigs (display_name), per-component damage that reads (misfire, steer slop, strobe, fuel bleed), trunks, bed seats, trailer coupling, garages that store the rig's exact state. *Delta:* the **odometer** — a per-rig history row (miles, states, kills, saves) — plus naming at the workbench and faction theft/recovery.

6. **Buildings tell stories.** Every interior reveals what happened there. *Today:* enterable houses (walls/roof-hide/front-fade recipe), chests, loot_tables.json, buildings.json types. *Delta:* **scene grammar** — authored micro-tableaux per building type, and every type gets a *decision*, not just loot.

7. **The radio is the living-world system.** Cheap to build, massive atmosphere. *Today:* radio.gd Y-scan (distress/trader/howler/lore), NPC barks, ElevenLabs voices with locked voice IDs. *Delta:* the radio becomes **faction-aware** (each family owns frequencies), reports YOUR deeds back to you, and the Broadcast Church makes towers capturable.

8. **Route planning is the strategic layer.** This is what separates us from a GTA clone. *Today:* the atlas (M), click-to-set course, waypoints (N), home beacon (F), Carousel DIAL, 60× scale law making distance REAL. *Delta:* the highway-vs-backroad decision, road intel as loot, and the atlas as a **knowledge object** — you plan on what you *know*, not what *is*.

---

## PILLAR 1 — ROAD SURVIVAL

*The roads are the game's bloodstream.*

**The fantasy.** Every departure is a plan: "Interstate 9 is fast but the Crimson Road tithes it after dark. The county route adds twenty minutes but the militia knows my truck." The map question — fast and exposed, or slow and hidden — is asked every single time you turn a key.

**What's live today.** The compressed USA (60× — four real hours coast-to-coast is four minutes of driving), usmap.json interstates with exits, chunk streaming so there's never an edge, road pirates who ambush fast asphalt driving, weather that changes grip and sight, night that shrinks the world to your headlights, motorists running real city-to-city routes on the same roads you use.

**The build.**

- **Road rows.** Every usmap road gains `danger` (0–3), `family` (who patrols it), `kind` extended (toll, bridge, tunnel, collapsed). MapForge (:8899) authors them; the AI REST API can sweep-assign from lore.
- **The read.** Welcome-sign moments for roads: "THE CRIMSON MILE — they race here" toast on entry; atlas draws danger as road weight/color; the radio names hot roads on the hour.
- **The mechanics per kind.** Highways: +speed, +pirate odds, +visibility to factions (standing events travel faster). Backroads: slow, ambush *setpieces* instead of chases (fallen tree, cable across the road — the dog warns first, Pillar 4). Tunnels/bridges: chokepoints — checkpoint or toll rows, one way in. Collapsed exits: the loot is behind the walk.
- **Rest stops and truck stops** as building rows (Pillar 5) anchored to interstates — the roadside rhythm of the American apocalypse.

**Proof:** `road_sim` — spawn on a danger:3 road at night, assert ambush event fires; drive the parallel backroad, assert it doesn't; assert toll road takes scrip or turns hostile.

---

## PILLAR 2 — FACTION BORDERS

*"Divided States" is the design, not the title.*

**The fantasy.** Crossing a state line feels like entering another country: different law, different money pressure, different music on the dial, different things that get you shot.

**What's live today.** DIVIDED_STATES.md names all 50 states with rulers and landmarks; rulers.json drives per-state rules (bounty_hunted doubling pirate odds, welcome gifts at TRUSTED); the respect ledger already tracks standing per power; towns remember you (stock tiers, greetings); state welcome signs fire on_state_entered.

**The build — seven FAMILIES over the fifty states.** We don't replace the state rulers — we *group* them. Each ruler row gains `family:`, and the family carries the law profile. The seven, mapped onto our world:

- **The Free Counties** — militia holdouts. Rural spine states. Checkpoints at county lines, guns everywhere, outsiders earn trust SLOW (standing gains halved, but TRUSTED here is the deepest discount in the game). Our existing holdout/secman behavior is already their culture.
- **The Federal Remnant** — the old government's ghost. Capitol-adjacent states. Curfews (night driving = SUSPECT), confiscation checkpoints (contraband item category), lawful bounties — but real infrastructure: safest roads, working lights.
- **The Corporate Corridor** — private security and debt. Toll roads that actually bill you, drone patrols (our scout drone re-skinned hostile), clean facilities, and DEBT rows — miss a toll and it compounds into a bounty. The Carousel garages in their territory charge storage.
- **The Crimson Road** — the highway raiders we already have. Road pirates get a flag, a home family, and a culture: they worship speed — *outrunning them EARNS standing* ("you're one of the fast ones").
- **The Green Belt** — eco-communes controlling food and medicine. Hunger (already live) and meds route through them; their markets are the only reliable food/med stock at scale. Violence near their holdouts poisons the well fast.
- **The Capitol Dead Zone** — DC and the monument states. No ruler. Scavengers, lurkers, symbolic loot (unique rows like the targeting core), and the highest ambient danger in the game. Where the "what broke America" trail starts.
- **The Broadcast Church** — the cult that owns the airwaves (→ Law 7). Radio towers as capturable placements; their propaganda actively LIES to you on the dial (fake distress calls that are ambushes — the radio you trust becomes a weapon).

**Mechanics per family:** a law profile row — `{tolls, curfew, contraband[], wanted_mult, price_mult, radio_station, greeting_style}` — consumed by the systems that already exist (pirates, prices, standing, radio, barks). One new consumer: the **checkpoint** placement (MapForge row) at family borders.

**Proof:** `border_sim` — drive the same contraband across a Remnant border (confiscation event) and a Free Counties border (waved through, standing tick); assert price_mult applies in each market; assert curfew flips night driving to SUSPECT only in Remnant states.

---

## PILLAR 3 — DEATH WITH LEGACY

*Death is storytelling, not a restart.*

**The reconciliation.** The brief says permadeath; our shipped law says the player soft-respawns at the safehouse (the world persists; only dogs permadie — that's the emotional reactor and it stays). We keep the law and take the brief's real point: **death must leave evidence and cost story.** Then we add the hardcore layer for the players who want the full ride.

**What's live today.** Death already: leaves your rig exactly where it fell, takes 40% scrap / 30% scrip, persists dogs/nodes/standing/clock, counts (`deaths` in the save). Crew death already drops a corpse chest with their gear. Fallen dogs already leave graves, collars, and memorial lines.

**The build — evidence, then legacy.**

- **The cut becomes a cache.** The toll doesn't evaporate — it lands in a "scavenger stash" chest near where you went down, marked by circling crows (we have crows). Go back armed and take your life back. If a faction patrols that road (Pillar 1 rows), *they* take it instead — it sits in their checkpoint strongbox. Your loss is their loot, recoverable.
- **Rigs get stolen.** An abandoned rig in family territory rolls (metaworld pattern, same as dog raids) — after a day it's in their compound/garage, repainted, bounty-board recoverable. "I lost Marcus's truck at the bridge ambush, but it's in the Crimson yard at Meridian."
- **Rumors.** The radio and NPC barks reference your last death ("someone got dragged off Route 9 last night") — the bark priority table already exists; this is a new row with the highest juice-per-line in the game.
- **HARDCORE LEGACY mode** (menu toggle at NEW GAME). Death is final — but the *world file survives*. Your next drifter spawns into the SAME world: your corpse is out there with everything it carried, your dog (if it lived) is a STRAY again holding its full bond history waiting to be found, your safehouse stands, your enemies remember the truck. Every serialization system this needs (player_record, dog to_record, garage records, world save) already ships — hardcore mode is a *reader* of systems we built, not a new system.

**Proof:** `evidence_sim` — die carrying 10 scrap; assert a cache chest exists near the death point holding the cut; assert the rig persists; force the metaworld roll, assert the rig relocates to a faction garage record; hardcore flag: die, assert a new-drifter spawn sees the corpse chest and the stray dog with bond intact.

---

## PILLAR 4 — DOGS AS SURVIVAL PARTNERS

*Not a gimmick. The emotional reactor of the whole game.*

**What's live today** — most of the brief already ships: detect enemies before you see them (guard pings), track/find (seek ×3), attack (SIC), SHIELD (soulbound-only bodyguard), injuries (downed + bandage saves), permadeath (grave, collar, burial, memorial), bond tiers changing obedience and heel distance, off-screen survival records, riding in truck beds, the dogcam. The kennel, feeding, petting, per-dog history — all real.

**The build — the last 20% that makes them unforgettable.**

- **Fear.** Dogs get a `nerve` stat by breed + bond. Gunfire near a low-nerve dog stresses it: it cowers, whines (SoundForge has the palette), won't SIC until it steadies. A SOULBOUND dog steadies fast — *trust is mechanical*.
- **Refusal.** Dogs refuse to enter lurker dens and Dead Zone interiors — they stop at the threshold and tell you. The refusal IS the trap warning (brief's "warn of traps" — we make it diegetic; the dog is the detector).
- **Distraction.** New whistle: send the dog to bark from a flank; occupier heads turn (uses the existing threat-perception hooks). The dog is exposed while doing it. You will regret asking sometimes. That's the point.
- **The carry.** Pick up a downed dog and carry it (slow, no weapons) to the car. The choice — carry under fire vs. leave and circle back — is the brief's "abandon the dog" moment, and it composes entirely from systems we have (downed clock, seat anchors, wound taxes).

**Proof:** `nerve_sim` — grenade near a CUDDLE-type: assert cower + SIC refusal; same near SOULBOUND SECURITY: assert steady; den threshold: assert refusal + warn bark; carry: assert speed tax + no-fire while hauling; distract: assert occupier gaze swings to the bark point.

---

## PILLAR 5 — BUILDINGS AS RISK/REWARD

*Every interior is a mini-story with a decision inside.*

**What's live today.** Enterable buildings with the house recipe (hidden roofs, front-fade walls, ramp stairs), chests on the shared container panel, buildings.json + loot_tables.json as the data spine, towns with markets, the safehouse + home base build board.

**The build — the type grammar.** Each building type is a ROW: `{loot_profile, danger_profile, decision, scene_grammar[]}`. The **decision** column is the design contract — no type ships without one:

| Type | The pull | The decision |
|---|---|---|
| Gas station | fuel, maps, snacks | glass walls — visible from the road; the classic ambush box |
| Motel | REST (bed row → sleep, save-adjacent) | who else checked in? room-by-room clearing |
| Police station | armory + evidence room | loudest lock in the game (key/hotwire loop, like the Meridian sedan) |
| Hospital | meds, surgery kits (wound system's best treatment) | howler nests love the dark wards; dog refuses some wings |
| Warehouse | vehicle parts, faction crates | it's THEIR warehouse — theft is a standing event |
| School | supplies + the heaviest environmental storytelling we ship | usually nothing hostile — the weight IS the point |
| Church | refuge (neutral ground, any family) | or a Broadcast Church cell — the dial tells you which if you listen first |
| Suburban home | food, records, safes | booby-trap rows; the dog's threshold read matters here |

**Scene grammar** — 3–6 authored micro-tableaux per type (a barricaded nursery, two skeletons holding hands, a dog collar by an empty bowl, a confession written on a wall). MapForge places them; loot placement keys off the scene ("the safe is behind the family photo" as a rule, not a script).

**Proof:** `building_sim` — stamp one of each type; assert loot matches profile, the decision hook fires (ambush odds at the gas station, standing hit at the warehouse, rest at the motel), and a scene tableau spawned with its keyed loot.

---

## THE CORE LOOP — LOCKED

Four nested clocks, and every one already has a heartbeat in the engine:

- **Minute-to-minute:** drive → walk → sneak → fight → loot → escape. *Live now* — this is the twin-stick + vehicle core with the perception engine (night/cones/binoculars) making "sneak" and "escape" real verbs.
- **Short-term:** fuel, food, ammo, meds, parts, dog supplies, intel. *Live now* — fuel/jerry cans, hunger, ammo economy, bandages/medkits, car_parts, feeding the pack. *Add:* **intel as loot** (road rows + faction dispositions found in glove boxes and evidence rooms — feeds the atlas, Pillars 1/8).
- **Mid-term:** jobs, reputation, vehicle upgrades, routes, safehouses, enemies. *Live now* — THE CIRCUIT (scavenge→upgrade→push→node) is the named engine of this clock, with standing, the workbench, home base, Carousel garages. *Add:* the **job board** (holdout contracts keyed to family law profiles) and **named enemies** (a pirate who survives your escape gets a name and holds a grudge — the metaworld pattern applied to people).
- **Long-term:** cross the country, choose sides, uncover what broke America, then escape / profit / rule / rebuild. *Live in skeleton* — states visited, standing ledgers, the Carousel network, the Cheyenne targeting core. *Add:* the **mystery spine** — a breadcrumb chain (Broadcast Church signals → Federal Remnant archives → the Dead Zone → Cheyenne) told in found scenes and radio, never cutscenes. The four endings are STANCES the systems already measure: **escape** (reach the far coast alive), **profit** (a scrip ledger threshold), **rule** (hold N lit nodes + HERO standing in a family), **rebuild** (max the home base + seed a holdout). You don't pick from a menu — you *are* one of them by how you played.

---

## WHERE THIS SLOTS INTO THE BACKLOG

Nothing here jumps the current goal queue — it feeds it: P2's lore rename shipped the vocabulary this doc uses (scrip/holdout); **P3 world depth becomes Pillars 1+2+5** (road rows, borders/checkpoints, building grammar — in that order, road rows first since pirates/weather/atlas already consume road data); Pillars 3+4 are P5-adjacent emotional systems that can ship as single slices any time (**evidence cache first** — it's small and pays immediately); the mystery spine is the last thing we lock, once the world it's hidden in exists.

Two honest notes from the expansion: (1) the seven factions slot cleanly OVER our fifty state rulers rather than replacing them — states keep faces, families carry laws, and everything existing (standing, pirates, prices, barks) just gains a family read; (2) player soft-respawn stays the default and the permadeath ask lives in **Hardcore Legacy mode** built on serialization we already ship — full permadeath as the only mode fights the dog-permadeath emotional design (two reactors compete), and the evidence/legacy systems give 90% of the storytelling at zero rage-quit cost.
