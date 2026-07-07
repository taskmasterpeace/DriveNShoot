# THE INFECTED TRIALS — Shamblers, Sprinters, Echoes, Choir-Touched

**Status:** GREENLIT design (owner directive 2026-07-08 via docs/LORE_BIBLE.md §6-7+14:
"design and build this"). This contract is the build plan; the lore bible is canon.
**Builds on:** the one puppet rig (every infected is a ProtoPuppet row), the noise layer
(`emit_noise`/`noises_in` — shamblers ARE noise-seekers), population cells + zone tags
(§14's spawn table maps 1:1 onto `population_targets.json`), the one damage law, the
Carousel sites (Choir-Touched anchors), corpses (`ProtoCorpse`).

## 1. Overview
The infected are FAILED STABILIZATION TRIALS, not monsters: living bodies the continuity
AI broke while trying to fix people. One actor class (`ProtoInfected`, puppet rig + rows)
with four data-driven variants at the bible's population shares: **Shamblers** (99.35% —
slow heat/noise-drift pressure), **Sprinters** (0.5% — short explosive bursts, the
uncertainty engine), **Echoes** (0.1% — fence-climb/door-tug/tool-strike pattern horror),
**Choir-Touched** (0.05% — signal amplifiers near Carousel/radio infrastructure that make
nearby infected coordinate). A HERD is one spawn event that rolls its composition — most
herds are pure shambler; the rare sprinter roll changes everything.

## 2. Player Fantasy
A herd drifts across the interstate at dusk — slow, ignorable, a fence between you. You
pop one for the road-space and the sound pulls the rest. Somewhere in eighty shamblers,
ONE body breaks into a dead sprint, and the plan dies. Later, at a quiet farmhouse, a
fence rattles: something on the other side is climbing it the way it watched you climb.
Near the relay tower, they all stand still, facing the speaker, humming the emergency
tone before it plays.

## 3. Detailed Rules
- **3.1 One class, four rows** (`data/infected.json`, additive fold on a code floor):
  `{id, share, speed, hp, damage, senses:{noise_mult, heat_r, sight_r}, behaviors:[...]}`.
  Look = puppet appearance rows (torn civilian/worker/soldier variants by zone).
- **3.2 SHAMBLER drift:** no pathfinding — steer toward the loudest `noises_in` result,
  else drift with the herd centroid, else stand. Attack = the existing melee-claw law on
  contact. They pool at noise sources (a honking parked car WILL collect a crowd).
- **3.3 SPRINTER roll:** on herd spawn, each body rolls sprinter at 0.5% (cap 1-2 per
  herd). Dormant until movement in sight range → 6s burst at 9 m/s → overheat stagger
  (3s, the counterplay window) → repeat. Never announced; the herd looks uniform.
- **3.4 ECHO behaviors:** flag-driven verbs: climb_fence (teleport-free ledge vault at
  fence bodies), tug_door (interact-shake on enterable doors), tool_strike (pick up one
  prop, strike glass/boards), follow_pattern (repeat a siren/light cadence). One phrase
  row ("where's my— where's my—") on a voice loop.
- **3.5 CHOIR-TOUCHED:** spawn only within `choir_r` of Carousel nodes/relay/public
  screens. Passive aura: infected inside 30m gain +25% speed and share noise targets
  (coordination read). Hum row plays the EBS tone. Killing it drops the aura — audible
  relief. Dogs refuse to enter the aura (the bible's tell — `dog.gd` fear hook).
- **3.6 SPAWN = the §14 table:** `population_targets.json` gains an `infected` group per
  zone_tag (thick_forest low wanderers, road_shoulder crash victims, highway pileups
  herds, suburbs dormant interiors, military_perimeter sprinter-weighted, Carousel sites
  choir-weighted). Population cells own counts; the unseen-time rule migrates herds.
- **3.7 JURISDICTION:** infected are nobody's citizens — law/faction NPCs fight them,
  checkpoints exist partly BECAUSE of them (quarantine corridors).

## 4. Formulas
- Herd composition: `sprinters = min(2, binomial(n, 0.005))`, `echo = binomial(n, 0.001)`;
  choir only site-spawned. Example: n=80 → P(≥1 sprinter) ≈ 33%.
- Shambler steer: `target = argmax(noise.radius - dist)` refreshed 1s; speed 1.1 m/s
  (herd), 1.6 m/s (locked on).
- Sprinter burst: 9 m/s × 6s, overheat 3s; damage = claw row × 1.4.
- Choir aura: speed ×1.25, share targets, r=30m, aura dies with the body.

## 5. Edge Cases
- Herd meets traffic: agents brake behind bodies (the blocker law already scans any
  car — extend to infected groups ≥3 on the road = a phantom leader at 0 speed).
- Sprinter overheats mid-water: drowns (water law wins) — swamp herds stay shamblers.
- Echo climbs into the safehouse compound: NEVER — AUTHORED rect is a no-spawn,
  no-path zone (home stays home).
- Choir-Touched at the Test Grounds gator pen: choir sites only — pens are not relays.
- Co-op: host-authoritative like every threat; herds sync as positions, variants at spawn.

## 6. Dependencies
Puppet rig (looks/animate), noise layer (proto3d `emit_noise` — add infected as
consumers), population cells (`infected` group + counts; §3.2 instantiation bridge),
melee/damage law, corpse law (infected leave ProtoCorpse), dog fear hook, Carousel site
registry (carousel.gd node positions), checkpoint kit (BANDIT_CONVOY_ECOSYSTEM.md — the
same barricades serve quarantine), save (cell counts persist — herds are cell data).

## 7. Tuning Knobs
| Knob | Default | Governs |
|---|---:|---|
| shares (per variant) | 99.35/0.5/0.1/0.05 | the bible's uncertainty economy |
| herd size band | 6–80 | pressure vs performance |
| sprinter burst/overheat | 6s/3s | panic vs counterplay |
| choir aura r / speed mult | 30m / 1.25 | how far the dread reaches |
| noise lock range mult | 1.0 | how bad honking the horn is |
| infected per zone row | §14 table | where the world is dangerous |

## 8. Acceptance Criteria (sims named)
1. `infected_sim`: rows fold; a herd of 40 spawns with ≥38 shamblers; composition
   deterministic under a seeded rng.
2. Shamblers converge on an `emit_noise` source and pool there (drift proven, no pathing).
3. A staged sprinter stays dormant until movement in range, bursts ≥8 m/s, then
   staggers ≥2.5s (the window).
4. An Echo climbs a staged fence body and tugs a locked door (verbs fire; no teleport).
5. `choir_sim`: infected inside the aura outpace those outside by ~25%; the dog refuses
   the aura ring; killing the Choir-Touched normalizes both.
6. Population rows: `military_perimeter` herds roll sprinter-weighted; `road_shoulder`
   singles; unseen-time migration moves a herd cell-to-cell (ledger, not teleport).
7. Traffic brakes behind a herd crossing the interstate; nothing regresses
   (traffic/world/save suites green untouched).
