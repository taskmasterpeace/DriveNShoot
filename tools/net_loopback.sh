#!/usr/bin/env bash
# Two REAL Godot processes over ENet loopback: host + client. Proves the
# transport layer actually connects (the seam sim proves the logic).
# Keep this file LF-only; Bash reads it directly in Windows worktrees.
DEFAULT_GODOT="C:/Users/taskm/Downloads/projects/Godot/Godot_v4.5.1-stable_win64_console.exe"
GODOT="${GODOT:-$DEFAULT_GODOT}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
GAME_ROOT="$ROOT/game"
# PowerShell's `bash` may be WSL rather than Git Bash. Translate both sides of
# the process boundary only in that environment; native Git Bash keeps C:/.
if [[ ! -x "$GODOT" && -x "/mnt/c/Users/taskm/Downloads/projects/Godot/Godot_v4.5.1-stable_win64_console.exe" ]]; then
  GODOT="/mnt/c/Users/taskm/Downloads/projects/Godot/Godot_v4.5.1-stable_win64_console.exe"
fi
if [[ "$GODOT" == /mnt/* ]] && command -v wslpath >/dev/null 2>&1; then
  GAME_ROOT="$(wslpath -w "$GAME_ROOT")"
fi
"$GODOT" --headless --path "$GAME_ROOT" res://proto3d/tests/net_host.tscn > /tmp/nethost.log 2>&1 &
HPID=$!
"$GODOT" --headless --path "$GAME_ROOT" res://proto3d/tests/net_client.tscn > /tmp/netclient.log 2>&1
CRC=$?
wait $HPID; HRC=$?
echo "=== HOST ==="; grep -E "HOST:" /tmp/nethost.log
echo "=== CLIENT ==="; grep -E "CLIENT:" /tmp/netclient.log
if grep -q "A CLIENT CONNECTED" /tmp/nethost.log && grep -q "CONNECTED to host" /tmp/netclient.log; then
  echo "NET LOOPBACK: ALL CHECKS PASSED"; exit 0
else echo "NET LOOPBACK: FAILURES PRESENT"; exit 1; fi
