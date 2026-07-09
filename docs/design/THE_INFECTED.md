# THE INFECTED — the failed trials, the herd, and the silence with an address

**Status:** GREENLIT arc (owner, 2026-07-09) — supersedes `INFECTED_TRIALS.md` (its taxonomy and
behaviors port intact; its plumbing — no ecosystem interface, no pressure writer, no tag grammar,
no phases — is what this replaces). Built by ground→design→critique workflow against the live
worktree; every fork the critics caught is resolved in §0.
**Canon:** `docs/LORE_BIBLE.md` §6-7+14+20 (the Trials, the shares, the spawn geography, the
mystery ledger). **Consumes/provides:** LIVING_WOUND_ECOSYSTEM (this arc is the contracted WRITER
of `corpse.infection`, `choir_zone`, `infection_pressure` — LWE §6), DSOA §6 (quarantine law),
SECURITY_LADDER (posts), NAVIGATION (danger cost), FAMILY_EMPIRE (crisis law, route danger),
CLONING (scan refusal), SPECTACLES (the PIT LAW), radio/TV/media (bulletins, the Trials films).

> **Vocabulary law (binding):** the word *zombie* never appears in code, rows, barks, docs, or UI
> (LORE_BIBLE:216, :788). Sanctioned: **THE INFECTED** · **SHAMBLERS / SPRINTERS / ECHOES /
> CHOIR-TOUCHED** · **HERD**. Registers for flavor: Machine Cant, Dead Radio, The Choir,
> Nullspeech, God Static (faith states), Lake Talk.

> **Mystery ledger (binding, LORE_BIBLE §20):** nothing here ever states whether the optimizer
> still transmits, whether Choir-Touched receive live orders or replay dead ones, whether Echoes
> remember, whether the Trials still run, or why the player never turns. Every mechanic works
> under BOTH readings. The street believes the grid-cascade story; the deep lore murmurs the
> machine; the fork stays forked.

## 0. RATIFIED RULINGS (the forks, resolved — binding on every section below)

| # | Ruling |
|---|---|
| 0.1 | **ONE phase spine: I1 → I2 → I3** (THE FIRST CHOIR → THE TAXONOMY, THE BODY, THE LAW → THE TRIALS + FULL COUPLING). I1 is deliberately zero-hard-gate (bespoke carousel spawns, no P0, no M-ladder, no LWE). Sprinters/Echoes/Choir-Touched-at-scale, population GROUPS wiring, quarantine, the surge → I2. Radio towers, films, full coupling → I3. |
| 0.2 | **ONE `infection_pressure` formula (F-IP):** stateless anchor FLOOR + a dt-scaled decaying accumulator hard-capped at **DYN_CAP 0.55 — an absolute balance law**: corpse+herd alone can NEVER cross `INFECT_ABSENT 0.6`. Total bird-silence is only ever a PLACE. Corpse-farming thins the birds; it cannot mint silence. |
| 0.3 | **`choir_r` code floor 650 m** (the multi-cell blot); per-base override legal on carousel rows; **fort_benning overrides to 220** — the intentional small first zone. Blot math at 650: π·650²/500² ≈ **5.3 cells**. The point predicate `choir_zone(pos)` is canonical; cell membership = any part of the cell inside (`dist(cell_center) ≤ choir_r + 354`) so a zone can never be smaller than its tells. |
| 0.4 | **fort_benning IS the first Choir zone — embraced.** It is ring_order[3], a mandatory DIAL node: THE DIAL forces every player to touch the silence. Its purge objective becomes *purge the congregation; the anchor stays* — you clear the base and the silence doesn't lift (never explain why; §20). Booked same-arc: `carousel2_sim` retargets its raider asserts to `norfolk_yard` and gains choir asserts for benning. *Owner-flip: keep benning raider and mint a non-ring relay base instead.* |
| 0.5 | **BITE FEVER (one name, one owner — §3.6), reshaped to be worth fearing:** 36 game-hours (1.5 game-days), VISIBLE (portrait pales, fevered-breathing loop, your own dog sniffs you), modest taxes, cleared only by sleeping a full night in a bed **plus** an `antibiotics` item row — a medkit treats the wound, never the fever. It is scan-DETECTABLE: quarantine stops read it, clone clinics refuse it. **The state fears your body more than your body does.** No conversion, ever (law, §3.6). |
| 0.6 | **Sprinter trigger `trigger_move_mps 5.0`** — walk (4.2) and crouch (2.4) are SAFE, run (7.2) is hot; the copy "walk, don't run" is now true against shipped speeds. Its ear: an event wakes it if `dist ≤ min(event.radius, ear_r)`; only PLAYER-attributed events additionally scale by `noise_mult`; walking emits nothing. The overheat is READABLE: bent-double motion row + wheeze SFX. |
| 0.7 | **Herd density is honest:** standard realize band 8–16; `highway_pileup` set-pieces are a flagged exception (cap 32–40) paid for by the HULK LOD LAW — beyond ~40 m shamblers render as frozen un-ticked hulls that wake by ring (they are BY DESIGN the cheapest actor: no pathfinding, one steer vector). Gate: a headless perf probe in `infected_sim` BEFORE the pileup cap ships; if it fails, the fantasy copy is rewritten to the half-mile-file read. |
| 0.8 | **The Echo is a worker that waits; the lurker is a hunter that freezes.** Echo differentiation: its phrase loop is an APPROACH tell (~25 m, cadence synced to its verb rhythm); it is always AT something (fence, door, glass), hands busy; it NEVER advances on you. Binoculars name the two differently. Co-op gaze v1 = HOST gaze only (`sight_facing` isn't in the sync packet — the packet field is a later flag). |
| 0.9 | **The warning contract counts only GUARANTEED channels** (a DRIVER must get the reads): ambience dip (I1's `_amb` term), **THE DIAL BLEEDS** (inside `choir_r` music stations and Y-scans degrade into EBS fragments/nullspeech — the canonical in-car read), quarantine dressing + road_shoulder crash-victim singles as the approach ramp, and traffic braking behind herds (brake lights ARE the driver's herd tell — promoted INTO the contract). Dog balk, birds, the hum, binoculars = bonus depth, never contract lines. |
| 0.10 | **The static sign points the canon way (LORE_BIBLE:305):** they stop when the signal CUTS. Your Y-scan sweep steps on the local band — the hum dies mid-note and the amplifier + aura'd bodies HALT because the signal STOPPED. Barks/copy never say "static stuns them." (SFX id `static_cut` was already right.) |
| 0.11 | **The Trials payoff is three found_reel PROTOCOL FILMS** (found_doc doesn't exist; the video pipeline ships today): redacted orientation reels on the safehouse TV / drive-in, past-tense, no dates after Black Week. Each film teaches a READ — Urgency: binoculars may tag "one stands wrong" (sprinter-suspect, probabilistic, never certain); Calm: corpse dressing distinguishes trial-dead from plain dead; Echo: the K-sheet names its verbs. Fear literacy, not a codex line. |
| 0.12 | **The herd's voice is NULLSPEECH, not a moan:** `inf_moan` is KILLED. Shambler idle = murmur rows — broken word fragments in number-station cadence (half a ZIP code, a road designation, a clipped statute). Choir-Touched get per-STATE phrase rows (in Georgia it recites Georgia's own gun statute — `world_state` knows each state's law). The wrongness is audible before you see a body. |
| 0.13 | **Anchor registry honesty:** Choir anchors = `carousel.json bases[].pos` ONLY until radio towers exist (ZERO exist in data or code today). Radio towers land as NEW authored placements WITH I3 (also unblocking LWE's Tower Bird); `public_screen` positions are the optional third class. ONE registry, shared with LWE's nest sites — two readers, one truth. |
| 0.14 | **The gunfire noise emitter lands INSIDE `ProtoWeapon.fire()`** so EVERY shooter emits — player, enforcer, pirate, hood MG, net ghost. NPC firefights become herd magnets; "kite the herd onto the garrison" is real. `horse.gd`'s bespoke 40 m emitter retires into the unified 60 m. Booking shared with LWE — first-lander adds it, exactly once. |
| 0.15 | **Radio signal id `herd_warning`** (never `infected` — don't overload the group name). Newsroom verb `report_advisory` (never `report_outbreak` — the codebase doesn't assert contagion; the state's own fearful copy may). |
| 0.16 | **Tag bundles are the ecosystem's grammar, exactly:** Shambler `[infected, blind, medium]` · Sprinter `[infected, fast, medium]` (its sliver of sight is THE documented exception to herd blindness) · Echo `[infected, blind, climber, medium]` · Choir-Touched `[infected, blind, medium]` + `site_only: true`. `choir_zone` is a REGION tag and never appears in a body bundle. |
| 0.17 | **THE PIT LAW (binding, the DOG LAW's mirror):** infected never fight in pits. Ever. They are failed CITIZENS — failed workers, soldiers, patients — not wild things; the horror dies the day they become livestock. Venue rows carry no infected class; capture gear refuses the `infected` group; at most one bark acknowledges the taboo. |
| 0.18 | **THE PREY LAW (LWE P3):** predator packs take lone stragglers (a shambler is meat), never engage clusters ≥ 5. The kill writes `corpse_heat` AND the body keeps `infection` — scavenging spreads pressure. No free lunch. |
| 0.19 | **The garage answers the herd:** RAM PLOW armor row (VehicleForge) halves herd-mass chassis cost. **PARK-AND-LURE is a named tactic:** a parked car's engine+radio keep emitting; the herd pools on your car while you loot the block. |
| 0.20 | **No portal interiors** (THE_AMERICAN_ROAD 0.9 binds this arc) — the Trials stay a surface mystery until portal tech proves out. **No Library dependency** (TABLED) — the films ride the media layer. |

## 1. Overview

FAILED STABILIZATION TRIALS: living bodies the continuity AI broke while trying to fix people
(Calm Protocol → Shamblers · Urgency Protocol → Sprinters · Echo Protocol → Echoes; Choir-Touched
is a STATE, not a fourth trial — any body near an anchor can be signal-touched, which is why that
row is `site_only` rather than share-rolled). Not undead, not a species, not anyone's citizens.
Eleven years on they are a known environmental threat that belongs to PLACES — quarantine
corridors, pileups, dead suburbs, the ground around Carousel anchors — the way howlers belong to
the NIGHT. **The differentiation law: howlers are a time, infected are a terrain.** They never
flee dawn, never fear headlights, never care about weather, because they hunt by NOISE, and noise
ignores every vision tax.

**One actor class** — `ProtoInfected` (`game/proto3d/infected.gd`, NEW): copy `lurker.gd`'s
213-line frame (capsule + shared ProtoPuppet + `Damageable` + stun/shove/knockdown + `melee_clear`
claw + population-unregister + ProtoCorpse death), swap the stalk block for the howler's
loudest-noise steer. Every variant is a ROW (`data/infected.json`, additive fold), every look a
puppet appearance row, every gait a motion row (MotionForge, F10 refold). Groups:
`infected` + `threat` + `combatant` (melee scans the union — every weapon works untouched).

## 2. Player Fantasy

You crest the overpass and the interstate below is MOVING — a herd strung across six lanes,
drifting through the wrecks toward some noise only they can hear, murmuring broken ZIP codes in a
cadence that isn't speech. Brake lights bloom ahead of you: traffic knows before you do. You kill
the engine. The radio dissolves into EBS fragments mid-song — that's how you learn the silence has
an address. One body in eighty is a knife that looks like all the others, so you walk, you don't
run, and you keep your dog close because she balks fifteen meters before your eyes find the reason.
A fence-line silhouette pauses mid-climb exactly when you look at it, hands still ON the wire.
And when a claw finally catches you, the fever that follows is survivable — but the checkpoint
scanner two counties over will see it, the clinic will turn your body away from the vat, and the
marshal will look twice. **The state fears your body more than your body does.** You clear
fort_benning wall to wall, and the birds still don't come back. Nobody explains why.

## 3. Detailed Rules

### 3.1 The taxonomy as rows (`data/infected.json`, code floor + additive fold)

Code-floor schema:
```json
{ "id": "", "share": 0.0, "hp": 26, "claw": 8.0, "claw_cd": 1.4,
  "speed_mps": 1.1, "lock_speed_mps": 1.6,
  "senses": { "sight_r": 0.0, "ear_r": 0.0, "heat_r": 0.0 },
  "tags": ["infected", "blind", "medium"], "verbs": [],
  "puppet": {}, "motion": "infected_shuffle",
  "voice": { "idle": "inf_murmur", "cooldown_s": [12, 30] } }
```
`heat_r` ships 0 (reserved): one sense bus today; a running engine is already a standing noise
event, which covers the heat-drift fantasy without a second sense system.

- **SHAMBLER** (`share 0.9935`) — no pathfinding, EVER: steer at the loudest `noises_in` hit,
  else drift with the herd centroid at 1.1 m/s, else stand; 1.6 m/s locked; claw on contact
  through the wall law. They POOL at noise sources (a honking car, a radio left on, a generator)
  until louder news arrives. Walls stop them; pooling at walls is correct behavior. Looks: torn
  civilian/worker/soldier palettes, `limp "l"|"r"` on ~40% (the shipped limp field drags the leg
  free). Idle voice = NULLSPEECH murmur (0.12).
- **SPRINTER** (`share 0.0050`) — the uncertainty economy. Rolled at herd spawn, capped 1–2 per
  herd, visually identical to a shambler until it breaks (never announced). Dormant; the ONE
  variant with a sliver of sight because the Urgency Protocol attacks MOVEMENT: trigger per
  F-SPRINT (0.6) → 6 s burst at 9 m/s → 3 s overheat stagger (bent-double row + wheeze — the
  guaranteed window) → re-arm. Damage claw ×1.4. Stillness AND silence both beat the trigger.
- **ECHO** (`share 0.0010`, verbs `[climb_fence, tug_door, tool_strike, follow_pattern]`) —
  pattern horror at the fence line. Reuses the lurker's exact gaze check but INVERTED: verbs run
  only while unobserved; under your gaze it pauses mid-motion, hands still on the wire, and
  resumes when you look away. It is always AT something and NEVER advances on you (0.8). One
  phrase row on a ~25 m loop ("where's my— where's my—") — the approach tell. Whether it
  remembers is never stated.
- **CHOIR-TOUCHED** (`share 0.0005`, `site_only`) — signal amplifiers, NOT commanders. Spawn only
  inside a Choir zone; a herd rolled there gets exactly one, standing near the anchor, facing it.
  The canon signs: hums EBS fragments (`hum_r 45 m` — the warning outranges the danger), turns
  toward speakers before sound, recites its state's own clipped statutes (0.12). **Aura** (30 m,
  while alive): infected inside gain speed ×1.25 and share the amplifier's loudest noise target.
  Kill it → aura and hum die the same frame — audible relief. Dogs refuse the aura ring.

**A HERD is one spawn event** rolling composition against the shares (F-HERD-COMP): most herds
are pure shambler; one body in eighty changes everything. Ledger 6–80; realized 8–16 (0.7).

### 3.2 Where they live — herds as cell data + THE CHOIR ZONE LAW

**Herds are population-cell data.** `population.GROUPS` gains `"infected"` (an honest CODE change
— the const is authoritative) at I2; `population_targets.json` gains infected counts per zone_tag
plus three NEW zone_tags (`deer_path`, `highway_pileup`, `carousel_site` — none exist among the 8
shipped) and a **per-group `max_materialized` override** (the global default is 4 — the herd band
needs its own). Spawn geography is LORE_BIBLE §14 verbatim: thick_forest low wanderers ·
deer_path drift · road_shoulder crash-victim singles (the approach ramp on corridors into zones)
· highway_pileup HERDS · suburbs dormant interiors (realize only on a noise event within 40 m) ·
military_perimeter sprinter-weighted ×4 · carousel_site choir-weighted. Cells own counts;
unseen-time migration moves ledgers, never teleports actors. First geography: the I-95/I-75 FL/GA
corridor — the first herds appeared around quarantine corridors, and the checkpoints already
stand there.

**THE CHOIR ZONE LAW.** A Choir zone is a PLACE where the machine language is loud (the Choir is
a street name for the signal, not an org). `carousel.gd` exposes the anchor registry (0.13);
`choir_zone(pos)` is the point predicate (F-CHOIR); cells derive membership per 0.3. Inside:
Choir-Touched spawns legal, the DIAL BLEEDS (0.9), the bed suppresses, dogs balk at the edge,
birds go per LWE's own thresholds. A base row may set `occupier: "choir_congregation"` — one new
match arm in `_spawn_occupation`, spawning a herd + one Choir-Touched inside the 130 m wake ring.

### 3.3 How they read — the warning contract (guaranteed channels only, 0.9)

An infected-held cell must present **≥ 2** of the guaranteed reads before first contact; a Choir
zone must present **≥ 3**. Guaranteed (always-on at their thresholds, sim-asserted):

| # | Read | Channel | Lands |
|---|---|---|---|
| 1 | Ambience dips — the `_amb` bed suppression term | EAR (in-car too, low) | I1 |
| 2 | **THE DIAL BLEEDS** — music/scan degrade to EBS fragments inside `choir_r` | RADIO (the driver's read) | I1 |
| 3 | World dressing — quarantine kit, painted head-counts ("40 HEAD"), HERD X-ING signage, road_shoulder crash singles on the approach | EYE at speed | I1/I2 |
| 4 | Traffic brakes behind a herd — brake lights ahead ARE the herd tell | EYE at speed | I2 |
| 5 | `herd_warning` radio signal (howlers-row clone, night_mult 1.4) | RADIO (pull) | I1 |

Bonus depth (never counted toward the contract): dog balk ring · NO-BIRDS / Whitewing absence /
Tower Bird (LWE-gated) · THE HUM at 45 m · infected corpses read WRONG (pale tint, no pack loot,
Rot Bloom + corpse-flies) · binoculars ledger read ("HERD — ~40 · drifting west" via
`set_recon_tags`; Echoes and lurkers are NAMED apart). Every read is diegetic — the reads ARE the
surface.

### 3.4 Counterplay matrix

| Lever | Shambler | Sprinter | Echo | Choir-Touched |
|---|---|---|---|---|
| **Noise** | THE lever: silence walks through a herd; thrown noise relocates it (horn 70 m, radio ≤90 m, glass 55 m) | event wakes it if `dist ≤ min(event.radius, ear_r 20)`; your own events scale by `noise_mult` (crouch shrinks you) | as shambler | your noise becomes EVERYONE's target (shared aura target) |
| **Sight** | none (blind) | 12 m × daynight × weather mults — dust/night blind it | none — but IT watches YOU: verbs run only unobserved | none |
| **Stillness / speed** | n/a | **walk (4.2) is safe; run (7.2) wakes it** (trigger 5.0) | n/a | n/a |
| **Light** | ignored — headlights mean nothing (the anti-howler; teaches the two grammars apart) | no effect | no effect | no effect; dogs refuse the ring instead |
| **The dial** | — | — | — | Y-scan within 25 m steps on the band → the hum dies mid-note → **2.5 s HALT** (0.10); 10 s cooldown per amplifier |
| **The window** | walk away — 1.6 m/s locked | the 3 s overheat (readable: bent double, wheezing) | hold your gaze while your partner works (host gaze v1) | kill it → aura + hum die together |
| **Vehicle** | a herd is a MASS: plowing ≥3 bodies costs chassis + speed (RAM PLOW halves it, 0.19); traffic brakes behind herds | can pace a dirt-road car briefly (9 m/s) | — | — |
| **Gunfire** | **calls the herd** — every shooter emits 60 m (0.14) | can trigger the burst | — | feeds the shared target |

Plus: **sprint footfalls** emit `(pos, 12 m, "steps", who:"player")` every 0.7 s while sprinting —
"hunts by noise" is true of the loud player; walking emits nothing, so the crouch/walk counterplay
is exact. **PARK-AND-LURE** (0.19) is legal and intended. The causeway trick (lure a herd off a
bridge into deep water) works — they drown quietly — but every body feeds `infection_pressure`:
emptying a herd into the canal taints the cell for days.

### 3.5 Quarantine — the law reads the land (I2)

`quarantine_law` is ONE law-profile row (DSOA §6.4 shape — curfew, checkpoint_density 0.8,
contraband `[choir_fragment, bio_sample]`, broadcast_style advisory_loop). Quarantine POSTS are
the SECURITY_LADDER `checkpoint` patrol kind placed at corridor/zone edges, DRESSED with the
bandit checkpoint kit (a dressing row, not new props). State Enforcers engage the `infected`
group on sight — infected are nobody's citizens. Stops run F-STOP-Q: the body scan reads BITE
FEVER as 2 contraband stacks — with the 36 gh fever this is a REAL window, not a vestige.
Safehouse immunity holds absolutely. Advisories ride `report_advisory` → radio bulletin + TV
lower-third, advisory-voiced, never explanatory.

### 3.6 BITE FEVER — the player condition (THE RULING, reshaped per 0.5)

**The player is never converted. No meter fills toward becoming one of them.** Grounds: (a) canon
transmission is PROTOCOLS — no bite-vector exists in the bible; (b) a conversion meter would
ANSWER sealed questions (are new infected still being made? what is the player?); (c) the death
law is wake-at-the-safehouse — a turn mechanic fights it. The refusal is itself lore: the AI's
own list for the player includes "immune variable." The game never says which. **Fever is a dirty
wound, and that is all the game will ever say.**

Mechanics: an infected claw wound that lands starts **BITE FEVER — 36 game-hours** (1.5 game-days).
Taxes: stamina regen ×0.75, hunger drain ×1.3 (+0.84/gh extra over the 2.8/gh base ≈ +30 hunger
across the full run). VISIBLE: K-sheet portrait pales + one moodle line ("FEVER — dirty wound"),
a low fevered-breathing loop, your own dog sniffs you and whines. Cleared ONLY by sleeping a full
night in a bed AND an `antibiotics` item row (pharmacy/clinic/medkit-tier-2 loot) — a medkit
`treat()` closes the WOUND, never the fever. Detectable: quarantine scans (3.5) and clone clinics
— **the clinic refuses a fevered body; black-market vats don't care, +1 on the defect roll**
(contagion-RISK language only; never "mid-trial" — that phrasing is banned, §20). Serialized with
`.get`-default so old saves load clean. Fever lands I1; the scan consumers land I2.

### 3.7 THE TRIALS — kept, and paid off as films (0.11)

The Trials are the origin fiction that GENERATES the taxonomy (title means "the infected, who are
trials" — no dungeon mode). Payoff: **three found_reel PROTOCOL FILMS** — redacted government
orientation reels (Calm / Urgency / Echo), placed per §14 geography (Urgency near
military_perimeter — sprinters were trialed near military hospitals). Past tense, no dates after
Black Week, no signatures; the redaction bound carries onto film content (title cards, burned
frames). Each film teaches a READ (0.11) — fear literacy, §20-safe, probabilistic, never certain.
A scratchy Calm Protocol training film on the safehouse TV at 2 a.m. is the beat. All three →
one K-sheet codex line that answers nothing.

## 4. Formulas

- **F-CHOIR** (the Region predicate, derived never stored):
  `choir_zone(pos) = any anchor a: dist2d(pos, a.pos) ≤ a.choir_r` · cell membership:
  `dist2d(cell_center, a.pos) ≤ a.choir_r + 354` (half-diagonal of the 500 m cell — the zone is
  never smaller than its tells). [anchors per 0.13; choir_r code floor 650 (120–1000);
  fort_benning row 220; ex: player 180 m from benning → inside (dog balks, dial bleeds,
  Choir-Touched legal); 260 m → outside; the benning CELL is choir-member out to 574 m of its
  center.]
- **F-IP** (the one `infection_pressure` writer — LWE §3.2's derivation, amended same-commit):
  `ip = clamp(anchor_floor + dyn, 0, 1)` ·
  `anchor_floor = K_anchor × MAX_over_anchors(clamp(1 − dist/choir_r, 0, 1))` (max, never sum) ·
  `dyn += deposits − dyn × DECAY × dt_gh`, hard cap `DYN_CAP 0.55`. Deposits (dt-honest):
  each infected body's decay sweep deposits `D_corpse × corpse.infection` once-per-sweep-scaled
  (D_corpse 0.10/body); herd presence deposits `K_herd × herd_count/HERD_NORM` per game-hour
  (K_herd 0.08/gh, HERD_NORM 40). [K_anchor 0.7 (0.4–0.8); DECAY 0.02/gh — half-life ≈ 35 gh ≈
  1.5 game-days ("corpses taint the cell for days" is now true under the math); DYN_CAP 0.55 <
  INFECT_ABSENT 0.6 is the 0.2 balance LAW. Worked: 6 fresh infected corpses anywhere → deposits
  0.60 → dyn caps 0.55 → anchorless ip 0.55: birds THIN, bed muffles, never silent. Same six at
  260 m from a default anchor (floor 0.7×0.6=0.42) → ip 0.97: NO-BIRDS, bed dead. A day and a
  half later dyn≈0.27: anchorless 0.27 (recovering), anchored 0.69 (still silent). fort_benning
  cell at 80 m (choir_r 220): floor 0.445; its standing congregation (herd 12) feeds 0.024/gh →
  dyn ≈0.30 within a day → ip ≈0.75 and stays there.]
- **F-HERD-COMP** (one spawn event; seeded rng = hash(cell_id, day)):
  `sprinters = min(2, binomial(n, 0.005 × zone_mult))` (zone_mult 4.0 at military_perimeter) ·
  `echoes = binomial(n, 0.001)` · `choir = choir_zone ? 1 : 0` · rest shamblers.
  [ex: n=80 pileup → P(≥1 sprinter) ≈ 33% — two of three big herds are pure shambler, and you
  can't tell which.]
- **F-SPRINT** (trigger + burst, 0.6): `trigger = (mover_speed > 5.0 AND dist < 12 ×
  daynight.vision_mult × weather.vision_mult AND !sight_blocked) OR (noise event with dist ≤
  min(event.radius, ear_r 20) [player-attributed events × noise_mult])` → burst 9 m/s × 6 s →
  stagger 3 s → re-arm. [ex: dust-storm night sight = 12×0.5×0.18 ≈ 1.1 m — functionally blind;
  crouched player's own footfall events shrink to 11 m reach. Walk at 4.2: dormant. Run at 7.2:
  it breaks.]
- **F-AURA**: while alive, infected within 30 m gain speed ×1.25 and inherit the amplifier's
  loudest target; MAX never product on overlap; dies with the body, same frame. [ex: one shot
  fired inside the aura → ALL 14 aura'd bodies acquire your muzzle at 1.375–2.0 m/s.]
- **F-HUM/HALT** (0.10): hum audible at `aura_r + 15 = 45 m` (the warning outranges the danger);
  Y-scan within 25 m → signal steps on the band → amplifier + aura'd HALT 2.5 s; cooldown 10 s
  per amplifier (no chain-stun).
- **F-BITE-FEVER** (0.5): `fever_until = now_h + 36`; while fevered `stam_regen ×0.75`,
  `hunger_drain ×1.3` (= +0.84/gh extra); cleared by (slept_full_night AND antibiotics_used);
  scan-visible. [duration knob 24–48 gh; never kills by itself — a tax with a social shadow.]
- **F-STOP-Q** (SECURITY_LADDER §4.2 verbatim + the body scan):
  `stop_chance = 0.35 × (1 + 0.15 × min(n, 4)) × standing_mult`, `n = contraband_count +
  (fevered ? 2 : 0)`. [ex: clean pack, fevered, NEUTRAL → 0.35×1.3 = 0.455; HERO → 0 (their law).]
- **F-NAV** (cost, never a wall): `edge_cost_s = base_time_s + W_danger × pts`,
  `pts = 2 × ip(cell) + (choir_zone ? 4 : 0)`. [W_danger 0–60 s/pt is NAVIGATION's existing dial;
  ex: W_danger 20, choir edge at ip 0.5 → +100 s — the courier detours unless the detour costs
  more; if no detour exists the journey PROCEEDS and the record law prices it. NEVER A STATUE.]
- **F-ROUTE** (the empire feed): `route_danger' = route_danger + ceil(2 × max_ip_on_route) +
  (crosses_choir ? 1 : 0)`. [+0–3 danger; a 40 km freight leg at rate 5 goes 200→290 scrip —
  quarantine pays, which is exactly why couriers keep dying there.]
- **F-SURGE** (blood moon; size only, SHARES NEVER CHANGE — the uncertainty economy is canon):
  `herd_n' = round(herd_n × 1.5)`; realize cap +4 that night; composition re-rolls on n' with
  fixed shares. [ex: 24 → 36 bodies; P(≥1 sprinter) 11.3% → 16.5% by n alone. War days never
  roll blood moon (events.gd returns early) — the surge cannot stack with war pirates.]
- **F-BULLETIN**: `report_advisory(town)` fires when a town cell's ip crosses 0.6 upward
  (BULLETIN_T = INFECT_ABSENT — the birds and the news agree), one per town per day, and once on
  `quarantine_law` adoption.

## 5. Edge Cases

- **Herd on the carriageway vs traffic** → a NEW parallel scan branch beside `_car_ahead`
  (reusing `_car_travel_arc` — it is not an extension of the existing check): herds ≥3 project a
  phantom leader at 0 speed; agents brake, never plow. A REAL car plowing ≥3 bodies takes chassis
  damage + hard slowdown (RAM PLOW halves it).
- **Lured herd walks into deep water** → the water law wins: they drown quietly, no swim verb;
  every body keeps `infection` and feeds F-IP — the canal trick taints the cell for days.
  Sprinter mid-water: drowns. Swamp herds are effectively shambler-only — Alligator Alley's
  threat grammar stays the gator's.
- **80-body ledger vs realized budget** → counts-not-instances: realized subset priority
  choir > sprinters > shamblers; binoculars read the LEDGER ("~40") so the number you fear is
  real even unrendered; pileup exception + HULK LOD per 0.7; realized infected count against the
  same enemy budget as howler night packs on corridor cells.
- **Two anchors overlap** → anchor_floor takes MAX; auras take MAX. No double-silence, no
  super-speed.
- **Corpse-farming for weaponized silence** → impossible by 0.2: dyn caps 0.55 < 0.6. Birds thin,
  bed muffles, silence stays a place.
- **Echo watched-pause in co-op** → v1 HOST gaze only (0.8); leapfrog-gaze teamwork arrives with
  the packet field, flagged.
- **Static-halt while driving / in co-op** → host-side 2.5 s timer on the amplifier; any player's
  scan within 25 m triggers; 10 s cooldown per amplifier.
- **Choir circle overlaps a safehouse/holdout rect** → the AUTHORED rect stays absolute
  no-spawn/no-path; the zone READS still apply outside the walls — home is safe, the land around
  it is not; walls do their job on herd crisis rolls.
- **A journey's only route crosses a zone** → F-NAV is cost, never a wall: proceed; record tier
  rolls the price; a fail drops cargo at the fall point (the FAMILY satchel law).
- **Herd at the home wire during another home crisis** → the FAMILY attention law rules (≤1
  surfaced per category): folds into the existing ping; the metaworld record runs both; the
  return briefing itemizes.
- **Venue cards an infected fighter / trap aimed at a shambler** → THE PIT LAW (0.17): nothing to
  schedule; traps refuse the group with a bark, no latch.
- **Predator pack meets a herd** (LWE P3) → THE PREY LAW (0.18): stragglers only, never clusters
  ≥5; the kill seeds heat AND keeps infection — predation relieves count, seeds pressure.
- **Player purges the fort_benning congregation** → bodies die, the ANCHOR does not (0.4): F-IP
  decays toward the anchor floor; birds return partway; dogs still hate the inner ring. Never
  explain why.
- **A player-ruled state adopts/repeals quarantine** → law is paper, pressure is real: the
  profile applies/removes checkpoints/contraband/curfew/advisories; it does NOT despawn herds or
  zero ip. Repealing quarantine over a hot corridor is a legal act with ecological consequences.
- **Howlers meet infected at night** → they ignore each other in I1/I2 (different groups; howlers
  hunt the player, infected hunt noise). The herd drifts to the GUNFIRE of a howler fight —
  screams are audio-only (LWE F-CALL), never noise events; nobody builds a scream event.
- **F10/reload_content() mid-fight** → refolds floats live; never re-rolls realized composition —
  no sprinter appearing because a knob moved.
- **Old saves** → GROUPS addition banks zero counts; `.get('fever', 0)` defaults clean; rows
  without `choir_r` use the 650 floor; bulletin latches save (no alt-F4 double bulletin).
- **I1 lands before ANY LWE phase** → designed-for: registry + `corpse.infection` + F-CHOIR land
  anyway (writers-first); F-IP banks in the base's saved state until cells exist (then the
  director's ledger at I2, then `row["eco"]` when LWE wires); bird/bed tells light up whenever
  LWE arrives. No re-work in either order.

## 6. Dependencies (bidirectional; the amendments ledger lands SAME COMMIT as this doc)

**This arc provides:** `corpse.infection` · `choir_zone` · `infection_pressure` (the LWE §6
contract, satisfied at I1) · the `infected` Body-tag population · quarantine law surface ·
`herd_warning` / `report_advisory` / the Trials films · THE PIT LAW / THE PREY LAW.

**File map (engine):** `infected.gd` (NEW) · `corpse.gd` (+infection, ONE shared edit with LWE's
+heat/indoors/gnawed + "carrion" noise — first-lander adds all fields) · `carousel.gd` (registry +
`choir_congregation` arm) · `carousel.json` (fort_benning row; `choir_r` legal on all rows) ·
`weapon.gd` (`fire()` gunfire emitter, 0.14) · `radio.gd` (SIGNALS `herd_warning` + 3 LORE lines +
the DIAL-BLEED zone check in scan/music paths) · `dog.gd` (balk ring) · `proto3d.gd` (`_amb`
suppression term; net kind `"infected"` + a `_make_enemy_ghost` arm; sprint-footfall emitter) ·
`population.gd` (GROUPS + F-IP into `row["eco"]` when it exists) · `population_targets.json`
(+3 zone_tags, per-group max_materialized) · `world_stream.gd` (ONE touch: the bridge match arm,
scheduled AFTER NAV-P2's dehydrate hook per the published hot-file order) · `character.gd` (fever)
· `events.gd` (surge) · `traffic.gd` (phantom branch) · `newsroom.gd` (`report_advisory`) ·
`law_profiles.json` (+quarantine row) · media manifest (3 found_reel rows) · soundforge manifest
(`inf_murmur`, `inf_phrase`, `choir_hum`, `static_cut`, `fever_breath`; `choir_hum` joins LOOPED)
· motions.json (`infected_shuffle`, `infected_burst`, `overheat_bent`) · VehicleForge (RAM PLOW
row) · `lurker.gd` READ-ONLY (its gaze check and stealth-scaled-range pattern are reused, never
subclassed).

**The amendments ledger** (each doc gains its one line, this commit): LIVING_WOUND_ECOSYSTEM §3.2
(derivation now names corpse deposits + herd load + anchor proximity = F-IP here) and §6 (the
greenfield pointer → THE_INFECTED.md I1) · LIVING_WORLD_DSOA §6.2 (+Quarantine rules category) ·
CLONING (clinic refuses fevered scans; black-market +1 defect) · SPECTACLES (THE PIT LAW) ·
THE_FAMILY_EMPIRE (herd at the wire = crisis law; route_danger infection term) · NAVIGATION
(danger_pts sources += ip/choir) · SECURITY_LADDER (quarantine posts = checkpoint kind; enforcers
engage `infected`) · BANDIT_CONVOY_ECOSYSTEM (kit dresses quarantine posts; escort kills seed
infection) · POPULATION_WAR (GROUPS gains `infected`, parallel-keys law) · INDEX (this row) ·
INFECTED_TRIALS.md (SUPERSEDED header). WEATHER needs no line — noise is weather-proof by
construction. LORE_BIBLE is canon source, not a consumer.

## 7. Tuning Knobs

| Knob | Default | Safe range | Governs |
|---|---:|---|---|
| shares | .9935/.0050/.0010/.0005 | sum ≤ 1 | the uncertainty economy — raise sprinters and they stop being scary |
| herd ledger / realize | 6–80 / 8–16 | 4–120 / 6–24 | pressure vs perf |
| pileup realize cap | 32–40 | ≤ perf probe | the set-piece exception (0.7) |
| trigger_move_mps | 5.0 | 4.5–6.5 | walk-safe / run-hot line (walk 4.2, run 7.2) |
| sprinter burst / overheat | 6 s / 3 s | 3–8 / 2–5 | panic vs window |
| sprinter sight_r / ear_r | 12 / 20 m | 8–18 / 12–30 | how still/quiet you must be |
| `choir_r` floor | 650 m | 120–1000 | blot scale (650 ≈ 5.3 cells; 220 = one-base bubble) |
| aura r / mult | 30 m / 1.25 | 20–45 / 1.1–1.4 | amplifier reach |
| hum − aura margin | +15 m | ≥ +10 | warning outranges danger (contract) |
| halt r / s / cd | 25 m / 2.5 s / 10 s | 15–35 / 1.5–4 / ≥6 | the street trick's power |
| K_anchor / D_corpse / K_herd / DECAY / DYN_CAP | 0.7 / 0.10 / 0.08 / 0.02 / **0.55** | cap is LAW < 0.6 | F-IP; NO-BIRDS stays a place |
| fever gh / taxes | 36 / ×0.75, ×1.3 | 24–48 / 0.6–0.9, 1.1–1.5 | the social shadow's length |
| footfall emitter | 12 m @ 0.7 s | 8–18 | how loud running is to the blind |
| surge herd_mult / realize+ | 1.5 / +4 | 1.0–2.0 / +0–6 | the blood-moon night |
| choir_pts / BULLETIN_T | 4 / 0.6 | 2–8 / 0.4–0.8 | routing cost; when the news notices |

## 8. Acceptance Criteria (phases + sims; all headless, real inputs, WATCHDOG, time_scale restored)

**I1 — THE FIRST CHOIR** (slot: beside ECOSYSTEM P2, after the Alley teaches the read language;
**hard gates: NONE** — bespoke carousel spawns via the has_meta ledger guard, no P0/M-ladder/LWE).
fort_benning flips to `choir_congregation` + `choir_r 220` (0.4, with the carousel2_sim retarget).
ProtoInfected ships SHAMBLERS ONLY (herd 6–20, murmur voice); `corpse.infection`; the registry;
the `_amb` suppression term; THE DIAL BLEED; `herd_warning` row; dog balk; the `fire()` gunfire
emitter + sprint footfalls; BITE FEVER (taxes + visibility only). Sims: `infected_sim` (rows fold;
drift converges on an emit_noise source and POOLS, no pathing; melee union kill; corpse
infection=1.0; fever applies/clears on bed+antibiotics; save round-trip; **the perf probe: 40
realized shamblers under frame budget**) · `choir_zone_sim` (registry membership; cell derivation
per 0.3; dial bleeds inside; dog balks at the ring; ambience gain drops; anchorless dyn NEVER
exceeds 0.55 — the NO-BIRDS-is-a-place assertion) · `carousel2_sim` updated GREEN (norfolk_yard
raider asserts + benning choir asserts).

**I2 — THE TAXONOMY, THE BODY, THE LAW** (slot: INDEX step 8, beside E2/S1/C1; hard gates: P0,
SECURITY_LADDER enforcers, NAV-P2 records). Full shares (Sprinter 0.6 / Echo 0.8 / Choir-Touched);
`population.GROUPS` + bridge arm + targets rows (+3 zone_tags, per-group max override); the
fever's scan consumers (F-STOP-Q, clinic refusal); `quarantine_law` + posts; `report_advisory`;
F-SURGE; the traffic phantom branch; F-NAV + F-ROUTE feeds; `herd_at_the_wire` metaworld raid
variant; net kind `"infected"`. Sims: `herd_mix_sim` (seeded comp; military ×4; ledger migration,
never teleport) · `sprinter_sim` (**a genuine 4.2 m/s WALKER stays dormant; a 7.2 m/s RUNNER
triggers**; burst ≥8 m/s; stagger ≥2.5 s) · `quarantine_sim` (stop fires on fever+contraband per
F-STOP-Q; safehouse immunity holds) · traffic/save suites stay green.

**I3 — THE TRIALS + FULL COUPLING** (slot: INDEX step 9; mutual LWE-P3 gate resolved by
construction — I1 shipped the three contract fields, either side lands in any order). PREY LAW;
Whitewing/Tower Bird coverage (radio towers land HERE as new authored placements, 0.13); Choir
TOTAL silence; corpse-flies keyed to infection; the three PROTOCOL FILMS + their taught reads;
`choir_fragment` economy (faith confiscates / Broadcast Church pays ×3); drone static flicker
over zones. Sims: `infected_ecology_sim` (LWE's own — Whitewing clean-land vs NO-BIRDS over
zones) · `choir_silence_sim` (bed AND calls die inside the ring) · `trials_films_sim` (found_reel
rows fold; TV/drive-in playback; the Urgency read appears in binocular tags only after the film).

**Hard prohibitions across all phases:** no portal interiors (ROAD 0.9) · no Library dependency ·
shares never change under any surge · the banned word never appears · every broadcast/document
hints and never adjudicates (§20).
