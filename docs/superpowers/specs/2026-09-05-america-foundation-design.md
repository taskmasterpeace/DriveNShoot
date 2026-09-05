# America Foundation — approved direction and first playable contract

Owner approved persistent MMO realms, a connected-country / road-job / home-ownership milestone, autonomous decisions, items, enemies, polish, and Blender MCP authoring. This is the first foundation milestone, not an assertion that a production MMO or the entire country is complete.

## Product

Preserve the top-down Godot 4.5.1 game and its compressed contiguous United States. First playable loop: take a freight job, travel to a real destination, earn a reward once, purchase an addressed home, store possessions, grant a guest access, leave and return. Durable authority must eventually live on a dedicated realm, never in a client's assertion of ownership or balance. Keep the existing single-player / co-op path usable.

## Isolation and scope

Work only in `D:/git/carworld/.worktrees/america-foundation`, branch `codex/america-foundation`, starting at f1290de. The parent checkout has user-owned edits to usmap.json, project.godot, and an untracked addon; leave all untouched. No publication, shared-branch push, paid generation, cloud provisioning, or deletion of user assets. No quality scores or capacity claims without measurement.

## Property authority

A small typed ledger owns accounts, integer scrip balances, immutable parcel IDs, purchase ownership, guest access, bounded item storage, and successful request receipts. One server-side command path performs validation and durable commit before acknowledging success. A parcel cannot have two owners. Repeating a successful request cannot charge or reward twice; reusing its ID for a different payload is rejected. Invalid account, parcel, item, quantity, owner permission, insufficient funds, malformed saves, and failed persistence are explicit failures, not silent resets. Tests use separate temporary save paths; player saves remain untouched.

The first ledger is a reusable authority component, not authentication or an internet service. Network binding and stable account authentication require a separate tested adapter; do not expose an untrusted arbitrary-account command endpoint and call it secure multiplayer.

## Runtime and content

New content is data rows. Connect through a small RoadLife component attached to the real main scene; do not rewrite the large world stream or existing homebase. A discoverable road-job board and parcel plaques use the shared interact action, readable prompts, mouse/keyboard and controller focus. A visible objective leads the player to the first job and then the first home. Rewards require actual destination proximity and active cargo, not a clicked debug button. New items have meaningful roles in freight, repairs, or household storage. Encounters must use existing Damageable / actor systems and leave real rewards; no isolated fake arena presented as country integration.

## Blender MCP asset contract

Create original stylized, weathered American roadside assets using the installed Blender MCP server and addon. Do not use paid remote providers. Preserve saved scenes: use a separate factory-startup Blender session and new output files. Commit procedural authorship scripts and export portable GLBs. Cottage footprint 10m X by 8m Z; Godot +Z is the front, origin at ground center, meters 1:1. Separate mesh node names beginning `Roof` support runtime cutaway. Door opening centered on the front, 1.3m wide by 2.2m high. Porch extends to Z=6m. Keep visual geometry separate from gameplay collision. Additional assets: parcel mailbox/plaque, freight kiosk, secured delivery crate. No purple. Roof, walls, windows, steps, weathering, exposed framing, porch furniture, and signage should read from the real top-down camera.

## Verification

Property assertions cover two buyers competing, replayed requests, restart persistence, revoked guests, storage conservation, and failed saves. Runtime tests exercise real inputs / interact paths; staging positions is allowed solely to arrange the scenario. Blender exports are inspected in Blender and Godot; collision and cutaway are tested in Godot. Report exactly which acceptance criteria passed and which remain. A small multiplayer test is not MMO-scale proof.

## Longer production work remains

All-town road certification, countrywide art/content rollout, persistent authenticated network realms, interest management, encounters and progression depth, accessibility, performance budgets, real load testing, moderation, backup recovery, and Windows release packaging remain explicit milestones. No milestone is complete because its plan exists.
