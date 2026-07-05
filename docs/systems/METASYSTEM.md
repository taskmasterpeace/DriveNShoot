# DRIVN — The Metasystem (the metaworld that never sleeps)

**Status:** ARCHITECTURE DECISION · 2026-07-05 · **Feeds:** Dogs (now), Stage 6 Living World, Stage 9 Netcode
**The kicker (user's insight):** ONE architecture — a metaworld + a hydrate/dehydrate engine —
serves **dogs, NPCs, and multiplayer replication.** Build it once for the dog and the living
world *and* the netcode inherit it. This is the multi-use-component pillar at its peak.

> The world keeps living at lower fidelity when the player isn't there. Close to the player,
> a thing is a full agent (physics, pathfinding, a brain). Far away, it's a cheap data record
> that still changes over time. You come home to a world that moved without you.

---

## 1. The vocabulary (so we all speak the same language)

| Term | Plain meaning |
|---|---|
| **Metaworld / World-State Manager** | the high-level list that tracks every dog/NPC — where, what mood, what history — whether or not it's on screen |
| **Dehydrate → record** | off-screen, a thing collapses to a tiny data row (`{id, type, pos, state, hp, ...}`) — no physics, no thinking |
| **Hydrate → agent** | when the player nears, the row spins up into a full live entity, its state restored from the row |
| **AoI bubble (interest management)** | the ring around the player that gets full simulation; outside it, records only |
| **Aggregate sim** | far away we don't step things move-by-move; we roll probabilistic events ("guard dog raided at 03:00 → wounded") |
| **Behavior tree + blackboard** | an agent's brain: a small decision tree reading a bag of world-facts. Dogs and NPCs use the *same* brain shape, different goals |
| **Storylets / incident scheduler** | branching off-screen events that mutate records (RimWorld's storyteller is the reference). **Deferred** |
| **Persistent memory (Nemesis)** | records remember you and hold grudges across time (Shadow of Mordor). **Deferred** |

---

## 2. What we build FIRST — the three SEAMS, not the whole engine (the refinement)

The trap is building the *entire* metaworld — aggregate-sim engine, storylet scheduler, full
persistence — before anything's testable. That's months, and you can't feel it yet.

**The seed is three seams. Build these; leave a socket for the rest.**

1. **WorldState records + hydrate/dehydrate.** A dog can collapse to a record and rebuild from it.
2. **The AoI bubble.** A radius check decides: inside → hydrated live agent; outside → record.
3. **The behavior-tree brain + blackboard.** The dog's logic moves into a tiny tree reading facts
   (threat behind? owner far? guarding a spot?). This is the shape NPCs will reuse verbatim.

**What we do NOT build yet:** the full aggregate-sim/storylet/incident engine. In this slice,
off-screen events are a *single stubbed roll* per record (enough to prove the seam), not a
simulation. The socket is there; the engine plugs in during Stage 6.

---

## 3. The first slice — richer dog commands on the seams

Dogs already: adopt, follow, stay, whistle, rear-smell, 4 types. Add the **command verbs** that
sell the companion fantasy AND exercise the metasystem:

- **Guard** — hold this spot; engage hostiles that enter; **stays when you leave** (→ dehydrates to a "guarding" record).
- **Sic** — attack that target now (point at a threat; the bite that was stubbed finally lands).
- **Seek** — go find loot / follow a scent actively (the Hunter nose as a command).
- **Scout** — range ahead and report; feeds the "quick snapshot of what the dog sees" idea.

Each command is a **goal** on the dog's blackboard; the behavior tree does the rest.

---

## 4. The killer acceptance test (the metasystem proven in miniature — headless)

This is the "come home to find it" moment, testable now:

1. Adopt a dog, command **Guard** at a spot.
2. Drive far away → assert the dog **dehydrated** (a record exists; the live node is gone; no per-frame cost).
3. Fire ONE stubbed off-screen event against the record (a raid roll) → record flips to *wounded* or *killed*.
4. Drive back → the dog **re-hydrates from the record** — and if the roll went bad, **you find it hurt, or find it gone.**
5. **Sic / Seek / Scout** each produce their behavior while hydrated.

If that passes, the metaworld works — for one dog. Everything else is content on the same engine.

---

## 5. How it grows (what inherits this for free)
- **Stage 6 NPCs** are records in the *same* metaworld — a trader, a bounty boss, townsfolk hydrate
  near you and dehydrate behind you. The aggregate-sim engine plugs into the socket here.
- **Multiplayer** is hydration *per player* — each client hydrates only what's in its AoI/vision
  cone. The dehydrate/hydrate seam IS the replication seam.
- **The living world** (memory, gossip, Nemesis-style grudges) is records that persist and mutate —
  layered on once the seam exists.

*Cross-refs: `DOGS.md`, `WORLD_NPCS.md` (Living World inherits this), `TRAVEL_AND_NETCODE.md`
(AoI/hydration = the netcode seam), `STAGES.md`, `ENGINE.md` (perception cone + multi-use pillar).*
