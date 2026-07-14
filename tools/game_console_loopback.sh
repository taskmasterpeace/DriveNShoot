#!/usr/bin/env bash
# Two real Godot processes prove the console's semantic input, authority
# snapshot, normalized result, and ledger-idempotency paths over ENet.
DEFAULT_GODOT="C:/Users/taskm/Downloads/projects/Godot/Godot_v4.5.1-stable_win64_console.exe"
GODOT="${GODOT:-$DEFAULT_GODOT}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
GAME_ROOT="$ROOT/game"
if [[ ! -x "$GODOT" && -x "/mnt/c/Users/taskm/Downloads/projects/Godot/Godot_v4.5.1-stable_win64_console.exe" ]]; then
  GODOT="/mnt/c/Users/taskm/Downloads/projects/Godot/Godot_v4.5.1-stable_win64_console.exe"
fi
if [[ "$GODOT" == /mnt/* ]] && command -v wslpath >/dev/null 2>&1; then
  GAME_ROOT="$(wslpath -w "$GAME_ROOT")"
fi
HOST_LOG="${TMPDIR:-/tmp}/game-console-host.log"
CLIENT_LOG="${TMPDIR:-/tmp}/game-console-client.log"
"$GODOT" --headless --path "$GAME_ROOT" res://proto3d/tests/game_console_online_host.tscn > "$HOST_LOG" 2>&1 &
HPID=$!
"$GODOT" --headless --path "$GAME_ROOT" res://proto3d/tests/game_console_online_client.tscn > "$CLIENT_LOG" 2>&1
CRC=$?
wait $HPID
HRC=$?
echo "=== CONSOLE HOST ==="
grep -E "CONSOLE HOST:" "$HOST_LOG"
echo "=== CONSOLE CLIENT ==="
grep -E "CONSOLE CLIENT:" "$CLIENT_LOG"
if [[ $HRC -eq 0 && $CRC -eq 0 ]] \
    && grep -q "CONSOLE HOST: ALL CHECKS PASSED" "$HOST_LOG" \
    && grep -q "CONSOLE CLIENT: ALL CHECKS PASSED" "$CLIENT_LOG"; then
  echo "GAME CONSOLE LOOPBACK: ALL CHECKS PASSED"
  exit 0
fi
echo "GAME CONSOLE LOOPBACK: FAILURES PRESENT (host=$HRC client=$CRC)"
exit 1
