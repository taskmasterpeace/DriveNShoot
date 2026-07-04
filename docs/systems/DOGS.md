# DRIVN — Dogs (the Companion System's first species)

**Status:** DESIGN + PROTO BUILT (2026-07-04) · **Stages:** proto now → full framework Stage 7, taming M6
**The law of dogs:** *a dog always knows what's behind you.* Every dog covers the blind spot the
top-down vision cone can't — that's why a dog is never cosmetic in DRIVN.

---

## 1. The Four Types (role = mechanical identity)

| Type | Fantasy | Signature mechanic | Secondary |
|---|---|---|---|
| 🛡️ **Security** | the guard | **Rear-Smell+** — biggest threat-detection radius, strongest behind you; loud bark names the direction | guard-orbit when you stand still; will BITE (when combat lands); intimidation aura vs NPCs (later) |
| 🎯 **Hunter** | the nose | **Loot/prey sense** — points at stashes, caches, corpses, prey in a wide radius | silent point (no bark — stealth-safe); tracking synergy (reads trails, later) |
| 🤝 **Companion** | the partner | **Instant obedience** — commands execute immediately (others have a beat of delay); balanced stats | fetch small items (later); +carry via saddlebags; mild everything |
| 💗 **Cuddle** | the heart | **Comfort Aura** — melts Stress near you; caps your max panic | best sleep quality (later); won't fight, won't range; tiny, quiet |

**Every type still rear-smells** — Security just does it *much* farther and louder. A Cuddle dog
will still grumble when something creeps behind you at close range.

## 2. Why Cuddle matters — the STRESS / MORALE vital (the thing you asked me to think of)

A gritty permadeath world needs a mind, not just a body. New player vital: **Stress (0–100)**.
- **Rises:** threats lurking near you, being stalked, gunfire, injuries, night alone (later), 
  witnessing death (later).
- **Falls:** slowly on its own; **fast near a Cuddle dog**; food/rest/safety (later).
- **Mechanical teeth (so it's never cosmetic):** high Stress **slows stamina regen** (live now),
  and later: **blooms your aim cone**, slows treatment actions, worsens sleep. At 90+: *panic* —
  brief input shake / cone blowout.
- Cuddle dogs are therefore a **build choice**: the scav who runs a Cuddle dog shoots straighter
  after a scare and recovers faster — at the cost of a companion who can't fight or scout.
- (Also gives Trader/Gaudy content hooks: calming meds, comfort items, flophouse beds.)

## 3. Breeds (variance under each type — data-driven)

| Type | Breeds (proto names) | Variance |
|---|---|---|
| Security | **Shepherd** (balanced) · **Rottweiler** (strongest bite, shorter radius) · **Mastiff** (slow, biggest intimidation) | radius / bite / aura |
| Hunter | **Bloodhound** (longest nose) · **Pointer** (exact-direction point) · **Coyote-cross** (also finds meat/prey) | range / precision / prey types |
| Companion | **Lab** (hardy) · **Border Collie** (smartest — extra command slot later) · **Mutt** (lucky — small loot-quality aura) | hp / commands / luck |
| Cuddle | **Pocket** (tiny chi-mix, fastest calm) · **Wheezer** (pug-type, snores = sleep bonus later) · **Ratter** (terrier — also kills rats, later) | calm rate / rest / vermin |

Breeds are palette + stat rows (`DataDog` resource later) — content, not code.

## 4. Shared dog framework
- **Adoption:** strays in the world (the Meridian kennel) — walk up, **E — Adopt**. Later: taming
  wild dogs (M6, Animal Handling), buying from Traders.
- **Commands:** **Follow** (default) · **Stay** (E on your dog) · **Whistle-heel** (`C` — all dogs
  return to you). Companion obeys instantly; others have a small delay (identity!).
- **Alerts:** growl/point → the dog **faces the threat**, HUD names the direction ("BEHIND you").
  Sounds come later (user note); the *behavior* ships now.
- **Bond** (later): grows with time/feeding; unlocks behaviors (guard a spot, fetch, ride in truck
  bed). **Needs** (later): food, injuries (dogs use the same DamageableComponent).
- **Dog paperdoll** (later, ties to `EQUIPMENT_PAPERDOLL.md`): collar (ID/faction), vest (armor),
  **saddlebags** (small Container — the taming table's "pack small items").
- **Multiplayer:** a dog is a perception extension the *server* respects (its senses feed only its
  owner's AoI) — scouts stay tactical, wallhack-free.

## 5. Built in proto3d TODAY (2026-07-04)
`proto3d/dog.gd` (ProtoDog): 4 types × distinct params, adopt/follow/stay/whistle, rear-smell
alerts vs. lurker threats (`proto3d/lurker.gd` — stalking silhouettes that freeze when faced),
Hunter stash-sense, Cuddle comfort aura + the **Stress vital** (HUD bar; stamina-regen penalty),
kennel yard in Meridian ("STRAYS — E TO ADOPT"). Proof: `proto3d/tests/dog_sim.tscn`.

## 6. Acceptance (dog_sim, input-driven)
Adopt via prompt → follows through real movement · Stay holds while you walk off · Whistle
returns · Security alerts on a threat placed in your REAR arc (names "BEHIND") · Hunter pings a
nearby stash · Cuddle proximity drains Stress and Stress throttles stamina regen · old sims stay
green.

*Cross-refs: `WORLD_NPCS.md` (Drifter/companion spine), `PROGRESSION.md` (Animal Handling/taming),
`INTERFACE_AND_BODY.md` (vitals/HUD), `EQUIPMENT_PAPERDOLL.md` (dog gear later), `STAGES.md` (7).*
