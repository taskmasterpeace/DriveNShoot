#!/usr/bin/env bash
# Two REAL Godot processes over ENet loopback: host + client. Proves the
# transport layer actually connects (the seam sim proves the logic).
GODOT="${GODOT:-C:/Users/taskm/Downloads/projects/Godot/Godot_v4.5.1-stable_win64_console.exe}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
"$GODOT" --headless --path "$ROOT/game" res://proto3d/tests/net_host.tscn > /tmp/nethost.log 2>&1 &
HPID=$!
"$GODOT" --headless --path "$ROOT/game" res://proto3d/tests/net_client.tscn > /tmp/netclient.log 2>&1
CRC=$?
wait $HPID; HRC=$?
echo "=== HOST ==="; grep -E "HOST:" /tmp/nethost.log
echo "=== CLIENT ==="; grep -E "CLIENT:" /tmp/netclient.log
if grep -q "A CLIENT CONNECTED" /tmp/nethost.log && grep -q "CONNECTED to host" /tmp/netclient.log; then
  echo "NET LOOPBACK: ALL CHECKS PASSED"; exit 0
else echo "NET LOOPBACK: FAILURES PRESENT"; exit 1; fi
