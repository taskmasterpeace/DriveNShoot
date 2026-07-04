# DRIVN — Travel Scale & Multiplayer Architecture

**Status:** DESIGN · **Created:** 2026-07-04 · **Primary stages:** 5 (World/Travel), 9 (Netcode)
**The two hard problems this doc solves:** (1) making a country-sized world *feel* huge but
*play* fast, and (2) letting many players roam that world **without stressing the server** —
Project-Zomboid-style. *(MP section grounded by a research subagent — see §Research notes.)*

---

## 1. The Travel Scale Law (the master dial)

**Design law (user-set):** a drive that is **4 real hours** in real life = **~10 minutes** in game.

- **Compression factor = 240 min ÷ 10 min = 24×.** (1 real hour of driving ≈ **2.5 game minutes**.)
- In-game vehicle speed ≈ real highway speed (cruise ~60 mph, top ~76), so **distance compresses
  ~24×** too. This one number sets the whole map.

**Derived world size & trip times** (from the 24× dial; all tunable by changing the one factor):

| Real-world | ÷24 → in-game | At ~60 mph cruise |
|---|---|---|
| USA E–W ≈ 2,800 mi | ≈ **117 in-game mi** | **≈ 2 hours** to cross the country |
| USA N–S ≈ 1,600 mi | ≈ **67 in-game mi** | ≈ 67 min |
| A 4-hr real leg (~240 mi) | ≈ 10 in-game mi | **≈ 10 min** (the design target ✓) |
| Neighboring towns (1–1.5 real hr) | ≈ 3–4 in-game mi | **≈ 3–6 min** (common leg) |

So: **towns are a few minutes apart, a region is ~20–30 min, the whole country is ~2 hours of
driving.** Huge, but every leg is bearable. *(If ~2 hr coast-to-coast feels long, bump the dial to
40× → ~70 min; it's a single constant.)*

**Relationship to the world clock:** the day/night clock runs at **~12×** (2 real hr = 24 game hr,
per `WORLD_NPCS.md`). Combined: **10 min of driving passes ~2 game-hours** (you watch dusk fall on a
long haul), and a **~2-hour cross-country drive = ~1 full game day.** Two independent dials
(distance 24×, clock 12×) that together make a trip feel like a *journey*, not a loading screen.

## 2. How Travel Actually Happens (three modes)

1. **Continuous driving (default — the game).** You physically drive streamed roads. Pressure comes
   from **fuel** (stations rare/contested), **breakdowns** (the 5-part car system), **ambushes**
   (heat/director), and **day/night**. The 24× compression is what makes this fun, not tedious.
2. **Long-haul Cruise (optional accelerator).** On a **safe, already-discovered** highway stretch,
   engage cruise → time **fast-forwards (2–8×)** with a pulled-out cinematic cam; **auto-interrupts**
   on threat, town, low fuel, or damage. Kills dead-air without deleting the drive. Gated to
   explored safe roads so it never skips fresh content.
3. **Fast-Travel (convenience, costed).** Only between **discovered safe towns**; costs **fuel +
   game-time + a risk roll** (ambush chance resolved en route). It's an *abstracted drive*, not a
   free teleport — the drive-is-the-game ethos stays intact. MP: your rig + cargo actually make the
   trip (and can be caught).

**Navigation:** world map (fog-of-war cartography), state welcome-signs, **landmark silhouettes**
you steer by (binoculars matter), waypoint arrows (`INTERFACE_AND_BODY.md §4`).

---

## 3. Multiplayer Architecture — big world, cheap server (the PZ model)

**Core principle (Project Zomboid):** the server does **NOT** simulate the whole world. It divides
the map into **cells/chunks** and only actively simulates the ones **near players**; everything else
is dormant. **Server cost scales with the number of active player-regions, not with world size.** A
lone driver crossing empty wasteland lights up only the thin ribbon of chunks under them.

### 3.1 The five load-bearing systems
| System | What it does | Why it keeps the server cheap |
|---|---|---|
| **Chunk grid + hot/dormant sim** | world = a grid of chunks (~256 m); only chunks containing/adjacent to players **tick** (PZ's "loaded cells"); dormant chunks don't run | cost ∝ active regions, not map area |
| **Area-of-Interest (AoI) replication** | each client receives only entities within its AoI (nearby chunks + vision cone); grid/spatial-hash interest | two players 100 mi apart share **zero** replication traffic |
| **Client-authoritative vehicle physics** | each client simulates its **own** `VehicleBody3D` and sends state (~15–20 Hz); server **validates** (speed/teleport/rate sanity, anti-cheat) rather than simulating every car | server runs **no heavy physics** — the expensive part lives on clients |
| **Tiered off-screen sim (PCAS T1–T5)** | distant NPCs/regions run **reduced or event-based** ticks (cheap "narrative" sim), not full AI/physics (`WORLD_NPCS.md §2`) | the world evolves off-screen for pennies |
| **Per-chunk persistence** | chunk **deltas** (looted caches, husks, built forts, territory control) saved to a DB per chunk; **seed** regenerates the base, deltas layer on | dormant chunks persist **without ticking**; tiny saves |

### 3.2 The hard edges (and the pragmatic answers)
- **Car-vs-car collision under client authority:** two client-authoritative cars can disagree.
  Pragmatic rule: **each client is authoritative for its own vehicle's body**; the server arbitrates
  a simple shared impulse and reconciles positions; lag-compensate hits. Accept minor cosmetic
  desync over expensive server physics. (Twitch-perfect ramming is not the fantasy; *survival* is.)
- **Cheating:** client authority = trust risk. Mitigate with server **sanity/rate validation**
  (no teleporting, no impossible speed, damage caps), not full re-simulation. Good enough for co-op
  and small-shard PvP; not a competitive shooter.
- **Seamless handoff:** as you drive, chunks stream in/out of AoI; the server spins chunk sim
  **up/down at the boundary** — the streaming from Stage 5 with MP semantics.

### 3.3 Scaling beyond one server (option, only if pop demands)
**Region sharding:** different servers own different map regions; **handoff at borders** (seamless
zone transfer, SpatialOS/seamless-MMO style). Not needed for co-op or a modest shard — flagged as
the growth path so the chunk/AoI design doesn't have to change to get there.

### 3.4 Godot 4.5 specifics
- Foundation exists: the 2D game's `network_manager.gd` (**ENet**, input + state replication, 32
  players, **tested cross-process**) is the seed to port.
- `ENetMultiplayerPeer` + `MultiplayerAPI` are the base. **`MultiplayerSpawner`/
  `MultiplayerSynchronizer` are fine for small scoped scenes but do NOT scale to AoI** — we build a
  **custom AoI replicator** (per-peer visibility, interest grid) over ENet channels. Per-peer
  visibility (`MultiplayerSynchronizer.set_visibility_for` / custom filtering) is how a client only
  hears about its AoI.

### 3.5 Why travel + this architecture fit perfectly
Cross-country travel is the **best case** for this design: a solo driver in the wasteland activates
one thin ribbon of chunks and shares sim with nobody. Players naturally **cluster at towns/arenas**
(where the living-world sim is worth paying for) and **disperse on the roads** (nearly free). The
world can be country-sized precisely because the server never holds it all at once.

---

## 4. Build path
1. **Stage 5** — single-player chunk streaming + the 24× compressed geography + world map. (No edge.)
2. **Stage 9 netcode**, on top of streaming:
   - (a) Port the ENet donor → **AoI chunk replication** (interest grid, per-peer visibility).
   - (b) **Client-authoritative vehicles + server reconciliation** (validate, don't simulate).
   - (c) **Tiered off-screen sim + per-chunk persistence** (PCAS ties in here).
   - (d) **Region sharding** only if population demands it.
3. Acceptance: a cross-process test where two players in **different regions** cost the server
   ~one region each (assert no shared replication), then converge in a town and share one hot region.

*Research notes: MP section grounded in PZ's cell/loaded-area model + standard MMO interest
management + client-side-prediction/server-reconciliation for vehicles. Cross-refs: `STAGES.md`
(5, 9), `WORLD_NPCS.md` (tiers/persistence), `ENGINE.md` (M2 world, M7 netcode), `CONTENT_PIPELINE.md`
(seeded chunks).*
