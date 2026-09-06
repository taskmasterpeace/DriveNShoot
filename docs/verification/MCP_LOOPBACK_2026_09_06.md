# Editor MCP loopback confinement - 2026-09-06

Scope: the two existing Godot MCP TCP/WebSocket listeners in the isolated
`codex/america-foundation` source. This is a development-tooling safety fix,
not public authentication, a game-content milestone or original-save recovery.

## Cause and change

Both start paths called `TCPServer.listen(port)` without an address. The
[Godot 4.5 API](https://docs.godotengine.org/en/4.5/classes/class_tcpserver.html#class-tcpserver-method-listen)
defines the omitted address as wildcard, across available IPv4/IPv6 addresses.
The previous import actually logged listener startup and shutdown; its exposure
was not connection-audited and remains a historical caveat.

Both paths now use one small shared listener policy with explicit `127.0.0.1`.
Ports, command handling and response formats remain unchanged. The editor's
readiness log reports its port, process ID and address for operator visibility.
Local clients should connect to `ws://127.0.0.1:9080`. No remote opt-out is added;
local processes are still trusted, so this is not an authentication boundary.

## Test-first and retained failed evidence

The permanent gate was written before the shared policy and routing changes.
Its first runtime-only execution failed on the missing policy before creating
any socket: fixture 0 passed / 1 failed, process exit 1, empty stderr. This is
the safe missing-policy RED, not a fresh execution of the old wildcard listener.
Old wildcard behavior was not reopened or reintroduced for a mutation check.

RED: `build/mcp-loopback-562cc436405e434ba7eeabacf935f796/`.
Two subsequent fixture failures are retained rather than erased:
`build/mcp-loopback-afefe0499127408ba0b14d9e3085621e/` exposed PowerShell async
return values leaking into the boolean result; `build/mcp-loopback-0c0ee37c62b841598e8fbfe80a86a5ce/`
exposed the fixture expecting an integer instead of Godot's decoded JSON float.
These were fixture corrections, not additional listener production fixes.

A separate runtime-only dispatch experiment confirmed that a typed TCPServer
call bypasses a GDScript override. It used an explicit temporary loopback socket,
never wildcard, and was not reused as a fake transport test.

## Final real behavioral verification

From this checkout, using the installed PowerShell 7 and Godot 4.5.1:

```powershell
pwsh -NoProfile -File tools/mcp_loopback_check.ps1
```

Result: **20 controller checks passed, 0 failed**, exit 0. Evidence:
`build/mcp-loopback-c3775c371a5d4a7da36409db370901cd/acceptance.json`.
Each stage has its exact arguments, fresh APPDATA/LOCALAPPDATA paths, stdout,
stderr, launch-handle PID, actual engine PID and terminal exit retained.

| Actual stage | Engine PID | Windows TCP LISTENING endpoints | Behavior observed |
|---|---:|---|---|
| Shared policy | 51312 | `127.0.0.1:65486` | Actual local TCP connection accepted |
| WebSocket component | 43152 | `127.0.0.1:65490` | Actual JSON command parsed and response received |
| Real editor plugin | 58644 | `127.0.0.1:9080`, editor debugger `127.0.0.1:6006` | Actual JSON-RPC ping answered |

The controller inspected Windows socket-table entries for the actual engine PID,
not merely the readiness string. It rejected wildcard/non-loopback TCP addresses.
All three processes exited normally with code 0; all task-owned handles closed.
The runtime fixture stages passed 7 and 8 internal assertions respectively and
had empty stderr. Editor stderr retains the two pre-existing Dialogue Manager
UID-fallback warnings; no engine/script/parse/leak errors were present. No warning
suppression, normal-profile access, global process kill or recursive deletion.

This is a sampled TCP endpoint and local protocol check, not a UDP audit, every
MCP command, IPv6-client compatibility, external-client penetration test, public
service clearance, or proof the earlier exposure was harmless. Original save
recovery and the full-game mission remain open. Independent review is pending.
