#!/usr/bin/env bash
# Two real ENet processes prove visible JOIN MATCH and SPECTATE handshakes.
set -u

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

run_mode() {
  local mode="$1"
  local host_log="${TMPDIR:-/tmp}/game-lobby-${mode}-host.log"
  local client_log="${TMPDIR:-/tmp}/game-lobby-${mode}-client.log"
  "$GODOT" --headless --path "$GAME_ROOT" \
    res://proto3d/tests/game_lobby_online_host.tscn -- "$mode" > "$host_log" 2>&1 &
  local host_pid=$!
  "$GODOT" --headless --path "$GAME_ROOT" \
    res://proto3d/tests/game_lobby_online_client.tscn -- "$mode" > "$client_log" 2>&1
  local client_rc=$?
  wait "$host_pid"
  local host_rc=$?
  echo "=== LOBBY ${mode^^} HOST ==="
  grep -E "LOBBY HOST" "$host_log" || true
  echo "=== LOBBY ${mode^^} CLIENT ==="
  grep -E "LOBBY CLIENT" "$client_log" || true
  [[ $host_rc -eq 0 && $client_rc -eq 0 ]] \
    && grep -q "LOBBY HOST \[$mode\]: ALL CHECKS PASSED" "$host_log" \
    && grep -q "LOBBY CLIENT \[$mode\]: ALL CHECKS PASSED" "$client_log"
}

if run_mode player && run_mode spectator; then
  echo "GAME LOBBY LOOPBACK: ALL CHECKS PASSED"
  exit 0
fi
echo "GAME LOBBY LOOPBACK: FAILURES PRESENT"
exit 1
