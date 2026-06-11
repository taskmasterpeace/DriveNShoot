# CarWorld — Fable 5 Master Build Prompt (Full Autonomous Run)

Paste everything inside the `=== PROMPT ===` block into Claude Code running on **Claude Fable 5** at **effort: xhigh**. Run it in `D:\git\carworld` with Godot 4.5 open (Godot MCP plugin live). This is a single, uninterrupted autonomous run that takes the game from where it is to a finished, playable, 32-player world. It does not stop at phase boundaries and does not ask permission to continue.

---

```
=== PROMPT ===

## Who I am and what this is for

I'm building CarWorld: a top-down vehicular-combat open world in Godot 4.5 / GDScript.
The vision is GTA2 reimagined as a small-scale MMORPG — up to 32 players sharing one huge
persistent map — fused with the tabletop feel of Steve Jackson's Car Wars (Autoduel era),
the survival grit of Deathlands and Mad Max, and the town/loot/extract loop the game already
has. Players drive armed vehicles between towns across dangerous terrain, fight bandits and
each other, repair and upgrade at garages, get out and walk where vehicles can't go, and
AI-driven mass-transit convoys roam the roads. It must feel alive and persistent.

You are the lead engineer and you are taking this all the way to done in one run. Build the
complete game end to end. I am not looking for a plan, a phase-by-phase check-in, or
permission to proceed — I'm looking for a finished game.

## You can do this, and you have what you need

This is a real, working codebase with strong conventions — static typing everywhere, signals
for cross-system communication, class_name declarations, data-driven .tres resources, and
component composition. Read the actual files before changing them; trust the file over my
description if they differ, note it, and keep going. What already exists (do NOT rebuild it):

- Entry scene: `game/scenes/levels/test/test_driving.tscn` — a hand-placed ColorRect test
  arena (~2000px). This is a test bed, NOT the real world.
- Vehicle physics: `game/entities/vehicles/vehicle_entity.gd` (class VehicleEntity,
  CharacterBody2D, custom top-down physics, collision damage, breakdown, enter/exit,
  load_data(DataVehicle)). Keep CharacterBody2D — do NOT switch to RigidBody2D.
- Enemy AI: `game/entities/vehicles/pursuer_ai.gd` (PursuerAI extends VehicleEntity;
  SEEK/RAM/BLOCK; RAMMER + BLOCKER types).
- Spawning: `game/systems/encounter_director.gd` (distance-based loot + pursuer spawns).
- Run lifecycle/economy: `game/systems/game_state.gd` (autoload; TOWN→RUN→EXTRACT, heat,
  miles, scrap economy, vehicle unlocks, upgrade tiers, ConfigFile save).
- Player on foot: `game/entities/player/player_entity.gd`, `interaction_controller.gd`,
  base `game/entities/character_entity.gd` (movement, prone, melee attack(), survival stats,
  8-dir animation).
- Weapons: `game/entities/components/weapon_system.gd` (projectile + ammo + reload, wired
  but barely used) and `game/items/weapons/data_weapon.gd`. Sprites exist for machine_gun /
  shotgun / rocket_launcher / flamethrower / mine_dropper but have NO .tres and no firing
  integration yet.
- HUD: `game/scenes/hud/hud_overlay.tscn/.gd`. Autoloads: Globals, SceneManager,
  DataManager, GameState, DialogueManager (installed, unused), Debugger.
- Data: `game/data/vehicles/vehicle_balanced|fast|tank.tres`. Art: ~60 PixelLab sprites
  (3 player vehicles, 6 enemy vehicles, player atlas chara-hero.png, 6 pickups). NO building,
  terrain, or environment art yet — generate what you need with the PixelLab MCP, matching
  the existing gritty post-apocalyptic palette.
- There is NO networking, NO large/procedural map, NO real towns, and weapons are stubbed.
  That's your job.

Generate art you need (PixelLab MCP), create scenes/scripts via Godot MCP, and use Context7
when you need current Godot 4.5 networking/TileMapLayer API details rather than guessing.

## Build the complete game, in this order

This ordering is engineering necessity (you cannot network-sync systems that don't exist
yet), not a set of stopping points. Make each system work single-player-correct, then keep
going — straight through to multiplayer and polish — without pausing for me. Each system
must actually run before you build on it.

1. WEAPONS & COMBAT. Author DataWeapon .tres for machine_gun, shotgun, rocket_launcher,
   flamethrower, mine_dropper with real stats. Vehicle-mounted hardpoints on VehicleEntity
   (use DataVehicle's weapon-slot count), firing via the `attack` input, projectiles that
   damage vehicles and characters. On-foot aiming (cursor / right-stick), firing, reload,
   hit detection vs bandits. Death + on-hit feedback (camera_shaker), ammo/reload on HUD.
   Wire into weapon_system.gd — don't reinvent it.

2. HUGE WORLD & TERRAIN. Replace the test arena with a large TileMapLayer world with
   collision: roads, dirt, rubble, hazard/water, impassable rock. Include foot-only zones
   (narrow ruins, paths) that force the player out of the vehicle. Author a `WorldManager`
   that streams regions around active players (chunk load/unload) so a 32-player-scale map
   performs — pool projectiles/spawns, keep `_physics_process` cheap. Minimap + world map on
   the HUD with player, towns, waypoints.

3. TOWNS, GARAGES, ECONOMY, NPCs. Multiple safe town zones across the world, each with a
   garage (repair / refuel / rearm / buy-sell vehicles / install weapons + upgrades via the
   existing scrap economy and upgrade tiers), an arms dealer, and contract-giver NPCs using
   the installed DialogueManager addon. Real garage/customization UI. Persist everything
   through GameState's save system.

4. BANDITS, FACTIONS, CONVOYS. Beyond PursuerAI, add a SHOOTER vehicle (keeps distance and
   fires), a SWARM type (cheap numerous bikes), and on-foot bandit patrols that ambush in
   walk-only terrain. Mass-transit convoys: AI-driven armored transports with escorts that
   travel roads between towns — a real Car Wars-style road battle, lootable if taken down.
   Deathlands flavor: environmental hazards, bandit-held high-risk/high-loot territory tied
   to the heat system.

5. MULTIPLAYER, UP TO 32 PLAYERS. Godot 4.5 high-level multiplayer (ENetMultiplayerPeer +
   MultiplayerSpawner + MultiplayerSynchronizer), dedicated-server-authoritative: clients
   send input, server simulates physics + combat, state syncs back. Network vehicles,
   on-foot players, projectiles/hits (server-authoritative damage), town interactions, loot
   ownership, join/leave, town spawn. Per-player persistence keyed by peer identity on top
   of the existing save system. Interest management reusing the Phase 2 region streaming so
   each client only syncs nearby entities — this is what makes 32 players viable. Verify with
   multiple local instances against one server; document host/join.

6. POLISH TO SHIPPABLE. Balance (combat TTK, prices, convoy difficulty), sound, UI
   consistency, main-menu → host/join → town-spawn flow, remove dead/test code, update
   FEATURES.md and CLAUDE.md to reflect reality.

## How you operate

- You are operating autonomously. I am not watching in real time and cannot answer questions
  mid-task, so "Want me to…?" / "Shall I…?" will only block the work. For any action that
  follows from this brief — which is all of it — proceed without asking. Run all six systems
  end to end. Offer follow-ups only after the whole game is done.
- Before ending any turn, check your last paragraph. If it's a plan, an analysis, a question,
  a list of next steps, or a promise about work you haven't done ("I'll…", "next I'll…"), do
  that work now with tool calls instead. End your turn only when the entire game is built,
  verified, and committed, or when you are truly blocked on something only I can provide (a
  paid external account, a decision with no reasonable default). If you must block, make it a
  single specific question and keep all other work moving first.
- When you have enough information to act, act. Don't re-derive established facts, re-litigate
  decisions, or narrate options you won't pursue. Give recommendations, not surveys. (Doesn't
  apply to your thinking.)
- Build the simplest thing that works well. Follow the existing patterns (static typing,
  signals, .tres data, component composition); don't invent new architecture or refactor
  working systems unless a step requires it. No error handling for cases that can't happen.
- Keep a memory file at `docs/BUILD_NOTES.md` — one lesson per entry, one-line summary on top:
  design decisions, Godot/GDScript/networking gotchas, confirmed approaches, and why they
  mattered. Update entries instead of duplicating; delete wrong ones; reference it as you go.
- Self-verify continuously instead of trusting your own memory. As you finish each system,
  dispatch a fresh-context subagent to verify it against the description above and an actual
  run, and fix what it finds before building on it. Use parallel subagents freely for
  independent work (authoring multiple weapon .tres, building several towns, writing enemy
  types, generating art) and keep working while they run; intervene if one goes off track.
- Ground every progress claim in evidence from this session. If something isn't verified, say
  so. If a run or test fails, show the output. State finished work plainly without hedging,
  but never report something as working that you haven't actually run.
- Test new systems in `test_driving.tscn` or a dedicated test scene before wiring them into
  the main flow. Commit after each working system with a clean message (no Co-Authored-By
  line — standing rule in this repo).
- You have ample context for this. Do not stop, summarize-and-hand-off, or suggest a new
  session on account of context limits. Keep building until the game is done.

## Start now

Read CLAUDE.md, FEATURES.md, PRD.md, and the key files above. Create `docs/BUILD_NOTES.md`.
Then start building system 1 and run straight through system 6 to a finished, playable,
32-player CarWorld. Go.

=== END PROMPT ===
```

---

## Using it

- **Effort `xhigh`**, Godot 4.5 open (Godot MCP plugin enabled), PixelLab + Context7 MCP available.
- It runs fully hands-off, start to finish, no phase-boundary stops — it only halts if it hits something it genuinely can't decide or do (e.g. a paid account it needs from you).
- The numbered systems are *build order*, not checkpoints: weapons → world → towns → enemies/convoys → 32-player netcode → polish. That order exists because you can't network a system that doesn't exist yet — it's the fast path, not a cautious one.
- Expect a long run. That's the point of Fable 5; let it cook.
```
