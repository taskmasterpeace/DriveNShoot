---
name: librarian
description: "THE LIBRARY's standing practice for DRIVN: when a player-facing system ships (or the owner asks for books about one), draft in-world BOOK ROWS — manual + lore + field-guide + skill-book candidates — for game/data/books.json, with loot/shop placement proposals, and present ALL prose to the OWNER for review. NEVER lands prose without explicit approval. Also 'audit' mode: scan shipped systems vs the shelf and report coverage gaps. Triggers: 'make books for X', 'write the field guide', '/librarian', the Before-Committing ship checklist, or 'which systems have no book'."
argument-hint: "[docs/design/SPEC.md | system-name | audit]"
user-invocable: true
allowed-tools: Read, Glob, Grep, Edit, Write, Bash
---

# /librarian — books are rows; prose is owner-gated

DRIVN's law: if the player can't see a system, it doesn't exist. THE LIBRARY is where systems become
*legible* — real pages the player reads (SKIM) and studies (STUDY). This skill turns a shipped system or
spec into 1–3 book candidates written in the world's own voice, shows the owner every word, and only
lands rows on explicit approval. A new book is NEVER code: it is a `books.json` row + an `items.json`
row + a price row + at least one acquisition path.

**THE ONE HARD RULE: no write to any `game/data/*.json` file, no docs/BOOKS.md row marked LANDED, and
no sim edit happens before the owner explicitly approves the specific book in this conversation
("approve", "land it", "ship book X"). Drafts are cheap; landed prose is canon.**

## WHEN THIS FIRES (deliberate, never automatic)

1. **Invoked directly**: `/librarian docs/design/LIVING_WOUND_ECOSYSTEM.md`, `/librarian traffic`,
   `/librarian audit`.
2. **The ship checklist**: `.claude/rules/git-workflow.md` "Before Committing" carries the line —
   a DRAFTED ledger row satisfies it; book approval never blocks a code ship.
3. **Standing audit**: run `audit` at the end of any multi-system arc.

## MODE A — BOOKS FOR A SYSTEM

### 1. GROUND (read all of it before drafting)

- [ ] The target: the spec (`docs/design/*.md`) AND the shipped code. **Verify shipped**: the class file
      exists under `game/proto3d/` and its sim under `game/proto3d/tests/`. Grep, don't trust the spec.
- [ ] `docs/design/THE_LIBRARY.md` — **§0 THE RATIFIED CONTRACT (the row schema) and §6 CONTENT
      STANDARDS (S1–S9 + the FELT CHECK) are the authoritative law this skill enforces. Quote them,
      never restate numbers from memory.**
- [ ] `game/data/books.json` (the shelf + `_comment`), `game/data/items.json` (the book item pattern),
      `docs/BOOKS.md` (the ledger — bootstrap it from books.json if missing, format below).
- [ ] Canon: `docs/DIVIDED_STATES.md` (vocabulary law: scrip, holdout, pre-Fracture, the Old Union —
      never "dollars", never "zombie"), `docs/LORE_BIBLE.md` (**§20 is BINDING: the AI stays
      ambiguous**), `game/proto3d/radio.gd` LORE lines (the fragment voice; the epigraph source),
      `game/proto3d/npc.gd` barks (the closing-line register).
- [ ] Mechanical fact sources — the ONLY places a book may take game-facts from: `game/data/rulers.json`,
      `game/data/law_profiles.json`, `game/data/carousel.json`, `game/data/input_bindings.json`
      (DEFAULT key names; always note F11 rebinds), `game/proto3d/character.gd` SKILLS (the **12** real
      ids: driving, kinship, mechanics, marksmanship, melee, martial_arts, endurance, strength, stealth,
      scavenging, first_aid, piloting).

### 2. THE SLATE — pick 1–3 candidates, never more

| Kind | When | Study block? |
|---|---|---|
| `manual` | always, for a shipped player-facing system | NO (manuals are skim-only — ruling 0.5) |
| `field_guide` | creatures / world-reads shipped in code | usually (×1.25 / 2 lv / 2 sessions) |
| `lore` | the system touches canon | NEVER (ruling 0.4; `unreliable:true` ⇒ no study, sim-enforced) |
| `skill` | maps to ONE of the 12 skill ids | REQUIRED — Vol I (2 sess ×1.5 cap 5) or Vol II (4 sess ×1.75 cap 9 req 4) |
| `reference` | dense world data (gazetteer-class) | NO — its value is the skim; ≤8 pages + chapter list |

**SHIP-GATE LAW (S5)**: never draft a full book about content not in code. Options: rumor-register
fragments inside another book, or a SHIP-GATED ledger row with nothing landed.

### 3. DRAFT — the ratified row shape (THE_LIBRARY.md §0.1, verbatim; snake_case; nested study)

```json
{
  "id": "book_fg_sky", "title": "A FIELD GUIDE TO THE WOUND, VOL. I: READING THE SKY",
  "emoji": "🪶", "kind": "field_guide",
  "author": "Marisol Vey, bird-watcher of Maple Hill", "voice": "fragment",
  "epigraph": "<a VERBATIM radio.gd LORE line — S8>",
  "shelf": false, "unreliable": false, "heretical": false,
  "pages": ["..."],
  "study": { "skill": "scavenging", "sessions": 2, "boost_mult": 1.25,
             "boost_levels": 2, "cap_level": 5, "requires_level": 0 }
}
```

**Prose laws — one PASS/FAIL checkbox each in the review block:** the §0.8 page law (manual 3 ·
field_guide 4–5 · lore 3–5 · reference ≤8; ≤12 lines; page 1 ALL-CAPS header >80 chars; **every page
closes on a bark line**; plain text, no BBCode) · S1 named author locked to ONE register · S3 truth
tiers + the six sealed mysteries hinted never spoiled · deliberate-falsehood documented for
`unreliable:true` rows only · S4 skim-value test named explicitly · S6 canon-from-rows · S7 no purple ·
**FELT CHECK: one line naming the in-game moment this page is written from.**

### 4. PLACEMENT PROPOSAL (rows only)

- [ ] `items.json` companion — **category `book`** (the CAT_ORDER extension is ratified, 0.2), usable,
      weight 0.3 (Vol I/zines) or 0.6 (Vol II/hardbacks), desc opens "USE to read."
- [ ] Price by the **0.7 ladder lookup**: manual 25 · lore 35 · field_guide 40 · skill Vol I 40 ·
      skill Vol II 75–90 **and NEVER SOLD** (loot/dungeon only — placement law).
- [ ] Acquisition (≥1): shelf (`shelf:true` — system manuals only) · loot (`loot_tables.json` entry,
      tags `["book","documents"]`; `empty` headroom only in furniture_* tables) · hand-place (a
      ProtoChest `{id:count}` dict, optionally with a **scene** — the dead reader's camp) · shop
      (`npcs.json` archetype stock — Quill for commons; NEW archetype ids only, code-floor ids like
      `trader` cannot be extended by rows).
- [ ] Region locks = hand-placed pickups + regional seller stock ONLY (no region-aware loot system
      exists — do not invent one in a placement row).

### 5. THE OWNER REVIEW GATE (hard stop)

Output this block and STOP. No file edits yet.

```
## LIBRARIAN DRAFTS — [system] ([spec path])
Standards source: THE_LIBRARY.md §0 + §6

### CANDIDATE 1: [emoji] [TITLE]  (kind · skill/sessions if any)
Author/voice: [name — register]   FELT CHECK: [the observed moment]
FULL TEXT (every page, verbatim): PAGE 1 … PAGE N
Rows to land: books + items + price ([ladder]) + [placements]
Guardrails: [each prose-law checkbox PASS/FAIL, one line each]
Deliberate falsehood (unreliable only): [claim + how play falsifies it]

AWAITING OWNER — per candidate: APPROVE / EDIT (say what) / REJECT / SHIP-GATE.
Nothing lands until you say so.
```

Approval is per-book and atomic — a book lands with ALL its rows or not at all.

### 6. LAND (approved books only)

1. Append rows (books/items/prices + approved placements). Grep both files for id collisions first.
2. Update `docs/BOOKS.md`: status → LANDED, acquisition + sim filled, same commit.
3. Sims: `library_sim` uses the pairing invariant (0.11) so counts self-adjust; add one content
   assertion per new book (its page 1 teaches its system). Run headless and **paste tallies**:
   `Godot_console --headless --path game res://proto3d/tests/library_sim.tscn` (+ `data_sim`).
4. If THE_LIBRARY Phase A hasn't landed: F10 won't refresh the shelf (fill-once cache) and USE-to-read
   still consumes pack books — say both out loud and hold loot/shop placement until the no-consume fix
   ships (shelf books are safe).
5. Commit: `feat(library): [TITLE] — [system] enters the shelf ([kind], [acquisition])`.

## MODE B — AUDIT (`/librarian audit`)

1. Enumerate shipped systems: the CLAUDE.md systems table + every sim in `game/proto3d/tests/`.
2. Map coverage from `docs/BOOKS.md` (fall back to grepping books.json pages).
3. Score gaps: `gap = days_since_ship × reach` (core-loop 1.0 / optional 0.6 / flavor 0.3), sort desc.
4. Report the table + TOP 3 TO DRAFT NEXT + SHIP-GATED list. Audit lands NOTHING — it reports and
   offers Mode A on the top gap.

## THE LEDGER — docs/BOOKS.md

`| id | title | kind | teaches | study | acquisition | status | sim | commit |` — status
DRAFTED → APPROVED → LANDED (+ SHIP-GATED, RETIRED). One book per row. The audit trusts this file.

## THIS SKILL'S OWN ACCEPTANCE CRITERIA

- [ ] ZERO file writes before explicit per-book owner approval in-conversation.
- [ ] Every LANDED book 4-way complete (books + item[category book] + price + acquisition) with its
      ledger row in the same commit.
- [ ] Sims green with pasted tallies — a landing without green sims is not a landing.
- [ ] Step 3's row template matches THE_LIBRARY.md §0.1 verbatim (drift is a checkable failure).
- [ ] No mystery-ledger item resolved; every `unreliable` falsehood documented.
- [ ] Audit mode lists every shipped system exactly once and never edits a file.

## PAID-FOR GOTCHAS (do not re-pay)

- Category is `book` (ratified 0.2) — but only AFTER the CAT_ORDER extension lands; before Phase A,
  a `book`-category item is INVISIBLE in the pack.
- USE-to-read consumes pack books until the Phase A no-consume fix (hold loot placement).
- ProtoBookPanel's cache is fill-once — F10 shows new rows only after the Phase A cache-clear line.
- `empty` headroom item only in furniture_* tables.
- Code-floor NPC archetype ids (e.g. `trader`) cannot be extended by rows — new sellers need NEW ids.
- res:// = game/ — the file is `game/data/books.json`, in-engine `res://data/books.json`.
- Prices fold additively for NEW ids only — repricing a shipped manual is a code edit, out of this lane.
