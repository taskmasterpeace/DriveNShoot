# THE LEDGER — books are rows; prose is owner-gated

Status law: DRAFTED → APPROVED → LANDED (+ SHIP-GATED, RETIRED). One book per row.
The audit trusts this file. See `.claude/skills/librarian/SKILL.md`.

| id | title | kind | teaches | study | acquisition | status | sim | commit |
|---|---|---|---|---|---|---|---|---|
| book_driving | DRIVER'S HANDBOOK | manual | driving, ignition, damage | — | shelf | LANDED (pre-ledger) | library_sim | pre-ledger |
| book_onfoot | ON FOOT: THE MOVESET | manual | crouch/slide/unarmed/drag | — | shelf | LANDED (pre-ledger) | library_sim | pre-ledger |
| book_dogs | THE PACK: DOGS | manual | dog verbs, bond | — | shelf | LANDED (pre-ledger) | library_sim | pre-ledger |
| book_home | HOME & SURVIVAL | manual | homebase, camp, hunger | — | shelf | LANDED (pre-ledger) | library_sim | pre-ledger |
| book_gadgets | GADGETS & SIGNALS | manual | drone, radio, GPS | — | shelf | LANDED (pre-ledger) | library_sim | pre-ledger |
| book_carousel | THE CAROUSEL | manual | dungeon bases, the DIAL | — | shelf | LANDED (pre-ledger) | library_sim | pre-ledger |
| book_states | THE DIVIDED STATES | manual | rulers, standing, borders | — | shelf | LANDED (pre-ledger) | library_sim | pre-ledger |
| book_roadbed | THE ROADBED READER | manual | per-surface handling character (2026-07-14) | — | proposed: shelf | DRAFTED | — | — |
| book_pilot_card | THE PILOT'S POCKET CARD | manual | drone real flight: climb/dive, boost, signal law (2026-07-14) | — | proposed: shelf | DRAFTED | — | — |

## DRAFT PROSE (awaiting owner APPROVE / EDIT / REJECT — nothing lands until then)

### CANDIDATE 1: 🛞 THE ROADBED READER (manual · skim-only · price ladder 25)
Author/voice: "Curbside" Ada Ferro, ex-dirt-track mechanic — one register: shop-floor plain talk.
Epigraph (verbatim radio LORE): "…if the road is open, somebody opened it for a reason…"
FELT CHECK: written from the moment your tail steps out on gravel washboard at 40 and the wheel
goes light in your hands.

PAGE 1
THE ROADBED READER — WHAT THE GROUND UNDER YOUR TIRES IS ABOUT TO DO TO YOU, SURFACE BY SURFACE
Tarmac is a promise. Everything else negotiates.
Asphalt holds the line: brakes bite, the wheel answers, the rear stays home.
Leave the slab and the ground starts voting on your plans.
Gravel votes LOOSE. Dirt votes SLIDE. Sand votes SINK. Mud votes NO.
Read the roadbed before it reads you.
— you drive it like you paid for it. You didn't. —

PAGE 2
GRAVEL & DIRT. The rear end gets brave and the brakes get long.
Washboard judders the springs — feel that flutter, that's the ground counting your speed.
Yank the handbrake on dirt and the tail comes around EASY — that's a tool, not a fault.
Brake early. Twice as early as feels right. Then a little earlier.
Knobby tires forgive out here; highway rubber files a complaint.
— the ditch don't care what your tires cost. —

PAGE 3
SAND, MUD, METAL, WET. Sand grabs your axles and drinks your motor — the nose ploughs wide,
so slow in, power out. Mud is sand with a grudge: crawl it, never stop rolling.
Bare metal decking is fine dry and glass-slick wet — bridge plates, holdout ramps, mind them.
Rain rewrites every page of this book at once: dirt goes to mud, metal goes to ice.
When the sky opens, add distance to everything — braking, following, living.
— slow is smooth. Stuck is forever. —

Rows to land on approval: books row (kind manual, no study, shelf:true) + items row (category book,
weight 0.3, "USE to read.") + price 25 (manual ladder) + shelf acquisition.
Guardrails: 3 pages PASS · ≤12 lines PASS · page-1 ALL-CAPS header >80 chars PASS · bark close each
page PASS · S1 one register PASS · S3 no mysteries touched PASS · S4 skim value = the braking/handbrake
/surface facts PASS · S6 facts from surfaces.json rows PASS · S7 no purple PASS.

### CANDIDATE 2: 🛸 THE PILOT'S POCKET CARD (manual · skim-only · price ladder 25)
Author/voice: Warrant Officer L. Okafor (ret.), drone wrangler — one register: clipped checklist military.
Epigraph (verbatim radio LORE): "…don't listen to the static too long…"
FELT CHECK: written from the moment the HUD flips to SIGNAL WEAK over unfamiliar ground and you
have to choose: push on, or bring the bird home.

PAGE 1
THE PILOT'S POCKET CARD — TAKING THE STICK, HOLDING ALTITUDE, AND BRINGING THE BIRD HOME ALIVE
Your body stands still while your eyes go flying. That's the deal. That's the danger.
USE the drone to deploy and take the stick in one motion. Move keys steer her.
SPACE climbs. CTRL dives. She holds the height you leave her at.
Terrain won't catch you — she keeps her own floor. The ceiling's about forty meters.
(Keys are the stock fit. The CONTROLS panel — F11 — refits any of them.)
— eyes in the sky, body in the dirt. Guard the body. —

PAGE 2
SPEED & BATTERY. SHIFT is the burner: near half again the pace, twice the drain.
Boost to cross open ground. Coast to loiter. The battery is the leash —
under half and she wants to think about home. Low battery lands her where she is;
a landed bird is a pickup, not a wreck. A SHOT bird is a wreck. Fly like they're aiming.
— the burner is for leaving, not for looking. —

PAGE 3
SIGNAL LAW. The link frays past two hundred meters out. WEAK means turn her.
LOST means she turns herself — the bird flies home on her own spine, no vote taken.
E sets her down where she hovers. B calls her all the way in.
The screen splits so you watch both lives at once. Altitude buys sight, not safety.
— a bird that comes home beats a bird that saw everything. —

Rows to land on approval: books row (kind manual, no study, shelf:true) + items row (category book,
weight 0.3, "USE to read.") + price 25 (manual ladder) + shelf acquisition.
Guardrails: 3 pages PASS · ≤12 lines PASS · page-1 ALL-CAPS header >80 chars PASS · bark close each
page PASS · S1 one register PASS · S3 AI ambiguity untouched (LORE_BIBLE §20) PASS · S4 skim value =
keys/boost-cost/signal-law facts PASS · S6 facts from input_bindings.json + drone_pilot.gd constants
PASS · S7 no purple PASS.

Notes: the visible-driver + authored fleet models are COSMETIC (fail the S4 skim-value test) — no
book drafted, by design. Phase A gotchas apply at landing time (book category visibility, USE-consume,
shelf cache) — shelf placement is the safe path for both.
