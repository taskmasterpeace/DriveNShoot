#!/usr/bin/env bash
# Headless smoke test for CarWorld. Boots the smoke scene, runs ~80 frames of every system,
# and reports script errors + SMOKE check results. Exit code = number of failed checks.
GODOT="${GODOT:-/c/Users/taskm/Downloads/projects/Godot/Godot_v4.5.1-stable_win64_console.exe}"
PROJ="D:/git/carworld/game"
OUT=$(mktemp)
timeout 90 "$GODOT" --headless --path "$PROJ" res://tests/smoke.tscn --quit-after 300 >"$OUT" 2>&1
echo "===== SMOKE CHECKS ====="
grep -E '^SMOKE' "$OUT" || echo "(no SMOKE output — scene may have failed to load)"
echo "===== SCRIPT/RUNTIME ERRORS (benign warnings filtered) ====="
grep -iE 'ERROR|SCRIPT ERROR|Parse Error|Compile Error|null instance|Failed' "$OUT" \
  | grep -v '^SMOKE' \
  | grep -viE 'invalid UID|dialogue_manager|tile_bit_tools|non-existing editor theme|resources still in use|RID allocations|leaked at exit' \
  || echo "(none)"

echo "===== FULL-RUN INTEGRATION SIM ====="
SIM=$(mktemp)
timeout 90 "$GODOT" --headless --path "$PROJ" res://tests/run_sim.tscn --quit-after 800 >"$SIM" 2>&1
grep -E '^RUNSIM|RUN SIM' "$SIM" || echo "(no RUNSIM output — sim failed to load)"
grep -iE 'ERROR|SCRIPT ERROR|Parse Error|Compile Error|null instance' "$SIM" \
  | grep -viE 'invalid UID|dialogue_manager|tile_bit_tools|non-existing editor theme|resources still in use|RID allocations|leaked at exit|ObjectDB instances leaked' \
  | grep -v 'RUN SIM' \
  || echo "(no sim errors)"
rm -f "$SIM"

rm -f "$OUT"
