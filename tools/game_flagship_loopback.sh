#!/usr/bin/env bash
# Two real Godot processes prove semantic input, authoritative combat snapshots,
# normalized results, and ledger idempotency for both Phase 2 flagships.
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

run_flagship() {
  local game="$1"
  local host_log="${TMPDIR:-/tmp}/game-flagship-${game}-host.log"
  local client_log="${TMPDIR:-/tmp}/game-flagship-${game}-client.log"
  FLAGSHIP_GAME="$game" "$GODOT" --headless --path "$GAME_ROOT" \
    res://proto3d/tests/game_flagship_online_host.tscn -- \
    --flagship-game="$game" > "$host_log" 2>&1 &
  local host_pid=$!
  FLAGSHIP_GAME="$game" "$GODOT" --headless --path "$GAME_ROOT" \
    res://proto3d/tests/game_flagship_online_client.tscn -- \
    --flagship-game="$game" > "$client_log" 2>&1
  local client_rc=$?
  wait "$host_pid"
  local host_rc=$?
  echo "=== FLAGSHIP HOST: $game ==="
  grep -E "FLAGSHIP HOST" "$host_log"
  echo "=== FLAGSHIP CLIENT: $game ==="
  grep -E "FLAGSHIP CLIENT" "$client_log"
  [[ $host_rc -eq 0 && $client_rc -eq 0 ]] \
    && grep -Fq "FLAGSHIP HOST [$game]: ALL CHECKS PASSED" "$host_log" \
    && grep -Fq "FLAGSHIP CLIENT [$game]: ALL CHECKS PASSED" "$client_log"
}

if run_flagship rust_runners && run_flagship black_grid; then
  echo "GAME FLAGSHIP LOOPBACK: ALL CHECKS PASSED"
  exit 0
fi
echo "GAME FLAGSHIP LOOPBACK: FAILURES PRESENT"
exit 1
