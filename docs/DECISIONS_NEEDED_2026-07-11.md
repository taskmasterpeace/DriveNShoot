# DECISIONS NEEDED — the owner's call sheet (2026-07-11)

Every open call from the visual fidelity arc (19 iterations, 5.5→9.1, all on main —
see `docs/HANDOFF_VISUAL_FIDELITY_2026-07-10.md`). Multiple choice; my recommendation
marked ★. Nothing below blocks the game from running — these steer the next passes.

---

## 1. THE TITLE BACKDROP (asked 3× during the loop)
The menu (MENU_boot render) is dignified but PLAIN — an amber DRIVN wordmark over a
flat dark backdrop. It's the first thing every player sees.
- **A ★ Generate + wire it** — one PixelLab pass (~$0.30 credits, no game name in the
  prompt), a moody wasteland-highway backdrop behind the wordmark; I review the art
  before wiring (the review law), menu_sim guards the wire.
- **B. Generate OPTIONS only** — 3-4 candidate backdrops rendered and sent to you;
  you pick, then it gets wired. (~$1)
- **C. No art — keep it plain.** The stark look is a statement.
- **D. Your lane** — you'll art-direct the menu yourself later; loop stays out.

## 2. THE LOOP'S FUTURE
It stood down at 9.1/10 for the handoff. The remaining levers are bigger-ticket
(art passes, content rows) than the 30-min cadence suits.
- **A ★ Resume at 60-min iterations** — deeper passes (real texture experiments,
  multi-render probes) with the same ledger/sims/push-to-main discipline.
- **B. Resume at 30-min** — as before; smaller but constant wins.
- **C. Park it** — visuals are good enough for now; redeploy effort to the next arc
  (AMERICAN ROAD ladder / ecosystem / empire per the roadmap docs).
- **D. On-demand only** — no schedule; you trigger a pass when something bugs you.

## 3. FURNISHER SET DENSITY (content rows, not code)
Interiors READ correctly (probe-proven) but sets are lean — a house wakes a bed and
a crate or two. This is `building_types.json` row work.
- **A ★ Moderate pass** — +2-3 pieces per set (table/chairs/shelf class), keeping the
  scavenged-sparse feel; furnisher LOD already handles the cost.
- **B. Dense pass** — full room-kit manifests per BUILDING BOOK II; bigger authoring
  job, richest interiors.
- **C. Leave lean** — post-collapse sparseness is the aesthetic.
- **D. You'll author the rows** — it's loot/economy-adjacent and you want the pen.

## 4. UI DEEP-STYLING (your declared lane — MAP-FIRST ruling)
The loop only touched UI cohesion (device bezels, doll plates, purple purge). Dash
layout, fonts, panel styling, menu layout remain untouched per your ruling.
- **A ★ Stays your lane** — status quo; the loop keeps hands off.
- **B. Collaborative** — the loop PROPOSES styled mockups as renders; nothing wires
  until you approve each one.
- **C. Delegate it** — the loop restyles UI under the house design rules (amber/dark,
  pixel grammar, no purple), sims guarding every change.

## 5. WET GROUND IN RAIN (skipped as heavy in it.12)
Rain currently reads via streaks + cool grade + thick air. TRUE wet-ground darkening
means swapping cached shared materials across live chunks (churn) — that's why WET
AIR shipped instead.
- **A ★ Accept wet-air as shipped** — the rain read is already strong.
- **B. Roads-only darkening** — a cheap subset: only road slabs darken when raining
  (roads are few, chunk-local, and the wet-asphalt read is the most iconic).
- **C. Full wet-ground pass** — all biome floors darken with rain intensity; costs a
  dedicated iteration + perf care.

## 6. WARDROBE JITTER SCOPE (it.15 law)
Crowds (motorists, town NPCs) now vary. Named crew/companions, infected, and the
lurker deliberately kept their EXACT authored rows.
- **A ★ Crowds only, as shipped** — named characters stay visually canonical.
- **B. Extend to companions/crew** — subtle variance on hired crew too.
- **C. Extend to infected as well** — variance everywhere except the player + lurker.

## 7. THE SMALL-NITS BATCH (one pass, ~15 min total)
Three parked cosmetics: (a) the K-sheet shows "HP 100/69 (cap)" when wounds drop the
cap below current hp (pre-existing display quirk); (b) ground patchwork chunk seams
are straight lines (could dither the boundary); (c) the vision-cone outside-dim
(×0.68) is fairly heavy in daylight — it's GAMEPLAY information, so I never touched it.
- **A ★ Fix (a) + (b), leave (c)** — the cone stays gameplay-sacred.
- **B. Fix all three** — including a gentle cone-dim soften (0.68→0.60 daytime).
- **C. Just (a)** — the HP display; seams read as field edges anyway.
- **D. None** — all three are character.

## 8. PIXELLAB SPEND POLICY ($78.72 credits, ~$0.005/generation)
The whole 19-iteration arc cost $0.72. Art spend is effectively free at this scale,
but it's your money.
- **A ★ Free rein under $5/session** — spend logged in the ledger each pass.
- **B. Ask per batch** — every generation run gets an explicit yes first.
- **C. Full free rein** — the balance is the budget.
- **D. Freeze spend** — code-drawn art only from here.

---
*Answers land in the ledger + memory; anything approved gets executed with the usual
sims + look-proof discipline.*
