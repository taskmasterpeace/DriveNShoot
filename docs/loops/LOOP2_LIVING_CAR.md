# Loop 2 — The Living Car: Damage, Dashboard & Arsenal

**Status:** DESIGN (next /goal loop) · **Created:** 2026-07-04
**Depends on:** M1 Feel Core (proto3d) · **Feeds:** ENGINE.md M3 Vehicle Framework, M4 Character Core
**One line:** Make the car a character you nurse and that can die *spectacularly*, make the
screen tell you your status at a glance (Zomboid-style glyphs), and stand up a gun **system**
(not guns) so "a lot of weapons" becomes a folder of data files.

---

## 0. Where this fits (roadmap reconciliation)

ENGINE.md's original order was M2=World streaming, M3=Vehicles, M4=Character. This loop
**reprioritizes toward felt experience**: after M1, the single biggest upgrade to "does this
feel like a game" isn't an infinite map — it's *the car being alive*, *a HUD you can read*,
and *a gun in your hands*. World streaming (old M2) slots in right after, once we have stakes
worth driving across a country for.

- This loop = a focused merge of **vehicle damage/survival** + **HUD** + **weapon system core**.
- We build the **engine** for each (data-driven, testable). We build **2–3 sample** guns and
  **1 car damage model**, not the full armory or the full parts economy. Content comes later.
- Every system here is designed so adding content later = adding a `.tres` file, never code.

---

## 1. Design pillars for this loop

1. **The car is a character.** It smokes, limps, burns, and dies with drama — never a silent
   health bar hitting zero.
2. **Read it in half a second.** Emoji/glyph HUD like Project Zomboid moodles — no menus to
   check if you're bleeding or your engine's cooked.
3. **Engine, not content.** One damage system powers car parts today, player limbs and
   destructible walls tomorrow. One weapon system powers every gun from a pistol to a
   car-mounted minigun.
4. **Every state is a decision.** On fire? Bail or fight it. Locked car? Key, crowbar, or
   hotwire — each with a cost. Health bars that don't create a choice are just numbers.

---

## 2. Driving tone — my honest recommendation (you asked)

> *"heavy and weighty like Mad Max, or more arcade-snappy like GTA 2?"*

**Neither as a global switch — make weight emergent from the build.** This is the engine answer
and it's better than picking one:

- **Baseline is GTA2-arcade** — responsive, forgiving, fun in 10 seconds. That's what you loved
  driving in M1, and it's the right default because the game is *also* on-foot, looting, and
  fighting; a punishing sim car would fight the pace.
- **Weight scales with what you bolt on.** A stripped bike or interceptor feels feather-light
  and twitchy (GTA2). Pile on armor plates, a full trunk, a trailer, and a ram grille and the
  same physics make it feel like a Mad Max war-rig — slow to turn, unstoppable in a straight
  line, murder to stop. `VehicleBody3D` already gives us this for free via mass + center of
  mass; the **load/weight system** (below) is what turns your customization choices into feel.

So the answer to "which tone" is **"yes, and the player chooses it by how they build."** That's
the Auto Duel gene — your car *becomes* a personality.

**What I think is missing from the brief** (add if these hit right):
- **Audio is half the feel.** Engine pitch rising with RPM, the crunch on impact, the *whoomp*
  when it catches, tires screaming on the skid. We should budget a pass for this — it's cheap
  and it's 50% of "weighty."
- **The blowout should change handling, not just pop.** A front-tire blowout pulls you hard to
  one side (drama + skill test to correct), a rear one fishtails. That's more Auto Duel than a
  stat penalty.
- **Death needs a consequence hook.** When the car becomes a burnt husk — do you lose the loot
  in the trunk? Your mounted weapon? Extraction stakes are what make the drama *matter*. I'd
  say: cargo is recoverable from the husk (you can walk back to it) but the car itself is gone.
  Flag for you.

---

## 3. System A — Vehicle Anatomy & Damage (the star of this loop)

### 3.1 The 5-part anatomy (your design, adopted)
Every vehicle is 5 damageable components, each a 0–100% condition with a status tier. This is
the whole mental model — no door-panel micro-sim.

| Component | Governs | At **Broken** |
|---|---|---|
| 🔧 **Engine** | top speed, accel, engine noise (heat/attraction) | stalls — won't start |
| 🛞 **Tires** | handling, grip, braking, off-road | blowout → hard pull / fishtail |
| 🔋 **Battery** | ignition, headlights, electric locks | dead start; lights out at night |
| ⛽ **Fuel Tank** | range; leaks when hit | dies mid-drive; leak = fire risk ↑ |
| 🛡️ **Chassis/Armor** | ram damage dealt, occupant protection | cabin exposed, occupants take hits |

**Status tiers** (drives the glyph + color on the HUD): `GOOD` (green) → `WORN` (yellow) →
`CRITICAL` (orange) → `BROKEN` (red). Same 4-tier scale for every component so the dashboard
reads instantly.

### 3.2 The death spiral (smoke → fire → cook → husk)
This is the "smoke, catch fire, might blow up, always ends burnt" you described, as a state
machine. **Chassis HP is the car's overall health; component damage is localized.**

```
HEALTHY ──(chassis < 40%)──► SMOKING ──(chassis < 15% OR fuel tank breached + spark)──► ON FIRE
                                                                                          │
                                                        ┌──── extinguish (scrap/extinguisher) ┘
                                                        ▼
                                                    back to SMOKING (fire out, still critical)
   ON FIRE, if not put out:
       a COOK METER rises (0→100% over ~6–10s, faster if fuel tank is breached).
       each tick rolls against the meter → chance to EXPLODE early ("might blow, might not").
       player can BAIL OUT anytime (dramatic escape) — recommended once the meter shows.
       ▼
   EXPLODED (blast damages nearby) ──► DESTROYED
   or COOK hits 100% ──────────────► DESTROYED
   or chassis simply hits 0 by damage ─► DESTROYED (may skip fire if not flammable hit)
       ▼
   DESTROYED = burnt-out black husk. ALWAYS. (your "no matter what")
```

**Genius touch — the cook meter is a decision, not a countdown.** The moment fire starts, a
rising **💥 %** appears on the HUD. It's literally "it might blow." You choose: floor it toward a
mechanic and pray, jump out and run, or spend a scrap/extinguisher to kill the fire. A health
bar became a poker hand.

### 3.3 The burnt husk persists (death creates content)
A `DESTROYED` car doesn't vanish — it becomes a **blackened static husk** that stays in the
world: cover in a firefight, a landmark, and a **salvage node** (strip 1–2 parts). When world
streaming lands (next loop), husks persist per-chunk. Every car that dies makes the world.

### 3.4 Engine framing: one `DamageableComponent` to rule them all
The 5 car parts are instances of a generic **DamageableComponent** resource (max hp, current,
armor, flammable?, on-broken signal). The *same* component will later back player limbs
(bleeding arm), destructible doors/walls, and fort pieces. We are not building "car damage" —
we're building **the damage system**, first proven on the car.

### 3.5 Repair & salvage (streamlined, your spec)
- **Field patch:** wrench + scrap/duct-tape → bump one component up a tier (Broken→Worn) in
  ~10–15s. Your mid-chase emergency fix. **You're vulnerable while doing it** (the hook for the
  dog/ambush tension — see Deferred).
- **Overhaul (at a garage/later):** install a salvaged part → 100%. Slow, loud.
- **Salvage:** one "Strip" interaction on any wreck/husk → part into your trunk. No granular
  disassembly.

---

## 4. System B — The Dashboard HUD (emoji/Zomboid glyphs)

### 4.1 The glyph system (engine, not a fixed HUD)
Your emoji instinct is *exactly* Zomboid's moodle system — and we build it the same way: a
**status-glyph table**. Each status is a data row: `{ id, emoji, tiers→color, priority }`. The
HUD just renders whatever glyphs are active, sorted by urgency. Adding a new status (poisoned,
overheating, low ammo) = one row. This same system serves the car, the player, and pickups.

### 4.2 What's on screen this loop
- **Player vitals (foot):** ❤️ health, and stamina for the dive/run. Bleeding/tired glyphs
  stubbed (tunable to off = arcade).
- **The car dashboard (driving):** a compact 5-glyph strip — 🔧🛞🔋⛽🛡️ — each tinted by its
  tier, so one glance = "engine's orange, tires are red." Plus ⛽ fuel as a bar/number, and the
  **💥 cook %** when on fire.
- **Ammo:** 🔫 current-gun icon + `mag / reserve` (e.g. `12 / 84`), caliber-aware.
- **Interact prompts / toasts:** already shipped in M1; the glyph HUD sits alongside.

### 4.3 Rules (from CLAUDE.md, kept)
Colors: no purple, ever. Warm wasteland palette — amber/bone/blood/rust. Glyphs read at a
glance; text is backup, never the primary channel.

---

## 5. System C — The Arsenal (a gun *system*, so you can have a lot of guns)

> *"I'm gonna have a lot of guns... we need something that [handles that]."*

The trick to "a lot of guns" is that a gun is **stats + a behavior tag + a caliber**, never new
code. We port the 2D game's `weapon_system.gd` / `projectile.gd` (already team-aware) into 3D.

### 5.1 A weapon is a `DataWeapon` resource
`{ name, icon(emoji), fire_behavior, damage, fire_rate, mag_size, reload_time, spread,
   caliber, projectile_speed, recoil, mount_type }`

- **fire_behavior** = a small enum, the ONLY thing that changes code path:
  `HITSCAN` (pistols, rifles — instant ray), `PROJECTILE` (rockets, grenade launchers, arrows —
  physical travel), `BEAM/CONE` (flamethrower, later). Three behaviors cover ~everything.
- **caliber** = shared ammo pool item (9mm, 7.62, 12ga, rockets). So 20 guns draw from ~6 ammo
  types → **scavenging ammo is a resource loop**, and finding a gun you have no ammo for is a
  real feeling.
- **mount_type** = `handheld` | `vehicle` — the SAME weapon system fires whether it's in your
  hands on foot or bolted to the car (this is why car-guns and foot-guns aren't two systems).

### 5.2 This loop's deliverable
- The weapon system + 3 sample guns proving all three behaviors: a **pistol** (hitscan,
  starter), a **pump shotgun** (hitscan spread), and a **pipe rocket** (projectile, explodes —
  reuses the car explosion). One shared ammo/inventory hook.
- Guns are **inventory items** you pick up, equip to a slot, and reload. Ammo counts feed the
  HUD from §4.
- **Not** this loop: the full armory, car-mounted weapon customization, weapon crafting,
  attachments. Those are content/M-later once the system's proven.

---

## 6. System D — Getting Into Cars (expands M1 locks)

M1 already has **keys** (find the key → unlock). This loop adds the other two vectors so a
locked car becomes the world's signature loot container:

- **🔑 Keys** (done) — quiet, rewards exploration.
- **🪛 Hotwire** — a skill/timing check; success starts it without the key. Faster & quieter
  the better your (future) skill. This loop: a simple hold-timer with a success window; the
  deep minigame is deferred.
- **🔨 Forced entry** — smash a window / shoot the lock. Instant, but **loud → raises heat**
  (ports the 2D heat system) → attracts trouble. The risk/reward you wanted.

Noise is the connective tissue: forced entry, engine damage, and gunfire all feed one **heat/
noise** value (2D donor system) that the encounter director reads. This is the hook the dogs
and patrols hang off — even though the animals themselves are a later loop.

---

## 7. How We Build The World (answering your map question)

> *"I see the way you made the map... how do we make a world like that? hand-place some stuff?"*

The M1 map was **100% code** (great for a prototype, terrible for authoring a country). The real
answer is a **hybrid pipeline — procedural filler + hand-authored anchors** — in three tiers you
can mix:

1. **Procedural (the streamer):** terrain, roads, and minor scatter generate from a world seed
   in chunks around the player. Endless, no edge, cheap. This is the ground you drive over.
2. **Blueprints (recommended for towns — hand-authored, git-friendly):** a town/building is a
   **data file** listing pieces at offsets — `{ template: "gas_station", pos: [x,z], rot }`,
   `{ prop: "wreck", pos, rot }`. You (or I) hand-place a town by editing a readable list; it
   stamps onto fixed map coordinates and persists. This is how you "hand-place stuff" without
   touching engine code, and it's diff-able and AI-authorable.
3. **Hero scenes (for landmarks):** truly special places (the drowned capital, a boss fort) are
   built visually in the Godot editor as normal scenes and dropped onto a map coordinate. Most
   expensive, reserved for the handful of places that carry the world.

**Navigation without GPS = landmark silhouettes.** Each region gets 1–3 distinctive skyline
shapes visible from far (your binoculars matter here). That's how Deathlands-style "keep driving
west and you'll hit water" becomes legible — you steer by the arch on the horizon, not a minimap.

**This loop does NOT build streaming** (that's the next loop). It's documented here because you
asked, and because the damage/husk-persistence design above is built to *fit* the chunk model
when it lands (husks save per-chunk).

---

## 8. Acceptance tests (what the loop's headless sim must prove — input-driven, no teleport-cheats)

1. **Damage tiers:** applying damage walks a component GOOD→WORN→CRITICAL→BROKEN; broken engine
   won't start; broken tire changes handling.
2. **Death spiral:** drive chassis below thresholds → SMOKING glyph appears → ON FIRE → cook %
   rises → (a) extinguish returns to SMOKING, (b) let it cook → EXPLODED → DESTROYED husk.
   Assert the husk exists, is a salvage node, and always ends burnt.
3. **Bail-out:** on fire, player exits before explosion and survives; car still becomes a husk.
4. **HUD glyphs:** the 5 car glyphs reflect component tiers; ammo readout matches the equipped
   gun's mag/reserve; low-health glyph shows under threshold.
5. **Arsenal:** each of the 3 sample guns fires its behavior, consumes shared-caliber ammo,
   reloads, and empties (can't fire on empty). A projectile rocket explodes and damages a target.
6. **Getting in:** locked car — key path (done), hotwire success/fail path, forced-entry raises
   heat. Assert heat delta on forced entry.
7. Old proofs stay green (drive_sim, walkthrough_sim, m1_sim). Boot test clean. Then hands-on.

---

## 9. Deferred — explicitly NOT this loop (nothing lost, everything logged)

You said: *"document all the stuff you're not adding."* Here it is, with why and when.

| Deferred item (from your brief) | Why not now | Target loop |
|---|---|---|
| 🐕 **Dogs / animals** (guard dogs, packs, the repair-vulnerability threat) | Needs the AI & Life pillar + perception cone to be meaningful; the *noise/heat hook* they attach to ships this loop, so they slot in cleanly later | ENGINE.md **M6 AI & Life** |
| **Mad Max customization** (ram plates, side blades, roof harpoon, passenger mounts, reinforced armor) | Big system; needs the load/weight + mount framework mature first. The *weight-scales-feel* foundation ships this loop | **M3 Vehicle Framework** |
| **Load/Capacity class system** (Scout/Raider/Tank/Mule) | Depends on the customization + inventory-weight systems existing | **M3 / M4** |
| **Fuel consumption by terrain**, **tire wear by zone** | The *components* (fuel, tires) ship this loop as damageable parts; the *degradation-over-distance economy* needs world streaming to have distance that matters | Next loop (**World Core**) |
| **Wrench/Car-Craft skill tree** (Tier 1–3 progression) | Needs the character stat/XP system | **M4 Character Core** |
| **Deep hotwire minigame** | This loop ships a simple timing check; the burglar-style minigame is polish | **M4 / later** |
| **Fatigue / hunger survival layer** | Stubbed as glyphs, tunable to off; full survival is opt-in mode later | **M5+ / mode toggle** |
| **Full armory (many guns), weapon attachments, crafting** | The *system* ships this loop with 3 samples; the rest is content | Ongoing content |
| **Full audio pass** (engine/impact/fire SFX) | Flagged as high-value; scope as its own polish pass | Polish loop |
| **Building husks / world persistence of damage** | Rides on world streaming's chunk-save | Next loop |

---

## 10. Open questions for you (answer any that pull at you)

1. **Death consequence:** when your car becomes a husk, do you lose the loot in the trunk, or
   can you walk back and salvage it from the wreck? (I lean: cargo recoverable, car gone.)
2. **Player death:** this loop we add player ❤️ health. If you die on foot — respawn, or is it
   extraction-style permadeath-of-the-run like the 2D game? (Sets the whole stakes tone.)
3. **Bail-out default:** should the game *auto-warn* "GET OUT" when the cook meter starts, or
   leave it to you to read the 💥% and decide? (Skill floor vs. hardcore.)
4. **Starter arsenal:** pistol as the M1-era starting gun feels right — but does the *player*
   start with a gun, or do you have to find your first one? (Desperation opener vs. armed opener.)

---

*This document is the design contract for the next /goal loop. When you're happy with it, the
loop prompt writes itself from §8's acceptance tests.*
