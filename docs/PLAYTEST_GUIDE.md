# DRIVN — Playtest Script (2026-07-06 build, v0.14)

**How to use this:** every test is DO → EXPECT. Say what you saw out loud — especially where it differs from EXPECT. Anything that *feels* wrong counts as feedback even if it technically works.

**Fast-travel for testing:** press **F10** (dev mode) → teleport buttons, spawn enemies/dogs/loot, set time of day, give gear. Use it liberally — this is a test, not a run.

**Your two big landmarks:** you start near the **SAFEHOUSE** (TV + drone pad + home chest are all here). **MERIDIAN** town is just north of it. The **drive-in** is ~100m northwest of the safehouse. The **EXIT 1 sign** is a long drive east on I-95 (or F10-teleport).

---

## 1 · Movement & the body
1. **Sprint** — hold SHIFT while moving. EXPECT: faster, stamina bar drains, refills at rest.
2. **Crouch** — hold CTRL. EXPECT: you sink low, move slow. Enemies should notice you later (sneak past a howler at night if you're brave).
3. **Slide** — sprint, then TAP CTRL mid-run. EXPECT: a low slide that carries a few meters and ends crouched while you keep holding CTRL.
4. **Dive** — SPACE while moving. EXPECT: Max-Payne dive, you can still aim/fire mid-air, quick get-up (slower when your stamina's gassed).
5. **Water** — walk into a lake/river edge (F10 teleport near water is fastest). EXPECT: shallow = slow wade; deep = swimming, stamina drains, you CAN'T punch/shoot; run out of stamina and you start drowning (torso damage). Get out = everything recovers.

## 2 · Fists & fighting
6. **Punch** — empty hands (press 1/2/3 to unequip or drop weapons), TAP left-click on an enemy. EXPECT: jab-jab-cross combo, damage lands.
7. **Shove** — HOLD left-click ~a third of a second. EXPECT: a palm shove that knocks them back (space-maker, not a killer).
8. **Tackle** — SPRINT at an enemy + left-click. EXPECT: you bull-rush, THEY hit the ground, you stay up. Punish them while they're down.
9. **Martial Arts skill** — check the K sheet: "Martial Arts" should level as you brawl. (Dev mode can grant XP if you want to see lv2 KICKS — third combo hit becomes a roundhouse — lv4 THROWS on hold-shove up close, lv6 ground FINISHERS ×3 on downed enemies.)
10. **Weapons still right?** — pistol/shotgun/melee should all feel unchanged (reload R, crits, knockback bat, etc.).

## 3 · Grab & drag
11. **Drag a body/crate** — kill something or find a chest, HOLD E on it. EXPECT: "Dragging — E to set it down", it trails behind you, you're slow, Strength XP ticks as you haul. TAP E on a chest still just opens it. E again drops it and it STAYS.

## 4 · Dogs
12. **Auto-JUMP** — adopt a dog (E on a stray, F10 can spawn one), then hop a fence/low wall and keep walking. EXPECT: the dog LEAPS it to stay at your heel — no pinballing.
13. **POUNCE** — C×4 (hold) to SIC a target ~3m away. EXPECT: the dog leaves the ground in a flying tackle.
14. **DIG** — needs a Hunter-type dog + a buried cache (dirt mound). EXPECT: the dog smells it, walks over, paws the ground, and real loot pops out. (If you don't stumble on a mound, tell me and I'll seed more.)

## 5 · 📻 Radio stations (NEW tonight)
15. **Power** — press **O**. EXPECT: "📻 ON — CHICAGO RADIO", music plays, keeps playing track after track.
16. **Stations** — press **L**. EXPECT: cycles CHICAGO RADIO → FREEWAVE → back. Station name toasts.
17. **Volume** — **,** and **.** EXPECT: 10% steps, toast shows %, and the level SURVIVES a game restart.
18. **In the car** — drive with the radio on. **Say out loud: is the volume right under the engine?** That's a feel call only you can make.
19. **Y-scan music** — press Y a few times. EXPECT: sometimes the dial lands on a station and powers the radio on by itself.

## 6 · 📺 TV & cinema
20. **Safehouse TV** — walk to the TV in the safehouse corner, press E. EXPECT: the media panel opens (~80% of screen), CLIPS shelf has "DRIVN Test Reel". Play it. EXPECT: the test pattern actually plays, and **game time sprints while you watch** (watch the clock).
21. **Drive-in** — northwest of the safehouse: a big screen on a lot. E on the projector post. EXPECT: "the projector clatters to life" — trailers would roll before a feature (with only the test reel installed it's a short show). Drive away mid-show — EXPECT it stops.
22. **Film pickups** — at the drive-in lot, look for tapes/DVDs on the ground (they seed when locked films exist). E takes one → that film unlocks on your TV shelf forever.
23. **Public screen** — Meridian cross street has a pole-mounted TV. EXPECT: it glows and plays a loop, **SILENTLY** (that's by design now — it was the emergency-tone bug).
24. **News** — if you saw the wake-up briefing, open the TV after: the lower-third ticker should carry the news.

## 7 · 🛸 The drone
25. **Route scout** — the pad next to the safehouse door. Set a map course first (M → click somewhere), then E on the pad. EXPECT: boot line about FEDNET-OPTIMIZER, the bird flies your course WITHOUT you, pings/marks hazards (🛸 waypoint appears — cycle N to see it), flies home, dock says recharging. Launch again after ~4s.
26. **Losable** — shoot the bird (or let something else). EXPECT: "SIGNAL LOST", a wreck where it fell.

## 8 · 🛣 Exits & the road
27. **EXIT 1 — MERIDIAN** — drive I-95 (or F10 teleport toward (1204, 282)). EXPECT: a real highway sign — glyph always visible, words readable when you face it: "EXIT 1 — MERIDIAN (T3)". The ramp is drivable asphalt.
28. **Road character** — driving onto I-95 should greet you with THE CRIMSON MILE toast, danger-3 ambush odds, all the old road rows intact.

## 9 · 🎮 Controller (plug in your pad)
29. **Twin-stick** — left stick walk, RIGHT STICK aim. EXPECT: the gun tracks the right stick; release it and the mouse takes back over.
30. **RT** — tap = punch (unarmed) / fire. EXPECT: same tap-vs-hold feel as the mouse.
31. **In the car** — EXPECT: RT becomes GAS, LT brake, left stick steers, A handbrake. Get out — RT is a weapon again.
32. **Buttons** — B crouch · A dive · X reload · Y interact (hold-drag works) · LB whistle · RB weapon cycle · D-pad: ↑radio scan ↓pack ←views →sheet · START map · L3 sprint (horn in car) · R3 binoculars.
33. **Rumble** — take a hit / stand near an explosion. EXPECT: the pad kicks.
34. **F11 rebind** — open CONTROLS, click any binding, press a new key/button. EXPECT: it takes immediately, survives restart, RESET ALL restores stock. Menu also has a CONTROLS button and is D-pad navigable.

## 10 · 🤝 Co-op with your boy (the main event)
35. **Connect** — Radmin VPN both sides → you HOST, he JOINs your 26.x IP. EXPECT: "Player 2 joined the wasteland."
36. **See each other** — EXPECT: name tag over his head, a 🤝 PARTNER arrow waypoint tracking him (cycle N).
37. **The truck** — EXPECT: a bed rig parked by the safehouse when he joins (host side). One drives, one rides the bed and shoots. **This is the fantasy — narrate how it feels.**
38. **Same enemies** — find a howler pack at night. EXPECT: you both fight the SAME pack, damage syncs.
39. **Partner respawn** — one of you dies (R to respawn). EXPECT: you wake NEXT TO your partner, not across the map.
40. **Horn** — honk (H / L3). EXPECT: your boy gets "a friend leans on the horn" + a ping.
41. **PvP** — host presses F6 twice (→ ffa). EXPECT: you can hurt each other — EXCEPT inside the safehouse yard (holy ground). A kill posts a ☠️ bounty on the killer's name tag. F6 back to peace = no friendly fire.
42. **Vehicles sync** — drive around each other. EXPECT: his car moves smooth, not teleporty. Call out any rubber-banding.

## 11 · 🏁 The racetrack (separate scene — the Proving Grounds)
Launch it from a terminal: `Godot --path game res://proto3d/track/track.tscn` (or ask me to launch it).
43. **Lap + ghost** — drive a lap through the checkpoints. EXPECT: lap timer, and after one clean lap a GHOST of your best lap appears — press **G** to race it. **1–9** switch rigs (each rig keeps its own best lap), **C** sics a chase-AI on the ghost, **R** resets.
44. NOTE: single-player only right now — MP racing is on the wish list, tell me if you want it prioritized.

## 12 · 🛠 The editors (browser)
45. **MediaForge** — http://localhost:8897 (already running). EXPECT: your media library, CONVERT buttons for any MP4s you drop in `game/media/film|tvshow|trailers|clips`, and the RADIO STATIONS panel — create a station, see chicago_radio listed.
46. **MapForge** — `node tools/mapforge/server.mjs` → http://localhost:8899. EXPECT: paint biomes, drag roads (nicknames survive edits now), the EXIT tool (click → name → archetype → ramps auto-build), and the STRUCTURE CATALOG (17 buildings, editable, *created-not-placed*).

---

## Known & by-design (don't burn tape on these)
- The world is **placeholder boxes** — art direction is deliberately undecided.
- Only **Meridian** is a populated town; other map towns are sparse.
- The **public screen is silent** on purpose; the safehouse TV and drive-in are where video sound lives.
- The radio currently plays **wherever you are** when ON — a strictly-car-mounted positional radio is a possible follow-up (tell me if you want it).
- The only film installed is the **test reel** — drop real MP4s in the folders + convert in MediaForge and the TV/drive-in/pickups all use them.

**Record everything that feels off — volume levels, speeds, distances, wordings, colors. Feel notes are the most valuable thing you can give me.**
