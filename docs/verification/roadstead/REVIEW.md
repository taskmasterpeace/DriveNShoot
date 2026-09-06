# Roadstead review and decision record

Scope: isolated `codex/america-foundation`, based on `f1290de`. Runtime frozen at `a0ff3cd` for the final broad sweep. Review acceptance is not global release certification; consult the [verification record](../AMERICA_FOUNDATION_2026-09-05.md) for test failures and remaining production gates.

## Independent review sequence

- Property authority: one fix round corrected verification of closed Windows temporary-file bytes before replacement. Re-review accepted `72f4a4e`; 67 assertions passed.
- Blender exports: one fix round replaced weak dimension assumptions with actual exported geometry checks and corrected floor-relative door clearance. Re-review accepted `1f2452d`; 44 Godot assertions and the independent Python contract passed. Parent verified real MCP schema/query/execution calls and inspected the asset images.
- Runtime: one fix round corrected physical WAIT polling through a modal. Re-review accepted `b27628c`; the runtime increased from 58 passed / 2 failed to 60 / 0, with 5 / 0 in a new process reading the actual saved checkpoint.
- Whole branch: independent review of `f1290de..f8ba565` found no Critical or Important issues and five Minor findings. One consolidated fix wave produced `a0ff3cd`. One scoped independent re-review accepted all five fixes and found no new breakage in that diff.
- Post-sweep verification follow-up: independent scoped review accepted the two-test correction `6fd82d3..ba1cab8`. No Critical/Important findings; one non-repeated cleanup diagnostic is retained. The controller resolved cross-diff source freeze with Git and independently verified both tests using the original driver and distinct actual profile roots. Historical worker profile/negative-control metadata is documented with its provenance limits in the verification record.

| Final finding | Accepted fix and evidence |
|---|---|
| Receipt-conflict test could pass for the wrong reason | Assert the historical receipt exists before rewind; require exact `receipt_conflict` and unchanged backpack/ledger |
| Objective and encounter behavior ignored data rows | Read the selected unowned parcel's ID/name/price and active job encounter flag; test changed rows and next-unowned selection |
| Failed PNG writes still returned success | Count failures, reject empty images, propagate nonzero process result; test actual GUI output with one blocked PNG path |
| Visible outer porch lacked collision support | Match the authored 9.8m plank width; walk to both outer edges using player input and verify raised floor height |
| Asset status still called completed runtime work pending | Distinguish exported geometry from independently exercised runtime collision/doorway/porch proof |

The final [fix report](task-4-report.md) retains RED/GREEN commands, output names and limitations. The [runtime report](task-3-report.md) retains its earlier implementation and modal-regression evidence. The [authority report](task-1-report.md) and [Blender report](task-2-report.md) preserve component development chronology. Raw task logs were copied byte-for-byte and SHA-256 checked against their scratch originals; historical diagnostic output and trailing whitespace were intentionally preserved.

## Rulings made, in order

1. Use an isolated worktree from committed `f1290de` to protect the original map/plugin changes. Cost: those uncommitted changes are not part of this build until deliberate integration.
2. Deliver the first ledger/runtime as local authority, not unauthenticated shared property RPCs. Cost: dedicated realms remain a separate milestone; Roadstead transactions and local checkpoint save/load are disabled while current co-op is online.
3. Use installed Blender MCP through its stdio SDK because no Blender tool was exposed to the task. Cost: machine-specific local tooling paths may need adjustment elsewhere. No user configuration change or paid provider was used.
4. Commit ledger, jobs and backpack in one verified full-run checkpoint before acknowledging a transaction. Cost: old saves rewind the entire local run; dedicated-server persistence will need a migration/adapter.
5. Pay contracts into a labeled banked Road Office fund, separate from carried scrip. Cost: transfers/withdrawals and integration into the broader economy remain unimplemented.
6. Add a bounded two-test input-dispatch follow-up after the final review when full-sweep traces show assertions outrunning queued events. Cost: extra scoped implementation/review time; tests must not mask a genuine gameplay defect. This is separate from the five closed final-review findings, and it does not certify frame-rate responsiveness.

These decisions do not authorize a merge into the original checkout, remote push, public deployment or account/service provisioning. The worktree is retained as the separate playable source build.
