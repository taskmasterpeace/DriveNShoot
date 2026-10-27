# MASTER PROMPT — make DIVIDED STATES OF AMERICA feel like the vast world of Deathlands

> Paste everything below the line into a fresh Claude Code session opened in `D:\git\DriveNShoot`.
> It is self-contained. It drives a dream loop against four generated target frames, one wave at a time.
> Written 2026-10-27 from `docs/design/WEB_DEATHLANDS_GAP.md` (read that first — it is the spec).

---

You are the lead engineer on **DIVIDED STATES OF AMERICA (DSOA)**, the three.js top-down open-world game in
`D:\git\DriveNShoot\web`. The Godot game in `game/` and in `D:\git\carworld` is the OLD reference build — never work there.
Your mission: close the gaps in `docs/design/WEB_DEATHLANDS_GAP.md` so the game feels like the vast, dangerous,
crew-driven world of James Axler's *Deathlands* — in **shapes only, never names** — and so the live game matches the
four dream frames in `docs/renders/gap-2026-10-27/`.

## 0. Read before you touch anything (in this order)
1. `docs/design/WEB_DEATHLANDS_GAP.md` — the gap analysis: G1–G10, formulas, acceptance criteria. **This is your spec.**
2. `web/AGENTS.md` (architecture map, commands, invariants) and `docs/RESUME_WEB_ENGINE.md` (gotchas already paid for).
3. `docs/design/WEB_FAN_SERVICE_BIBLE.md` §1, §3.1–3.3, §3.5 — the IP law. `docs/design/WEB_ATLAS.md` §3.3 — the 8 CREW CARDS.
4. The skills in `.claude/skills/`: **dsoa-lane** (how a lane works), **dsoa-land** (how a lane lands), **dsoa-look**
   (how a look change is proven), **dsoa-content** (rows first). Load each when its moment comes.
5. The `dream-loop` skill (Pro workflow) for every visual wave.
6. Look at all six images in `docs/renders/gap-2026-10-27/`: `01_onfoot_meridian.png` and `02_driving_lawman.png` are
   TODAY; `target_drive_day.png`, `target_drive_dusk.png`, `target_foot_party.png`, `target_town_wide.png` are the DREAM.

## 1. Laws (non-negotiable)
- **Rows first, then code.** Every feature ships with an agent command (or a field on one), a `selftest` check and a
  scenario that shows it off. `selftest` green on a **fresh page, twice**, before landing.
- **Perf budget:** < 150 draw calls (instance everything), no per-frame allocation in hot loops, fixed pooled lights,
  1080p < 8 ms. Measure perf as an **ABBA A/B with fresh browsers** against the previous commit, never a remembered number.
- **IP:** `node web/tools/ip-lint.mjs` → 0 deny before every commit. No character names, slang, places or plot from
  the books. The crew may hold **at most 4 of the 8 CREW CARDS** at once. Use house words: Carousel, ring-sick, scrip,
  holdout, Keyholder, bulls, gatemen, sutlers, HOUSE RULES, COLD DEPOTS, HOT GROUND.
- **Art laws:** never purple (OKLCH/HSL hue 270–320) anywhere. Every person shows their **real flag** — on crew cards the
  flag is the card's backdrop, not a glyph. Nights stay truly dark.
- **Lanes:** one lane = one branch `feat/web-<lane>` = one worktree under `.worktrees/` = its own port 34xx with `DL_URL`
  on every call (never :3141 from a lane). At most **4 lanes at once**. Two lanes never edit the same file — if they must,
  serialize them. Kill processes by exact PID only.
- **Landing:** per `dsoa-land` — merge with `--no-ff`, resolve conflicts by whole blocks (never dedupe lines), regenerate
  `web/docs/COMMANDS.md` from the live page, prove every check name survived, fast-forward `feat/web-engine`, push
  `feat/web-engine:main`.
- **Commits:** clean conventional messages, **no Co-Authored-By lines** (Robert's rule). Commit after every feature.
- **Screenshots:** the `screenshot` command renders only the 3D canvas. For the full frame with HUD use Playwright on
  `http://localhost:34xx/?agent=0` at 1920×1080, drive it with `window.DL.call(name, args)`, and save into the lane's
  `docs/renders/web/<topic>/`.
- **Never ask Robert for a step you can do.** Only passwords, payment and one-time tokens are his. Decisions marked ☐ in
  the gap doc: take the recommended default, write it down in the doc's open-questions list, keep moving.

## 2. Wave 0 — clean the runway (you, alone, before any lane)
1. `git status`; land or retire the stale work so lanes don't inherit merge debt:
   `dsa2/ike-counter` (5 commits ahead of main), the 8 `.worktrees/dsafix1-*` fix branches, and origin's
   `feat/web-bases`, `feat/web-roadside`, `feat/web-underground` (**G4 and G6 need this one**), `dsa2/play-link`.
   For each: rebase or merge, selftest twice, land — or, if it is stale/superseded, record why in `RESUME_WEB_ENGINE.md`
   and leave it unmerged.
2. Baseline: `cd web && npm run agent`, `node tools/dl.mjs selftest`, `node tools/dl.mjs scenario name=stress`, and
   the six-frame **baseline set** (below) saved to `docs/renders/web/deathlands-baseline/`.

**The six-frame set** (used for every before/after in this prompt; same spots, hours and zooms every time):
| # | Setup |
|---|---|
| F1 | Phoenix, Central Ave, 09:00 clear, in the LAWMAN at ~25 mph heading north, default drive zoom |
| F2 | Same street, 19:40, headlights on, default drive zoom |
| F3 | Rust Haven market, 08:30, on foot, default foot zoom, crew of 4 (once G3 exists) |
| F4 | Rust Haven from 40 m outside the gate, 08:30, widest zoom |
| F5 | Inside a 6-storey building, floor 4, at a window looking at the street (once G4 exists) |
| F6 | Meridian, Florida, 08:00, on foot (the new-game opening frame) |

## 3. Wave 1 — the four things Robert asked for by name (4 parallel lanes)
These are independent and touch different files. Run them as four lanes in parallel (`dsoa-lane`), then land them one
at a time (`dsoa-land`), camera first.

**Lane `camera` (G1)** — files: `web/src/data/camera.js`, `web/src/main.js` (`updateCamera`, `setZoom`, the
wheel handling), `web/src/engine/input.js`, `web/src/systems/sky.js` (shadow box/far plane/fog), a new
`web/src/world/cutaway.js`.
- Continuous boom with pitch from zoom (§4.1 of the gap doc): **wheel zooms everywhere** (in the car too); weapon cycle
  moves to Alt+wheel; Z/Shift+Z/−/= step the five named stops; pad: R3 + right-stick vertical.
- **In the car the default is further out** (drive.dStart 70); **getting out eases in** (foot.dStart 20); each mode
  remembers the player's last zoom.
- **Closer = angled third-person/isometric** (θ up to 50° on foot), further = top-down map (θ ~8–10°). North stays up.
- Occluder cutaway (Bayer dither in a screen circle around the player; camera-side walls of your room drop to knee
  height), true frustum `viewR` (§4.2) so spawns never pop in view, a horizon (sky gradient, far plane to ~1200 at wide
  zoom, height fog, a ridge card per region).
- Commands: `camera d= theta= mode=`; `zoom level=` keeps working. Checks: acceptance 1–5 of the gap doc.

**Lane `guncarry` (G2)** — files: `web/src/systems/characters.js`, `web/src/data/arms.js`, creator rows.
- Pistols at the side/hip off the dominant shoulder line; long guns shouldered on the dominant side; per-character
  `hand: 'R'|'L'` (5–10% left, seeded; the creator lets the player pick). Muzzle ray still converges on the cursor.
- Check: acceptance 6. Render: a close tilted frame (needs lane `camera`'s `camera d=10 theta=50` — until it lands use
  the debug screenshot `tilt=` argument).

**Lane `crew` (G3)** — files: new `web/src/data/crew.js`, new `web/src/systems/crew.js`, new `web/src/ui/crew.js` +
`crew.css`, `web/src/systems/seats.js` (recruit/followThink moves into crew), dialogue `do:` hooks in `data/npcs.js` /
`data/meridian-talk.js`, `ui/inventory.js` (CREW column), save.
- The 8 CREW CARDS from `WEB_ATLAS` §3.3 as rows + ~20 generic hireables; cap 6 (+ dogs); ≤ 4 archetypes per crew.
- Recruit in play four ways (talk, hire, rescue, earn). CREW panel on **U** (flag-backdrop cards); **hold U** = order
  radial (FOLLOW, HOLD HERE, TAKE COVER, WEDGE/FILE/SPREAD, FOCUS MY TARGET, FREE/HOLD FIRE, FALL BACK TO THE RIG, MAN
  THE GUN, LOOT THIS, STAND WATCH). Trust per §4.4 off the existing deed stream. Down → bleed-out → carry/drag → death
  → grave + memorial + radio obituary line. Camp talk at night, combat barks, dialogue interjections.
- Seed Rust Haven with two recruitable cards and Meridian with one, so a new game can build a crew without the API.
- Checks: acceptance 7. Scenario `crew-run`: recruit 3, drive to the Dustwolf camp, order a wedge assault, win, camp.

**Lane `storeys` (G4)** — files: `web/src/data/storeys.js`, `web/src/world/storeys.js`, `web/src/world/ring.js`,
`web/src/world/streamer.js`, `web/src/world/floorplan.js`, new `web/src/world/facades.js`. **Rebase onto
`feat/web-underground` first.**
- Up to **6 storeys** (`maxAbove: 5`) by zone; storeys in the ring and streamed chunks, not just the island.
- Instanced facade kit (window bays glass/boarded/blown/lit, ledges, cornices, walkable fire escapes, signs, damage
  holes with rebar, roof water tanks/HVAC/sandbag nests, tin lean-tos, laundry lines) — +10–12 draw calls total.
- Roofs as places: access, plank/rope bridges between roofs, rooftop snipers; shooting out of windows into the street
  and back; per-floor loot. Checks: acceptance 8. Walkability audit covers every floor.

Land order: `camera` → `guncarry` → `storeys` → `crew`. After each landing re-shoot the six-frame set.

## 4. Wave 2 — THE DREAM LOOP (the look), run after Wave 1 lands
Use the **dream-loop skill, Pro workflow**. Create `web/.dream-loop/` (gitignored). The targets already exist —
**do not regenerate them**; copy them in:
- Round A target: `docs/renders/gap-2026-10-27/target_drive_day.png` (frame F1)
- Round B target: `target_foot_party.png` (frame F3)
- Round C target: `target_town_wide.png` (frame F4)
- Round D target: `target_drive_dusk.png` (frame F2)

For each round: implement → validate yourself → capture the live frame with the same framing as the target (match the
target's camera pitch and distance with `camera d= theta=`, hour with `setTime`, weather with `setWeather`) → send the
**live frame + target + previous frame + previous verdict** to a **fresh judge subagent** with the dream-loop judge
prompt (Composition 0–3, Lighting 0–3, Materials 0–3, Details 0–1). Tell the judge: **"Ignore HUD text — the target's HUD
lettering is AI-garbled; the shipped HUD is correct. Judge the world and the HUD layout only."** Address every item.
Exit per the skill (≥ 8 with perf in budget; stall rules apply). Then the next round.

What the judge will demand, roughly in this order (from the gap doc G9):
1. Post stack ≤ 1.5 ms: half-res SSAO (N8AO-class), selective bloom on emissives, per-hour LUT grade, vignette, grain.
2. Facade and roof detail (from lane `storeys`), sidewalks with curbs, crack decals, car-husk barricades, a burnt bus,
   dust trails, tumbleweeds.
3. Lights: player headlights as two pooled SpotLights; emissive lit windows at night; drum-fire point lights (pooled by
   distance); neon motel sign flicker.
4. **People.** At close tilt the procedural box people are the weakest element. Build the Phase 6 path
   (`WEB_ENGINE_PLAN`): skinned low-poly GLB characters baked to vertex-animation textures and instanced, for the crew
   and named NPCs; the procedural crowd stays as far LOD. Read the dream-loop `assets-3d.md` before choosing a source.
   Faces must read at foot.dStart; flags on every nameplate.
5. Atmosphere: height fog, blowing-dust sprites, a dust-wall horizon card for storms, a stacked-car-husk + container
   wall kit for holdouts (`target_town_wide.png`).
6. Fix the open look debts in `dsoa-look` (palms as stars, gem crowns, plank crows, Meridian grid) as they show up.

Record every round (score, top gaps, renders) in `docs/design/WEB_LOOK.md` §9 "Deathlands dream loop".

## 5. Wave 3 — the vast world (lanes again, ≤ 4 at once)
- **`dialogue` (G5):** `req` gains `skill:`, `stat:`, `crew:`, `item:`, `trust:` (failed checks shown greyed with the
  reason); quest rows `data/quests.js`; a JOURNAL tab (active/done/failed + chronicle lines about you).
- **`carousel` (G6):** stations as underground interiors (blast door, dead status boards, power + code puzzle,
  occupiers); PAIR / ROULETTE / BACKSPIN; access keys as items + keycutters; ring-sick per §4.5 (reuse the REST microsleep
  FX); crew and dogs jump, rigs never do; a new-game option **"Ring-born"** that opens mid-jump in a random station.
- **`holdouts` (G7):** the holdout generator — wall kit, gate + towers, the Swap, saloon, clinic, jail, pit, water
  tower; a Keyholder card + bulls; 1–2 HOUSE RULES per holdout enforced through the witness/deed system; per-holdout
  scrip (FIFTY PAPERS spread). One per exit town in streamed regions; hand-polish five.
- **`regions` (G8):** finish streaming P1 omissions (people, traffic, loot, saves past Phoenix) → P2 → one new
  contrasting region per wave (swamp, mountain, frozen north, drowned coast), each with a canon ruler from
  `docs/DIVIDED_STATES.md`, 3–5 holdouts, one Carousel station, a regional creature from the bible's §3.3 list
  (Rooters, Sorebacks, Showcats, Slabs, Criers) and a regional hazard.

## 6. Above and beyond — do these too (each is small, each makes it feel alive)
1. **Campfire scenes.** At a fire or in the RV at night, the camera eases to a close tilt, the crew sits, and each
   member says one line built from real deeds. The Deathlands books live in these scenes.
2. **The arrival cold-open.** "Ring-born" new games (G6) open on black, a ring-hum, ring-sick blur, then the blast
   door — the best first 30 seconds the game can have.
3. **Crew memorial wall** at the safehouse: a plank per fallen member, with flag, signature item and the obituary line.
4. **The quartermaster's count.** With an armorer-type card in the crew, a bark announces the crew's remaining rounds
   after every fight ("nineteen left"), and they clean guns at camp (condition up).
5. **Rooftop overwatch.** Order a member to STAND WATCH on a roof: they get a sight bonus and call out contacts with a
   minimap ping.
6. **House-rules gate check.** Entering a holdout: a gateman stops you, reads the house rules aloud (subtitled), and
   asks for guns or a toll — comply, bribe, lie (skill check) or fight.
7. **Cartography as loot.** Maps of a region are items; until you own one, the big map shows only what you've driven
   (fog of war on the atlas).
8. **Photo mode upgrade** (K exists): free tilt/zoom/hour/LUT, hide HUD, crew pose button — so Robert can make posters.
9. **Devlog capture.** After each wave, record a 30–45 s gameplay clip from the six-frame spots (headless Chrome +
   ffmpeg) into `docs/renders/web/devlog/` for Devlog 02.
10. **A "Deathlands feel" scorecard** in `WEB_DEATHLANDS_GAP.md` §1.3 — re-grade every row after every wave so
    progress is visible in one table.

## 7. Done means
- Gap doc acceptance criteria 1–11 all pass (checks named in the doc, all green on a fresh page, twice).
- Dream-loop judge ≥ 8/10 on all four targets, perf inside budget.
- ip-lint 0 deny; no purple; every person flagged.
- `RESUME_WEB_ENGINE.md` updated with what landed, the gotchas you paid for, and the ☐ decisions you defaulted.
- Final report to Robert: the six-frame set before vs after (side by side), the scorecard, the judge scores per round,
  and the three things you would do next. Lead with the pictures.
