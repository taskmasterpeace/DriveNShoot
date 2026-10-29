---
name: goal-loop
description: Use when a DSOA (or any repo) quality can be MEASURED by a command that prints a number and should be pushed to a target by repeated small data changes - "set a goal and keep going back until it reaches it", "dream loop but for a process", tune rows until a metric is met (role diversity, loot balance, spawn spread, price curves), or when reading or extending tools/goal-loop.mjs and docs/design/goal-loop-log/.
---

# The goal loop: a dream loop for a process

Robert (2026-10-28): "imagine dream loop, but for a process. You set a goal and you have it keep going back until it
reaches that goal." The tool is `web/tools/goal-loop.mjs`; the first goal is `web/tools/goals/role-diversity.json`.

## A goal is a row (`web/tools/goals/<name>.json`)
| field | what |
|---|---|
| `name`, `title`, `brief` | the goal in words; the brief is what the agent reads each round (how the rows work, what must still read right) |
| `metric` | a command whose LAST line is a number (`node tools/role-diversity.mjs` prints the share of passing settlement x criterion pairs) |
| `target`, `direction` | stop when the number reaches it (`up` or `down`) |
| `files` | the ONLY files the loop may change (rows: `src/data/<x>.js`) |
| `checks` | commands that must exit 0 after every change (`node --check`, a targeted check like `tools/occ-check.mjs`) |
| `detail` | optional: a command whose output tells the agent WHAT fails (`--fails`) |
| `rounds`, `agent`, `timeoutS` | how many rounds; the editing command (prompt on stdin; default `claude -p --model sonnet --permission-mode acceptEdits --allowedTools Read Edit Grep`) |

## Each round
measure -> met? stop -> snapshot the allowed files -> the agent changes ONE thing -> checks -> re-measure ->
KEEP only if the metric moved the right way AND every check is green, else restore the snapshot byte for byte -> log.
Every round lands in `docs/design/goal-loop-log/<goal>.md` (a table: before, after, verdict, the agent's one-line
CHANGE, checks) and every kept change's diff in `<goal>.diffs.md`.

```
cd web
node tools/goal-loop.mjs role-diversity --dry          # measure + checks + the prompt it would send; changes nothing
node tools/goal-loop.mjs role-diversity --rounds 16    # run it (background it: each round is a model call)
node tools/goal-loop.mjs role-diversity --agent "<cmd>" # any editor that reads a prompt on stdin
```

## Laws (paid for)
- **The checks are what keep it honest.** A metric alone gets gamed (crank a jitter knob until neighbours differ at
  random). Every goal needs a targeted check that the result still READS right: `occ-check.mjs` fails a port without
  dockhands, dock work in the dry desert, a raider camp with a teacher, a knob outside its safe range, an edited GOAL.
- **The target is not a knob.** The checks freeze it (occ-check fails if `GOAL` changes).
- **One change a round.** A rejected idea is in the history the next round reads, so it is not tried again.
- **Never git in the loop.** It restores only what it snapshotted. If the agent touches a file outside `files`, the loop
  restores its own files, leaves the stranger alone and STOPS (exit 3) - look at what it did.
- **Don't edit `web/` while a loop runs** in the same checkout: the outside-files guard compares `git status` before
  and after each agent call, so your own edits during that call stop the loop. Work outside `web/` or wait.
- Exit codes: 0 met, 4 not met in the rounds given, 3 stopped (outside files), 1 checks red at the start.

## Writing a new goal
1. A metric tool in `web/tools/` that is pure and fast (seconds): read rows + a fixture, print a summary line, then the
   number. Give it `--fails` (one line per failure) for the agent.
2. A check tool that fails anything that would make the result wrong-but-high. Run it green before the first round.
3. The goal row. `--dry` first; read the prompt as the agent would.
4. Run, read the log, look at the result in the game (a number is not a look).
