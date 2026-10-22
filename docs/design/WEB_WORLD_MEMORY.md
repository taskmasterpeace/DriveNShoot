# WEB_WORLD_MEMORY — the world keeps score

**Status:** 2026-10-22. Phases 1-4 SHIPPED in `web/` (branch `claude/web-engine-handoff-2fceb5`): a406754 the world keeps score · 691fd39 people remember · 1b7e6f2 the director (hunters, dead_draw_dead, radio news) · 55e9a43 the world moves without you (faction sim, camps changing hands, raids). Phase 5 (HUD respect chips, radio digests, witnesses who run home, rumors hopping between allies) is next.
**Owner of the call:** Robert. **Engine:** the three.js web engine (`web/`, see `web/AGENTS.md`).
**Sources:** a read-only architecture pass over `web/src` (2026-10-22), the fan-service bible
(`docs/design/WEB_FAN_SERVICE_BIBLE.md` — FEUD MATH, PAPER LADDER, SCORE TO SETTLE, WANTED WITH YOUR PAINT), canon
`docs/DIVIDED_STATES.md` and `docs/design/THE_INFECTED.md`.

---

## 1. Overview

A **society layer** that turns what the player does into what the world knows, and what the world knows into how it
treats the player. Six parts, each one file, each fed by the one before:

| Part | File | Holds | Feeds |
|---|---|---|---|
| **Deeds** | `systems/deeds.js` | the verb vocabulary; coalescing; the witness pass; the rumor queue | chronicle, factions |
| **Chronicle** | `systems/chronicle.js` | a pooled 512-record ring of what happened, a rolled-up tally, a 96-record legend, 30 day digests | queries, radio, director |
| **Factions** | `systems/factions.js` | up to 16 factions: standing toward the player, tiers, relations, strength, places | AI hostility, prices, director |
| **Memory** *(phase 2)* | `systems/memory.js` | named NPCs' memories of the player (killed my kin, saved me, owes me) | dialogue, barks, refusals, vendettas |
| **Director** *(phase 3)* | `systems/director.js` | event templates as data (hunters, raids, caravans, broadcasts), paced | spawners, quests, the chronicle |
| **Faction sim** *(phase 4)* | `systems/factionsim.js` | off-screen hourly/daily ticks: income, recruiting, skirmishes, territory | factions, chronicle |

One facade, `g.society` (`systems/society.js`), owns them, updates them inside the sim step (so dialogue freezes rumors,
like everything else) and saves/loads them as one block. Nothing scans the log per frame: the AI reads two typed arrays,
the director reads tallies.

**Phases** (each ships alone): 1 *The world keeps score* (deeds, witnesses, rumors, chronicle, factions, the hostility
bridge, witness-gated wanted) · 2 *People remember* · 3 *Director* · 4 *The world moves without you* · 5 content and polish
(radio news from day digests, witnesses who run home, respect chips on the HUD, map tint, banners).

## 2. Player Fantasy

*You shot a man in the street at noon and a water-hauler saw your face. By dusk the gate bulls at Rust Haven know it, and
the sheriff's people stop waving you through. Do the same thing at 2 a.m., crouched, from 25 metres, and nobody knows a
thing — unless you missed one. Catch the hauler before she reaches the gate and the story dies with her (and the
chronicle remembers that too). Run three errands for the Dustwolves and their buggies stop opening fire on sight. The
radio talks about the night the Glass Flats went red. The woman whose brother you killed won't sell to you, ever.*

Fan service (mechanics only, per the bible): GTA2's respect meters (FEUD MATH), witnesses and heat (PAPER LADDER),
Zomboid's sense of a world that kept going while you weren't looking, the Deathlands rule that every holdout has a long
memory and a short temper.

## 3. Detailed Rules

### 3.1 Deeds
A **deed** is a verb done by an actor to a target at a place: `{actor, verb, target, faction-of-target, place, x, z, mag}`.
Hooks call `g.deeds.*` synchronously at the moment of the deed so the witness pass sees live positions.

| Verb | Base mag `m` | Raised by |
|---|---|---|
| hurt | 1 | `ai.onDamaged`, coalesced per actor/victim pair over 4 s |
| carjack | 2 | taking an occupied vehicle |
| steal | 2 | an owned vehicle or pickup |
| rob | 3 | (phase 2 dialogue) |
| destroy | 2 | blowing up an owned vehicle |
| kill | 4 | `onKill` (×2 named, ×3 leader, ×0.25 self-defense) |
| silence | 6 | killing a witness who holds a pending rumor |
| rescue | 3 | killing someone who was attacking a non-hostile |
| deliver | 2 | a finished job (dialogue effect) |
| trade | 0.5 | a purchase (dialogue effect) |
| pay, defend, betray | 2, 3, 5 | dialogue effects |

Only deeds whose actor is the player (or a follower) run a witness pass. NPC-vs-NPC kills go straight to the chronicle
with `src:'world'` (no rumor, no standing change).

### 3.2 The witness pass
At the deed position, each character is tested in order (cheapest first):
1. alive; not the actor, not a follower; their faction's `memory` is not `none` (the infected never testify);
2. inside a Manhattan box of `sight` metres;
3. facing within 110° of the deed, or closer than 8 m, or is the victim;
4. has line of sight (`g.los`, which smoke blocks — a smoke grenade is a stealth tool).
If the player is inside a building, only witnesses inside the same building count.
Within `idRange` a witness **identifies** the actor; beyond it (but within `sight`) they only **saw something**, which
raises the place's alert and nothing else. At most 8 identified witnesses are kept per deed.

### 3.3 Rumors
Each identified witness takes a slot in a fixed 64-slot rumor pool, due after a delay (§4). When it falls due:
- witness dead → dropped, `rumorSilenced` emitted (and if the player killed them, a `silence` deed was already recorded);
- witness downed and essential → postponed until they get up;
- otherwise the witness's faction **learns** the deed (standing changes, §4), a chronicle record with `src:'rumor'` is
  written, and the HUD says **WORD SPREADS**.
A faction learns a given deed **once**: the first of its witnesses to report it applies the standing change; later reports
of the same deed only add chronicle weight. The victim's own faction counts as the deed's direct counterparty
(learn factor 1) when the victim survives to report.

### 3.4 Factions, standing, tiers
Factions are data rows (built-ins in `data/society.js`, packs may add up to 16 in total). Each has a standing toward the
player in [−100, 100], a tier derived from it, relations to every other faction (−100..100), and values that say how
much each verb against whom moves its standing. Built-in rows:

| id | name | archetype | start | notes |
|---|---|---|---|---|
| `rusthaven` | Rust Haven | town | +10 | its bulls raise wanted stars; forgives self-defense; leader Sheriff Okonkwo |
| `dustwolves` | The Dustwolves | raiders | −60 | hostile to everyone; their members' names/weapons/buggy live in the row |
| `drifters` | Drifters | loose | 0 | cohesion 0.35 — loose people gossip less |
| `infected` | the infected | none | — | `memory: none`: never witness, never learn, always hostile |

The **hostility bridge**: an armed member of a faction whose tier is *hostile* or *hunted* attacks the player on sight;
at *wary* or better they don't. Faction-vs-faction hostility is `relation ≤ −50`. With the default rows this reproduces
today's rules exactly (raiders hostile to all, wardens hostile to raiders and to a wanted player).

**Wanted stars** rise only when an identifying witness belongs to a faction with `stars: true` (Rust Haven). Today any
shot anywhere raises them, even alone in the desert; after phase 1, the desert keeps your secrets.

### 3.5 The chronicle
A pooled ring of 512 records (oldest overwritten), plus:
- **tally** — `actorFaction|verb|targetFaction → {n, mag, lastT}`, updated on insert, so evicting a record from the ring
  never loses a count a query relies on;
- **legend** — up to 96 notable records (mag ≥ 8, a named or leader target, or a director outcome), oldest-least-notable
  evicted;
- **day digests** — 30 days of per-day totals (kills by faction, deeds by verb, places), the raw material for radio news.
Record flags `k`: 1 named · 2 leader · 4 night · 8 unwitnessed · 16 reported · 32 silenced · 64 director · 128 coalesced ·
256 downed · 512 selfDefense.

### 3.6 Phases 2–5 (designed, not built)
- **Memory:** kinds `killedKin −70/120 d (revenge 1)`, `shotMe −40/30 d`, `robbedMe −35`, `betrayed −50/90 d`,
  `owesMe −10`, `savedMe +45/60 d`, `savedKin +35`, `helped +15`, `paidDebt +15 (clears owesMe)`, `traded +2 (stacks 5)`,
  `gift +10`; 12 per NPC, same kinds merge; opinion recomputed lazily on day change or when dirty. NPC rows gain `fid`,
  `kin[]`, `friends[]`, `refuseBelow` (default −40), barks, gifts. Dialogue choices gain conditions
  (`ifMemory`, `ifOpinion`, `ifTier`, `ifStanding`) and effects (`remember`, `forget`, `deed`, `standing`).
- **Director:** templates as data with predicates (`playerAlive`, `inPlace`, `hour`, `night`, `weather`, `notoriety`,
  `tally`, `memory`, `war`, `placeKillsToday`, `chance`), binders (`worstStanding`, `bestStanding`, `placeOwnedBy`,
  `npcWithMemory`) and spawners mapped onto existing calls (squad → `spawnRaider`/`addChar`, vehicle, convoy, herd,
  npc, weather, broadcast on STATIC 1660 AM, pickup, quest). Shipped templates: `hunters`, `raid_on_favored`,
  `trader_caravan`, `radio_compound`, `dead_draw_dead`, `debt_collector`.
- **Faction sim:** hourly income/recruiting, daily skirmishes between factions at war, territory flips at camps,
  retaliation. **Leaders change only from an authored `successors` list** — no procedural promotion of a character who
  beat the player, no follower armies (Warner Bros. US 10,926,179, see the bible; counsel reads the claims before ship).

## 4. Formulas

**Sight and identification range** (metres)
`sight = lerp(42, 16, night) · (1 − fogK) · (crouch ? 0.6 : 1) · (inVehicle ? 1.2 : 1)`
`idRange = 0.55 · sight + (flashlight ? 6 : 0)`
- `night` ∈ [0,1] from `sky.night` (0 noon, 1 midnight); `fogK` ∈ [0, 0.7] from weather (dust/rain).
- Range: sight 6–50 m, idRange 3.5–33.5 m.
- Example: noon, clear, standing: sight 42, idRange 23.1. 23:00 (night 0.95), clear, crouched: sight
  `lerp(42,16,0.95)=17.3 · 0.6 = 10.4`, idRange 5.7 — a witness 25 m away saw nothing they could name.

**Rumor delay** (seconds of sim time)
`due = t + U(rumorDelay) · clamp(distToHub / 200, 0.5, 2)`
- `rumorDelay` per faction, default [20, 45]; `distToHub` = witness → faction hub (metres).
- Example: a Rust Haven witness 100 m from the gate, roll 30 s: `30 · clamp(0.5) = 15 s`. 600 m out: `30 · 2 = 60 s`.

**Standing change when a faction learns a deed**
`Δ = clamp(value(verb, target) · m · learn, −60, 60)`
- `value` looked up in order `verb:self` → `verb:<faction id>` → `verb:enemy` (relation ≤ −50) → `verb:friend`
  (relation ≥ 50) → `verb:any` → 0. `m` = deed magnitude after modifiers. `learn` = 1 direct counterparty, `cohesion`
  (0–1) for a rumor, 0.5 for a broadcast.
- Example: killing a named Rust Haven man (`kill:self = −9`), `m = 4 · 2 = 8`, reported by the victim's faction:
  `Δ = clamp(−9 · 8 · 1, −60, 60) = −60` → standing +10 → −50 (**hostile**).
- Example: killing a Dustwolf in front of Rust Haven (`kill:enemy = +1`, relation −100): `Δ = 1 · 4 · 0.8 = +3.2`.

**Standing decay** (per game hour)
`rest = start + clamp(0.25 · lifetime, −40, 40)`; `standing += (rest − standing) · (1 − e^(−1/(24·memoryDays)))`
- `lifetime` = sum of every Δ ever applied; `memoryDays` default 14 (τ in days).
- Example: start +10, lifetime −60 → rest −5; from −50 the gap of 45 closes by ~1/336 per hour: about 3.2 points per
  game day at first. Big deeds partly stick forever (rest moved 15 points).

**Tiers** (standing → tier, global, a faction row may override)
hunted ≤ −80 · hostile ≤ −40 · wary < −10 · neutral < 20 · friendly < 60 · allied ≥ 60.

**Kill magnitude**: `m = 4 · (named ? 2 : 1) · (leader ? 3 : 1) · (selfDefense ? 0.25 : 1)`, range 1–24.
`selfDefense` = the victim was targeting the player when they died.

**Opinion** *(phase 2)*: `opinion = 0.3 · standing(fid) + Σ weight · base · 0.5^(ageDays / halfLifeDays)`, clamped ±100.

## 5. Edge Cases

- **Witness killed before the rumor lands:** the rumor is dropped and `rumorSilenced` fires; if the player killed them, a
  `silence` deed (mag 6) is recorded — which itself runs a witness pass. Killing a witness in front of another witness
  makes things worse, not better.
- **Essential witness downed:** the rumor waits until they stand up (essential NPCs revive after 45 s).
- **The victim is the only witness and dies:** nothing propagates; the record is flagged `unwitnessed`.
- **Self-defense:** a kill where the victim was targeting the player gets ×0.25 magnitude; factions with
  `forgivesSelfDefense` take no standing change for it at all.
- **Player inside a building:** only witnesses inside the same building count; a shot through a window counts for those
  with line of sight through it (LOS already handles walls and openings).
- **Smoke:** blocks the LOS test, so nobody behind smoke witnesses anything.
- **In a vehicle:** the actor is easier to see (sight ×1.2) but carjacks and roadkills are still deeds by the player.
- **Same deed, many witnesses of one faction:** one standing change per faction per deed (the first report); the rest
  add only chronicle `reported` flags.
- **Rumor pool full (64 pending):** the new rumor is not queued; its record keeps `reported` unset (a deed too many to
  gossip about). Logged in `perf.society` so a test can see it.
- **Chronicle ring full:** the oldest record is overwritten; tallies, legend and digests are unaffected.
- **Save/load mid-rumor:** pending rumors save with their remaining delay and witness id; a witness missing after load
  (despawned) drops the rumor as silenced.
- **The infected:** never witness, never learn, have no standing; deeds against them are tallied only.
- **A faction pack row with a purple colour (hue 270–320):** rejected at registration with a warning (art law).
- **NaN guard:** a deed at a non-finite position is dropped and reported as an error, never written.

## 6. Dependencies

| System | What it needs from world memory | What world memory needs from it |
|---|---|---|
| `main.js` (Game) | `society.update(simDt)` in the sim step; `deeds.onKill` first in `onKill`; witness-gated `raiseWanted` | `addChar` assigns `fid`; `emit`; `los`; `insideBuilding`; player crouch/vehicle/flashlight |
| `ai.js` | `hostile()` reads `factions.playerHostile[fi]` and `rel[]` | `onDamaged` calls `deeds.onHurt`; characters carry `fi` |
| `combat.js` | — | `onKill(c, attacker, cause)` passes the cause (fixed 2026-10-22) |
| `sky.js` | — | a `day` counter that increments at midnight |
| `ui/hud.js`, `ui/feedback.js` | — | toasts (WORD SPREADS), barks via pooled floaters (phase 2) |
| `ui/dialogue.js` *(phase 2)* | refusals and conditions | choice effects call `deeds.onChoice` |
| `agent/api.js` | commands (§8), snapshot/restore `society` block | — |
| `agent/content.js` | pack sections `factions`, `places`, `events` | load order: factions, places → weapons … npcs → events |
| `convoy.js` *(phase 3)* | — | convoy kinds with an owning faction |
| `WEB_FAN_SERVICE_BIBLE.md` | names this system as the home of FEUD MATH, PAPER LADDER, SCORE TO SETTLE, WANTED WITH YOUR PAINT | — |
| `WEB_STREAMING.md` | places beyond Rust Haven register as place rows when their chunks stream in | — |

## 7. Tuning Knobs

| Knob | Default | Safe range | Affects |
|---|---|---|---|
| `SIGHT_DAY` / `SIGHT_NIGHT` | 42 / 16 m | 25–60 / 8–25 | how hard stealth is by day and night |
| `ID_FRACTION` | 0.55 | 0.35–0.8 | how close a witness must be to name you |
| `FACING_DEG` | 110° | 80–160 | how often witnesses "miss" a deed beside them |
| `rumorDelay` (per faction) | [20, 45] s | [5, 15] – [60, 180] | the window to silence a witness |
| `cohesion` (per faction) | 0.7 town / 0.35 drifters | 0.2–1 | how much a faction cares about rumors vs direct reports |
| `memoryDays` (per faction) | 14 | 3–60 | how fast standing drifts back |
| rest fraction / cap | 0.25 / ±40 | 0–0.5 / 10–60 | how much of your history is permanent |
| Δ clamp | ±60 | 30–100 | the biggest single swing one deed can cause |
| kill modifiers | ×2 named, ×3 leader, ×0.25 self-defense | 1–4, 1–5, 0–0.5 | the weight of who you kill |
| tiers | −80/−40/−10/20/60 | keep ordered, ≥ 15 apart | where behaviour changes |
| ring / legend / digests | 512 / 96 / 30 | 256–4096 / 32–256 / 7–90 | memory size vs save size (~60 KB at defaults) |
| rumor pool | 64 | 32–256 | simultaneous gossip |
| witness cap | 8 | 4–16 | CPU per deed |

## 8. Acceptance Criteria

All are selftest checks or `node tools/dl.mjs` sequences against the running game; each passes or fails.

1. **Chronicle:** 600 × `deed verb=hurt witness=false` → ring size 512, tally `n = 600`, `seq` strictly increasing, legend ≤ 96.
2. **Witnesses:** a Rust Haven drifter 15 m away in the open at noon is identified (`witnesses` dry run); at 23:00 with
   the player crouched, not identified; with a building between, none; with smoke between, none.
3. **Rumor lands:** a witnessed `kill` of a Rust Haven drifter → 1 pending rumor → `step seconds=60` → a `rumor` event
   and Rust Haven standing lower than before.
4. **Rumor silenced:** as 3, but kill the witness 5 s after the deed → `rumorSilenced`, standing unchanged by the
   original kill, and a `silence` record in the chronicle.
5. **Factions bridge:** `standing faction=dustwolves set=70` → a freshly spawned armed Dustwolf is not hostile to the
   player; `set=-90` → hostile; wardens and raiders still fight each other either way.
6. **Unwitnessed:** a kill at 23:00, crouched, 25 m from the only bystander → record flagged `unwitnessed`, 0 rumors,
   standing unchanged after `step seconds=60`, wanted stars unchanged.
7. **Wanted is witness-gated:** shooting a drifter alone in the desert raises no stars; doing it beside a Rust Haven
   witness raises them only after that witness is identified.
8. **Save/load:** `chronicle.last`, every faction's standing and pending rumors survive `save` → `load`.
9. **Performance:** `perf` reports `society.witnessMsMax < 0.5` during `scenario name=stress`; draw calls unchanged
   by phase 1 (no new meshes).
10. **No purple, no IP:** registering a faction with colour `#8a2be2` is rejected; `node tools/ip-lint.mjs` reports 0 deny.
