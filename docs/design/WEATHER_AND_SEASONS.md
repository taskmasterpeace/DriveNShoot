# WEATHER & SEASONS — the sky as a map feature

**Status:** GREENLIT design spec (owner directive 2026-07-08, voice): *"We need weather. We need seasons…
different weather at different parts of the map… we're gonna have to gradient it — the rain, we can't have
lines of rain everywhere, you can't be raining in a square… and that could help drive the animal behavior."*
**Builds on / replaces-in-place:** `weather.gd` (the shipped state machine — its `STATES` tax rows, `force()`,
`vision_mult()`, `grip_now` API are all KEPT; what changes is *where weather lives*: a global state becomes a
**field**), `daynight.gd` (the 24-min clock + `day` counter the calendar rides), `usmap.gd` (the 500 m cell
grid + biomes the climate rows key off), `events.gd` (the deterministic `hash(day)` seed idiom),
`world_state.gd` (`run_offline_catchup` — seasons/storms advance offline), `population.gd` `row["eco"]`
(`water_rot` — now wetted by storms *where the storms are*, not where the player is),
`docs/design/LIVING_WOUND_ECOSYSTEM.md` (the primary consumer: weather and seasons are ecology **drivers**).
**Core law:** *Weather is a place, not a filter. A storm is somewhere — you can see its edge, drive into it
by gradient, and drive back out.*

---

## 1. Overview

Today `weather.gd` holds one global state rolled at the player's feet every 2–5 minutes. This spec upgrades
it to a **weather field**: at any moment the world holds 0–4 **storm systems**, each a moving disc
`{kind, center, radius, velocity, ttl}` with intensity 1.0 at the core falling off smoothly to 0 at the rim.
Local weather at any world position is *sampled* from the field — `intensity(pos)` — and every existing tax
(vision, grip, engine wear) scales by that local sample instead of switching on/off. That single change
answers all three of the owner's requirements at once: **different weather in different places** (systems
live on the map, not on the player), **gradients, never squares** (radial smoothstep falloff — the rain
fades in over hundreds of meters; there is no edge line to see), and **drivable weather** (a system the size
of a county at 60× scale is a 1–4 km disc crawling at 5–12 m/s — slower than a car; outrunning the rain is a
real, winnable play).

On top of the field sits a **calendar**: four seasons of `SEASON_DAYS` game-days each, riding the existing
`daynight.day` counter. Season + region select which systems the sky spawns (Florida's wet summer, the
plains' dust spring, the northern winter), stretch or shrink the dark hours, and multiply the ecosystem's
growth coefficients. The seasonal arc is the point: **winter is the lean season** — plants low, nights long,
predators hungriest and active longest. "Survive the winter" emerges from three small multipliers, no
scripting.

Everything stays deterministic (seeded per game-day/hour like `events.gd`), host-authoritative, bounded
offline, and data-driven (climate = rows; a new season profile or storm kind is JSON, not code).

## 2. Player Fantasy

Northbound out of the Alley at dusk, the horizon to the west is a bruise. The atlas shows why: a rain system
the size of a county crawling east across the interstate, dead across your route. You have choices — punch
through the middle (grip 0.62 at the core, howlers hunt well in the din), skirt the northern rim where it's
just drizzle, or wait it out at the rest stop and let it pass over you. You take the rim: the windshield
speckles, the road darkens, grip goes soft — and then you're through, sun on wet asphalt, the storm in your
mirror. It's late autumn. The nights have been getting longer for a week, the herds thinner, the howls
closer to the road. Everyone at the holdout says the same thing: get your walls up before winter.

## 3. Detailed Rules

### 3.1 Storm systems (the field)

A **system** is a record in `ProtoWeather.systems: Array[Dictionary]`:

```gdscript
{ "kind": "rain",            # a STATES row key — the existing tax table is reused verbatim
  "center": Vector2(x, z),   # world position — INDEPENDENT of the player
  "radius": 2600.0,          # meters, core-to-rim (0.5–5 km band at 60x scale)
  "vel": Vector2(7.0, 1.5),  # m/s drift — the wind vector; systems CROSS the map
  "ttl_h": 3.0,              # game-hours to live; fades out over the last 20%
  "born_day": 12, "born_slot": 3 }   # its deterministic identity (§3.3)
```

- **Cap:** ≤ `MAX_SYSTEMS = 4` alive world-wide (perf + legibility — more than ~2 relevant to a drive is mush).
- **Kinds** reuse the shipped `STATES` rows (`dust`, `rain`, `heat`) unchanged; `heat` systems are huge and
  slow (a heat dome), `dust` mid-sized and fast, `rain` the workhorse. **P2 adds `snow`** (new row: vision
  0.7, grip 0.55, engine_wear 0.05) gated to winter + northern latitudes. **P3 adds signature systems:**
  the Florida **hurricane** (wet-season only: radius 4–5 km, high wind, spiral audio, ecology water_rot
  soak) and the plains **tornado** (spring only: tiny radius, violent, rare, a moving hazard core).
- Systems are **not visual props**: they are field entries. Visuals derive locally (§3.6).

### 3.2 Sampling — the gradient law (no squares, no lines)

```gdscript
func intensity(pos: Vector3, kind := "") -> float:      # 0..1, the ONLY read anyone does
    var best := 0.0
    for s in systems:
        if kind != "" and s.kind != kind: continue
        var d := Vector2(pos.x, pos.z).distance_to(s.center)
        var edge := 1.0 - smoothstep(s.radius * CORE_FRAC, s.radius, d)   # CORE_FRAC = 0.45
        best = maxf(best, edge * s.fade)                # fade = ttl ramp-in/out
    return best
```

- Full intensity inside the **core** (`radius·0.45`), smoothstep falloff to 0 at the rim — the transition
  band is hundreds of meters wide at typical radii. **There is never a hard edge**: driving in reads as
  drizzle → rain → downpour; the owner's "raining in a square" is structurally impossible because nothing
  ever samples a cell boundary — only smooth radial distance.
- **Taxes become lerps by local intensity** (the compat law — same numbers, now local):
  `vision_mult(pos) = lerp(1.0, STATES[kind].vision, I)` · `grip = lerp(1.0, STATES[kind].grip, I)` sampled
  at the **active car's** position each frame (`grip_now` stays the static cars already read) ·
  `engine_wear · I`. Two players in co-op can be in different weather — correct and intended.
- **API compatibility:** `state` becomes a *derived* property = the strongest kind at the player
  (`I ≥ 0.25`, else `"clear"`), so every existing reader (`vision_mult()`, `icon()`, HUD, howler, birds)
  works unmodified. `force(kind)` is kept for sims/dev: it spawns a stationary max-intensity system centered
  on the player (duration = the old `_next_roll` semantics). Zero call-site changes, same as the audio law.

### 3.3 Spawning — deterministic, regional, player-independent

Once per game-hour (the same boundary the ecology ticks), roll spawn slots seeded
`hash("wx:%d:%d" % [day, hour])` — the `events.gd` idiom; same save + same day ⇒ same skies:

1. If `systems.size() < MAX_SYSTEMS`, roll each empty slot vs the **regional climate row** (§3.5) of a
   candidate region — candidates are drawn from the whole **map**, biased toward (a) the player's state and
   its neighbors (relevance) and (b) regions with a live ecology interest (a WARM sector under rain gets
   wet — §3.7). A system spawns **at a region**, not at the player.
2. Drift: `center += vel · dt` every tick; `vel` from the season's prevailing wind row ± jitter. Systems
   that drift off the map or expire fade out (`fade → 0` over the last 20% of ttl).
3. The existing 120–300 s player-local roll is **deleted** — replaced by the field. The
   "🌧 RAIN — the sky turns on you" notify fires when the *player's local* intensity first crosses 0.25
   (entering a system), and "☀️ The sky clears" when it falls below — same toasts, now honest.

### 3.4 Seasons — the calendar

```
season_idx = (daynight.day / SEASON_DAYS) % 4      # 0 SPRING · 1 SUMMER · 2 AUTUMN · 3 WINTER
year       =  daynight.day / (SEASON_DAYS · 4)
```

- `SEASON_DAYS = 7` (a 28-game-day year ≈ **11.2 real hours** — a season per long session; tunable 5–14).
- **Daylight shifts by season** (the big free lever): `daynight` gains a per-season dark-window offset —
  WINTER `±1.5 h` more dark, SUMMER `±1.5 h` less (`is_dark()` and the twilight ramps read the offset; the
  ecosystem's NIGHT SHIFT windows inherit it automatically). Longer winter nights = longer howler shift =
  the lean season with no extra code.
- Season is **display-surfaced** (HUD date line "DAY 23 · AUTUMN, YEAR 1", the atlas header, radio weather
  bulletins) and **save-free** (derived from `day`, which already persists).

### 3.5 Regional climate rows (`data/climate.json`)

The existing `BIOME_WEATHER` dictionary grows one axis (season) and moves to data:

```json
{ "climate": {
    "swamp":  { "SPRING": {"rain":0.40}, "SUMMER": {"rain":0.55, "heat":0.15},
                "AUTUMN": {"rain":0.35}, "WINTER": {"rain":0.15} },
    "desert": { "SPRING": {"dust":0.35, "heat":0.10}, "SUMMER": {"dust":0.30, "heat":0.45},
                "AUTUMN": {"dust":0.40}, "WINTER": {"dust":0.15} },
    "plains": { "SPRING": {"rain":0.25, "dust":0.20}, "SUMMER": {"heat":0.25},
                "AUTUMN": {"rain":0.15}, "WINTER": {"snow":0.30} },
    "forest": { "SPRING": {"rain":0.35}, "SUMMER": {"rain":0.25},
                "AUTUMN": {"rain":0.30}, "WINTER": {"snow":0.35} } },
  "wind":    { "SPRING": [6,2], "SUMMER": [4,1], "AUTUMN": [8,2], "WINTER": [9,3] },
  "sizes":   { "rain": [1800,3200], "dust": [1200,2400], "heat": [3000,5000], "snow": [2200,4000] } }
```

Additive fold over a code floor (the `bandit_regions.json` law; F10 refolds). Unknown biome → the floor.
Latitude gate: `snow` spawns only in regions whose usmap row-band is northern (a simple `z <` threshold row)
— Florida never snows, the Dakotas do.

### 3.6 What the player sees, hears, and reads (the gradient made visible)

- **Local render:** rain/dust/snow particles attach near the camera with **density = local intensity** and
  the sky/fog tint lerps by the same sample — the world darkens as you drive deeper, brightens as you leave.
  No world-space rain curtains (nothing to draw an edge on).
- **The distance read:** a system within ~4 km renders as a **horizon darkening** in its compass direction
  (a cheap sky-gradient tint wedge) — the "bruise on the horizon" that lets a driver see weather coming
  *before* the HUD says anything. This is the visual gradient at map scale.
- **The atlas/map (M):** live storm discs drawn as soft-edged blobs with drift arrows — weather becomes a
  ROUTING layer (skirt the rim, or wait). The drone route-scout reports intensity along a course.
- **Audio (the ecosystem EAR-LAYER law, ECOSYSTEM 0.10):** a `rain_bed` loop whose volume = local intensity
  (add to `LOOPED` + one SoundForge row); thunder one-shots roll `play_at` at random azimuths when I > 0.6;
  the wildlife bed (F-AMBIENT) already ducks under storms via `vision_mult`. Storm audio is presentation
  only — it never feeds `noises_in`.
- **Radio:** the existing weather bulletin seam reads the FIELD: *"rain system crossing I-75 south of Ocala,
  moving east"* — real, actionable, generated from `systems[]`.

### 3.7 What weather & seasons DRIVE (the couplings — why this spec exists)

| Consumer | Coupling |
|---|---|
| **Ecology `water_rot`** | a sector under a system's disc gains `water_rot` toward the kind's wet value **whether or not the player is there** (the WARM tick samples `intensity(cell_center)`) — regional rain finally means regional rot, Sump Rats boom where it actually rained |
| **Ecology growth** | `season_mult` rows multiply F-PLANT `r_plant` (SPRING 1.5 · SUMMER 1.0 · AUTUMN 0.7 · WINTER 0.4) and F-GRAZER `r_graze` (SPRING 1.3 breeding season · WINTER 0.6) — **the lean-season arc**: winter starves the chain from the bottom, predator hunger peaks, roads get dangerous, exactly the ECOSYSTEM's core law with a calendar on it |
| **NIGHT SHIFT** | the seasonal dark-window offset stretches the howler shift in winter; summer gives the day shift back |
| **Predator senses** | already coupled (`weather.vision_mult()` in F-SENSE) — now honest per-position: a nest inside the storm is blinded by it, one outside isn't |
| **Birds** | already coupled (grounded in storms via `weather_lift`) — Ash Crows' pre-storm gathering now has a real object to gather ahead of (a system disc inbound within N km) |
| **Vehicles** | `grip_now` sampled at the car (shipped law, now local); heat-dome engine wear only inside the dome |
| **Bandits/traffic** | visibility terms already read weather; a checkpoint inside a dust core is half-blind (their problem too — fair) |
| **Camps/hunger** | (P3 hook) winter raises hunger drain slightly at camp — the walls-before-winter pressure |

### 3.8 Determinism, net, offline, save

- **Deterministic:** spawn rolls seeded per `(day, hour)`; drift is pure integration — same save, same skies.
  The live field is host-authoritative; clients receive `systems[]` (tiny — ≤4 dicts at 20 Hz is nothing) and
  sample locally.
- **Offline catch-up:** inside `run_offline_catchup`'s day loop, re-roll each absent day's systems *coarsely*
  (spawn + integrate at day resolution, no visuals) ONLY to water ecology sectors deterministically
  (`water_rot` deposits along each system's swept path) and to advance the calendar. Pure float math, no
  spawns, bounded by the existing 7-day cap. The return briefing gains one line: *"It rained hard on the
  Alley while you were gone — the sumps are alive."*
- **Save:** `data["world"]["wx"] = {systems: [...]}` — one key, `.get`-defaulted (no `SAVE_VERSION` bump).
  Season derives from `day` (already saved). `restore()` keeps its no-toast contract.

## 4. Formulas

| Formula | Expression | Vars / ranges | Example |
|---|---|---|---|
| **W-INT** (the gradient) | `I(pos,s) = smoothstep_inv(s.radius·CORE_FRAC, s.radius, dist) · s.fade`; `I(pos) = max over systems` | `CORE_FRAC = 0.45` (0.3–0.6); `fade` ramps 0→1 over first 10% ttl, 1→0 over last 20%; result 0..1 | rain system r=2600: full downpour inside 1170 m, fading to nothing at 2600 — a ~1.4 km drizzle band; at 25 m/s you cross the gradient in ~57 s of building rain, never a line |
| **W-TAX** | `vision = lerp(1, kind.vision, I)` · `grip = lerp(1, kind.grip, I)` · `wear = kind.wear · I` | the shipped STATES numbers, unchanged; sampled at player (vision) / active car (grip, wear) | half-deep in rain (I=0.5): vision 0.8, grip 0.81 — soft warning zone before the core's 0.6/0.62 |
| **W-SPAWN** | per game-hour, per empty slot: `rng.seed = hash("wx:%d:%d:%d" % [day, hour, slot])`; spawn if `rng.randf() < Σ climate[biome][season]` for the rolled region; kind by weight share | ≤ MAX_SYSTEMS=4; region candidates biased player-state + eco-interest; radius from `sizes[kind]`, vel from `wind[season]` ± 30% jitter | day 23 AUTUMN, swamp row rain 0.35 → a rain system spawns over the Alley about every 3 game-hours; the same day+hour on the same save always spawns the same storm |
| **W-SEASON** | `season = (day / SEASON_DAYS) % 4`; `dark_offset_h = [0, −1.5, +0.5, +1.5][season]`; ecology `season_mult` rows multiply `r_plant`/`r_graze` | `SEASON_DAYS = 7` (5–14); offsets ±0–2 h; mults: r_plant ×{1.5,1.0,0.7,0.4}, r_graze ×{1.3,1.0,0.8,0.6} | WINTER: plant regrowth ×0.4 + nights +3 h total swing vs summer → `food_avail` sags below the nest fixed point (0.375) region-wide → hunger climbs → the hungry season, emergent |
| **W-WET** (regional rot) | per WARM/HOT eco tick: `water_rot += k_wet · I(cell_center, "rain") · dt` toward 1.0 (storm present), else mean-revert to biome base (existing law) | `k_wet = 0.15/gh` (0.05–0.3); uses cell center, NOT player pos | a 3-gh rain sit over a dry farmland cell: water_rot 0.30 → ~0.55 → Sump Rats eligible tonight, in that county only |
| **W-HORIZON** | render a sky-wedge darkening toward `s.center` when `dist < HORIZON_KM·1000` and `I(player)<0.25` | `HORIZON_KM = 4` (2–8); wedge width ∝ angular size | the bruise on the horizon: you see the storm you'd meet in ~3 min of driving, and can route around it on the atlas |

## 5. Edge Cases

- **Two systems overlap (rain over dust).** `I` takes the max per kind; taxes take the *worst* of each
  channel (min grip, min vision) — never additive stacking below the table floors. Overlaps are rare
  (MAX_SYSTEMS 4 map-wide) and read as "the storm has a dirty edge."
- **A system crosses the protected safehouse bubble.** Weather is never gated — it rains on home (cozy, not
  punitive: no engine wear parked, camp fire audio ducks the rain bed). Ecology's protected-sector law is
  untouched (no nests at home, wet or dry).
- **`force("dust")` in an old sim.** Spawns a stationary max-I system on the player and pins `state` — every
  existing sim (`visibility_sim`, howler headlight tests, gunfeel) sees exactly the old behavior. The compat
  shim is load-bearing: **no existing sim may go red** (asserted by `wx_compat_sim`).
- **The player outruns a storm the sim later needs (determinism worry).** Field state is position+time math
  off the seeded spawn — nothing about the player perturbs a system's path. Outrunning is sampling, not
  mutation.
- **Season flips mid-storm (day 7→8).** Live systems keep their identity and ttl; only *new* spawns read
  the new season's rows. No pop.
- **Offline: 7 days of storms would soak everything.** W-WET's swept-path deposit uses day-resolution
  integration with the same `k_wet` — bounded by the same clamp 0..1 and mean-reversion; a week of FL summer
  leaves the swamp wet (correct) and the desert dry (drift paths rarely cross it, and reversion wins).
- **Snow in Florida.** Impossible by data: `snow` weight exists only in northern-latitude climate rows, and
  the latitude gate is a hard filter — a modded row can't melt the law without also editing the gate row.
- **Client/host divergence.** Clients never roll spawns; they integrate received `systems[]` between syncs
  (pure drift = perfectly predictable) — visual-only divergence bounded by one sync interval.
- **HUD weather icon with no global state.** `icon()`/`label()` read the derived local `state` — inside a
  system you get its icon exactly as today; outside, clear. The HUD never learns the field exists.

## 6. Dependencies (bidirectional)

- **Reads:** `weather.gd` (STATES rows, force/restore contracts — upgraded in place), `daynight.gd`
  (`day`, twilight ramps — gains the seasonal dark offset), `usmap.gd` (`cell_of`/biomes/state bands),
  `events.gd` (seed idiom), `world_state.gd` (offline day loop, broadcast queue), `population.gd`
  (`row["eco"].water_rot` via the eco tick), `hud_3d.gd` (icon line, atlas), `radio.gd` (weather bulletins),
  `audio.gd` (`rain_bed` loop + thunder, the LOOPED list), `net.gd` (host-auth sync of `systems[]`).
- **Written for (these must reference this doc):**
  - `LIVING_WOUND_ECOSYSTEM.md` — consumes W-WET (regional `water_rot`), `season_mult` on F-PLANT/F-GRAZER,
    the seasonal dark offset (NIGHT SHIFT windows), per-position `vision_mult` in F-SENSE, and the
    lean-season pressure arc. Its §6 lists this doc.
  - `daynight.gd` — must read `dark_offset_h` from the season.
  - `ROAD_TRAFFIC_OVERHAUL` / `BANDIT_CONVOY_ECOSYSTEM` — visibility/grip consumers; checkpoint blindness
    inside cores.
  - `LIVING_WORLD_DSOA` — the return briefing gains the weather line; the Journey Board reads storm discs
    as route hazards.

## 7. Tuning Knobs

| Knob | Default | Range | Governs |
|---|---:|---|---|
| `MAX_SYSTEMS` | 4 | 2–6 | how busy the sky gets, map-wide |
| `CORE_FRAC` | 0.45 | 0.3–0.6 | gradient band width (lower = wider drizzle rim) |
| system radius (`sizes` rows) | 1.2–5 km | 0.5–6 km | drivability of a storm (bigger = commit, smaller = dodge) |
| drift speed (`wind` rows) | 4–9 m/s | 2–15 | can you outrun it (car ≈ 25 m/s: yes, deliberately) |
| `SEASON_DAYS` | 7 | 5–14 | year length (28 game-days ≈ 11 real h at default) |
| `dark_offset_h` per season | ±1.5 max | 0–2 | how hard winter nights bite (the howler season) |
| `season_mult` (r_plant) | 1.5/1.0/0.7/0.4 | ±50% | the lean-season depth — how hungry winter gets |
| `k_wet` | 0.15/gh | 0.05–0.3 | how fast rain wets a county (Sump-Rat latency) |
| `HORIZON_KM` | 4 | 2–8 | how far ahead the sky warns a driver |
| spawn weights (`climate` rows) | per biome×season | 0–0.6 | regional identity — THE dial |

## 8. Acceptance Criteria (headless sims, real-path)

1. `wx_field_sim` — a spawned rain system: `I` is 1.0 in the core, 0 beyond the rim, and **monotonically
   smooth** along a radial walk (max ΔI per 10 m < 0.02 — the no-hard-edge assertion); taxes lerp with I;
   two overlapping kinds take worst-per-channel, never additive.
2. `wx_compat_sim` — `force("dust")` pins the derived `state`, `vision_mult()` returns 0.18, `grip_now`
   0.9, `restore()` is silent; then the full existing suite's weather consumers run green unmodified.
3. `storm_drive_sim` — drive a staged car through a rain system on a straight road: grip falls then
   recovers along the gradient (no step), the enter/exit toasts fire exactly once each, and driving at
   25 m/s laterally EXITS a 7 m/s system (outrunning provable).
4. `wx_regional_sim` — a system parked over a WARM Florida cell raises that cell's `water_rot` while a dry
   plains cell stays at base **with the player standing in neither** — different weather at different parts
   of the map, asserted.
5. `season_sim` — advance `day` through 28: season derives correctly, WINTER extends `is_dark()` by the
   offset, `r_plant`/`r_graze` multipliers apply in the eco tick, and the lean-season arc shows: a staged
   healthy sector's `food_avail` sags below 0.375 in WINTER and recovers in SPRING (deterministic, seeded).
6. `wx_offline_sim` — a 5-day absence: seasons advance, swept-path W-WET deposits are deterministic (same
   seed → identical floats), zero systems/visuals/audio spawn during load, one briefing line queued.
7. `wx_save_sim` — save mid-storm → load: the same system resumes (position/ttl round-trip via
   `data["world"].wx`); an old save without the key loads clear-skied, no bump.

---

*End of spec. Weather is a place; the season is a pressure. Phase with the ecosystem: field + rain/dust/heat
+ calendar + eco couplings ride ECOSYSTEM Phase 1–2; snow + the seasonal arc land P2; hurricanes/tornadoes
are P3 signatures. Nothing here blocks the Alley slice — the compat shim keeps every shipped consumer green.*
