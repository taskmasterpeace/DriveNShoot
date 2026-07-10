# PHYSICS & COMBAT LAB — playable body, gunfeel, damage, and Spectacles proving ground

**Status:** DRAFT FOR OWNER REVIEW · **Date:** 2026-07-10

## 1. The promise

Ship a standalone, save-free test scene where the owner can personally compare three character
physics models under identical controls, then use the winning mechanics as the foundation for
DRIVN's combat, nonlethal Spectacles, visible vehicle damage, and first ConsoleNet arcade game.

This is not a replacement main scene. The lab may import real game rows and systems, but it never
loads or writes the campaign save. Experimental bodies can fall apart without destabilizing the
world, netcode, traffic, or the shipped player controller.

### Locked owner decisions

- Standalone scene with its own launcher.
- Compare controlled hybrid, active ragdoll, and full-physics character bodies by playing them.
- Grounded movement plus disciplined tactical weapon handling.
- Full sprint carries firearms at low ready.
- Dives follow movement input; stationary dives fall back to aim direction.
- Grenades are the first consumer of reusable throwable data.
- Hold to charge distance; release to throw; a tap produces a quick medium toss.
- Repeatable combat matches use nonlethal rounds.
- Driving sight uses a bounded human head: it looks through a turn, follows active mouse/right-stick
  aim within a neck limit, and naturally returns toward the road without accumulating 360° rotation.
- Sound asset overhaul is separate. This work emits stable sound-event ids but does not replace audio.
- Spectacles obey WATCH · BET · ENTER. Dogs and infected never enter pits.

## 2. Delivery slices

The work ships in four independently playable slices. A later slice cannot make an earlier slice
unplayable.

1. **L1 — Physics & Combat Lab:** body comparison, common controls, weapon radial, pistol/shotgun/
   automatic firearm/fists/grenade, nonlethal opponent, distance/LOS calibration, instrumentation.
2. **L2 — Impact Bay:** event-driven vehicle dents, directional armor, bullet marks, crash contact
   capture, damage persistence, and performance budgets.
3. **L3 — Spectacle Runtime:** reusable nonlethal bout card with watch/bet/enter modes, tournament
   brackets, payout through `ProtoBetting`, and venue-rule rows.
4. **L4 — BACKROOMS '84:** a playable lore-native ConsoleNet maze duel with fog of war, local score,
   AI opponent, tournament invitation, and Spectacle hooks.

The lab remains after graduation as a regression playground and performance benchmark.

## 3. Launch and scene boundary

- Root launcher: `PHYSICS_LAB.bat`.
- Scene: `res://proto3d/tools/physics_combat_lab.tscn`.
- Controller: `res://proto3d/tools/physics_combat_lab.gd`.
- No campaign menu, save, metaworld, calendar advancement, loot loss, wounds, or permanent deaths.
- All temporary state resets on scene restart.
- An always-visible help card names every control; a compact telemetry panel can be hidden.

The lab contains five connected stations:

1. **Body lane:** straight sprint, slalom, low doorway, stairs, waist cover, turn pads.
2. **Grip and gaze range:** stationary and moving targets at 5/10/20/30/50 m, plus a marked driving
   circle for head/vision return-to-forward tests.
3. **Dive and throw lane:** forward/lateral/backward dive markings and landing rings at 5–40 m.
4. **Nonlethal killhouse:** cover, doors, sight breaks, one configurable sparring opponent.
5. **Vehicle impact bay:** unarmored and armored rigs, ballistic wall, crash barrier, reset console.

## 4. Common input contract

Every body mode receives the same normalized command packet. Physics implementations may differ;
controls and game rules do not.

| Verb | Keyboard/mouse | Controller |
|---|---|---|
| Move | WASD | left stick |
| Aim | mouse | right stick |
| Sprint | Shift | L3 |
| Directional dive | Space | A / Cross |
| Fire / melee | LMB | RT |
| Reload | R | X / Square |
| Quick weapon cycle | tap RMB | tap RB |
| Weapon radial | hold RMB | hold RB |
| Radial selection | mouse direction | right stick |
| Charge/release throwable | G | LT |
| Interact/start round | E | Y / Triangle |
| Body mode | F1 hybrid · F2 active ragdoll · F3 full physics | lab HUD buttons |
| Reset station/body | Backspace | hold Start |
| Toggle opponent behavior | F4 | D-pad right |

### Weapon radial

- Tap the radial button to cycle the equipped loadout.
- Hold past 0.18 s to open the wheel; release equips the highlighted wedge.
- Wedges: fists/holster, pistol, automatic weapon, shotgun, throwable, plus available loadout slots.
- Mouse direction or right stick chooses a wedge. Aim input is suspended only while the wheel is open.
- Solo lab and single-player may slow to 20%; online play must remain real-time. The selector works at
  full speed so multiplayer is never dependent on time dilation.
- The backpack remains the place to configure the loadout. The wheel is selection, not inventory.

## 5. Three playable body models

### F1 — controlled physics hybrid

The production candidate. A `CharacterBody3D` owns authoritative translation and collision. The
procedural rig layers pose targets with damped springs, inertia, weapon lag, and final two-hand IK.
Impacts add bounded visual reactions without stealing control.

- Lowest input latency and easiest networking.
- Sprint uses low-ready weapon rows and readable acceleration/deceleration.
- Dive uses a directed root impulse plus staged takeoff, airborne, contact, slide, and recovery poses.
- Hands solve after torso and weapon transforms. Elbow pole targets prevent straight-arm/T-pose grips.

### F2 — active ragdoll

Torso, pelvis, head, upper/lower limbs, hands, and feet are rigid bodies joined by constrained joints.
PD-style joint motors chase the same target poses as F1. Locomotion still has a desired direction,
but balance, foot contact, recoil, collisions, and recovery are physical outcomes.

- More emergent weight and better impact reactions.
- Higher CPU cost and tuning risk.
- Grip is a physical right-hand attachment plus a spring-assisted support-hand target.
- A failed balance recovery is allowed to fall, but controls must never produce unbounded joint energy.

### F3 — full physics

The same articulated body uses forces and torques for translation, turning, diving, and getting up.
Motors are intentionally weaker and the pelvis is not teleported by a kinematic root.

- Maximum emergence and chaos.
- Expected to have the highest latency, recovery variance, and networking cost.
- Exists to let the owner feel the tradeoff, not to presume it is the production winner.

### Comparison rule

Switching modes preserves spawn point, selected weapon, aim direction, opponent setting, and station.
The telemetry panel records:

- input-to-motion latency;
- commanded versus actual speed;
- right/left hand grip error in centimeters;
- muzzle aim error in degrees;
- dive distance, airtime, landing impulse, and recovery time;
- active rigid bodies and joints;
- physics frame time, total frame time, and current FPS.

No mode may use hidden stat advantages. Speed, stamina, weapon, recoil, mass, and arena geometry are
identical inputs.

## 6. Movement, grip, dive, and throw behavior

### Running and sprinting

- Walking/running allow weapon-ready upper-body blending.
- Full sprint lowers pistols to close retention and long guns diagonally across the chest.
- Sprint has heel-to-toe cadence, pelvis/shoulder counter-rotation, planted contact beats, and speed-
  driven lean. The root never visually outruns the feet without measured slip.
- Firing exits full sprint into a short plant/raise transition. It does not fire from a low-ready pose.
- Releasing sprint blends out; it never snaps to idle or instantly erases momentum.

### Weapon grips

- Every weapon row owns right grip, left grip, muzzle, carry class, elbow-pole hints, and recoil data.
- Torso/carry pose resolves first, weapon second, arms third, hand IK last.
- Pistols default to a two-hand firing stance and close-retention sprint carry. One-handed pistol use is
  a deliberate row, not an accidental missing support grip.
- Long guns seat the stock near the firing shoulder, keep the trigger wrist aligned, and bend the
  support elbow toward its authored pole target.
- The lab displays both grip anchors and measured hand error on demand.

### Directional dive

- Movement input determines dive direction; aim direction is the stationary fallback.
- Forward, lateral, and backward dives share rules but have distinct pose targets.
- Stages: anticipation (brief), launch, airborne control lock, contact, slide/roll, recovery.
- Weapon is tucked during launch/contact. A firing pose is allowed only in explicitly tested airborne/
  prone windows, not throughout every transition.
- Collision impulses may alter landing, but the selected direction remains recognizable.

### Throwable mechanic

- Press/release quickly: medium quick toss.
- Hold: enter throw pose, show a ballistic preview, and grow normalized power to 1.0.
- Release: spawn the item at the hand/muzzle-equivalent anchor with inherited horizontal velocity.
- Distance derives from charge, character strength, item mass, and throw-row min/max speed.
- The grenade fuse begins on release in L1. Cooking is a later row flag, not implicit in charge time.
- Trajectory preview and real projectile use the same gravity, launch point, and velocity function.
- Lab grenades are nonlethal stun/score devices. Campaign grenades retain real damage.

## 7. Gunfeel foundation

### Trigger modes and automatic weapon

Weapon data gains a trigger mode (`semi`, `auto`, later `burst`) rather than inferring behavior from
cooldown. Input press fires once for semi. While held, auto requests fire at the row cadence; the
existing weapon cooldown remains the single rate gate.

L1 adds one **Scrap SMG** using existing 9 mm ammunition so the feature does not require a second
ammo economy. It has its own shape, two-hand grip, magazine, recoil, spread growth, automatic trigger
row, and effect rows. It is a real weapon row, not a lab-only hardcode.

### Muzzle flash visibility

The existing flash call stays the one entry point, but its presentation becomes weapon data:

- size, length, duration, color, light energy/range, smoke amount, and optional multi-prong shape;
- spawned at the weapon's real muzzle after grip/aim resolution;
- visible from the normal top-down camera in daylight and night;
- pooled/capped for automatic fire; no per-frame cost while idle;
- synchronized with recoil, casing, tracer, and sound-event emission on the same accepted shot.

Sound integration is events only: `fire_sfx`, mechanical tail, reload stage, dry fire, impact surface,
and optional automatic loop start/stop. No sound assets or voice identities are changed in this work.

## 8. Nonlethal sparring opponent

The opponent uses the same puppet, weapon rows, muzzle FX, projectile/raycast laws, cover collision,
and damage interface as the player, wrapped in lab-only round health.

Behavior selector:

1. **Passive:** pose/grip/impact target.
2. **Return fire:** attacks only after being hit.
3. **Hunter:** patrols, searches last-known position, uses cover, strafes, reloads, and attacks on LOS.
4. **Duel:** symmetrical first-to-three scored rounds.

Nonlethal rules:

- rounds score hits, knockdowns, ring-outs, and health depletion;
- a downed fighter respawns at their corner after a short card;
- no corpse, loot loss, campaign wound, death counter, crime, or save mutation;
- melee and martial-arts moves score under the same round controller;
- opponent accuracy, reaction delay, aggression, and weapon are data rows visible on the HUD.

## 9. Driving gaze and field-of-view station

### Diagnosed directional root cause

Driving sight currently has no independent human-head state. `_update_vision_cone()` points the cone
at the car's horizontal travel velocity above 4 m/s and otherwise at the vehicle body. It does not
consume a bounded driver gaze, mouse/right-stick look intent, a neck return spring, or a visual neck
pose. Consequently a sustained circle can make the cone continuously orbit in world space without a
readable head limit or return-to-forward behavior.

The replacement separates three directions:

1. **Vehicle forward:** the car's local `-Z`; the neutral road-facing reference.
2. **Driver gaze:** a local yaw bounded to the authored neck arc; the vision cone and visible head use
   this direction.
3. **Weapon aim:** mouse/right-stick reticle clamped by the active seat's firing arc; bullets use this
   direction before spread. It is not silently replaced by gaze.

With no active aim input, driver gaze receives a small look-through-turn target from steering/yaw
rate, clamped to roughly ±35°. It uses a critically damped shortest-angle spring and returns toward
vehicle forward as the turn settles. The local angle can never wrap or accumulate beyond the limit,
even after repeated circles.

Recent mouse/right-stick intent has priority over turn anticipation. Gaze follows that aim within a
wider authored neck limit (initial tuning ±80°). The weapon may continue to its legal seat-arc edge
when the reticle exceeds the neck limit; the head stays anatomically bounded. After 0.55 s without
meaningful aim movement, gaze blends back to the turn target and then forward. Mouse and pad use the
same normalized look-intent timestamp and yaw path.

The visible driver/rider puppet writes the local gaze to the neck/head joint. The vision cone reads
the exact same resolved gaze vector, so the model and the clear area cannot disagree. Hidden cab
drivers still run the state because gameplay sight must not depend on whether a roof occludes the
model.

### Distance and occlusion instrumentation

The lab also places targets and occluders at 5, 10, 20, 30, 50, 75, 100, 150, and 240 m. Controls
toggle day/night, dust, headlights, binoculars, camera zoom, and doors. This retains the earlier
distance investigation without conflating it with the now-diagnosed driving-direction defect.

For the target under test, the HUD shows:

- world distance and on-screen/off-screen state;
- camera projection and near/far visibility;
- vehicle-forward, resolved-gaze, and weapon-aim yaw in local degrees;
- active gaze source (`turn`, `mouse`, `right_stick`, or `returning`) and time since look input;
- cone range, half-angle, and clear radius;
- LOS-fan distance in the target direction;
- perception-fade membership and target transparency;
- whether gameplay AI considers the target visible.

The distance hypothesis remains: normal cone (100 m), binocular recon (240 m), fade candidate cutoff
(100 m), and camera framing can disagree. Instrumentation must identify that boundary before any
distance value or algorithm changes. Direction and distance receive separate regression cases.

## 10. Vehicle impact bay

### Performance decision

Do not use soft-body vehicles or continuously rewrite arbitrary mesh vertices. Cars keep their stable
`VehicleBody3D` collision hull. Damage deforms only modular visual panels, on damage events. This is
cheap while idle, deterministic, bounded, and compatible with traffic promotion.

### Contact and damage packet

Bullets and crashes produce one packet:

`{world_pos, world_normal, incoming_dir, energy, penetration, source, weapon_id}`.

- Bullets obtain it from the existing ray hit.
- Crashes obtain contact position, normal, and impulse from direct body-state contacts; the existing
  delta-velocity crash damage remains a fallback and sanity cap.
- Position/direction resolves local zone: front, rear, left, right, top, or wheel.
- Existing `take_damage(amount)` remains a compatibility wrapper for old callers.

### Directional armor and deformation

- Use the existing front/rear/side authored values instead of the current runtime front-only scalar.
- Each zone has armor resistance and optional armor durability.
- Energy below resistance: spark/scuff or shallow dent; little/no component damage.
- Energy above resistance: armor absorbs its share, remaining energy damages chassis/components and
  increases that zone's visual deformation.
- Armor panel rows have a higher deformation threshold. Heavy weapons and high-energy crashes can
  still bend or detach them after the threshold is exceeded.
- Visual panels shift inward, squash, and rotate within authored clamps. Collision does not follow
  cosmetic dents; severe vehicle handling remains represented by the existing chassis slop.

### Bullet marks and persistence

- Pool a maximum of 12–16 marks per nearby real vehicle; reuse the oldest mark.
- Marks are small surface-aligned dark indent/ring meshes or decals and never spawn on a failed hit.
- Distant ambient traffic receives no marks. A shot/impact promotes it through the existing real-car
  path before full damage presentation.
- Save zone severity, armor durability, deformation seed, and mark summary—not every transformed
  vertex. Restore regenerates the bounded look deterministically.

## 11. Spectacle Runtime

L3 generalizes the lab duel into an event row. Every card supports:

- **WATCH:** AI-versus-AI simulation with visible score, round clock, and winner.
- **BET:** honest odds and vig through `ProtoBetting`; physical scrip settlement at the venue.
- **ENTER:** player replaces one entrant under the same rules and can bet on themself.

The first combat card is nonlethal. Venue rows may later allow first-blood or lethal rules, but L3
does not introduce permanent fighter death. Cards support qualifiers, semifinals, finals, seeding,
records, purses, and an optional ConsoleNet invitation. The live event can be watched on a venue
screen; results can create radio/TV copy without requiring new media assets.

This adds a ranged **shootout/killhouse** spectacle without rewriting the existing laws for car
races, derbies, fist pits, beast pits, drone duels, or monster rallies.

## 12. BACKROOMS '84 — first ConsoleNet game

A fictional post-collapse cartridge descended from bunker-training software and bootleg arcade
boards. Two human silhouettes hunt in a maze; it is spiritually adjacent to *Combat* without copying
its assets, name, map, or presentation.

### Rules

- Top-down grid maze with compact rounds.
- Your current sight cone reveals corridors; walls stop sight.
- Explored floor becomes dim memory. Opponents are drawn only when currently visible.
- Footsteps/shot pings briefly reveal a direction, not an exact through-wall position.
- Single projectile or short nonlethal burst, reload window, round score, local high score.
- Maze rows have deterministic seeds so learning routes is real skill.
- Solo AI and local two-player are supported by the same command packet.

### World integration

- Launches from a safehouse/arcade console through a dedicated game panel, not a fake video.
- Local performance can generate a ConsoleNet tournament invitation.
- Tournament rows carry site, fee, purse, rules, leaderboard seed, faction sponsor, and trap chance.
- At live events the player may continue, abandon the cabinet, fight an ambush, or escape—the existing
  lore rule that comfort can be bait.
- Results may grant scrip, a title, respect, and broadcast copy.

## 13. Data spine

Expected additive rows:

- weapon trigger/muzzle/grip/carry fields in weapon content;
- `data/throwables.json`;
- `data/lab_opponents.json`;
- `data/physics_profiles.json`;
- vehicle damage/armor/deformation fields in vehicle rows;
- `data/spectacles.json` for event cards and venue rules;
- `data/arcade_games.json` plus deterministic BACKROOMS '84 maze rows.

Unknown fields remain forward-compatible. Code floors provide safe defaults so existing rows behave
exactly as before until given new fields.

## 14. Verification and acceptance

Each slice lands with a real-path sim and a hands-on card.

### L1 sims

- `physics_lab_sim`: standalone boot, save isolation, all stations and mode switching.
- `body_compare_sim`: identical command packet/stat inputs across F1/F2/F3; finite joints/velocities.
- `weapon_radial_sim`: tap-cycle, hold-select-release, mouse/pad parity, panel input suppression.
- `automatic_fire_sim`: hold cadence, ammo use, cooldown gate, release stop, reload block.
- `muzzle_visibility_sim`: accepted shots create correctly anchored/capped flash instances.
- `sparring_sim`: passive/return-fire/hunter/duel, nonlethal reset, score, no campaign death.
- `throw_charge_sim`: shared preview/launch math, charge-distance ordering, mass/strength effects.
- `drive_gaze_sim`: turn anticipation is bounded, repeated circles never accumulate head yaw, aim
  temporarily owns gaze, weapon aim stays independent, and idle/released steering returns gaze forward.
- `fov_distance_sim`: marked-distance telemetry agrees with cone, fade, LOS, and camera after the
  reproduced root cause is fixed.

### L2 sims

- `vehicle_contact_sim`: front/rear/side contact packets and energy bounds.
- `directional_armor_sim`: same hit behaves differently by face and armor strength.
- `vehicle_deform_sim`: bounded event-driven panel state, mark cap/pool, snapshot round trip.
- Existing vehicle, traffic, gunfeel, save, traction, and motorcycle sims remain green.

### L3/L4 sims

- `combat_spectacle_sim`: watch/bet/enter, bracket, payout, nonlethal fighter reset.
- `arcade_maze_sim`: wall LOS, memory, hidden enemy, deterministic maze, score/invitation.
- `tournament_trap_sim`: invitation to live venue and interruptible cabinet flow.

### Hands-on acceptance

The owner can launch one batch file, switch among all three bodies without restarting, feel and see
the same sprint/grip/dive/throw/gun tests, fight a repeatable opponent, diagnose visibility by marked
distance, shoot/crash armored vehicles and see bounded damage, and leave with telemetry plus a clear
favorite body mode. Later slices let the same combat become a watchable/bettable/enterable event and
make BACKROOMS '84 playable from a world console.

## 15. Explicit non-goals

- No full campaign migration to active ragdoll until the owner chooses a lab winner.
- No soft-body vehicles.
- No sound-library overhaul or voice changes.
- No permanent death in the first shootout Spectacle.
- No dogs or infected in pits.
- No main-game FOV value change before reproduction and a failing test.
- No copied Atari assets, maps, names, or code.
