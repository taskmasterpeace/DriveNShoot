# NEXT SESSION PLAN — MCP bridge, the Game Deck, the rules, the GPS

**Written:** 2026-07-15 (handoff) · **Branch:** `codex/specticles-games` (== main, tree clean)
**Author's note:** this is the "what we're gonna do next" doc. Step 1 (the MCP bridge) is a
setup YOU do on your machine before the next session boots — everything after it is my lane.

---

## 0. THE PLAN IN ONE BREATH

1. **Connect the Godot AI MCP bridge** so I can *see and touch the live editor* (my one blind spot).
2. **Turn on the Game Deck** — the 22-game portable system that's built + sim-green but has no door.
   Give it a door, then actually PLAY it on-screen (perfect first use of the bridge — I watch it run).
3. **Fix "the rules"** — needs a 30-second scope from you first (which rules — see §3).
4. **Double-check the GPS** — verify the device + map render and work.
5. Carry-overs: the Meridian-edge fall-through bug (§5) and the parked AI dev-lab arc (§6).

---

## 1. CONNECT GODOT AI (the MCP bridge) — DO THIS FIRST

This is the free, open-source route (`hi-godot/godot-ai`): an MCP server that exposes the **live
Godot editor** (~120 operations / ~43 tools — build scenes, edit nodes, wire signals, materials,
run the scene, read errors back) to **me** in Claude Code. I keep all my context (memory, git
discipline, the forge toolchain, the sim workflow) and just gain editor eyes and hands. No second
agent, no auto-approve gambling on the repo.

**Prereqs (already met, we'll confirm):** Godot 4.5.1 ✓ · `uv` present (uvx already runs
blender-mcp here) ✓ · Claude Code MCP ✓.

**Steps:**

1. **Install the addon into the project.** In the Godot editor: **AssetLib** tab → search
   **"Godot AI"** → Download → Install. (Asset Library #5050.) It lands in `game/addons/godot_ai`
   (res:// = `game/`, and `addons/` already exists here). *Alt:* `git clone
   https://github.com/hi-godot/godot-ai` then copy `plugin/addons/godot_ai` into `game/addons/`.
2. **Enable it.** Godot → **Project → Project Settings → Plugins** → enable **Godot AI**. A dock
   appears and the plugin auto-starts its Python server — no manual launch. Endpoint
   `http://127.0.0.1:8000/mcp` (WebSocket bridge on 9500).
3. **Register it with Claude Code** (one command, in a terminal):
   ```
   claude mcp add --scope user --transport http godot-ai http://127.0.0.1:8000/mcp
   ```
   (I can run this for you via the shell if you'd rather — it edits your user MCP config. Say the word.)
4. **Restart / start a new Claude Code session.** MCP servers load at session start, so the
   `godot-ai` tools only appear in the NEXT session — which is exactly the handoff.
5. **Keep the Godot editor OPEN on this project** while that next session runs — the MCP server
   lives inside the editor plugin. (Minor: avoid firing big headless sim sweeps while the editor
   holds file locks; per-file it's fine.)

**First thing I'll do once it's live:** open the game, watch the Game Deck run in the editor, and
re-drive that Meridian-edge fall-through (§5) so I can see the hole instead of reading a log line.

---

## 2. TURN ON THE GAME DECK (top priority — the "you never saw it" system)

**What's actually there (all shipped on this branch, sim-green):**
- **22 games** (`game/data/games.json`) — WASTE HEAP, RADWORM, DEAD GROUND, PACK RAT, BUNKER
  BREAKER, LAST MILE, DIAL TANKS, RED SKY, FIGHT NIGHT 99, RUST RUNNERS, SKYJOUST… each with its
  own folder under `game/proto3d/games/<id>/` and a cover art webp.
- The full stack: `game_deck.gd` · `game_handheld.gd` (pocket unit) · `game_console.gd` (safehouse
  TV console) · `game_shell.gd` (the library UI) · `game_venue.gd` (arcade venues) · `game_net.gd` +
  lobby/broker/spectator (online MP) · `score_ledger.gd` · tournaments + leaderboards as data rows.
- **~30 sims** (`game_*_sim`, `console_*_sim`, `handheld_catalog_sim`) — catalog, acquisition,
  license, save, input, shooter kernel, local + online MP, spectacle, bot-fill. Green.

**Why you never saw it — the missing door:** the deck opens when you **USE the `game_handheld`
item** ("Pocket Game Deck") from your pack; cartridges (`game_cart_*`) install individual games on
the shelf. A fresh NEW GAME never puts a handheld in your hands and the item isn't seeded into
early loot/shops, so there's no way to stumble onto it. It's a surfacing gap, not a build gap.

**The work:**
- **A. Give it a door (the real fix).** Seed `game_handheld` so a normal player finds one early —
  candidates: the NEW GAME starting kit, the FIRST RUN scavenge beat, an early shop (Quill), or a
  safehouse pickup. One or two rows. (The safehouse **console** path — play on the TV — should also
  be reachable; verify `game_console` is wired to a safehouse prop.)
- **B. See it work (your actual ask).** With the bridge live: grant/seed a handheld + a cartridge,
  USE it, and play one game on-screen. Confirm the arcade input router, a shooter-kernel game, and
  the score ledger all behave for a human at the keyboard — not just in sims.
- **C. Polish pass** on whatever looks off once we can watch it (cover art, shell UI, the
  handheld/phone framing). This is where the editor bridge earns its keep.
- **/librarian** note: this is a big player-facing system with zero book coverage — worth a pass
  later, not a blocker.

---

## 3. FIX "THE RULES" — needs a 30-second scope from you

"The rules need fixing" is ambiguous and I won't guess wrong on a live system. Leading candidates,
pick one (or tell me it's something else):

- **PvP rules (most likely).** `pvp_mode` cycles **peace → duel → ffa** on **F6**
  (`proto3d.gd` ~821, ~3724–3839). Peace = co-op only; duel = damage on, kills read as duels; ffa =
  open season; the **SAFEHOUSE BUBBLE** is holy ground; damage is victim-authoritative. If this is
  it — what feels wrong? (defaults, the cycle, safe-zone size, kill/bounty feel?)
- **Game Deck rules.** Per-game rulesets (waves, scoring, win conditions) in the game folders /
  `game_tournaments.json` / `game_leaderboards.json`.
- **House rules / onboarding.** THE FIRST RUN or the FIRST-RUN objective chain reading wrong.

**Action:** first thing next session I confirm which "rules" you mean, then fix + leave a
regression sim (the house iron rule).

---

## 4. DOUBLE-CHECK THE GPS

The map is a **screen on a handheld device** — `world_stream.gd` `DEVICE_SKINS` (`~1800`) frames the
atlas inside a `gps.png` brick or a `phone.png` portrait, swappable live via the on-screen LCD chip
(`_swap_device_skin`, `~1994`); default `device_skin = "gps"`. There's also a standing owner idea
(memory: `gps-device-idea`) to gate the map behind actually *owning* the device.

**Action (with the bridge, visually):** open the map (**M**), confirm the GPS brick renders and the
atlas sits correctly in its screen rect, the 📱/📟 chip swaps skins without losing the view,
waypoints/drone/partner markers land, and decide whether the "must own a GPS" gate is in or out.
Verify against `render_ui` acceptance (`map_debug_buttons` outlines the device hotspots).

---

## 5. KNOWN ISSUE FOUND THIS SESSION — Meridian-edge fall-through

While you were playing, the void net self-reported:
```
VOIDNET: fell at (-378.1, -22.9, -471.6) chunk=-3,-4 loaded=true kids=3 speed=36188 mode=0
```
On foot, you dropped through the world just **southwest of the Meridian authored slab**; the
GROUND_INTEGRITY void net caught it and teleported you home (working as designed). `kids=3` (a
near-empty chunk) + an impossible fall speed = a **chunk floor that didn't build** at the
authored-slab boundary — most likely fallout from the Arc-1 relief/floor work touching that seam.
**Action:** repro at chunk (-3,-4), sample the floor across the authored boundary, restore the
floor, leave a regression check. (Best done with the bridge so I can watch the repro.)

---

## 6. STILL PARKED — the AI dev-lab arc (tasks #6–9)

Your earlier "comprehensive dev mode to iterate + test AI" goal, banked with full surveys in memory
(`ai-survey-2026-07-14`): (#6) AI DEV LAB overlay + scenario rows + headless runner · (#7) driving
AI that follows the road graph + handles hazards (autopilot never brakes today) · (#8) real
city-to-city delivery runs · (#9) combat AI + car-gun mount hooks (no AI can fire a mount yet).
Ready to pick up without re-scouting whenever you want it.

---

## 7. STATE OF THE BRANCH (so next session boots grounded)

- **THE_COUNTRY_PLAN shipped in full** (3 arcs): vertical country (relief, climbing roads, carved
  rivers + real bridges, 60 overpasses, `water_depth_at`), readable road (town landmarks, farm
  belts, real exit billboards, ecotones), living map (districts→engine tints + generator seam,
  ghost sites). Merged to main through `c556720`.
- **The Game Deck** (22 games) is on this branch, sim-green, unsurfaced (§2).
- Suite green; tree clean; `codex/specticles-games` == main.
- **Paid-for staging laws** (don't re-pay): THE LANE LAW (stage drive sims in a lane, not on the
  divided-road centerline = median barrier) · THE DENSIFY LAW (survey polyline segments by
  coordinates, never index — the relief bake inserts midpoints) · photobooth stages on the real
  surface + flushes border toasts · JS bake: `>>>` not `>>` on 32-bit hashes.

---

### FIRST FIVE MINUTES OF THE NEXT SESSION
1. Confirm `godot-ai` MCP tools are live (bridge connected, editor open).
2. Scope "the rules" with you (§3).
3. Seed a handheld + open the Game Deck on-screen (§2B) — the thing you've been waiting to see.
