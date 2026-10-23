# WEB_INFECTED — the infected's kinds in the web engine

**Status:** v1 BUILT (2026-10-22): `web/src/systems/zombies.js`, rows in `web/src/data/infected.js`. The canon is
`docs/design/THE_INFECTED.md` (the Godot game's taxonomy, rulings 0.1-0.20, the counterplay matrix §3.4); this doc is
how much of it the web engine carries and how. Never "zombies" on screen.
**The kinds that kept something** (the Greyborn, the Grapevine), their traps and the hot ground's creatures:
`docs/design/WEB_GREYBORN_GRAPEVINE.md` (2026-10-23).

## 1. Overview
The web infected were shamblers that hunt by smell and "runners" that always ran. v1 brings them to the canon's
taxonomy: the **Shambler** (unchanged), the **Sprinter** (a shambler until it breaks), the **Echo** (a worker that
waits) and the **Choir-Touched** (a signal amplifier at a site with an anchor). Each is a data row.

## 2. Player fantasy
A herd at walking pace is a problem you can walk away from - until one of them isn't a shambler. You learn to walk,
not run, near the dead; you learn that the third one from the left breathing like that is your three seconds. You come
back to your safehouse and the boards on the east window are splintered, and you never saw what did it, because it
stopped every time you looked. Out in the Glass Flats there is a mast that hums, and the dead near it are faster.

## 3. Detailed rules
- **Shambler:** as before - smells the living to 45 m (the player smells strongest), comes at 2.0-2.7 m/s, swarms to
  noise, claws cars, latches on, bites (13).
- **Sprinter** (`runner` in hordes and saves): looks and walks exactly like a shambler, and is named one. It breaks
  (`burst`) when anyone living moves faster than **5.0 m/s** inside its **20 m** ear (walking at 4.6 is safe, sprinting
  at 7.6 is not; a moving car counts), or a noise reaches it inside its ear (a shot). Then **6 s at 9 m/s**, claws
  ×1.4; then **3 s overheat**: standing bent double (`crouch`), wheezing (the guaranteed window); then a shambler again,
  re-armed after 4 s. A save taken mid-burst loads it back at a walk.
- **Echo:** spawned at a post (`infected kind=echo`). It works at the boarded window or locked door nearest its post
  (within 12 m): every 1.6 s it strikes the boards (9 of their 150), every 3.5 s it kicks the door (the door's own kick
  rules: locks give way after their kicks). It works **only unobserved**: while the player is within 30 m, has it in
  sight and looks within 55° of it, it freezes mid-motion. It never advances on anyone and never attacks. Its phrase
  (a bark over its head and a wordless murmur) loops every 5.5 s, heard to 25 m: the approach tell.
- **Choir-Touched:** only at a choir site (`CHOIR_SITES`; one today, the dead relay at (−330, −250), a 22 m rusted
  lattice mast). A site wakes once a night when the player comes within 160 m and it is out of their sight: one
  Choir-Touched at the mast's foot, facing it (ash-pale skin), and a herd of 5-8 standing round it. It hums to 45 m.
  Every infected within its 30 m aura moves ×1.25 and takes its loudest target (its own smell pick). Kill it and the
  hum and the aura end the same frame.

## 4. Formulas
| Name | Formula | Variables | Example |
|---|---|---|---|
| Sprinter trigger | `d(o, c) ≤ ear ∧ speed(o) > trigger` | ear 20 m, trigger 5.0 m/s | you sprint (7.6) 15 m away: it breaks; you walk (4.6): it doesn't |
| Noise trigger | `d(noise, c) ≤ min(r, ear)` | r = the noise's radius (a shot 45, ×2 for the infected) | a shot 18 m off breaks it; one 25 m off only draws it |
| Burst bite | `13 × 1.4` | claw | 18.2 a bite during the burst |
| Aura pace | `zSpeed × 1.25` within 30 m | speed | a 2.4 m/s shambler at 3.0 |
| Echo progress | `boards / workEvery` while unobserved | 9 / 1.6 s | 150 hp of boards: ~27 s of not looking |

## 5. Edge cases
- **A sprinter in a car's way:** a car moving faster than 5 m/s inside 20 m breaks it (engines are loud).
- **An old save's runner:** becomes a dormant sprinter on load; a stored burst pace is clamped back to a walk.
- **An Echo with nothing to work on:** it stands at its post and murmurs; it still freezes when watched.
- **An Echo's window already broken / door already open:** it looks again (within 12 m of its post) next frame.
- **The Choir-Touched and the herd by day:** the daylight clean-up takes far-off infected as before; the site wakes
  again the next night.
- **Watching from a car:** an Echo freezes for a driver too (sight from the car, the aim direction).
- **Storeys:** the infected take the stairs (world/storeys.js steer) and never bite through a floor.

## 6. Dependencies
| System | What it needs from the infected | What the infected need from it |
|---|---|---|
| `main.js` `noise` | sprinters break on a near noise (`onNoise`) | every shot and kick calls it |
| `systems/interiors.js` | — | `windows` (boarded, `damageBoards`), `doors` (locked, `kick`) for the Echo |
| `systems/audio.js` | — | `hum`, `wheeze`, `murmur` (synth) |
| `ui/feedback.js` | — | the Echo's phrase as a floater bark |
| `world/storeys.js` | `sameFloor`/`steer` read the infected like anyone | — |
| `agent/api.js` | `infected` command, three checks; the swim check bursts its sprinters on purpose | `horde runners=`, `spawn kind=zombie runner=` |
| `THE_INFECTED.md` | the canon this follows (§3.1 rows, §3.4 counterplay) | — |

## 7. Tuning knobs
| Knob | Default | Safe range | Affects |
|---|---|---|---|
| `sprinter.trigger` | 5.0 m/s | 4.7-6.5 | whether walking is safe (walk 4.6, sprint 7.6) |
| `sprinter.ear` | 20 m | 12-30 | how close running gets dangerous |
| `sprinter.burst` / `overheat` | 6 / 3 s | 3-9 / 1.5-5 | the chase and the window |
| `horde runners=` | 0.2 (night hordes 0.15) | 0-0.5 | how often a herd hides one |
| `echo.boards` / `workEvery` | 9 / 1.6 s | 3-20 / 0.8-4 | how fast unattended boards fall |
| `echo.watch` / `cone` | 30 m / 55° | 15-60 / 30-90 | how hard it is to keep one frozen |
| `choir.aura` / `speed` | 30 m / ×1.25 | 15-50 / 1.1-1.5 | how much worse a herd near the mast is |
| `choir.hum` | 45 m | 30-80 | how early you're warned (it should outrange the aura) |

## 8. Acceptance criteria (selftest)
1. A sprinter 14 m off walks under 3 m/s while you stand; it breaks within 1.5 s of you sprinting; tops 8 m/s; then
   overheats standing bent double; then walks again at a shambler's pace.
2. An Echo at a window boarded from outside: 4 s watched, the boards keep every point and it is frozen; 4 s with your
   back turned, the boards lose some; it never moves 1.6 m from its post and never comes within 6 m of you.
3. The dead relay woken: the herd in the aura has ×1.25 and the player as target; the hum counter rises; killing the
   Choir-Touched resets the herd to ×1 and the hum stops.
4. The infected still never swim: sprinters set off at full tilt from 42 m stop at the waterline.
