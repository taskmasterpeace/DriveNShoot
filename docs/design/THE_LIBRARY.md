# THE LIBRARY — skim to learn the world, study to sharpen the character

**Status:** GREENLIT design spec (owner directive 2026-07-09, voice): *"Whenever we ship a system, we
should create books for it in the game… so somebody playing can actually read the books to learn how to
play the game, learn about the world — I've never seen a game where you can actually learn about the
world… What if you could SKIM through it or READ it? Skimming is for the player to learn real stuff;
reading is for the character to gain a skill. Not Project Zomboid time-holds — something different."*
**Owner decisions (ratified 2026-07-09):** study reward = **LEARNING BOOST** (an XP multiplier — you still
level by DOING); study time = **sessions on the clock** (~1 game-hour sittings, comfort/light matter);
the standing practice = **/librarian, a drafts-for-review slash command** (owner approves all prose).
**Builds on (all verified shipped):** `book_panel.gd` (THE LIBRARY shelf+reader, amber/bone),
`bookshelf.gd`, `books.json` (7 manuals), the `book_*` items + USE route, `character.gd` `add_xp` +
the 40·L² curve (**12 skills** — the "10 skills" note is stale), the game-hour accumulator
(`hunger_tick` pattern), beds (`homebase.gd`/`camp.gd`), the media unlock pattern (`media_pickup.gd`),
loot tables + `loot_resolver.gd` (`documents` tag), NPC shop stock/prices folds, `skill_perks.json` +
the U tree, the one-file save (`.get` defaults), `input_bindings.json` action rows.
**Core law:** *SKIM is free, instant, and real — the HUMAN reads actual pages and learns the actual
game and world. STUDY costs the survival clock and pays the CHARACTER — a boost that only cashes out
by doing. The shelf is the tutorial; found books are treasure.*

---

## 0. Ratified contract (reconciles the design facets — binding)

The multi-agent design pass produced four facets and two critiques; the critiques caught real
contradictions. These rulings resolve every one. **No book row lands that violates this section.**

| # | Ruling |
|---|---|
| **0.1 THE ROW SCHEMA (canonical).** | One shape, snake_case: `{id, title, emoji, kind, author, voice, epigraph?, shelf: bool, unreliable?: bool, heretical?: bool, pages: [String], study?: {skill, sessions, boost_mult, boost_levels, cap_level, requires_level, perk?}}`. `kind ∈ {manual, field_guide, lore, skill, reference}`. Nested `study` block only — never flat fields. Placement (loot/shop/region) lives in **placement rows** (`loot_tables.json`/`npcs.json`/hand-placed chests/pickups), never on the book row. All fields default so the 7 shipped rows stay valid unedited. |
| **0.2 CATEGORY = `book`.** | One-line `CAT_ORDER`/`CAT_LABEL` extension (`container.gd:126`) gives the pack a real **📖 BOOKS** shelf; all book items use it (31+ items deserve their own tab). The "must be tool" workaround dies with the ratification. |
| **0.3 BOOST LIFECYCLE (one law).** | One boost per skill, **blocked-while-active** ("the last lessons aren't spent yet") — never replace, never stack. Expiry = **levels consumed, never time**. Re-study of the same volume allowed only after consumption AND while `level < cap_level`. `cap_level`/`requires_level` are **CTA gates only** (button disabled with a reason line) — no force-expiry engine code. Applied inside `ProtoCharacter.add_xp` (the one choke point — `grant_xp` is a passthrough and three repair sites bypass it). Boosts survive death (`revive()` keeps skills — knowledge is the one thing the wasteland can't take). |
| **0.4 LORE IS SKIM-ONLY in v1.** | The stress-relief "downtime reading" economy is **CUT**: the stress vital self-decays at 3.0/s when safe, so book-relief can never compete — it would be homework with no felt reward. Lore books carry **no study block** (sim-enforced; `unreliable:true` ⇒ no study is a subset of this). Banked for v2: a sticky-stress floor that only comfort verbs (bed, whiskey, petting, **reading**) can push below — if that lands, downtime reading returns as the healthy whiskey. |
| **0.5 THE 7 MANUALS STAY SKIM-ONLY.** | No study blocks on the free shelf — otherwise day one becomes a study-five-boosts launch ritual that cannibalizes the paid catalog and blocks better books behind one-boost-per-skill. The shelf is the user guide; **the first STUDY moment is the first book you FIND or BUY** — a real beat. |
| **0.6 ONE CATALOG.** | The skill wing = the **24-volume scheme** (2 per skill × 12 skills: Vol I PRIMER common wasteland print / Vol II MASTERCLASS rare pre-Fracture text). The lore facet's four skill-book texts (THE FIVE PARTS, MEDIC'S PRIMER, THE QUIET WALK, RANGE NOTES) become the canonical prose for their volumes. The lore wing = the non-boost shelf (§5). Tier constants: **Vol I — sessions 2, ×1.5, 2 levels, cap 5, requires 0 · Vol II — sessions 4, ×1.75, 2 levels, cap 9, requires 4** (rows carry them; the sim asserts the defaults). Field guides may carry small boosts (×1.25, 2 levels, 2 sessions). |
| **0.7 PRICE LADDER (lookup, not arithmetic).** | manual 25 · lore 35 · field_guide 40 · skill Vol I 40 · skill Vol II 75–90 and **RARES ARE NEVER SOLD** — Vol II is loot/dungeon reward, always. Sell-back ~half (shipped law), so no buy-sell exploit. /librarian prices by this table. |
| **0.8 PAGE LAW (one table).** | manual 3 pages · field_guide 4–5 · lore 3–5 · **reference ≤8 with a chapter list** (the Gazetteer exemption). ≤12 short lines/page; page 1 opens ALL-CAPS and runs >80 chars; **every page closes on a bark-register line**; plain text (the reader is a raw-String RichTextLabel — no BBCode). The deliberate-falsehood requirement applies to `unreliable:true` rows **only**. |
| **0.9 REST GATE EXPIRES ON PLAY, not clock.** | The between-sittings gate clears on **play signals** — any XP gained, leaving HOME_R, or 500 m driven — instead of T-waitable game-hours (a T-waitable clock gate is ~2 real seconds, defeating its own anti-marathon purpose). "Your head needs the road" becomes literally true. |
| **0.10 NON-CONSUMPTION keyed on category.** | `container_panel._on_use` skips removal for `category == "book"` (cleaner than id prefixes now 0.2 exists); `use_item`'s book branch opens the reader and reports handled-no-consume. `library_sim:60`'s `assert(use_item returns true)` is rewritten to assert *panel opened AND pack count unchanged*. |
| **0.11 SIMS COUNT FROM DATA, never literals.** | `library_sim`'s hard-coded 7s (`:29/:39/:53`) become the **pairing invariant** (`book_*` items == books rows; shelf children == visible rows) so /librarian landings stop editing sims. Page assert widens to the 0.8 table. |
| **0.12 FUN ADOPTIONS (from the vision critique).** | **(a) THE SHOTGUN SEAT** — STUDY may run while riding passenger (partner/crew/motorist drives): travel time becomes reading time, the most DRIVN-shaped fantasy in the design (P2). **(b) FIELD STUDY** — an optional `context` row on a study block grants the top rate (×1.75–2.0 progress) when studying in the subject's presence (the field guide in its biome, PURSUIT & EVASION at the Proving Grounds, THE CRIMSON CATECHISM parked on a crimson-family road) — pulls reading out into the world and breaks bed-dominance (P2). **(c) `heretical` tag reserved now (inert)** — when jurisdictional law ships: Faith checkpoints confiscate heretical print, Quill pays 2× for banned books, carrying WHAT THE STATIC SAID in occupied FL is a quiet standing risk. **(d)** `found[id]` sets on ANY acquisition (pickup, loot, purchase, first open) so bought books reach the shelf. **(e)** authored pickups may declare a **scene** (a dead reader's camp — the Kessler journal beside what's left of Kessler). **(f)** the respawn wake-line remembers your in-progress book ("you fell asleep over PURSUIT & EVASION — 2.4/4 hrs kept"). **(g) Banked v2:** the auto-written player journal — a shelf book compiled from the save's own records (dog names, deaths, states entered); the ultimate learn-about-the-world book is the one about YOURS. |
| **0.13 OWNER-RATIFY FLAGS (defaults chosen, flip on request).** | T-wait is dead **during** a sitting (anti-hold-to-fill; the 60-real-second sitting IS reading the pages) · boosts survive death · sitting length 1.0 game-hour · manuals skim-only (0.5) · lore skim-only (0.4). |

---

## 1. Overview

Every book is a row. **SKIM** is the shipped reader kept exactly: free, instant, real pages — the shelf
at the safehouse holds the manuals (the user guide in-world), and found books open from the pack. **STUDY**
is new: a book with a `study` block grows a STUDY button in the reader; a sitting is ~1 game-hour on the
real clock (the hunger tick charges it automatically), comfort raises the rate (bed ×1.5, home ×1.25,
calm dog +0.15, rattled −0.25), night needs real light (home interior, camp lamp, a thrown flare), and
interruptions bank fractional progress — the world never pauses, and a howler scream mid-sitting puts the
book on the floor with nothing lost. Finish the sessions and the **LEARNING BOOST** lands: that one
skill earns ×1.5–1.75 XP until the next 2 levels are earned *by doing*. The K sheet and U tree wear the
boost visibly; toasts mark grant and spend. Study is clearly worth a session and never better than doing
— it yields zero XP itself; the savings only exist if you then drive, shoot, fix, sneak.

Books live in the world as treasure: Vol I primers at Quill's stall in the Meridian market and in
bookshelves/desks (`documents`-tagged loot), Vol II masterclasses **never sold** — police lockers, gun
safes, buried caches, and one thematic masterclass seeded in each Carousel base's victory chest (Cheyenne
Mountain's is the drone doctrine). Lore books teach the *player* — the bird-language table verbatim in a
bird-watcher's hand, the two irreconcilable Black Week accounts, a bounty hunter's howler journal whose
theories your first night contact will falsify. The whole practice is kept alive by **/librarian**: every
shipped player-facing system gets a drafted book (owner-approved prose, always), and an audit mode names
the shelf's gaps.

## 2. Player Fantasy

You pull a water-stained zine off a dead trapper's table: *WHAT EATS THE LEAVINGS.* You skim it right
there, one eye on the door — and actually learn something you didn't know: rat sign means the big things
already fed. Back home you want it in your hands, not just your head: you sit on the bed, hit STUDY, and
for one real minute your character pores over pages while the clock runs and your stomach complains. Two
evenings later: **📖 STUDIED — KINSHIP ×1.25 for your next 2 levels.** Nothing happens. Then you work
your dog, and the bond climbs faster than it ever has. Later, at a checkpoint under Faith law, you
remember the other book in your pack — the one with the static transcribed like scripture — and you
wonder, for the first time, whether you should hide it.

## 3. Detailed Rules

The full mechanics are the CORE facet's, under the 0.x rulings. The load-bearing points:

- **Landmine fixes ship first (Phase A):** USE-to-read no longer consumes the book (0.10); the reader
  gets **pad-legal action rows** (`drivn_page_prev/next`, `drivn_book_close`, `drivn_study` — F11
  rebindable, consumed only while open; kills the raw-`KEY_ESCAPE` dead-end); the fire guard pardons the
  open book (clicking beside it no longer fires your gun); `reload_content()` clears the fill-once book
  cache (F10 live-preview for /librarian); `library_sim` rewrites per 0.10/0.11.
- **Save:** one new top-level key, the media pattern: `data["library"] = {found, read, studied, progress,
  rest_until, boosts}`. Boosts live on `ProtoCharacter.study_boosts` at runtime but serialize here —
  **never** in `character.to_record()` (that record rides the net for join snapshots).
- **The sitting:** starts from the reader (STUDY button; preconditions: on foot, book at hand, not
  starving, rest gate clear, no active boost on that skill, lit if dark). Progress accrues on the
  absolute-game-hour accumulator (the hunger pattern — honors `dev_mult` for sims automatically). T-wait
  is dead during a sitting (0.13) and the rest gate clears on play signals (0.9). Auto-ends at 1.0
  effective hours; comfort multiplies the rate, not the clock.
- **The boost:** `add_xp` multiplies incoming XP for the boosted skill; each real level-up decrements
  `levels_left`; at 0 the boost erases and the level toast appends "— 📖 the lessons are yours now."
  Worked value (the balance anchor): Vol I driving studied at level 2 saves **160 XP = 12 km of
  driving**; Vol II marksmanship at level 6 saves **480 XP = 240 landed shots**. Two sittings of study
  for hours of grind shaved — worth it, never a substitute (study grants zero XP itself).
- **Surfacing (if the player can't see it, it doesn't exist):** shelf rows wear state tags (`NEW` /
  `▰▰▱▱ 2.4/4 hrs` / `✓ STUDIED`); the K sheet lists active boosts; the U tree badges the boosted branch;
  author bylines render under titles; `kind` groups the shelf (manuals, guides, lore).

## 4. Formulas (canonical set — full derivations in the facet record)

- **Progress:** `dprogress = dhhr × comfort × light_gate`; comfort `= clamp(tier + 0.15·calm_dog −
  0.25·(stress>70), 0.5, 1.65)`, tier ∈ {bed 1.5, home/camp 1.25, roadside 1.0}; field-study `context`
  match overrides tier to 1.75–2.0 (P2).
- **Sitting:** ends at `accrued ≥ 1.0` game-hour (60 real s at 1:1; 40 s on the bed). Hunger cost = the
  existing 2.8/game-hour tick — a Vol II costs ≈ 1.5 cans of food. Study is never free.
- **Boost:** `amount ×= boost.mult` in `add_xp`; XP saved over the boost `= Σ 40·(2L+1)·(1 − 1/mult)`
  per boosted level (the shipped `level = ⌊√(xp/40)⌋` curve).
- **Prices/drops:** the 0.7 ladder; loot weight 0.08–0.15 in `documents`-tagged tables (desks in bookish
  buildings multiply via the shipped `weight_mult`); expected find ≈ one lore book per ~2 h of dedicated
  scavenging.

## 5. The Catalog v1 (ships in /librarian-paced batches after the engine)

**First batch (6):** `book_howler_journal` — *NIGHTS I NEVER SAW THEM* (Kessler's confidently wrong
hunter journal — **ships NOW, P1**: howlers are live code today; its two true rules — keep your lights
on, run from the scream — are shipped `howler.gd` behavior, and his theories are falsified by the
player's first night contact) · `book_blackweek_diary` — *SEVEN DAYS, SEVEN LIES* (the cascade account)
· `book_gazetteer` — *THE RIDER'S GAZETTEER, 3rd PRINTING* (kind `reference`, ≤8 pages + chapter list;
every mechanical fact read from `rulers.json`/`law_profiles.json` at authoring time — the respect system
legible in advance) · `book_meridian_winter` — *HOLDING OUT: MERIDIAN'S FIRST WINTER* (home's founding
story; the Maple Hill breadcrumb) · **driving Vol I** *THE WHITE LINE* · **mechanics Vol I** *THE FIVE
PARTS: A WRENCH-TURNER'S SCRIPTURE*.

**The wings:** 24 skill volumes (0.6) · the lore shelf (`book_drone_runner` *DON'T LISTEN TOO LONG* —
the optimizer account, shelved next to the diary it contradicts; `book_ring_log` *THE RING UNDERNEATH* —
teaches the real Carousel unlock ladder, **first copy hand-placed at a dead technician's camp near the
first ring base**, reward-chest copies collect the rest; `book_crimson_catechism` — speed-cult creed
with a true technique spine; `book_witness_hour` *WHAT THE STATIC SAID* — FL-locked via hand-placed
pickups + FL sellers (no region-aware loot system exists; don't invent one), `heretical:true` reserved;
`book_ledger_line` — respect/border law, wanted-law chapters ship-gated) · the field guides
(`book_fg_sky` *READING THE SKY* — the ACTUAL bird-language table in Marisol Vey's hand, ship-gated on
ECOSYSTEM Phase 1; `book_fg_leavings` — rats/dogs/carrion order, same gate).
**Cross-spec flag:** the Witness Hour payoff needs a **live-play path to the FL takeover** (today it
only fires via offline catch-up ≥4 days away) — flagged to LIVING_WORLD/events as a one-line escalation
of the weekly STATE-AT-WAR roll.

**Distribution:** Quill the bookseller (new `npcs.json` archetype + one spawn line in the Meridian
market, beside Mercy) sells commons; `furniture_bookshelf` loot table (Vol I at w 0.02, `empty` headroom
— legal only in furniture tables); thematic Vol II sprinkles (police lockers, gun safes, tool racks,
medicine cabinets); `cache_rare`/`buried_cache` (the Hunter dog digs up a picker's almanac); one Vol II
per Carousel base victory chest. Every landed book is **4-way complete**: books row + item row
(category `book`) + price row + ≥1 acquisition path.

## 6. Content Standards (the law /librarian enforces — S1–S9)

**S1 in-world authorship** — every non-manual has a named author + provenance locked to ONE of the five
shipped registers (radio fragment / wire-service / headline / bark / house manual); no dev voice, ever.
**S2 the page law** (0.8) — and every page closes on a bark-register line ("Dogs are the permadeath.
Guard them like it." is the signature). **S3 truth policy** — manuals + field-guide system chapters are
accurate against shipped behavior, mechanical facts read from rows at authoring time; lore is
perspective and may conflict on purpose; the **six sealed mysteries** (the howler by day, the Choir, the
AI's nature, what a jump does, the sealed places, the Trials' authorship) are hinted, never spoiled.
**S4 the skim-value test** — *"a new player who skims this learns a real technique or a real fact"*;
the review names it explicitly; a book that only vibes is rejected. **S5 the ship gate** — no book
describes an unshipped system (a field guide to animals you can't meet is a lie about the game);
pre-ship lore appears only as rumor fragments inside other books. **S6 mechanical canon from rows only**
— richer LORE_BIBLE identities appear only as "some riders swear…" **S7 no purple** — reader stays
amber/bone; no purple glyphs or color-words. **S8 the epigraph law** — a book's `epigraph` is a VERBATIM
radio LORE line; the shelf and the dial are provably one voice. **S9 the contradiction ledger** — a
top-level `_contradictions` array logs every deliberate disagreement and which mystery it protects;
unlogged contradictions fail the sim. **Plus the FELT CHECK** (review-block line): every draft names
the one in-game moment the page is written from — a book is written from the screamer's summon at
2 a.m., not from a data row.

## 7. Edge Cases / Dependencies / Tuning (headlines)

Attacked mid-sitting → abort, bank fraction, no gate, "the road doesn't care." Dark mid-sitting → rate
0 until lit (flare resumes it). Sold your in-progress book → progress persists, STUDY needs the book at
hand. Save/quit mid-sitting → floats persist, session state doesn't (press STUDY again). The world
moves, the print doesn't → stale pages are in-world ("3rd printing"); /librarian may ship a 4th printing
as a NEW row; the newsroom announces change, books never auto-edit. MP → study is local; boosts stay
off the wire. **Dependencies:** core engine ← this spec; ECOSYSTEM P1 ← field guides (ship gate);
LIVING_WORLD ← the takeover live-trigger flag; jurisdictional law ← the `heretical` payoffs; ECOSYSTEM
§ EAR/`corpse_flies` ← the dead-reader scenes. **Tuning:** all knobs in a `study_rules` block in
books.json (session 1.0 gh · comfort tiers · clamp [0.5,1.65] · light radii · tier constants 0.6 ·
ladder 0.7) — rows, never code.

## 8. Acceptance Criteria

1. `study_sim` — USE a pack book: count unchanged; sitting accrues on the clock (dev_mult); auto-ends at
   1.0; rest gate blocks until a play signal clears it; resume→complete→grant once; `add_xp` ×mult; two
   level-ups consume + erase; boost survives death; save/load round-trips `library` + `study_boosts`;
   bed ≥1.5× roadside; dark-unlit pauses, flare resumes; starving blocks; Vol II refuses below
   `requires_level`; CTA refuses at `cap_level`; blocked-while-active enforced.
2. `library_sim` (rewritten per 0.10/0.11) — pairing invariant; schema v2 validation (kind enum;
   `study.skill` ∈ the 12 real ids; kind `skill` ⇒ study block; `unreliable` ⇒ no study; `shelf:false`
   hidden until found; `_contradictions` entries well-formed); page law per kind; panel opens without
   consumption.
3. Pad-only player can open, page, study, close (action rows, F11). Clicking beside the open book never
   fires. F10 refolds books.json live.
4. Every landed book 4-way complete; `docs/BOOKS.md` ledger row LANDED in the same commit; sims green
   with pasted tallies (a landing without green sims is not a landing).
5. /librarian: zero file writes before explicit per-book owner approval; audit mode lists every shipped
   system exactly once and edits nothing.

---

*Phases: **A** fix-pack + schema fold + save key + binds + sim rewrite (three shipped bugs die here) ·
**B** the session engine + boost + study_sim + K/U surfacing · **C** /librarian lands + ledger bootstrap
+ the first 6 books authored THROUGH it as its shakedown run · **D** the catalog in owner-paced batches;
SHOTGUN SEAT + FIELD STUDY + the heretical payoffs ride their host systems. The shelf is the tutorial;
the world is the library.*
