#!/usr/bin/env bash
# Multiplayer connection smoke test: launch a headless server + a headless client and verify
# they connect over ENet (127.0.0.1:27015). Exit 0 if the client connects.
GODOT="${GODOT:-/c/Users/taskm/Downloads/projects/Godot/Godot_v4.5.1-stable_win64_console.exe}"
PROJ="D:/git/carworld/game"
SLOG=$(mktemp); CLOG=$(mktemp)

CARWORLD_NET=server timeout 25 "$GODOT" --headless --path "$PROJ" res://tests/net_test.tscn --quit-after 900 >"$SLOG" 2>&1 &
SPID=$!
sleep 3   # let the server bind the port

CARWORLD_NET=client timeout 18 "$GODOT" --headless --path "$PROJ" res://tests/net_test.tscn --quit-after 500 >"$CLOG" 2>&1
sleep 1

echo "===== CLIENT ====="; grep 'NET:' "$CLOG" || echo "(no client NET output)"
echo "===== SERVER ====="; grep 'NET:' "$SLOG" || echo "(no server NET output)"

RESULT=1
# Pass = spawn assignment, server roster=2, server received input, AND client received synced state.
grep -q 'NET: spawned_as=' "$CLOG" \
  && grep -q 'NET: players=2' "$SLOG" \
  && grep -q 'NET: input throttle=1' "$SLOG" \
  && grep -q 'NET: state_synced' "$CLOG" \
  && grep -q 'NET: vehicle_throttle=1' "$SLOG" \
  && grep -q 'NET: client_state_applied=true' "$CLOG" \
  && RESULT=0
echo "===== NET TEST: $([ $RESULT -eq 0 ] && echo PASS || echo FAIL) ====="

kill "$SPID" 2>/dev/null
rm -f "$SLOG" "$CLOG"
exit $RESULT
