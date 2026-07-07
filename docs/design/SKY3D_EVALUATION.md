# Sky3D — evaluation (do we need it / could we use it?)

**Goal (2026-07-07):** "examine if we need or could use" [TokisanGames/Sky3D](https://github.com/TokisanGames/Sky3D).
**Verdict:** we do **not need** it (our day/night is complete and gameplay-wired), but we
**could** use it as a **visual polish** upgrade — it's the rare Tokisan addon that fits our
renderer. **Recommendation: BANK it for a later "make the sky pretty" pass; don't adopt
mid-arc.** No code changed by this evaluation.

## What Sky3D actually is (verified, not assumed)

- **Pure GDScript** — 7 `.gd` + 2 `.gdshader`, **no GDExtension / no compiled libs** (unlike
  Terrain3D, which we rejected for exactly that). **MIT** licensed.
- **Runs on our stack:** the authors state "Supports Godot 4.3+, Forward, Mobile, and
  **Compatibility** renderers." Our project is **GL Compatibility** — so the blocker that
  killed Terrain3D does **not** apply here. Compatibility needs two documented tweaks:
  `Sky3D / Sky Contribution = 0.75` and `SkyDome / Fog / Fog Density = 0.01`.
- **Confirmed live:** its `demo/Sky3DDemo.tscn` imports and boots headless on our Godot
  4.5 with **exit 0, no shader-compile or script errors** (checked during this evaluation).
- **What it adds visually:** atmospheric-scattering sky, sun/moon **disks** with moon
  phases, drifting **clouds**, a **star field**, day-cycle fog — plus its own time-of-day
  management (`TimeOfDay`: current time 0–23.99 h, day length, day/night).
- **How it wants to be used:** `class_name Sky3D extends WorldEnvironment` — you **remove
  your existing `WorldEnvironment`**, add a `Sky3D` node, and it **owns** the sun + moon
  `DirectionalLight3D`s and the clock ("light energy, color, and angle are driven by Sky3D
  and not directly changeable" on the lights).

## What we already have (`daynight.gd` + `weather.gd`)

- `ProtoDayNight`: a full 24-real-minute day, driving the **sun** (`DirectionalLight3D`),
  the **sky** (`ProceduralSkyMaterial` — a flat gradient), **fog**, and **every vehicle's
  headlights**. It owns the clock (`hour`/`day`), a `dev_mult` fast-clock (×1/×10/×60 for
  testing nights), and **T-wait** (sprint the clock).
- It is **load-bearing for gameplay**, not just visual:
  - `daylight()` (1.0 noon → 0.0 night) feeds the **PERCEPTION ENGINE** — night shrinks
    what you can see, which is *the entire reason night is dangerous*.
  - `moon_phase` (8-day cycle) sets **how dark** night gets — a full-moon 0.72-sight night
    vs a new-moon 0.32-ink night (a playtest LAW).
  - `weather.gd` (dust/rain/heat) multiplies vision/grip on top of it.
- Our sky is plain (a gradient `ProceduralSkyMaterial`); the *system* is rich, the *picture*
  is not.

## The catch — an ownership collision

Both systems are opinionated about owning the **sun**, the **sky/environment**, and the
**clock**. Sky3D wants to *be* the `WorldEnvironment` and *drive* the sun/moon + time;
`daynight.gd` already does that **and** exports the numbers (`daylight()`, `moon_phase`,
`hour`) that perception, headlights, the moon-darkness law, and weather all read. You can't
just drop Sky3D in — you'd get two things fighting over the sun and two clocks.

## Need vs. could

- **Need?** **No.** Day/night, moon-driven darkness, fog, headlights, weather, and the
  perception coupling all already work and are sim-covered. Sky3D adds **zero** missing
  functionality.
- **Could?** **Yes** — cleanly, as a **visual-only layer**, because it's GDScript + GL-compat
  + MIT. The prize is purely the *look*: a real scattered sky, sun/moon disks, clouds, and a
  star field instead of the flat gradient.

## If we pursue it — the integration plan (medium effort)

Keep `daynight.gd` as the **authoritative GAMEPLAY clock**; make Sky3D **visual-only**:

1. Add `addons/sky_3d`, enable the plugin, apply the two Compatibility tweaks.
2. **Drive Sky3D from our clock:** each frame set `sky3d.current_time = daynight.hour`
   (and map `moon_phase`); turn OFF Sky3D's own time progression (`game_time_enabled =
   false`) so there's ONE clock — ours.
3. **De-conflict the sun:** either let Sky3D own the sun *visual* while `daynight.daylight()`
   stays the source of truth for perception/headlights (read our number, not the light's),
   or keep our sun and use only Sky3D's `SkyDome` for the sky/clouds/stars. Pick one owner
   per concern; re-verify `feel_sim`/perception read OUR `daylight()`.
4. Replace the `ProceduralSkyMaterial` with Sky3D's `SkyDome`; keep `weather.gd` layering
   its vision/grip on top (Sky3D fog is cosmetic; our weather is mechanical).
5. **Re-run the guards:** `feel_sim` (night sight floor), any daynight/perception sim, and
   a boot smoke — the moon-darkness LAW and headlights must be byte-for-byte unchanged.
6. Budget a **GL-Compatibility look pass** — the authors warn Compatibility needs tuning to
   match Vulkan; verify it actually looks better than our gradient on *our* renderer before
   committing.

**Risk:** medium — the sun/time ownership de-conflict is the real work; the payoff is
cosmetic. **Reward:** a genuinely prettier sky/night for a driving game where you stare at
the horizon a lot.

## Recommendation

**Defer, don't adopt now.** It's the right tool for a future visual-polish pass (GL-compat,
GDScript, MIT, proven to boot), but it's a *juice* upgrade over a *working* system, and it
demands untangling the sun/clock ownership that our perception + moon-law depend on. When we
do a "make DRIVN look good" pass (alongside the [terrain relief](TERRAIN_RELIEF.md) and
[textured ground] work), Sky3D is the pick — mount it as a visual layer on `daynight.gd`'s
clock, per the plan above. Until then, this evaluation is the artifact; the clone sits in
scratch, nothing vendored.
