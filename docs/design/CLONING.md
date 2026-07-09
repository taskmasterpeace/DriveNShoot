# CLONING — the vat, the wake, and what your family remembers that you don't

**Status:** GREENLIT design spec (owner, 2026-07-09: *"cloning insurance… make it more engaging…
I want to re-remember everything by reading your journal… if you die, don't you lose your family? How
do we handle that? Figure it all out."*). **Extends, never redesigns, LIVING_WORLD_DSOA §11** (clone
insurance is canon there: policy tiers Street/Clinic/Corporate/Federal/Heretic, backup age, per-state
legality, debt, body grade, corpse persistence, §11.7 no-dog-cloning). This doc adds the player-facing
LOOP and answers the family question. **Family members can NEVER be cloned** (§11.7 extended — the
FAMILY_EMPIRE ruling stands; permadeath is the pillar).

## 1. The clinic ritual (cloning is a PLACE, not a menu)

Backup scans are **visits**: drive to a clone facility (Building Book rows — `clinic_small`'s
clinic-back at street tier, `hospital_lobby`'s clone wing at clinic tier, corporate towers at gold
tier), the scan takes real game time (an hour in the chair — hunger ticks, the world moves), and it's
priced per DSOA §11 tiers. On later visits **you can see your clone growing in the vat** — a body in
amber glass wearing your paperdoll rows, one visit more grown than the last. The vat room is a real
interior; the attendant is a real NPC; faith states have none (illegal — the facility row simply
doesn't spawn under their law, and your POLICY is contraband paper there).

**BLACK-MARKET VATS** (the owner's favorite): hidden facilities — a junkyard back lot, a drained-pool
basement (dirt-spur payloads and city backrooms both qualify). Cheap scans, no questions — and the
menu of consequences DSOA §11 priced: wrong-state wake-ups, body defects (a permanent wound-tax roll),
debt collected by leg-breakers (a rival-director contract), and the whole facility can be RAIDED and
lost — your backup with it. Finding one is intel (radio rumor, a fixer, the wife-as-fixer's ASK line).
**Fever rule (THE_INFECTED.md I2):** a clinic refuses to scan a fevered body (contagion risk — that
is all anyone says); black-market vats don't care, +1 on the defect roll.

## 2. The wake (choose your ground)

Tier buys **wake-point choice**: street tier wakes you wherever the vat is; clinic tier lets you pick
among that provider's facilities; gold tier = any facility in legal states — **strategic respawn**:
wake behind the border your killers can't cross (the state-line law does the protecting). Waking is a
scene, not a load screen: the vat drains, the paperdoll is yours (body grade per tier), your gear is
NOT (the corpse kept it — DSOA law: the world where you died is intact, your rig where it fell, your
grave maybe already dug).

## 3. THE MEMORY LAW + THE JOURNAL (the re-remember loop)

**You wake knowing what you knew at your LAST SCAN.** Mechanically: map intel (`known_to_player`
exits, waypoints, revealed atlas), radio-learned rumors, and RELATIONSHIP MEMORY entries newer than
the scan are flagged `forgotten`. **THE JOURNAL is the answer** (this makes the Library's banked
auto-journal a v1 requirement of THIS spec): the game has been auto-writing your run — dogs named,
states entered, deals made, family beats — and **reading your journal restores what you forgot**:
skim a chapter (free, real text — you literally re-read your life) and the flagged intel/memories
re-light. The journal lives on YOUR shelf; if you die far from home, the drive home to read who you
are is the loop working as fiction. A stale backup with a lost journal (house burned) is the hardest
wake in the game — by design, and the game says so before you skip scans.

## 4. THE FAMILY LAW (the owner's question, answered)

**You do not lose your family — they lost YOU.** The family are persistent people in the world; your
death didn't delete them. What death costs:

- **They grieved.** You DIED — there may have been a funeral; **your own grave can stand at the
  memorial wall** (visiting it is a real beat, and the game lets you keep or remove the stone).
- **Trust takes the hit, scaled by staleness:** `bond_hit = base × staleness_days × tier_softener` —
  a fresh backup and a gold policy means she barely lost you; a six-week-stale street clone is a
  stranger wearing her husband. The reconciliation arc is the EXISTING bond economy (dates, gifts,
  her ASK quests) — you re-earn what the vat couldn't copy.
- **Anyone born or met after your last scan is a STRANGER to you** — the newborn you never scanned
  for is the heaviest line in the game, and the journal's family pages + a re-bond arc (she
  re-introduces you; the kid warms slowly) are the repair verbs. Nothing is auto-restored: the
  journal restores *facts*; only time and verbs restore *feeling* (bond floats recover at 2× with
  the journal read, but they recover by DOING).
- **Faith states treat the revival as abomination** (DSOA §11): your marriage performed in a faith
  church may be *annulled under their law* — a paper problem, a real quest, and pure DRIVN.
- **The asymmetry is the point:** you can come back; they can't. The spec never softens that — it's
  what makes the safe, the walls, and the crisis-law rescue drives matter MORE for a cloned player,
  not less.

## 5. Deps · Knobs · Sims

**Deps:** LIVING_WORLD_DSOA §11 (canon), THE LIBRARY (the auto-journal graduates from banked-v2 to
REQUIRED-here; journal reading = the skim system), FAMILY_EMPIRE (bond economy, memorial wall, the
crisis law unchanged — insurance never rescues the family), BUILDING_BOOK (facility rows: clone wing,
clinic-back, black-market vat), law_profiles (legality/contraband), respect (faith reaction rows).
**Knobs:** scan price/tier (DSOA's), `staleness_bond_base`, journal re-light scope, black-market
defect table, grave keep/remove. **Sims:** `clone_ritual_sim` (scan visit takes clock; vat visible) ·
`clone_wake_sim` (wake-point tiers; gear stays on the corpse) · `memory_law_sim` (post-scan intel
flagged; journal read restores; family entries gated to verbs) · `family_grief_sim` (bond hit scales
with staleness; stranger-child arc; the grave exists) · `blackmarket_sim` (defect roll; raidable vat
loses the backup). **Phases:** C1 insurance + clinic ritual + memory law + journal restore (needs the
LIBRARY journal) → C2 wake-point choice + the family law full → C3 black markets + faith annulment.
