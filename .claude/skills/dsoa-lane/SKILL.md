---
name: dsoa-lane
description: Use when starting a subagent (a "lane") to build a system for the DIVIDED STATES OF AMERICA web game, or when reviewing a lane's hand-back. Gives the brief template that comes back mergeable (own worktree, own port, own scratch folder, two green batteries, exact shared-file list), the rules every lane must carry, and how to review the hand-back as a critic.
---

# Running a lane agent on DSOA

A lane = one subagent, one system, one branch `feat/web-<lane>`, one worktree (`isolation: "worktree"`), one port.
Lanes that come back mergeable were briefed with ALL of the below. Lanes that weren't cost hours.

## The brief (fill every section)
1. **Who and where:** "You are the <LANE> lead on DIVIDED STATES OF AMERICA ... in `web/`. Own worktree, branch
   `feat/web-<lane>`. FIRST `git merge feat/web-engine` (worktrees are sometimes cut from `main`)."
2. **Robert's words:** quote the ask and the settled calls that bear on it (`docs/design/WEB_WORLD_EDITOR_PLAN.md`
   §1.1; START IN FLORIDA; dark scary nights; survival first; controller first).
3. **Read first:** `web/AGENTS.md`, `web/CLAUDE.md`, `.claude/skills/em3/SKILL.md`, the design docs of every system
   it touches, and "build ON what exists" with file names (the lane will otherwise fork a second system).
4. **Build:** numbered deliverables, each ending in something checkable. Data as ROWS (`web/src/data/<lane>.js`) +
   an exported `validate<Lane>(rows)` for the World Forge. Every new collision tag gets a rule in `data/materials.js`.
5. **Proof:** COMMANDS rows + `node tools/gen-commands.mjs`; named selftest checks (what each proves); screenshots
   from the GAME camera in `docs/renders/web/<lane>/` looked at as a hard critic; `docs/design/WEB_<LANE>.md` with the
   8 sections (Overview, Player Fantasy, Detailed Rules, Formulas with an example, Edge Cases, Dependencies both ways,
   Tuning Knobs with safe ranges, Acceptance Criteria).
6. **Rules (copy verbatim):**
   - Harness on YOUR OWN PORT 34xx; `DL_URL` on EVERY dl.mjs call; never :3141.
   - Full selftest green twice in a row on fresh pages before hand-back (budget 1800 s; `only=a|b`, `skip=`).
   - `node --check` every edited file; < 150 draw calls; no per-frame allocations; fixed light count;
     `scenario name=stress` must not regress; `node tools/ip-lint.mjs` 0 deny; golden hashes unmoved unless stated.
   - NO PURPLE (hue 270-320); real flags on every person; no "Co-Authored-By" lines; commit on your branch only.
   - Never work in `D:\git\carworld` itself; never kill by pattern (exact PIDs only); a refused permission is
     reported, never routed around.
   - Helper files under `scratchpad/<lane>/`, never the scratchpad root, never `scratchpad/lead/`.
   - Shared files: minimal hooks, each listed exactly in the hand-back.
7. **Hand-back:** branch + final commit, both battery results, stress before/after, golden status, what each check
   proves, screenshots, shared-file changes, what it could not do, harness stopped by exact PID.

## Running the fleet
- Five Opus lanes at once hit the account session limit together (they all stop; resume each with SendMessage after
  the reset). Four is a safer ceiling; never launch while the lead's battery needs the CPU most.
- When `feat/web-engine` moves, message every running lane: what moved and "merge it before your final batteries".
- Two lanes that must share a system (water, a species, steering): name the owner in both briefs, or expect to
  reconcile by hand (send the reconciliation back to the lane that knows its side best).

## Reviewing a hand-back (as the critic)
- Look at 2-4 of its screenshots yourself before merging. Name the three worst things; the good ones merge with the
  notes on a follow-up list, the ugly ones go back.
- "Not two greens" is normal under load: read WHICH checks failed. Its own checks failing = not ready. Different
  other checks each run = load flakes (verify on your battery).
- Refusals it reports (rm -rf, reset --hard, credential searches): never do them for it. Put them on Robert's list.
