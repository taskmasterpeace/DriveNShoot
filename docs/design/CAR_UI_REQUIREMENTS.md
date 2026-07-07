# CAR UI REQUIREMENTS

**Written:** 2026-07-07. **Owner ask:** "Make me a document of the car UI requirements."
**Scope:** the in-car / at-the-wheel information layer — what the player sees and hears from the driver's seat. Not vehicle physics, not weapon mounting, not the garage screen.
**Grounded in:** `game/proto3d/hud_3d.gd` (dashboard), `car_3d.gd` (5-part damage + fuel + headlights), `radio.gd` + `music.gd` (stations), `docs/design/LIVING_WORLD_DSOA.md` §14 (seats), `docs/HANDOFF.md` §2d (owner asks list).

## Diegetic-first principle (reads before every requirement below)

DRIVN's HUD is minimal by house style: emoji-bar dashboard, no numeric health globes, no radar, no minimap. Every requirement in this doc must pass one test: **does this teach the player through the WORLD (light, sound, wobble, a toast that fades) before it teaches them through a widget?** A gauge is the fallback when a physical effect can't carry the information alone (e.g., you cannot feel "12% fuel remaining" from engine sound — you need the number). When in doubt, the physical effect is P0 and the readout is P1 polish riding on top of it. Box-rig aesthetic, amber-on-bone palette, no purple.

---

## P0 — Must exist for the car to read as alive and threatening

### P0-1. Damage readout: LIVE-already
The dashboard (`hud_3d.set_dashboard`) already renders all 5 parts (engine/tires/battery/fuel_tank/chassis) as 4-segment bars (`▮▮▱▱`) tiered GOOD→WORN→CRITICAL→BROKEN by color, plus a fuel bar and a `💥BLOW %` cook readout when on fire. This is correct and should NOT be replaced with numbers — the bar is the diegetic-enough compromise (a dashboard idiot-light, not a percentage readout).
- **Requirement:** the readout must never be the PRIMARY signal. Misfire cough, chassis steering wander, headlight flicker, and fuel leak drain (all live in `car_3d.gd`) are the primary signal; the dashboard bar is confirmation for a player who wants to plan ahead, not the first thing that tells them something's wrong.
- **Gap (PARTIAL):** none of engine-misfire, tire-slop, or battery-flicker have a **dedicated sim assertion** (HANDOFF §2b: "combat juice rides untested"). Requirement, not a UI ask: before adding readout polish, the physical effects it's confirming need `misfire_sim`-class coverage so a UI change can't quietly break the thing it's supposed to be reading.

### P0-2. Radio station toast on change: PARTIAL
`radio.gd` already toasts full-sentence flavor text on scan (`"📻 ♪ …a STATION, actually playing music… (%s)"`) and `music.gd` tracks `now_playing` / `station_name()`. What's missing is a **compact toast specifically for station CHANGE** (the L-key next-station action and the O-key power toggle), distinct from the Y-scan discovery toast.
- **Requirement:** pressing L must toast `📻 <STATION NAME>` for ~1.4s (reuse `ProtoHUD.toast()`, already built). Pressing O must toast `📻 OFF` / `📻 <STATION NAME> — ON`. This is confirmation of an action already taken, not new information — keep it short, no track name (track name changes too often, would spam).
- **Requirement:** the toast is the ONLY UI radio needs. No persistent station-name label, no EQ visualizer, no album art. If the player wants to know what's playing, that's what the toast (and the diegetic in-cab audio, P0-3) is for.

### P0-3. Radio audio sounds like it comes FROM THE CAR: PROPOSED (owner ask, this session)
Confirmed gap: `music.gd`'s `_player` is a plain `AudioStreamPlayer` — non-positional, full volume everywhere, identical to the ambient-screen bug already fixed once this arc (commit `89802d1`, "the EMERGENCY-TONE bug" — a non-positional `VideoStreamPlayer` blared map-wide). Radio must not repeat that mistake.
- **Requirement:** the music player must be (or be wrapped by) an `AudioStreamPlayer3D` parented to the car's cab, so volume falls off with distance from the vehicle — a parked car with the radio on should be audible walking up, not audible from across the map.
- **Requirement:** an INTERIOR/EXTERIOR muffle state. While the player is the driver or a seated passenger (`character.gd` seat state, already tracked for the seat-anchor system), the radio reads full-fidelity ("in the cab"). The instant the player exits the vehicle (E to get out), the same audio should get a low-pass muffle applied — the classic "car door closes, bass thump through glass" read. This is one bus-effect toggle (a `AudioEffectLowPassFilter` wet/dry swap on enter/exit), not a new audio graph.
- **Requirement:** volume knob (`,`/`.`) continues to scale `_player.volume_db` as it does today (`music._apply_volume`) — the positional/muffle change must not regress the existing knob.
- **Edge case:** two cars both with radios on, player walks between them — nearest-car falloff should win naturally from 3D attenuation; no special-case code needed, but a sim should assert it (see Sim Hooks).
- **Edge case:** battery BROKEN kills headlights already (`headlights_on and battery.tier() >= CRITICAL` gates the lamp); the radio should die the same way — no power, no music, silence not static (matches the existing "empty shelf reads as static, never broken" law in `radio.gd`'s comments, but a DEAD battery is not an empty shelf, it should just cut audio, not fake static).

### P0-4. Headlights state: LIVE-already
`car_3d.gd` `set_headlights()` already spawns real `OmniLight3D`-family lamps + glow meshes, gated by battery tier, toggled by input. This is fully diegetic (a light in the world, not an icon) and needs no UI addition. Listed here only so the requirements doc doesn't look like it forgot headlights.

### P0-5. Horn: LIVE-already
`_horn` action already exists (`drivn_horn`), carries over the net (`net_horn_ping`), and recalls a bonded pack within `horn_recall_radius()`. Purely diegetic (a sound), correctly has zero UI. No requirement — confirming it's covered, not a gap.

---

## P1 — Strongly wanted this arc, each has a design decision still open

### P1-1. Night driving: ambient car-anchored light halo — PROPOSED (owner ask, this session: "too dark outside the headlight cone")
- **Requirement:** a soft, warm, LOW-radius omnidirectional light anchored to the car's chassis (not the headlight cone — a separate, dimmer glow that reads as "engine heat / undercarriage / interior dome light spill," not a second set of headlights). Radius should light the car itself and its immediate footprint (close enough to see your own tires and the character exiting the door) without meaningfully lighting the road ahead — that job stays the headlight cone's alone.
- **Requirement — the tradeoff (this is the design point, not just a fix):** the halo must cost something. DRIVN's heat/howler-attraction pattern (established via headlight fear response in `howler.gd`, radio night-weighting) is the model — a lit car at night should read as MORE visible to threats, not a free quality-of-life fix. Recommend the halo have two states:
  - **OFF (default):** current darkness. Full stealth, full immersion, matches "too dark" complaint unaddressed.
  - **ON (interior dome / running lights, player-toggleable, separate from headlights):** visibility radius as above, but adds to the same attraction roll headlights already feed (`howler.gd` fear/attraction check) — a small additive term, not a new system, since headlights already prove the attraction hook exists.
- **Open design question for the owner (flag, don't resolve unilaterally):** should the halo be ALWAYS ON (pure QoL, no tradeoff, headlights alone remain the danger dial) or TOGGLEABLE (a new choice, more Autoduel-like risk/reward)? This doc recommends toggleable to preserve "every light is a decision" but the call is the owner's. Either way the radius/brightness values are Tuning Knobs (see below), not fixed in code.
- **Dependency:** rides the same `Damageable` battery-gate pattern as headlights — a BROKEN battery kills the halo too (no free light from a dead car).

### P1-2. Seats/passengers — who's aboard: PARTIAL
The seat SYSTEM is live and rich (`proto3d.gd` lines ~3690-3760: crew + dogs board up to `dog_seats`, bed-seat anchors show riders physically standing in the truck bed) and `LIVING_WORLD_DSOA.md` §14 specs driver/gunner/rear-passenger/cargo-bed/dog-seat/drone-operator roles further. What's PARTIAL is the **at-a-glance UI answer to "who's in my car right now"** while driving — today the only confirmation is the boarding toast (`"🧍 %s climbs into the bed"`) which fades, and the physical rig itself (look at the truck bed, see Sam).
- **Requirement:** the existing dashboard status line (`_dash_status`, already composing "which rig · surface struggle · cargo load" as a `·`-joined string) gets ONE more clause when occupants > 0: a compact roster, e.g. `🧍×2 🐕×1` (counts only — names are what the physical rig + boarding toast are for; a roster of full names in the dash would violate the minimal-HUD principle).
- **Requirement:** this must NOT duplicate `LIVING_WORLD_DSOA.md` §14's passenger-ROLE mechanics (gunner fires from a seat, rear passenger shoots from window — those are gameplay systems, already partially live via `_fire_from_seat()`). This doc's ask is display-only: a count, not a role picker.
- **Trunk access prompt:** LIVE-already. `_at_trunk()` + `"E — Open trunk"` / `"E — Open trailer (%d kg tank)"` prompt text already exists via the shared `_prompt_label`. No gap.

### P1-3. GPS/tablet device-gated map — PROPOSED, NOT GREENLIT (banked owner idea, spec hooks only)
Per memory (`gps-device-idea.md`) this is an idea, not an approved feature — this section specs the UI HOOKS it would need IF greenlit, so the eventual build isn't starting from zero, without committing scope now.
- **Requirement (if built):** the M-map key must become conditional on device ownership. Today M always opens the full macro map; a device-gated version needs a **three-tier reveal** that the map-drawing code would branch on:
  1. No device: M shows nothing, or a diegetic "no signal" toast — never a blank panel.
  2. Basic device (owner's stated tier: "roads + exits"): the map draws the road network and `EXIT NODES` (already a real data concept per `world-structures-arc` memory — `I-95_X1` etc.) but NOT points of interest, NOT the nav-arrow waypoint system (`update_nav`), NOT the 🛸 drone marks.
  3. Full device (a later tier, unspecified): today's full map — POIs, waypoint arrow, drone marks all restored.
- **Requirement:** the device itself should be a car-mounted object (a dash-mounted tablet/GPS unit), meaning its presence check belongs to the CAR's spec/inventory (a row on `vehicles.json` or the trunk, TBD), not the player's personal inventory — reinforces "the car is your world," matches the owner's framing ("car-GPS/tablet/phone").
- **Requirement:** whatever tier is active must be readable from the dashboard at a glance — a single glyph (e.g. a small 📡/🚫 icon near the existing `_mode_label` location strip) so the player knows BEFORE pressing M whether it'll do anything.
- **Explicitly NOT required by this doc:** the phone/mobile-mode surface described in `LIVING_WORLD_DSOA.md` §"mobile mode" is a separate, much larger system (drone ops, news, safehouse management remotely) — out of scope here. This section only covers the in-car MAP gate.

### P1-4. EV vehicle row — battery %, range, charge state, solar trickle: PROPOSED (owner ask, this session)
No EV precedent exists in `car_3d.gd` today — `fuel` is a single float, `fuel_tank` a `Damageable` component, and the existing `battery` component is the ELECTRICAL SYSTEM (starts the engine, powers headlights/radio), not a fuel source. An EV variant needs its OWN row, not a reuse of the existing `battery` id (that would collide two different meanings of "battery" on the same vehicle spec).
- **Requirement:** an EV vehicle class is a `vehicles.json` row like any other rig (house rule: new content = a row, never new code per-vehicle) with a `powertrain: "electric"` field (or similar) that the dashboard branches on.
- **Requirement — readout swap, not addition:** an EV dashboard REPLACES the `⛽FUEL` bar+percentage with a `🔋CHARGE` bar+percentage in the exact same dash slot (same bar widget, `hud_3d._bar()`, reused — no new widget class). Never show both fuel and charge on one vehicle.
- **Requirement — range estimate:** unlike gas (which the player learns by feel/experience), EV convention expects a distance-to-empty number. Add a `~%d mi` (or the game's distance unit) suffix on the charge readout, computed as `charge_pct * max_range_at_full / 100` — a derived display value, not new car state.
- **Requirement — charge STATE, not just level:** three states the dashboard must distinguish: DRAINING (driving, default), IDLE (parked, not charging), CHARGING (plugged in at a station/garage — future system, not yet built, but the dash state enum should reserve the slot now so the eventual charging-station feature doesn't require a dashboard rewrite).
- **Requirement — solar trickle variant:** a sub-variant (or a `has_solar: true` flag on an EV row) that VERY slowly refills charge while parked in daylight (`daynight.gd` already exposes `is_dark()` — trickle should gate off that, off in `is_dark()`). UI-wise this needs one glyph difference: a small ☀️ badge next to the charge bar when the trickle is actively adding charge (daylight + parked), so the player learns "leaving it in the sun helps" without a tooltip.
- **Requirement — sound signature:** owner explicitly called out "different sound signature, no fuel" — this is an AUDIO ask, flagged here for completeness but NOT a UI requirement (audio direction is out of this agent's lane per house rules). The UI-relevant consequence: an EV has no misfire cough (misfire is an internal-combustion failure mode) — its equivalent breakdown tell needs a design decision (motor whine degrade? Sudden cutout?) before the dashboard can decide what CRITICAL/BROKEN on an EV's drive component even looks like. Flagging as an open dependency, not resolving it here.
- **Edge case:** EV's `battery` (electrical system, powers lights/radio) and the NEW charge-battery (motive power) are two different components on the same rig — naming collision risk. Recommend the data schema use `battery` (existing, 12V-equivalent, gates lights/radio same as gas cars) and a distinctly-named `drive_battery` or `traction_pack` for the EV's motive charge, so `Damageable` component IDs never collide across the two meanings.

---

## P2 — Nice-to-have, low urgency, flag and move on

### P2-1. Cook/fire readout: LIVE-already
`💥BLOW %d%%` already exists on the dashboard, gated to `on_fire`. No further UI work needed; listed for completeness.

### P2-2. Surface/struggle status line: LIVE-already
`_dash_status` already composes "BOGGED — dirt tires churning" / "TIRES SHOT — limping" text dynamically. No gap.

### P2-3. Mirror/rear-view or blind-spot indicator: NOT ASKED, NOT RECOMMENDED
Not in the owner's ask list and would cut against the minimal-HUD, world-anchored-cues house style (a mirror widget is exactly the kind of sim-racer chrome DRIVN's dashboard has deliberately avoided so far). Noting explicitly as a NON-requirement so it isn't quietly added by a future pass without a design conversation.

---

## Dependencies (system interaction map)

| This doc's item | Depends on / reads from | Owned by |
|---|---|---|
| Damage bars | `Damageable.tier()`, `car.dashboard()` | `car_3d.gd` (existing) |
| Station toast | `ProtoHUD.toast()`, `music.station_name()` | `hud_3d.gd` + `music.gd` (existing, needs wiring) |
| Positional/muffled radio | `AudioStreamPlayer3D`, a low-pass `AudioEffect`, seat/driver state | `music.gd` (needs rework), `character.gd` seat state (existing) |
| Night halo | `Damageable` battery gate (pattern from headlights), `howler.gd` attraction roll | `car_3d.gd` (new light node) + `howler.gd` (new additive term) |
| Passenger count clause | `_dash_status` string composition, `car.trunk`/seat arrays | `car_3d.gd` (existing seat/board code) |
| GPS device tiers | M-map draw call, `world_stream`/`usmap` exit-node data, car spec or trunk inventory | `proto3d.gd` map code (new branch), `vehicles.json` (new field, if greenlit) |
| EV charge row | `vehicles.json` schema, `Damageable` component naming, `daynight.is_dark()` | `car_3d.gd` (new component + dashboard branch) |

## Tuning knobs

| Knob | Category | Suggested range | Notes |
|---|---|---|---|
| Station-change toast duration | feel | 1.0–2.0 s | match existing `toast()` default (1.4s tween) |
| Radio interior/exterior muffle wet/dry | feel | 0.0 (full muffle) – 1.0 (full clarity) | swap on enter/exit, not a slider the player sees |
| Radio 3D attenuation max distance | curve | 8–20 m | should die out roughly at "can't hear it over footsteps" |
| Night halo radius | feel/gate | 2–6 m | P1-1's core tradeoff dial — bigger = safer to see, more howler bait |
| Night halo attraction weight | gate | 0.1–0.5× of headlight's existing weight | halo should matter less than headlights, never more |
| EV trickle charge rate | curve | 0.05–0.3 %/sec in daylight | slow enough that "just wait" isn't a strategy, felt enough to reward parking in the open |
| EV range-estimate refresh | feel | recompute every frame or every 1s | cosmetic choice, no gameplay stake either way |
| GPS tier reveal radius (basic tier) | gate | roads+exits only, no POI radius | owner-specified: "roads + exits" is the literal ceiling of tier 1 |

---

## Sim hooks — how a headless sim proves each P0

- **P0-1 (damage readout):** stage a car, drop `engine` component tier to CRITICAL via direct damage call, assert `hud.set_dashboard(...)` receives `tier == Damageable.Tier.CRITICAL` and the bar string renders `▮▮▱▱`-class output — reuse the `misfire_sim` pattern already established, extend it to assert the DASHBOARD output, not just the physical misfire flag.
- **P0-2 (station toast):** simulate the L-station-next input action, assert `hud._toast_label.text` (or a new sim-hook getter) contains the new station's `station_name()` within one frame, and that it differs from the Y-scan discovery toast text.
- **P0-3 (positional/muffled radio):** stage two `AudioStreamPlayer3D`-driven cars at a known distance apart with radios on; assert the effective volume at the player's position falls off with distance (query `AudioServer` bus volume or the player's measured attenuation, whichever the engine exposes cleanly); then teleport the player from driver seat to outside the car and assert the low-pass wet/dry value flips within one frame of the exit action.
- **P0-4 / P0-5 (headlights/horn):** already covered by existing behavior — no new sim required per this doc; confirm existing coverage is retained if this doc's other changes touch `car_3d.gd`.

Everything above P0 (night halo, seats roster, GPS tiers, EV row) should get its own sim once built, named on the `<name>_sim` convention (e.g. `night_halo_sim`, `ev_sim`), asserting real input → real dashboard/light state, per house rule: no teleport-only tests, no widget verified by eyeballing a screenshot.
