Below is a **PRD for the final version** of your game (the “real” CarWorld vision), built on what we’ve actually proven in the Road Loop MVP **plus** what’s worth salvaging from your older doc. I’m ignoring the dead weight (Matter.js, Colyseus, etc.) and locking this to **Godot**.

I’m also including a **“What we steal from open source”** section and only naming things that are genuinely useful.

---

# CarWorld (Working Title) — Product Requirements Document

## 1) Product Summary

**One-liner:**
A top-down retro pixel, post-apocalyptic America where driving is survival, getting out of the car is dangerous and rewarding, and players build lives (or reputations) across cities connected by highways, wilderness, and transport hubs.

**Core identity:**
**GTA2 + Autoduel + Deathlands** → with modern systems: procedural world, online play, meaningful on-foot gameplay, and emergent stories.

**Primary platform:** PC (Steam)
**Secondary:** Steam Deck; later: console
**Tech:** Godot 4.x, typed GDScript, ENet multiplayer (server-authoritative later)

---

## 2) Vision and Pillars

### Pillar A — **The Road Is the Dungeon**

Every trip is a run: distance, risk, decisions, extraction.
(Your MVP already proves this works.)

### Pillar B — **Cars Are Builds, Not Skins**

Vehicles are loadouts: armor zones, tires, engine reliability, weapon mounts, cargo, heat signature.

### Pillar C — **On-Foot Matters**

Repair, scavenge, infiltration, building entry, stealth, prone/crawl, door play, and “small-space advantages” cars can’t access.

### Pillar D — **Emergent Stories**

The game records meaningful events (kills, crashes, escapes, betrayals) and surfaces them via radio/news boards/settlement gossip (text-first; audio optional later).

### Pillar E — **Hardcore by Default, Cozy by Mode**

Default is harsh. But you ship a **“Cozy Roam”** mode for playing with Parker (low threat, exploration/farming, no PvP).

---

## 3) Target Audience

**Primary:**

* Players who love harsh systems and “one more run” loops
* Fans of Autoduel/Car Wars/Project Zomboid vibes
* PvP risk seekers (Ultima Online murderer logic, later)

**Secondary:**

* Father/daughter “co-op roam” crowd
* Pixel sandbox explorers

---

## 4) Game Modes

### 4.1 Wasteland Online (Main)

* Persistent character progression
* Shared world regions and cities
* PvP always-on outside safe zones, with consequences
* Factions, bounties, notoriety

### 4.2 Arena (Session)

* Instanced matches (duels, team fights, demolition)
* Fast rewards and competitive loop

### 4.3 Cozy Roam (Family Mode)

* PvP off, reduced threats, optional breakdowns
* Focus: exploration, farming, base/home life, collectibles
* Local co-op first; online co-op later

---

## 5) Core Gameplay Loop

### Highway Run Loop (the spine)

1. **Town/Outpost Hub** (safe)
2. **Prep** (fuel, kits, ammo, loadout, mission)
3. **Depart** → highway/wilderness
4. **Pressure**

   * obstacles, breakdowns, heat, pursuers, ambush zones
5. **Choices**

   * loot cache, detour, repair, fight, flee
6. **Extract / Arrive**

   * bank distance + loot + mission progress
7. **Progression**

   * upgrades, reputation, unlocks, territory access

Your MVP already contains a simplified version:

* miles, extraction anywhere, breakdowns, repair kits, loot caches, heat, pursuer gating.

---

## 6) Feature Requirements (Final)

## 6.1 World & Travel

### Regions

* Post-apocalyptic **Earth-America** (starting region: one corridor)
* Expandable by updates (“map releases”)

### Travel Network

* **Cities and settlements** connected by highways
* **Transporter hubs** (Deathlands-inspired) acting as:

  * Fast travel gates
  * Progress gates (requires codes/keys/power cells)
  * PvP hotspots / faction control points

### World Structure (Final)

* **Overworld**: highways + wilderness (procedural + hand-authored POIs)
* **Interiors**: instanced buildings/bunkers/garages/arenas
* **Dungeons**: underground bases, labs, subway ruins

### Chunking (Final)

* Chunk streaming of overworld
* Deterministic seeds for:

  * roads
  * wreck clusters
  * caches
  * encounters

---

## 6.2 Vehicles (Core Product)

### Vehicle types

* Motorcycle, sedan, pickup, van, armored buggy, semi, etc.

### Handling model

* Arcade-realistic top-down drift model
* Surface traction (asphalt/dirt/grass/sand/ice/oil)
* Damage feedback and collision consequences

### Modular hardpoints

* Front / rear / turret / side mounts
* Drop weapons: mines/oil/smoke

### Component damage zones

* Engine, tires, fuel tank, armor plates, weapon mounts
* Blowouts matter (traction + max speed penalties)

### Fuel & supplies

* Fuel consumption by engine type + load
* Ammo, repair kits, scrap, med supplies

---

## 6.3 On-Foot Gameplay (Must be valuable)

### Movement + interaction

* Smooth 8-direction movement
* Interact system (hold-to-action standard)
* Doors, containers, terminals, vehicle repair points

### Combat (on-foot)

* Light firearms + melee
* Cover via props
* **Prone/crawl** for:

  * slipping under obstacles/vehicles
  * stealth entry
  * tight-space advantage

### Stealth & noise

* “Noise” feeds encounter risk (ties to heat)

---

## 6.4 Encounters & AI

### Highway threats

* Pursuers (ram-first early)
* Ambush spawns
* Roadblocks
* Snipers (late)
* Wildlife / mutants (optional per region)

### Settlements

* Guards
* Reputation-based hostility
* Crime response (safe zones enforce rules)

### “Baron” / city control (late-game)

* Player/faction can own/operate a settlement
* Generates convoys and resource flows (interdictable)
* This is a **Phase 3+** feature, not launch-critical

---

## 6.5 Heat / Notoriety System

### Heat (run-level)

* Drives pursuer chance + encounter intensity
* Sources:

  * distance
  * crashes
  * repairs
  * looting
  * firing weapons
  * killing witnesses (later)

### Notoriety (persistent)

* UO-style murderer logic (PvP consequences)
* Bounties + guard hostility
* Safe zone access restrictions

---

## 6.6 Missions

### Mission board types

* Courier (time pressure)
* Escort convoy
* Salvage recovery
* Bounty hunt
* Arena contracts
* Storyline missions (Deathlands-style artifacts, transporter network)

### Mission delivery

* Missions are data-driven (Resource/JSON schema)
* Supports procedural variation with fixed constraints

---

## 6.7 Economy & Progression

### Currencies

* **Scrap** (crafting/upgrades)
* **Credits** (trade)
* **Reputation** (access/prices)

### Progression vectors

* Vehicle garage upgrades
* Character attributes/skills
* Settlement access + licenses
* Transport codes (world expansion)

### Death / cloning

* Harsh default: loss + recovery
* “Clone/insurance” system provides:

  * respawn with penalties
  * protects some progression
* Cozy mode: light penalties

---

## 6.8 Multiplayer

### MVP-online goal (launch target)

* Small shared regions with:

  * safe hubs
  * highways
  * arenas
* Co-op optional; PvP zones default outside hubs

### Networking model

* Start: **hosted sessions** (listen server)
* Evolve: **dedicated servers**
* Server-authoritative movement/combat for anti-cheat

### Sync scope (final)

* Player states, vehicles, projectiles, loot states, world events
* Deterministic chunk seeds reduce bandwidth

---

## 6.9 Content Pipeline (AI + human)

### Principles

* AI generates **variations**, not rules
* Game logic remains deterministic and testable

### Asset pipeline

* Standardized sprite sizes (vehicle 2:1 aspect)
* Runtime rotation permitted (single-sprite vehicles) to reduce art load

### Tools

* Aseprite (cleanup), TexturePacker, Tiled (maps), Audacity/BFXR

---

## 7) Tech Stack (Final)

### Engine & Language

* **Godot 4.x + typed GDScript**

### Physics & Entities

* CharacterBody2D for on-foot
* VehicleEntity (custom physics controller)
* Signals + composition-based systems

### Data

* Godot Resources (`.tres`) for vehicle/weapon/item definitions
* Optional JSON import pipeline → Resources

### Multiplayer

* ENet / Godot multiplayer APIs
* MultiplayerSynchronizer where appropriate

### Templates / Open Source to harvest (selectively)

* **MoonBench vehicle physics prototype** for force/traction inspiration and tuning reference. ([GitHub][1])
* **Godot 2D Top-Down Template** for general top-down scaffolding patterns (inventory/interact patterns may be reusable). ([Godot Forum][2])
* Optional: top-down shooter template patterns for inventory/interact/projectiles (only take patterns, not structure). ([GitHub][3])

**Rule:** we do not import whole frameworks blindly. We strip parts.

---

## 8) UX / UI Requirements

### HUD (vehicle)

* Speed, engine state, HP, armor sides, ammo, heat tier, kits, fuel
* Action bar for hold interactions (repair/loot/extract)
* Minimal clutter; read at speed

### HUD (on-foot)

* Health/stamina, weapon, noise indicator, interact prompt

### Menus

* Garage (loadout)
* Inventory
* Map + transporter network
* Mission log
* Faction/reputation screen
* Options + controller mapping

---

## 9) Non-Goals (to keep you sane)

* No full MMO scale at launch
* No “infinite everything” procedural interiors at launch
* No complex AI baron governance at launch
* No voice-first radio dependency (text-first)

---

## 10) Milestones (Practical Roadmap)

### Phase A — Vertical Slice (you’re basically here)

* Road loop + heat + loot + pursuer + upgrades
* One hub town + garage terminal
* One mission type (courier) + extraction banking

### Phase B — First Region Alpha

* City ↔ Highway ↔ Outpost triangle
* Enterable building + interior instance
* Basic economy (buy/sell/repair)
* 2–3 enemy archetypes

### Phase C — Online Play Alpha

* Host/join
* Shared highway region + hub
* Arena instancing
* Persistence v1

### Phase D — Launch Candidate

* Transporter hub network
* Notoriety/bounties
* 8–12 vehicles, 10–15 weapons
* 30–60 minutes of progression that loops cleanly

---

## 11) Success Metrics

* **Driving feel:** players describe it as “tight” or “addictive”
* **Decision pressure:** players voluntarily skip caches sometimes
* **Retention:** “one more run” behavior in playtests
* **Clarity:** a kid can understand loot/repair/extract without explanation (Cozy mode)

---

## 12) Key Risks & Mitigations

### Risk: scope creep (your #1 threat)

**Mitigation:** keep the “Road as dungeon” spine sacred; everything else supports it.

### Risk: multiplayer complexity

**Mitigation:** deterministic seeds + small regions first; dedicated servers later.

### Risk: content explosion

**Mitigation:** data-driven Resources + strict schemas + small curated content packs per release.

---

## 13) Appendix: “Final Feature Set” Checklist (Launch)

**World**

* 1 region, 3 hubs, 2 outposts, transporter hub v1
  **Vehicles**
* 8+ vehicles, hardpoints, armor zones, tires, fuel
  **On-foot**
* enter/exit, loot, repair, prone/crawl, interiors
  **Threat**
* heat, pursuer, ambush, roadblock, wildlife (optional)
  **Economy**
* scrap + credits + garage upgrades
  **Missions**
* courier, salvage, bounty, arena
  **Online**
* host/join co-op + PvP zones
  **Modes**
* Hardcore default + Cozy Roam

---

If you want, I can convert this into:

* a **dev-ready backlog** (epics → user stories → acceptance criteria), or
* a **pitch-deck style PRD** (shorter, investor-friendly), or
* a **single “north star spec”** you can hand to a team and say: *build this, ignore everything else.*

[1]: https://github.com/moonbench/2d-vehicles-godot-3?utm_source=chatgpt.com "moonbench/2d-vehicles-godot-3"
[2]: https://forum.godotengine.org/t/i-created-a-godot-template-for-2d-top-down-games/95350?utm_source=chatgpt.com "I created a Godot template for 2D top-down games - Plugins"
[3]: https://github.com/quiver-dev/top-down-shooter-core?utm_source=chatgpt.com "Open source top-down shooter template for Godot 4"
