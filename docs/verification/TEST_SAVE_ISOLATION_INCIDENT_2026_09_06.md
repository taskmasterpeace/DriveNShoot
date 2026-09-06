# Regression test save-isolation incident — 2026-09-06

## Confirmed impact

An agent ran `road_life_sim` without the required isolated `APPDATA` and
`LOCALAPPDATA`. Its real transactions wrote to the existing normal player file
`%APPDATA%/Godot/app_userdata/DRIVN/drivn.save`. This is an unintended test write,
not an authorized player-save migration. Passing assertions do not make it safe.

The normal `drivn.save` existed since July 7. Its September 6 08:57:50 UTC write
falls inside the retained non-isolated test window (08:57:31–08:57:53 UTC).
`road_restart.save` was also written at 08:57:42 UTC; it was created at 08:22:55
UTC during the earlier unlogged regression gate. The original pre-test playthrough
contents are unknown and have not been reconstructed. Do not substitute a known
test-profile save and call that recovery.

## Cause and containment

`road_life_sim.gd` compared `user://drivn.save` before/after initial scene boot,
but then exercised real freight/deed/storage transactions using that same path.
It did not restore the prior contents. The operator omitted the externally
required profile isolation; the harness did not refuse that unsafe invocation.

The normal save location is no longer used for verification. Replacement component
checks ran under explicit fresh isolated `APPDATA` and `LOCALAPPDATA`, with exact
environment/command records retained under `build/realm-purchase-task2-fix1/`.
Those 241 passing assertions do not undo this incident.

Exact copies of the two affected current files were preserved, without editing
their originals, under ignored workspace evidence:
`build/save-isolation-incident-f257d9f30f1a4eff8e8c987816a44cf4/`.
Source/copy SHA-256 matches were checked. No save contents or credentials are
published in this report.

## Recovery status: unresolved

- No pre-test backup was found in the affected directory or the project-local
  save-file inventory. Other discovered project copies are known disposable test
  profiles, not verified copies of the user's playthrough.
- No per-user Windows File History configuration directory was present at the
  checked default location.
- The read-only shadow-copy inventory failed; the native `vssadmin` fallback
  required administrator privileges and was denied. No privilege workaround,
  restoration, deletion, or replacement of the normal save was attempted.
- A verified pre-test backup or administrator-authorized recovery investigation
  is still needed to establish whether the original playthrough is recoverable.

## Required prevention gate

Before the real scene or save is accessed, the road-life harness must refuse a
user-data directory outside this checkout's designated `build/` or
`.superpowers/sdd/` test roots. Add a persistent process-level regression: an
owned normal-like profile outside those roots must fail closed with an unchanged
save sentinel; a fresh allowed profile must complete the existing real-input
road-life checks. Test the unsafe original behavior only against a disposable
sentinel, never the actual player profile. All import/runtime commands must still
explicitly isolate both profile environment variables.

This prevention gate and final milestone review remain pending at this report's
creation. The full-game goal and release gates remain open.
