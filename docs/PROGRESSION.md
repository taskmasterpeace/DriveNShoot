# DRIVN — Progression, Skills & Life Systems (design vision)

**Status:** VISION / deep-future content · **Created:** 2026-07-04
**Feeds:** ENGINE.md **M4 Character Core** (the spine), **M6 AI & Life** (taming), and a new
**M8 Base, Automation & Agriculture** pillar. · **Design source:** user brief 2026-07-04
**Honest scope note:** this is a *multi-year content vision*, not a loop. The value of writing
it now is (1) nothing gets lost, and (2) we build the **one engine** it all hangs off correctly
the first time. See §Reality & Sequencing before treating any table as "next."

---

## 0. The Spine: "You are what you do" (Ultima Online model)

No classes. Skills rise **through use**. A shared **700-point cap** across all skills forces
identity by scarcity — Grandmaster (100) in ~7 skills, or a generalist spread across 14 at 50.

### Core attributes (0–100)
| Attribute | Influences |
|---|---|
| **Strength** | carry weight, melee dmg, recoil control, ramming impact, HP bonus |
| **Dexterity** | attack/reload/hotwire speed, handling, crit, stealth |
| **Intelligence** | crafting complexity, power-grid size, bot AI slots, recipe tiers, **train speed (-1%/pt)** |
| **Constitution** | max HP, stamina, rad/disease resist, tame bonding |
| **Luck** | loot quality, salvage yield, crit, encounter bias, blueprint finds |

---

## 1. THE KEY ENGINE INSIGHT (why this sprawl is buildable)

Every single system below — marksmanship, hotwiring, robotics, taming, farming, base-building —
is the **same shape**: *a skill that gains XP through an action and crosses thresholds that
unlock capabilities.* So we do **not** build 60 features. We build **ONE progression engine**:

```
Skill  = { id, xp, level, thresholds: [{ at: N, unlocks: capability_id }] }
Attribute = { id, value, modifies: [stat_hooks] }
Action → grants XP to a skill → crossing a threshold flips an unlock flag.
```

Then every content system (weapons, vehicles, bots, animals, crops) just **registers its skill
and its unlock table** as data. Adding "Fishing" or "Armoring" = a data file, never engine code.
This is how the whole RPG becomes tractable: **build the spine once, plug content in forever.**

The same is true of the **unlock consumers**: a "combat mod" (ram plate), a "bot tier," a
"tameable species," a "crop" are all just **recipe/blueprint resources gated by a skill
threshold**. One recipe system, one gate check, infinite content.

---

## 2. Skill Catalog (thresholds → unlocks) — curated from the brief

### Combat & Medical
| Skill | Threshold | Unlocks |
|---|---|---|
| Marksmanship | 70 | unlocks **Sniping**; headshots viable |
| Sniping | 50 / 70 | ping targets for allies / shoot tires + engine-disable shots |
| Heavy Weapons | 70 | vehicle turret mounting (needs Mechanics 50) |
| Medical | 70 / 100 | field surgery (remove bullets) / resuscitate ally 1×/day |

### Survival & Foraging
| Skill | Threshold | Unlocks |
|---|---|---|
| Foraging | 70 | mutant-flora detection (glow-crops) |
| Fishing | 50 / 100 | glowfish (chem ingredient) / aquaculture |
| Cooking | 70 | combat-buff meals (+DEX 1hr) |
| Tracking | 50 | read vehicle tracks (type/speed/direction) |
| Camping | 70 | vehicle camo net |

### Vehicle & Mechanics — the road to Auto Duel
| Skill | Threshold | Unlocks |
|---|---|---|
| Mechanics | 30 / 50 / 60 / 70 / 90 / 100 | hotwire sedans → engine swaps + hotwire trucks → ram plates/grilles → side blades/shredders + silent armored hotwire → harpoon/heavy turrets/military hotwire → **build vehicle from salvage chassis** |
| Driving | 50 / 70 | PIT maneuvers, precision ramming / convoy driving (NPC followers match speed) |
| Navigation | 50 | hidden routes bypass raider checkpoints |

### Technical & Robotics
| Skill | Threshold | Unlocks |
|---|---|---|
| Electronics | 50 / 70 / 100 | EMP + radio scramblers / ECU tune (+20% fuel) / **fusion battery (infinite base power)** |
| Chemistry | 40 / 50 | unlocks **Poisons** / nitrous injection + explosive gas shells |
| Poisons | 50 / 85 | poisoned bolts / exhaust poison smoke screen |
| Armoring | 50 / 100 | heavy vehicle armor (speed penalty) / **vehicle-fort conversion (bus → bunker)** |

### The Robotics Tree — "Hotwire to Drone" (8 tiers, built in order)
| Tier | Bot | Robotics | Electronics | Also needs | Function |
|---|---|---|---|---|---|
| 1 | Junkbot | 30 | 20 | — | first build; aesthetic light |
| 2 | Scavenger Bot | 50 | 30 | Mechanics 30 | auto-loot scrap 20m |
| 3 | Combat Drone | 60 | 40 | Marksmanship 40 | pistol mount, follows |
| 4 | Turret AI | 70 | 50 | Armoring 50 | auto-target 180° |
| 5 | Repair Bot | 80 | 60 | Mechanics 70 | repairs parked car 1%/min |
| 6 | Hunter-Killer | 85 | 70 | Marksmanship 60 | rifle perimeter patrol |
| 7 | AI Co-Pilot | 90 | 80 | Driving 80, INT 80 | auto-drive + auto-aim passenger guns |
| 8 | Autonomous Vehicle | 100 | 90 | Mechanics 90, INT 100 | self-driving scavenger missions |

### Taming (Animal Handling)
| Creature | AH | Stat | Method | Role / Special |
|---|---|---|---|---|
| Stray Dog | 50 | STR 30 | weaken <20% HP, Meat×3, bind 1d | guard/scout; pack items, alarm bark |
| Mutant Hound | 70 | STR 60 | tranq (Chem 40), Meat×5, bind 2d | combat/cart; fear aura |
| Wolf | 85 | STR 60 | bait (Forage 50), Meat×10, bind 3d | pack hunter; silent, tracking |
| Roach (mutant horse) | 60 | STR 40 | sedative (Chem 50), armored saddle, 3d | mount/pack; fast travel, ram |
| War Beetle | 90 | STR 80 | pheromone (Chem 70) + lure, 5d | siege mount/living wall; tank |

### Agriculture & Base Building
- **Crops** (Agri threshold / days / yield): Corn 30/7/10 · Potatoes 30/10/15 · Wasteland Wheat
  40/14/8 · Mutant Cactus 50/14/6 · Medicinal Herbs 60/10/4 · Glow-Tomatoes 70/21/20
  (night-vision buff) · Nightshade 60/10/3 (poison) · Hemp/Tobacco 50/14/12 (trade) ·
  Rad-Shrooms 80/7/5 (rad resist).
- **Construction:** 30 scrap fortification → 50 concrete + watchtowers → 70 automated
  doors/airlocks → 100 multi-level fortress.
- **Agriculture (base):** 50 hydroponics → 60 greenhouse → 85 mutant crops → 100 self-sustaining.

---

## 3. Training methods (skill-by-use, no XP pools)
Use advances the skill directly; practice dummies/benches let dangerous skills train safely.
Marksmanship (shoot/combat) · Mechanics (repair/install/hotwire/scrap = 1–3 pts) · Medical
(heal/splint) · Robotics (build in tier order, no skipping) · Animal Handling (interact/breed) ·
Agriculture (plant/water/harvest; failures still grant) · Driving (distance; off-road/combat
bonus) · Poisons (craft + apply + hit). **INT reduces craft/build time 1%/pt** → high-INT trains
more cycles/hour.

## 4. Example Grandmaster builds (700 cap = identity by scarcity)
| Build | 100s | 70s | Identity |
|---|---|---|---|
| The Operator | Robotics, Mechanics, Electronics | Driving, Armoring | self-driving war fleet |
| The Ranger | Tracking, Animal Handling, Survival | Medical, Sniping, Foraging | nomad + wolf pack |
| The Chemist | Chemistry, Poisons, Cooking | Medical, Electronics | poison smoke, drug buffs |
| The Warlord | Speech, Barter, Heavy Weapons | Driving, Armoring | faction leader, tank driver |

---

## 5. Reality & Sequencing (the honest part)

This vision is a **full survival RPG** stacked on the driving engine: UO skills + Mad Max cars +
PZ perception + robotics + taming + farming + base-building. Built naively, that's **years** of
content. The engine is being designed so all of it *can* exist — but we ship it in playable
slices, and **we do not design 60 skills of content before the spine that runs 3 of them exists.**

**Near (build the spine + prove it on the core loop):**
- The progression **engine** (skill = xp+thresholds→unlocks; attributes→stat hooks). *M4.*
- The first **3 anchor skills** that make the drive/fix/fight loop grow: **Mechanics**
  (hotwire + repair + basic mods), **Driving** (handling/ramming), **Marksmanship** (guns).
  These plug into Loop 2's damage + arsenal systems directly.

**Mid (each is one content pass on the existing engine):**
- Combat mods & Armoring (rides the Vehicle Framework M3), Medical, Chemistry/Poisons, Electronics.

**Far (whole pillars, each a multi-loop epic):**
- **Robotics/drones** (needs AI framework + power grid), **Taming** (needs M6 AI & Life),
  **Agriculture + Base Building** (needs the M8 base pillar + world persistence).

**What we deliberately AREN'T designing yet** (churn risk — the numbers will change the moment
the systems are real): full loot tables, base power-grid math (solar panels per bot), the full
60-skill number-tuning, crop economies. These get authored **when their system is built**, not
before, because balancing content against systems that don't exist wastes the work.

---

## 6. How this maps to the roadmap
- **Loop 2 (Living Car):** damage + HUD + arsenal — the *substrate* Mechanics/Marksmanship act on.
- **M3 Vehicle Framework:** combat mods, Armoring, load/class system (Scout/Raider/Tank/Mule).
- **M4 Character Core:** **the progression engine itself** + the 3 anchor skills + inventory.
- **M6 AI & Life:** taming (dogs → wolves → war beetle), companion behaviors.
- **M8 Base, Automation & Agriculture (NEW pillar):** robotics tree, construction, farming,
  power grid, fusion battery, vehicle-fort conversion.
