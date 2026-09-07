# LASTLINE review fixes — scoped re-review approved

The fixes are committed locally as `64e2054`, following the `7c93002` candidate.
The independent review found three Important defects. Covering checks and both
physical journeys now have passing evidence; the scoped re-review approved all
three fixes with no new Critical/Important breakage at `64e2054`.
An additional westbound timing failure remains unresolved, not erased by its
later passing repeat. Helicopters and the larger game are not complete.

All linked raw records below are byte-identical copies of the original completed
isolated runner output. Each result records its own source hashes. Different
candidate runs are not interchangeable proof of one final source revision.

The sections below preserve the investigation in order; the latest complete
source/visual audit is at the end. Earlier statements of pending checks describe
their historical checkpoint, not the current covering-run status.

| Check | Observed result | Evidence |
| --- | --- | --- |
| Real passenger death, denied R checkpoint, original implementation | 12/4. R revived and moved the player, charged the death toll, but left an aboard ticket and disabled passenger physics. | [Death RED](../renders/transit-coach-2026-09-07/fix-death-original-red/stdout.log), [result](../renders/transit-coach-2026-09-07/fix-death-original-red/result.json) |
| Initial retained-body reverse boarding fixture | 13/0. Actual reserve/board/departure succeeded; the predicted freed-object crash did **not** reproduce. Destination checkpoint placement is an explicit lifecycle fixture, not a completed journey. | [Initial reboard](../renders/transit-coach-2026-09-07/fix-reboard-initial-green/stdout.log) |
| Precise retained-driver lifetime assertion | 13/1. The body still referenced its valid queued-for-deletion driver before deferred free. This engine compares the later freed reference equal to null, explaining why the anticipated dereference did not occur in the fixture. | [Ownership RED](../renders/transit-coach-2026-09-07/fix-driver-detach-red/stdout.log) |
| Independent door radius and real interact | 61/5 overall. Door2.99m/counter4.84m was rejected; actual E at door2.84m/counter4.65m left the panel closed. Three additional emergency assertions also failed and are not attributed to this radius defect. | [Door RED](../renders/transit-coach-2026-09-07/fix-door-radius-red/stdout.log) |
| First corrected-radius safety pass | Still61/5 overall, with the door checks passing. Emergency bus was still moving9.63m/s with the driver running at the expired observation deadline. | [Parking RED](../renders/transit-coach-2026-09-07/fix-parking-missed-red/stdout.log) |
| Physics-clock parking diagnostic | Still61/5.40.267wall seconds versus34.9physics seconds/2094ticks; bus still0.56769m/s with driver running. This interval begins before the100m approach, **not** at damage. Further phase-specific attribution is required. | [Timed parking RED](../renders/transit-coach-2026-09-07/fix-parking-timed-red/stdout.log) |
| First death-fix character equality diagnostic | 33/1. Only hunger differed91.68556→91.66067 under the existing live-world2.8/game-hour hunger cadence. Respawn-owned fields, wallet, ticket and ownership stayed unchanged. | [Hunger attribution](../renders/transit-coach-2026-09-07/fix-death-hunger-red/stdout.log) |
| Focused death fix, cadence-aware expectations | 36/0,exit0,19.753s,stderr0. Real R covers ordinary/clone wake, denied disk publication, foot movement, once-only toll/refund/death count and reload replacement. | [Death GREEN](../renders/transit-coach-2026-09-07/fix-death-first-green/stdout.log), [result](../renders/transit-coach-2026-09-07/fix-death-first-green/result.json) |

The controller personally checked the last run's raw log and result:355
before/after/current closure hashes matched at inspection, with both profile
directories inside that run's worktree build directory. This is focused death
evidence, not a pass for the still-failing parking suite.

## Named braking investigation

Current source inspection found `ProtoCar3D._physics_process()` returns early for
a dead body after assigning the ordinary3.0 parking brake. The public driver's
stronger pedal/handbrake inputs therefore do not reach their normal active
processing path once the coach dies. The focused
[effective-brake RED](../renders/transit-coach-2026-09-07/fix-effective-brake-red/stdout.log)
reports14/1: all four wheels contact ground, input_brake0.7/max_brake220, but
actual body and wheel brakes stay3.0. The100m approach took16.853wall seconds;
post-damage stopping took20.507wall/20.533physics seconds. The approved correction
is an identical-default base hook with a dead, owned offline LASTLINE override,
using its existing brake row and wheel physics. It is still in verification.
The [first corrected-brake attempt](../renders/transit-coach-2026-09-07/fix-brake-edge-red/stdout.log)
remains6/2: an early brake sample and a multi-frame input-edge expectation need
attribution. Neither result is accepted as a complete safety pass.
No increased time limit, changed stationarity tolerance, velocity overwrite or
suppressed collision is authorized. The old successful runs do not resolve
this confirmed control-path concern.

## Evidence debts retained

The earlier candidate's ObjectDB/resource warnings and the unlogged conjuncts
in its51/7 safety run remain unresolved. Current clone-ritual coverage also
reports15/0 with240bytes of [shutdown diagnostics](../renders/transit-coach-2026-09-07/fix-clone-warning/stderr.log);
it is not pristine. The [focused verbose output](../renders/transit-coach-2026-09-07/fix-clone-warning-verbose/stdout.log)
and [diagnostics](../renders/transit-coach-2026-09-07/fix-clone-warning-verbose/stderr.log)
identify an unparented round-trip probe Node retaining cloning.gd. Cleanup of
that owned test probe is approved; normal clean confirmation is still pending.
This does not identify the different historical safety warnings. Final visual
capture and independent scoped review are also pending.

## Corrected braking and safety checkpoint

The actual-input delivery guard caught a buffered-event false positive in
[RED17/1](../renders/transit-coach-2026-09-07/fix-input-buffer-red/stdout.log).
Dispatching those real parsed events with `Input.flush_buffered_events()` now
proves false→true→false handler acknowledgement at the measured rolling edge;
no production input settings changed.

- [Focused emergency GREEN18/0](../renders/transit-coach-2026-09-07/fix-candidate-emergency/stdout.log):
  exit0,25.681s wall,stderr0. Real body/all four contacting wheels brake100.1,
  propulsion0. Both E edges arrive at0.41942m/s with driver running and produce
  no exit/refund. Post-hit parking takes2.0833physics seconds, after which the
  ordinary3.0 idle brake returns. Refund publishes at0.002899m/s/driver stopped;
  actual foot save, denied-write retry and0.2m wreck-drift bound pass.
- [Expanded safety GREEN70/0](../renders/transit-coach-2026-09-07/fix-candidate-safety/stdout.log):
  covers the original safety path plus door-boundary and brake/input/publication
  guards. Recorded runtime50.954s with empty stderr. All earlier parking REDs
  remain linked above; this pass includes a real braking correction.
- [Clone cleanup GREEN16/0](../renders/transit-coach-2026-09-07/fix-clone-cleanup-green/stdout.log):
  exit0,8.942s wall,stderr0. The detached probe is explicitly freed; the main
  cloning system remains valid. This only closes that identified test leak.

The controller personally verified the emergency run's355 before/after/current
closure hashes, isolated profile paths and raw edge/publication telemetry.
These are candidate source checkpoints. Full journeys, all covering cases and
independent review are still required before Task3 closes.

## Committed fix-source covering audit

The controller directly checked all13 completed run results, environment records
and source hashes. Each run's before/after hashes and environment snapshot agree;
every APPDATA and LOCALAPPDATA path is inside that run's fresh worktree build
directory. All production hashes match `64e2054`. Relevant earlier coach runs
have exactly one current-file difference: the final test-only journey phase/time
logging change. It adds no awaits, acceptance changes or production behavior.
Other covering scenes and the final west repeat match their entire recorded
closure. No engine was rerun for this audit.

| Check | Passed / failed | Wall seconds | Raw output |
| --- | ---: | ---: | --- |
| Emergency physical braking | 18 / 0 | 25.681 | [Emergency](../renders/transit-coach-2026-09-07/fix-candidate-emergency/stdout.log) |
| Expanded coach safety | 70 / 0 | 50.954 | [Safety](../renders/transit-coach-2026-09-07/fix-candidate-safety/stdout.log) |
| Passenger death / real R / retry | 36 / 0 | 19.688 | [Death](../renders/transit-coach-2026-09-07/fix-final-death/stdout.log) |
| Retained coach / reverse real boarding | 15 / 0 east; 15 / 0 west | 28.591; 24.963 | [East lifecycle](../renders/transit-coach-2026-09-07/fix-final-reboard-east/stdout.log), [west lifecycle](../renders/transit-coach-2026-09-07/fix-final-reboard-west/stdout.log) |
| Atomic ticket lifecycle | 115 / 0 | 8.759 | [Tickets](../renders/transit-coach-2026-09-07/fix-final-ticket/stdout.log) |
| Vehicle / ordinary brake defaults | 113 / 0 | 28.269 | [Vehicles](../renders/transit-coach-2026-09-07/fix-final-vehicle/stdout.log) |
| Existing road-life path | 71 / 0 | 37.181 | [Road life](../renders/transit-coach-2026-09-07/fix-final-road-life/stdout.log) |
| Clone ritual / fever | 16 / 0; 7 / 0 | 8.942; 4.673 | [Ritual](../renders/transit-coach-2026-09-07/fix-clone-cleanup-green/stdout.log), [fever](../renders/transit-coach-2026-09-07/fix-final-clone-fever/stdout.log) |
| Full eastbound journey | 36 / 0 | 140.215 | [East travel](../renders/transit-coach-2026-09-07/fix-final-east/stdout.log) |
| First final-source west journey — retained failure | 25 / 2 | 175.596 | [West timing RED](../renders/transit-coach-2026-09-07/fix-west-timing-red/stdout.log) |
| One authorized west repeat, extra test logging only | 37 / 0 | 161.032 | [West travel and phase timing](../renders/transit-coach-2026-09-07/fix-final-west/stdout.log) |

The12 passing rows/runs total549 assertions; the separate25/2 run is excluded
from that total and stays failed. All13 have empty stderr and no process
timeout; the failed run exits1, all selected passing runs exit0. Historical
safety shutdown diagnostics remain unattributed. Only the separately traced
clone test probe leak has a verified cleanup.

### Return-trip timing: what was and was not proved

The first west run expired its150s journey observation while still turning into
the terminal. It physically parked during later helper frames, but the fixture's
deliberately denied writer remained denied: **ticket completion and foot exit
did not occur**. Its last image is explicitly
[FAILED before arrival](../renders/transit-coach-2026-09-07/fix-west-timing-red/04_FAILED_before_arrival.png).

The bounded repeat retained the same production, route,150s observation,
165s scene watchdog and180s process cap. New test-only phase logging records:

| Existing journey edge | Wall seconds | Physics seconds |
| --- | ---: | ---: |
| Actual departure | 2.619 | 2.650 |
| First road segment | 25.887 | 25.583 |
| Destination apron | 111.344 | 107.000 |
| Driver arrival flag, body still settling | 138.069 | 132.767 |
| Safe denied-write observation, speed0.0382m/s | 138.652 | 133.350 |
| Actual ticket-none / FOOT outcome | 139.232 | 133.850 |

The arrival flag alone is not stationary egress evidence: at that flag the body
was still settling at1.315m/s and the rider remained aboard. Subsequent gates
prove safe retry, blocked-exit refusal, real exit and destination checkpoint.
The passing run shows roughly5.38s wall/physics divergence by foot exit; the
failed run lacked these phase clocks. Neither logging nor the later pass proves
the earlier miss was fixed, or attributes it to hardware load. This residual
timing variability remains a reliability concern for downstream final review.

## Controller visual judgement

The controller personally inspected all16 current-production PNGs: six east,
four failed west, six passing west. They are unedited engine viewport captures;
the120 newly archived raw records/images across26 fix folders are SHA-256
identical to their source output. Older committed candidate archives are not
substituted for these fix-source views.

- [Ticket board](../renders/transit-coach-2026-09-07/fix-final-west/01_ticket_board.png):
  readable bounded fare, refund, controls and unavailable-flight copy.
- [Seated passenger](../renders/transit-coach-2026-09-07/fix-final-west/02_boarded.png)
  and [real west travel](../renders/transit-coach-2026-09-07/fix-final-west/03_journey.png):
  physical original bus and passenger cutaway are visible. No visible operator
  is present; the right-status HUD runs off-screen. Both are assigned Task6.
- [West arrival](../renders/transit-coach-2026-09-07/fix-final-west/04_arrival.png)
  and [east arrival](../renders/transit-coach-2026-09-07/fix-final-east/04_arrival.png):
  the full coach body is on constructed apron and the real exit is clear.
  Parking is safe but not visually precise: west7.07°/1.28m, east5.45°/1.21m.
- [Mask-off diagnostic](../renders/transit-coach-2026-09-07/fix-final-west/diagnostic_arrival_mask_off_NOT_journey_evidence.png)
  removes the conspicuous daytime wedges. This changed render state is not
  journey evidence; its visual cause still requires proper attribution.
- [Meridian night](../renders/transit-coach-2026-09-07/fix-final-west/05_terminal_night_POST_journey_fixture.png)
  and [Richmond night](../renders/transit-coach-2026-09-07/fix-final-east/05_terminal_night_POST_journey_fixture.png)
  are explicitly20:00 post-journey fixtures, not claims of night travel. The sign
  is lit more clearly than the boarding area and bus. Task6 owns practical
  boarding/cabin lighting and the purple emoji replacement.

The sparse box-like buildings, repetitive terrain, wide empty aprons and missing
street dressing still look like a prototype. Successful trip assertions do not
make this art release-quality. Persistent, purposeful interiors and regional
encounters remain planned follow-through, not delivered content.

## Independent scoped disposition

The separate read-only re-review accepted passenger-death checkpoint/ownership,
identity-guarded driver detachment and the independent door radius/shared-panel
accessibility. It also found no new blocking defect in the narrow dead-coach
brake hook or attributed clone fixture cleanup. No test rerun or full-branch
review is implied. Task3's functional dependency gate is closed at `64e2054`;
physical KESTREL implementation is now Task4.

The reviewer retains all timing, historical-warning and visual concerns above.
A named streaming risk check found this corridor is supported by the existing
permanent12km ground slab, so a proposed falling-bus failure after distant
respawn was not established here. Aircraft and future national services still
need real nearby scenery/collision after the local passenger wakes elsewhere;
Task4 now owns bounded physical-service interest, reused by later host travel.
