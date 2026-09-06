# Roadstead habitation — screenshot-led implementation contract

This is progress toward ENGINE.md §2, §5, §6 and WORLD_PILLARS.md law 6,
not a replacement for the full-game mission or the persistent-realm gate.

## Decisions

Keep the original Blender cottages and existing parcel IDs, prices, collision,
storage and local-only authority. Dress their real location, not a showcase scene.
Use an original freight shelter, reclaimed fence and utility lamp authored through
the installed Blender MCP adapter. Keep editable sources and embedded GLBs.
Ground surfaces and props in the actual terrain; preserve the 1.4 m doorway and
walking route from lane through porch into every home. A connected gravel lane
links the home fronts with the office yard and the existing road shoulder. Worn
parking markings, a covered desk and parcel boundaries communicate use at the
normal gameplay camera. Nothing should pretend to be a usable facility unless
its real interaction exists.

Lighting changes must preserve cone-based enemy culling, darkness/weather range,
room memory, and headlight mechanics. The visible cue should have a soft falloff,
not a hard screen-space triangle. Cottage lights illuminate furniture and porch
locally at night; they must not brighten the country globally or reveal enemies
through walls. These lights do not imply a completed electricity economy.

## Verification and acceptance

- Runtime checks: data placements exist in the real scene; no blockers on office
  interaction/parcel approach/door path; actual walking enters and exits homes.
- Model checks read exported binary vertices: metre scale, grounded origins,
  embedded resources, bounded triangles, separate shelter roof for cutaway.
- Rendering checks: repeat the real visual audit at 1280×720; judge office,
  home porch, interior and night plus unrelated highway/device pieces. Preserve
  baseline captures and disclose staged positions, held clock and fixture unlocks.
- Existing home, visibility, light-state, input and freight sims remain green.
- No public deployment, no fabricated MMO claims, no changes to the main checkout.

## Remaining full-game gates

The mission remains open: authenticated dedicated authority with independent
clients and recovery; connected nationwide authored content; readable complete
UI/controller flows; deeper encounters/economy/home uses; performance and soak
budgets; original/licensed content review; clean supported Windows packaging;
player testing and operational readiness. A screenshot pass closes none of these
by implication. ROADSTEAD_REALM_NEXT.md defines the next server proof explicitly.
