#!/usr/bin/env bash
# THE SUITE RUNNER — run every sim in game/proto3d/tests headless; exit 1 if any fails.
# Usage: tools/run_suite.sh [filter-substring]
# The loop's PROVE step (LOOP_LEDGER law): red blocks DONE.
set -u
GD="C:/Users/taskm/Downloads/projects/Godot/Godot_v4.5.1-stable_win64_console.exe"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FILTER="${1:-}"
FAILS=0
TOTAL=0
for scene in "$ROOT"/game/proto3d/tests/*_sim.tscn; do
  name="$(basename "$scene" .tscn)"
  if [ -n "$FILTER" ] && [[ "$name" != *"$FILTER"* ]]; then continue; fi
  TOTAL=$((TOTAL+1))
  # timeout backstop: a hung sim (missing watchdog / crashed pre-timer) must never
  # stall the whole suite — the 2026-07-09 rig_v2 zombie held the runner 30+ min.
  # rc must be TIMEOUT'S, not tail's (a pipe eats it) — capture raw, trim after.
  raw="$(timeout -k 10 240 "$GD" --headless --path "$ROOT/game" "res://proto3d/tests/$name.tscn" 2>&1)"
  rc=$?
  out="$(printf '%s' "$raw" | tail -200)"
  if [ "$rc" -ge 124 ]; then
    # Windows: timeout kills the console wrapper; the ENGINE child survives —
    # reap it by scene name (the two-runner/orphan lesson, 2026-07-09).
    wmic process where "CommandLine like '%${name}%' and name like 'Godot%'" delete >/dev/null 2>&1
    out="$out
TIMEOUT-KILLED after 240s"
  fi
  # Pass = an explicit all-green line, or a results line with 0 failed.
  if echo "$out" | grep -qiE "ALL CHECKS PASSED"; then
    echo "[PASS] $name"
  elif echo "$out" | grep -qiE "RESULTS: [0-9]+ passed, 0 failed|DONE .* 0 failed|— [0-9]+ passed, 0 failed"; then
    echo "[PASS] $name"
  else
    echo "[FAIL] $name"
    echo "$out" | grep -iE "FAIL -|FAILURES|SCRIPT ERROR|Parse Error|WATCHDOG" | head -8 | sed 's/^/       /'
    FAILS=$((FAILS+1))
  fi
done
echo "SUITE: $((TOTAL-FAILS))/$TOTAL green"
[ "$FAILS" -eq 0 ]
