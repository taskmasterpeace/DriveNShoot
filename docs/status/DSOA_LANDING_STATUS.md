# DSOA landing status (gate G0)

Goal: land everything that is built but not merged, one branch at a time, each followed by a full double battery
(`scratchpad/lead/battery2.sh`, fresh Chrome per run, budget 5400). Then fast-forward `main` after a review PASS.

Known flakes (from the handoff, §4): scripted-driving checks (road chain, buried mine, nitrous, harpoon winch, hub spikes,
steep I-10 climb), `steering: left is screen-left`, hordes radio report, back-lots fence, understreet manhole, react
parent-to-child, crew FOLLOW. They fail in the full battery and pass alone.

| # | Branch | Tip | Merged | Battery (vs previous) | Problems | Next step |
|---|---|---|---|---|---|---|
| 0 | `integrate/deathlands` (base) | `120d9354` | (base) | Nov 11 (`2b93cc0f`): 774/786 twice. `base1112` (`120d9354`): 783/796, 781/796 — same 10 + the sprinter check failed twice | 11 twice-failing checks | `fix1` on `3418653e`: 792/796 twice, no repeat failure, all one-offs pass on rerun | Pushed; main fast-forwarded to it after review PASS |
| 1 | `main` | `3418653e` | yes (from `ca1d5c4d`) | fix1 792/796 twice; review PASS | — | Next main move after the queue lands |
| 2 | `feat/web-look-feel` | `422e87bc` | yes (`d9bd1fc6`) | lf3 807+808/811, no repeats, one-offs pass on rerun | lighter night shortened the torch (checks restaged); real bugs fixed: stale bus timetable, rubble matrix | Landed `34f7a750`, pushed |
| 3 | `feat/web-testlab` | `b00fbb1e` | yes (`d9bd1fc6`) | with look-feel | — | Landed, pushed |
| 4 | `feat/web-seasons` | `ed6a8284` | yes (`19c11c5a`) | battery `se1` running | sky/grip/walk overlaps combined (snow + burning rain kept) | Battery after landing |
| 5 | `feat/web-farming` | `fbffc391` | prepped | 54/54 with fixes | was 7/37 on its own tip: its checks lift seasons out and the loop crashed; fixed | Battery after landing |
| 6 | `feat/web-horses` | `48b678aa` | prepped | 14/14 + melee | ported its saddle hooks into the rewritten melee | Battery after landing |
| 7 | `feat/web-crafting` | `daa18d41` | prepped | 15/15 | `herbs` was two items; now one food row with the herb tag | Battery after landing |
| 8 | `feat/web-storeys` | `800c1072` | prepped | 12/12 | finished (docs + checks) | Battery after landing |
| 9 | `feat/web-holdouts` | `81595459` | prepped | 9/9 | finished (docs + checks) | Battery after landing |
| 10 | `feat/web-carousel` | `fff4c4dd` (local) | prepped | 10/10 | finished; local tip has one docs commit origin lacks | Battery after landing |
| 11 | `feat/web-gadgets` | `031c967b` | prepped | 5/5 | finished (the drone bay) | Battery after landing |
| — | `feat/web-room-scan` | `e80d8ee2` | NOT landing | — | parked until Robert says go | — |
| — | `feat/web-world-tools` | `8514ed7a` | NOT landing | — | step 2 (G1), a later session | — |

## The full queue (what is in the main line, what is waiting) — updated 2026-11-12 21:00

`main` = `3418653e` (the Oct 30 play build + world map + battery fixes). `integrate/deathlands` = main + look-feel + testlab
(landed green) + seasons (battery `se2` running). Everything below waits, in landing order. Each lands with a double battery.

| Order | Branch | From | Base | State |
|---|---|---|---|---|
| done | `feat/web-seasons` | seasons lane | integrate | landed (se2 827+823/828; one-offs pass on rerun; zfight fix rides in tr1) |
| back | `feat/web-towns-roads` (PR #14) | roads session | integrate | HANDED BACK: its 14 checks pass alone, 7 fail in the full battery (towns 'not built' by then) + P1 golden + long-road wayside; reverted on integrate, waiting for a new tip |
| 2 | `feat/web-world-connected` | roads session | on PR #14 | not on origin yet |
| done | `feat/web-farming` | Oct 30 lane | prep | landed `1ffa47fe` (fa1 863+862/865, no repeat failure, 5 one-offs pass alone) |
| now | `feat/web-horses` | Oct 30 lane | prep | merged from prep `e9e1d382`, battery ho1 running |
| 5 | `feat/web-crafting` | Oct 30 lane | prep | prepped (herbs one item) |
| 6 | `feat/web-storeys` | Nov 11 lane | prep | prepped (12/12) |
| 7 | `feat/web-holdouts` | Nov 11 lane | prep | prepped (9/9) |
| 8 | `feat/web-carousel` | Nov 11 lane | prep | prepped (10/10) |
| 9 | `feat/web-gadgets` | Oct 30 lane | prep | prepped (5/5) |
| 10 | `fix/web-supply-law` | supply-law session | prep | waiting (needs farming + crafting) |
| 11 | `feat/web-veh-horses-w2`, then `feat/web-veh-wagons-w2` | vehicles session | prep | waiting (cavalry 5/5, wagons 5/5 on their harness) |
| 12 | `feat/web-veh-fuel`, `-boatguns`, `-doors`, `-chain`, `-suv`, `-tanks`, `-monster`, `-bicycle`, `-drones`, `-damage-feel` | vehicles session | integrate | waiting |
| 13 | `feat/web-zed-interiors`, then `feat/web-zed-start` | zombies/interiors session | prep | waiting |
| 14 | `feat/web-zed-camera` | zombies/interiors session | prep | waiting |
| 15 | `feat/web-zed-wallreach`, then `feat/web-zed-pound`, then `feat/web-zed-breeds` | zombies/interiors session | integrate | waiting (confirm stacking with that session) |
| — | `feat/web-veh-horses`, `feat/web-veh-wagons` | vehicles session | — | superseded by the `-w2` branches: not landing |
| — | `feat/web-room-scan` | — | — | parked until Robert says go |
| — | `feat/web-world-tools` | — | — | step 2 (G1), a later session |

## Checks failing in BOTH Nov 11 runs (must be fixed before main)

1. steering: left is screen-left
2. hordes: a migration walks the highway… (radio report)
3. terrain: steepest graded stretch of I-10
4. back lots: climbing a fence is slower than the gate
5. understreet: street → manhole → tunnel → cellar
6. gadgets: road chain pops the tyres
7. gadgets: pressure mine kills the car
8. kit: nitrous burst spends a bottle
9. kit: harpoon winch pulls the door off
10. kit: hub spikes shred the tyre

One-run-only (load flakes if they pass on rerun): lsw-bodies shoulder flags, crew FOLLOW, infected sprinter, timed-actions kick.

## Root causes found (2026-11-12)

- **8 of the 10** (I-10 climb, back lots, understreet, road chain, mine, nitrous, harpoon, hub spikes): the fan-nods
  convoy check opened the trader's counter (the PACK screen) and never closed it. Every later check that skips `stage()`
  stood frozen. Fixed in the check. All 9 pass together alone.
- **steering**: classic steering is the default now; the check sets screen-true mode itself.
- **hordes**: radio callers left by earlier gunfire checks saw the horde first; muted for that check.
- **infected sprinter** (failed both base1112 runs): a rotting body left near the stage pulled the idle test infected into a
  walk past you, so it saw you early. The body's smell pull is off for that check.
- One-run only in base1112 (pass alone): shot read, timed-actions search cancel, look-feel headlights, grapevine, travel, react deputy.

## The prep branch

All ten branches are merged in order on `prep/g0-wave2` (pushed) with their overlaps resolved and each branch's own
checks passing on a side harness (:3420). Integrate takes them from there one landing at a time, a double battery each.

## Dry-run merges (git merge-tree, in order)

Clean: look-feel, testlab, storeys, holdouts. Conflicts: seasons (api, main, sky, vehicles, zfight; sky.js overlaps
look-feel's day length), farming (api, main), horses (hudlayout, main, melee), crafting (items, crew, inventory, docs),
carousel (api, COMMANDS), gadgets (api, main). Carousel's local branch has one more docs commit (`fff4c4dd`) than origin.

## Log

- 2026-11-12 11:55 — tools set up (step 0), baseline battery `base1112` started on `120d9354`.
- 2026-11-12 12:40 — fixes for all 10 twice-failing checks committed on `fix/web-g0-checks`; waiting on `base1112`.
- 2026-11-12 13:20 — base1112 done (783, 781 of 796). Sprinter fix added; `fix/web-g0-checks` merged to integrate as `3418653e`; battery `fix1` started.
- 2026-11-12 13:20 — fix1 run 1: 792/796, all 11 targets pass. Grapevine (2 runs now) fixed on prep. All 10 branches prepped.
- 2026-11-12 13:22 — added from the lead session (Robert's ask): after main lands green, publish a hosted play build of main on
  mkl-dev behind a login (copy the COF play server's pattern), prove it in a fresh browser, post the link to alpine-swift and
  octavia. Then land `feat/web-towns-roads` (dsoa-towns-roads session) when its PR is ready, with a battery.
- 2026-11-12 13:25 — queue extended (lead session): after the 11 and `feat/web-towns-roads`, land `fix/web-supply-law`
  (dsoa-supply-law: no-from-nothing crew farm/scavenge/ammo, stock ledger, cheat audit) and the `feat/web-veh-<slice>`
  branches (dsoa-vehicles-v2), each when its lane posts it ready, a battery each. The hosted play link stays last.
- 2026-11-12 13:35 — fix1 done: 792/796 both runs; one-offs (grapevine, forge tab, zfight, crate, pickup bed, recorder, understreet, body search) all pass on rerun (zfight on a fresh page — watch it: run 1 saw 5112 coplanar instanced faces on the Phoenix street). integrate pushed at `3418653e`; review started. look-feel + testlab landed on integrate (`d9bd1fc6`), battery `lf1` started.
- 2026-11-12 13:45 — review PASS (watch: zfight on the Phoenix street, forge BUILDING mount, recorder arrival, timed-action searches, understreet). `main` fast-forwarded ca1d5c4d → `3418653e`.
- 2026-11-12 15:50 — lf1 (look-feel + testlab, `d9bd1fc6`): run 1 never started (browser did not connect after vite restarted;
  `battery3.sh` now retries), run 2 806/811, run 3 800/811 under load. Failed in both: the Echo-and-beam check (look-feel's
  lighter night shortened the torch: check now staged on the darkest night), travel sleeping-trip (REAL BUG: the bus
  timetable kept the clock rate it was first drawn at; now redrawn when Day length changes), dog heel (load; passes alone and
  after the look-feel checks). zfight again: REAL BUG since 10-28 — breakage debris drew every piece with the last wall
  piece's matrix (287 stacked slabs on the Phoenix street). Headlight pixel test now reads with the crash dirt cleared.
  Fixes on `fix/web-g0-checks2` (`dd49ed15`) merged to integrate; battery `lf2` started. (integrate was pushed at
  `dd49ed15` before this battery, a step early.)
- 2026-11-12 17:35 — lf2 (`dd49ed15`): 808/811, 806/811. Fixed holding: Echo, travel, grapevine, z-fight pairs (0 now). Failed both:
  lsw-bodies flag height (a crouched Greyborn's shoulders; check now stance-aware). Headlight pixel test borderline again
  (goggles' exposure; now read at bare eyes). zfight's last 5 "buried" were fight blood under a 0.3 m ruin slab prop:
  put aside during the scan. Dog heel passed run 2 (watch). Fixes `34f7a750` on integrate; battery `lf3` started.
  FOLLOW-UP (not blocking): combat decals land at terrain height, so blood can sit under low non-solid ruin props.
- 2026-11-12 17:55 — queue update (lead session, from the vehicles lane): after the prepped 10, land `feat/web-veh-horses-w2`
  (3 cavalry commits on prep/g0-wave2) then `feat/web-veh-wagons-w2` (stacked); ignore `feat/web-veh-horses` and
  `feat/web-veh-wagons`. Vehicle slices on integrate: `feat/web-veh-fuel`, `-boatguns`, `-doors`, `-chain`, `-suv`, `-tanks`,
  `-monster`, `-bicycle`. Also queued: PR #14 (towns and roads), `fix/web-supply-law` (on wave2), `feat/web-zed-wallreach`.
  Known flake per the lane: horses "feed" check, confirm against base before blaming a slice.
- 2026-11-12 18:55 — lf3 green (807, 808; reruns 7/7). look-feel + testlab landed, integrate pushed `34f7a750`. Seasons merged (`19c11c5a`) + zfight blood-layer staging (`8b182de6`); battery `se1` started.
- 2026-11-12 20:40 — se1 (seasons, `8b182de6`): 825/828, 824/828. Failed both: workshop hub spikes — REAL BUG in seasons:
  mountain-pass radii were real-metre sized on the compressed map (~800 km each), so in winter "Raton Pass closed" the
  streets of Phoenix (grip 0.3); radii scaled 1/32. And the headlight pixel test (colour grade lifted the unlit read;
  now read without it). Fix `db4006f9` on integrate; battery `se2` started.
  NOTE (pace): each landing has been taking 1.5-3 h because every battery turns up something real. ~20 branches remain.
- 2026-11-12 21:40 — se2: 827/828, 823/828. zfight failed both: a second rubble bug (re-breaking a thing laid an identical pile; now rewritten in place) — fix `0ac52867` on integrate. One-offs (airboat deck, Florida herds, a sound file, back-door kick) pass on rerun. Seasons landed. PR #14 towns-roads merged (`28839291`, 14 new checks, ip-lint clean); battery `tr1` started.
- 2026-11-12 23:20 — tr1 (towns-roads): run 1 830/841, run 2 never started (cold page needs 39 s; battery3.sh now waits 150 s). Towns checks pass alone, fail in the battery: handed back to dsoa-towns-roads (note in the side-session folder), merge reverted. Farming merged (`1ffa47fe`), battery `fa1` started.
- 2026-11-13 01:35 — LEAD CHANGE: the account switch at 00:34 cut the landing session; a new chat (bus #31655) carries on from this file. fa1 had finished by itself: run 1 never connected, run 2 863/865, run 3 862/865, no check failed twice; the five one-offs (look-around key, crew FOLLOW, shot read, Echo ambush, Florida herds) each pass alone on a fresh page. Farming landed, integrate pushed. Horses merged from prep (`e9e1d382`), battery `ho1` started. Also cut by the switch, not picked up here: the zombies/interiors session (uncommitted files in `web-zed`), the weather session, the roads session (uncommitted files in `web-towns-roads`, `web-world-connected`).
