# Task 5 — legacy input-dispatch verification

Archival note: the historical scratch RED outputs are now retained in [the repeat archive](focus-repeat-a0ff3cd-logs.zip); [drag](trace-drag.stdout.log) and [remote](trace-drone-remote.stdout.log) traces are adjacent. The scoped review accepted this task; see [controller verification and provenance limits](../AMERICA_FOUNDATION_2026-09-05.md). Table log paths below are relative to this report's directory; profile paths are relative to the checkout.

Date: 2026-09-05

Worktree: `D:/git/carworld/.worktrees/america-foundation`

Task base: `6fd82d3`

Reviewed runtime under test: `a0ff3cd`

## Outcome

The two failures were test-harness scheduling defects, not gameplay defects. Physical `E` events submitted with `Input.parse_input_event` are queued for Godot's process/input iteration. On the Roadstead branch's loaded headless startup, awaiting physics frames alone can resume the test before `_unhandled_input` receives the queued event.

Both owned helpers now await `get_tree().process_frame` immediately after each physical `E` edge. Physics frames still model the tap/hold duration and gameplay simulation. This waits for the engine event-delivery boundary rather than polling for the desired outcome, repeating input, or bypassing `_unhandled_input`. It matches the physical-key boundary already used by `road_life_sim.gd` for queued key state. No production code, input binding, handler, assertion, watchdog, or time-scale behavior changed.

## RED evidence and root cause

The preserved repeated-failure logs at reviewed runtime `a0ff3cd` are:

- `.superpowers/sdd/2026-09-05-america-foundation/focus-repeat-a0ff3cd/drag_sim.stdout.log`: 5 passed, 7 failed. The first meaningful failure is `TAP still OPENS the container`; hold/haul assertions then fail because the late release changes the next scenario's state.
- `.superpowers/sdd/2026-09-05-america-foundation/focus-repeat-a0ff3cd/drone_remote_sim.stdout.log`: 23 passed, 6 failed. Dock launch, split view, remote, charging, homecoming, and charge-law checks fail.

The detailed traces locate the boundary:

- `input-trace-a0ff3cd/drag_sim.stdout.log` records the first E release entering `_unhandled_input` only after `TAP still OPENS the container` had already failed and the test had called `panel.close()`. The following press/release therefore operates on the wrong tap/hold phase.
- `remote-input-trace-a0ff3cd/drone_remote_sim.stdout.log` records the dock E edges only after the dock assertions had executed.
- The traces also record FOOT/NORMAL state, no menu, no Roadstead panel, no briefing lock, and a valid current interactable. That excludes the new gameplay gates as the cause.
- Both test sources are identical to clean `f1290de`, where they pass. The branch adds enough startup/render work for the pre-existing physics-only assumption to become observable.

## Harness change

`game/proto3d/tests/drag_sim.gd`:

- `_e` still constructs a physical `KEY_E` `InputEventKey` and calls `Input.parse_input_event`.
- `_e` now awaits one process frame after queuing the event.
- Every caller awaits `_e`, so tap release, hold press/release, and drop press/release are delivered before the following assertion/simulation phase.

`game/proto3d/tests/drone_remote_sim.gd`:

- `_tap_interact` still queues physical `KEY_E` press/release events.
- It now awaits one process frame after each edge while retaining its physics frames between edges and after release.

All 12 drag assertions and all 29 drone-remote assertions are unchanged.

## Commands and GREEN results

Before testing, `Get-Process | Where-Object { $_.ProcessName -like 'Godot*' }` returned no Godot processes. Runs were sequential. Every process used a distinct task-local APPDATA directory; none used the normal profile. The generated profiles were removed after raw output was retained.

Each row used this exact command shape, with the literal profile, log, and scene values shown in the table:

```powershell
$profile = '<profile>'
$log = '<log>'
New-Item -ItemType Directory -Force $profile, (Split-Path $log) | Out-Null
$env:APPDATA = (Resolve-Path $profile).Path
& 'C:/Users/taskm/Downloads/projects/Godot/Godot_v4.5.1-stable_win64_console.exe' --headless --path game '<scene>' *> $log
$code = $LASTEXITCODE
Get-Content $log
exit $code
```

| Run | Profile | Scene | Raw log | Exit | Result |
|---|---|---|---|---:|---|
| drag 1 | `docs/verification/roadstead/task5-profiles/green-1-drag` | `res://proto3d/tests/drag_sim.tscn` | `task5-logs/green-1-drag.log` | 0 | 12 passed, 0 failed |
| remote 1 | `docs/verification/roadstead/task5-profiles/green-1-remote` | `res://proto3d/tests/drone_remote_sim.tscn` | `task5-logs/green-1-remote.log` | 0 | 29 passed, 0 failed |
| drag 2 | `docs/verification/roadstead/task5-profiles/green-2-drag` | `res://proto3d/tests/drag_sim.tscn` | `task5-logs/green-2-drag.log` | 0 | 12 passed, 0 failed |
| remote 2 | `docs/verification/roadstead/task5-profiles/green-2-remote` | `res://proto3d/tests/drone_remote_sim.tscn` | `task5-logs/green-2-remote.log` | 0 | 29 passed, 0 failed |
| drag 3 | `docs/verification/roadstead/task5-profiles/green-3-drag` | `res://proto3d/tests/drag_sim.tscn` | `task5-logs/green-3-drag.log` | 0 | 12 passed, 0 failed |
| remote 3 | `docs/verification/roadstead/task5-profiles/green-3-remote` | `res://proto3d/tests/drone_remote_sim.tscn` | `task5-logs/green-3-remote.log` | 0 | 29 passed, 0 failed |

The first drag GREEN log includes Godot's `ObjectDB instances leaked at exit` and `2 resources still in use at exit` cleanup diagnostics after the 12/12 result and exit 0. The second and third fresh drag runs did not emit them. The warning is preserved rather than filtered.

## Bounded negative controls

The controls were temporary test mutations and are absent from the final source.

1. Drag: omitted only the physical press/release for the first tap, retaining the original `TAP still OPENS the container` assertion. Command used the same invocation above with profile `task5-profiles/negative-drag`, log `task5-logs/negative-drag.log`, and scene `drag_sim.tscn`. Exit 1; 11 passed, 1 failed. The tap-open assertion was the only failure, while hold/haul/drop remained green.
2. Drone remote: omitted only the dock-launch interaction and stopped immediately after the existing `E at the dock launches the ROUTE scout` assertion to prevent intentional missing state from contaminating later sections. Command used profile `task5-profiles/negative-remote-bounded`, log `task5-logs/negative-remote-bounded.log`, and scene `drone_remote_sim.tscn`. Exit 1; 17 passed, 1 failed. The dock-launch assertion failed.

An earlier exploratory remote mutation continued after the intentionally omitted dock event; its log is retained as `task5-logs/negative-remote.log`. It recorded the expected dock-related failures, then reached a downstream nil `take_damage` call and the watchdog because the scenario intentionally lacked the launched drone. It was superseded by the bounded control above and is not acceptance evidence.

After restoring the real E events, GREEN runs 2 and 3 above reconfirmed both complete scenarios.

## Source freeze and self-review

The production freeze check was:

```powershell
git diff --exit-code a0ff3cd -- game/proto3d ':!game/proto3d/tests/drag_sim.gd' ':!game/proto3d/tests/drone_remote_sim.gd'
```

Result: exit 0, no output. `git diff --name-only a0ff3cd -- game/proto3d` listed only the two owned test files. `git diff --check` over both test files exited 0. The final diff contains only process-frame delivery waits/comments and awaited helper calls; no assertions were removed or weakened.

No whole-suite rerun, production edit, normal-profile run, push, publication, paid call, or original-checkout change was performed. Parent-owned documentation and evidence changes were not staged or reverted.

## Risks and limits

- The checks establish three consecutive clean-process passes for each affected harness, not a new whole-suite result. The archived 264-scene sweep remains the suite evidence.
- `process_frame` is the correct queued-input boundary in this harness. If Godot changes when `parse_input_event` is flushed relative to the `process_frame` signal, these tests could need an explicit test-local delivery observer; no such instrumentation is warranted by current evidence.
- The one non-repeated cleanup warning in `green-1-drag.log` remains visible for future leak triage, but it did not recur and did not affect the result or exit code.
