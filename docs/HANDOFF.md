# DRIVN — Engineering Handoff

**Written:** 2026-07-06, at the end of a long build session, as a retirement hand-off.
**Verified by:** a fan-out audit of 23 subagents (16 code-subsystem auditors + 6 doc auditors + 1 synthesizer) cross-checked against a full headless sim run. Everything below is grounded in the actual code, not memory — where it isn't, it's flagged **[low-confidence]**.

> **Read this first, then `CLAUDE.md` (how to work) and `docs/ENGINE.md` (the vision).** This document supersedes the *status* claims in the other docs — several of them over-claim (see §9).

> ### ✅ Progress since the audit (2026-07-06, post-handoff)
> The retiring dev kept going down the roadmap. Landed, each sim-proven + committed:
> - **Roadmap #1 — persistence holes: CLOSED.** All five leaks save/load and are asserted in `save_sim`: **hunger, weather, active war, hired crew, metaworld dog-records**.
> - **Roadmap #2 — drift + versioning: DONE.** One `ProtoMain.SAFEHOUSE` anchor replaces four drifting literals; the save carries a `version` field.
> - **Roadmap #4 — road-row consumer (partial): the `danger` row now scales `ambush_odds()`** — a danger-3 road spawns pirates ~2× as often (`road_sim`). *Toll + family still unconsumed.*
> - **Roadmap #5 — vehicle mounts + car combat damage: DONE.** `mount_schematic` USE bolts a `car_mg` on (activates the dead-gated fire path, `mount_sim`); and driving no longer makes the cab invincible — a claw mauls the **rig** through its 5-part damage while the driver stays shielded, and **vehicle armor is now real** (blunts the hit; was inert metadata). `car_combat_sim`.
> - **Signs for the illiterate (spoken ask): DONE.** `ProtoSign` — an always-visible 📜 symbol ("words here"); the words only surface when the sign is in your **sight cone** + range. `sign_sim`.
> - **The one real red is fixed:** `dog_sim` rear-smell (test staged the threat behind *movement*, not *gaze*) + the Companion-obey flake hardened. `voices.json` "jack"→"scrip" closed.
> - **Roadmap #3 — data-spine read-back (items slice): DONE.** `ProtoContainer.ITEMS` is now a static var; `ensure_items()` folds `data/items.json` *additively* onto the code floor at boot — a JSON row with a new id is a real in-game item (dogfooded with `field_ration`), existing ids stay code-authoritative so stale JSON can't corrupt them. `items_sim`. **"A new item = a ROW" is true now** (for items).
> - **Roadmap #3 — loot read-back: DONE.** `ProtoContainer.roll_loot(table_id, rng)` reads `data/loot_tables.json` (seeded-deterministic); the radio distress cache now rolls its contents from data instead of a hardcoded dict. `items_sim`. (Loot tables verified 0 broken refs.)
> - **Roadmap #3 — FULLY COMPLETE across all four spine surfaces:** items (`items.json`), loot (`loot_tables.json` rolling), prices (`prices.json`), and **NPC archetypes** (`npcs.json` → `ensure_archetypes()`, which also un-deadened the mechanic/medic hire branches by adding Hazel/Mercer archetypes). Every surface is an additive fold on a code floor; "a new item/price/loot/NPC = a ROW" is true. `items_sim`/`crew_sim`.
> - **Roadmap #6 — misfire coverage added** (`misfire_sim`, standalone): a CRITICAL engine coughs + a wounded chassis wanders. With crit (`melee_sim`) and camera-trauma (`feel_sim`), the substantive combat-feel/drivable-damage gaps are closed.
> - **Roadmap #4 — toll + family: DONE (#4 COMPLETE).** Driving onto a toll road bills its scrip once on entry (pay if you can; if short, the running family marks you with stress — no hard gate); `family` read for flavor. All four road rows are now *felt*. `road_sim`.
> - **Roadmap #6 — crit + camera-trauma coverage: DONE.** `melee_sim` asserts a crit lands ×1.8; `feel_sim` asserts trauma spikes, shakes the camera off its mark, and decays. The two biggest combat-feel coverage holes closed.
> - **#8 lurker→puppet: DONE.** The last bespoke enemy now rides the shared `ProtoPuppet` (data-driven all-black "lurker" look; strides via `animate()`; its hood preserved on the rig's head; hit-flash recursed). **No enemy is bespoke anymore** — every fighter is the one sin()-driven rig fed a row. `arsenal_sim` asserts it; threat/dark/dogmeta/melee_wall/items/town/life/combat_feel all green.
> - **#6 get-up-stamina: DONE** (`getup_sim`) — a gassed shootdodge keeps you down ×1.9 longer. **All of #6 is now asserted** (crit, camera-trauma, misfire, get-up).
> - **Deployables pillar rung 1 — the PROXIMITY MINE: DONE** (`ProtoMine`, `mine_sim` 6/6). USE plants it; it arms after a beat (planting-safe, never trips on you); the first enemy in its ring detonates it through the one blast law. First proven rung of the P5 deployables ladder.
>
> **PIVOT (owner directive, 2026-07-06) → the whole roadmap below is superseded by §0.** The owner reviewed four new design specs (now banked in `docs/design/`) and set the next major arc: **THE LIVING WORLD — the "Four Days Later: Florida Under New Law" slice.** The retirement-era "do NOT start the pillars" discipline (§3/§7) is lifted *for this arc only* — Florida is now the greenlit build. The pending equipment-paperdoll rung (an ad-hoc `worn_armor` field) was **parked/reverted** — it will be built properly from the full 19-slot spec (`docs/design/EQUIPMENT_PAPERDOLL.md`) later, not as a one-off. **Start at §0.**

---

## 0. THE NEXT ARC — THE LIVING WORLD (owner directive, 2026-07-06) 🌎

**This section is the current marching order. It supersedes the reined-in roadmap in §3.**

> ### ✅ SHIPPED (2026-07-06) — the Florida MVS is BUILT, all three phases sim-proven
> The next dev doesn't start this arc from zero — the minimum-viable slice is **done and green**:
> - **Phase 0 — offline catch-up + the takeover.** `ProtoWorldState` (`world_state.gd`) owns `state_control` + `active_laws` + the EVENT DIRECTOR catch-up. Save carries `last_played_utc` + a `world` block; on load, if the absence crosses 12 h, catch-up rolls ≤7 days deterministically and at the 4-day mark **Florida falls to the Faith Bloc** → law flips → you wake SAFE at home to a return briefing (never arrested at home). Law profiles fold additively from `data/law_profiles.json` (a new law = a ROW). `offline_catchup_sim` **13/13**.
> - **Phase 1 — the law you can SEE.** `on_state_entered` announces the controlling faction + law when you cross into occupied territory and warns when your kit is contraband there — a risk, never an instant punishment. `law_profile_sim` **8/8** (same gun legal under Free Counties, contraband under the Faith Bloc).
> - **Phase 2 — broadcasts on the dial.** A queued EMERGENCY BULLETIN cuts through the radio static on the next Y-scan (text-first fallback floor; drains the queue). `broadcast_fallback_sim` **8/8**.
> - **The "STATE OF THE STATE" return-briefing SCREEN.** A framed, scrolling wake-up panel (`hud_3d.gd` `show_briefing`) — days passed, new controller + law, contraband in your kit (by name), bulletins on the air — that gates gameplay input (`menu_open`) until E/any key dismisses it. `offline_catchup_sim` is now **16/16** (panel shows + dismisses via REAL input).
>
> **What's NOT done yet in the arc:** everything Phase 3+ (scout drone, crime/bodies, jail, cloning, multi-passenger seats, media/TV registry, co-op/PvP fun pass, 19-slot paperdoll). The Florida MVS itself — offline catch-up → law → briefing screen → radio bulletin — is **complete and green**. **Next up:** Phase 3 scout drone (`drone_scout_sim`, §21.4) or the low-code co-op/PvP track. See the build order below.
>
> ### ✅ SECOND FIRING (2026-07-06, the moveset+media autonomous arc) — five more rungs SHIPPED, all sim-proven + committed
> - **THE MOVESET (plan doc since retired, 2026-07-07) — COMPLETE.** One new key (hold-CTRL crouch; sprint+tap = slide), the UNARMED KIT (tap punch combo / hold shove / sprint-TACKLE + an 11th level-by-doing skill **MARTIAL ARTS**: lv2 kicks, lv4 throws, lv6 finishers), GRAB & DRAG (hold E on chests/bodies), WATER on foot (auto wade/swim/drown off the real map), and the DOG VERBS (auto-JUMP over fences, POUNCE on SIC, Hunter DIG on `ProtoBuriedCache` → loot_tables). Sims: crouch/unarmed/drag/water/dogverb (60+ checks).
> - **MOTIONFORGE (:8896) — the 4th Forge, tool + engine.** Puppet/quadruped animator literals lifted into **MOTION rows** (stock in code, `data/motions.json` overlays; F10 FORGE re-folds live); REST + describe-it endpoint; treadmill stage `res://proto3d/tools/motion_stage.tscn`; `motion_sim`.
> - **THE MEDIA LAYER (cinema plan since retired; the design contract lives at `docs/design/CINEMA_MEDIA_LAYER.md`) — COMPLETE, ALL PHASES.** MediaForge (:8897, MP4→Theora+poster+manifest rows via bundled ffmpeg-static; test-reel/test-music generators) · `ProtoMediaRegistry` · safehouse TV + 80% panel (time passes, watched/unlocked in the save) · DRIVE-IN (trailers→feature off rows, leave-stops) · DVD/tape/reel pickups seeded from `found_*` rows · PUBLIC SCREENS tuned by `data/media_channels.json` (faction>state>open), world-event clips preempt · Newsroom (takeover→TV, bounty→radio, weather→wire) · radio MUSIC stations off `game/media/music/radio/` (runtime mp3, no import). Sims: media_registry/tv/unlock_media/drive_in/news_media/music/broadcast_fallback.
> - **LIVING WORLD Phase 3 — SCOUT DRONE: DONE.** Safehouse **drone dock** launches a ROUTE SCOUT along your course (body stays home), marks hazards as the 🛸 map waypoint, returns/docks/recharges, can be SHOT DOWN and lost (wreck). AI-collapse lore keystone in the drone boot line + the dial. `drone_scout_sim` 11/11.
> - **CO-OP/PVP FUN PASS — DONE** (top-5 + top-5 tonight rows): partner name tags + follow-waypoint arrow, respawn-at-partner, co-op bed rig, net horn pings; F6 peace/duel/ffa (host-authoritative), safehouse bubble, victim-authoritative PvP damage + kill toast + session bounty on the tag. `coop_fun_sim` 16/16.
> - **Remaining on the ladder (the NEXT arc):** crime/bodies → jail → cloning → multi-passenger seats → the 19-slot paperdoll (build from `docs/design/EQUIPMENT_PAPERDOLL.md`). Each is a multi-day system — do them one rung at a time, sim-first, same as everything above.

The owner delivered four design specs (banked verbatim in **`docs/design/`**) and chose the next major feature. It is **not** robots, AI video, consoles, or cloning. It is the one slice that proves the whole vision:

> ### 🎯 THE FLORIDA SLICE — *"Four Days Later: Florida Under New Law"*
> The player lives in Florida for its gun laws. They don't play for four days. On return, the save simulates those days: a religious faction has taken Florida, the **laws changed** (guns now contraband), and the player **wakes safe inside their safehouse** — not punished — and learns what happened from **radio/TV/phone** before deciding to hide, smuggle, fight, or flee.
>
> **The spine of the whole arc, in one sentence:** *the world keeps moving while the player is gone, and technology (radio/TV/phone/drones) is how they observe it, survive it, and manipulate it.*

### The four specs (all now in-repo)

| Doc | What it covers | Priority in this arc |
|---|---|---|
| **`docs/design/LIVING_WORLD_DSOA.md`** | Offline catch-up, state control + law profiles, safehouse briefing, broadcasts, drones, crime/jail, cloning, military bases, seats, mobile companion. **The master spec.** | **P0 — build first** |
| **`docs/design/CINEMA_MEDIA_LAYER.md`** | Diegetic media: safehouse TV, drive-in, media registry, news-from-world-state. Feeds the "TV briefing" beat. | P1 — dovetails with broadcast |
| **`docs/design/COOP_PVP_MOBILE.md`** | Tonight co-op/PvP fun pass (partner arrow, name tags, respawn-at-partner, PvP opt-in, bounty) + phone-as-drone companion + AI-collapse lore keystone. | P2 — parallel track, low-code |
| **`docs/design/EQUIPMENT_PAPERDOLL.md`** | The full 19-slot wearable inventory (6 armor / 7 clothing / 6 accessory), T1–T5, set bonuses. Fills §2c's "19-slot paperdoll" pillar. | P3 — build from this spec, not ad-hoc |

### The build order (from LIVING_WORLD_DSOA §20 + §25, sequenced for our engine)

The whole arc is gated on **one non-negotiable foundation the owner's spec repeats loudly: the save must persist the new world state.** We just closed the old persistence leaks (see banner) — do not reopen that wound by adding offline progression that resets. Add these save keys first: `last_played_at_utc`, `world_state_version`, `state_control`, `active_laws`, `active_events`, `resolved_events`, `broadcast_queue`.

**Phase 0 — EventDirector + Offline Catch-Up** *(the heart; build first)*
1. Add `last_played_at_utc` + `world_state_version` to the save (`save_game()`/`load` in `proto3d.gd`).
2. New `EventDirector` node that **wraps the existing `events.gd` `roll_daily`** (don't replace it — the deterministic daily roll already exists; make it the offline tick).
3. Deterministic offline catch-up: on load, if `gap_hours ≥ threshold`, roll up to `MAX_OFFLINE_DAYS` (cap at 7) of events into an `OfflineDigest`. Same save + same gap + same seed ⇒ same result.
4. A **Return Briefing** screen (reuse the modal/panel pattern from the container/sheet UI) that shows: days passed, new controller, new laws, contraband flags, nearby patrols. **No arrest inside the safehouse** (fairness rule).
5. `offline_catchup_sim`: set `last_played_at` 4 days ago + a seed that guarantees the Florida takeover → assert controller changes, law changes, briefing appears, gun becomes contraband, **player not arrested at home**, broadcast queued.

**Phase 1 — State Control + Law Profiles + Contraband**
6. `data/law_profiles.json` rows — start with exactly **two**: `free_counties_law` (guns legal) and `faith_occupation_law` (guns contraband, curfew). Fold them additively like `items.json` (the read-back spine is now proven — reuse `ensure_*` pattern).
7. `state_control` map (state → controlling faction) on world state; a state takeover swaps the law profile.
8. `legal_tag` contraband tags on items/weapons; an inventory+trunk contraband check that fires **on being seen/searched**, not on possession.
9. `law_profile_sim`: same gun legal under Free Counties, contraband under Faith Occupation; safehouse possession does not punish.

**Phase 2 — Broadcast: radio / TV / phone briefing**
10. Expand `radio.gd` into (or wrap it with) a `BroadcastSystem`; add a **TV interactable** in the safehouse (this is where `CINEMA_MEDIA_LAYER.md`'s MediaRegistry + `ProtoTV` slot in).
11. Template-driven broadcast content with a **hard fallback stack**: text bulletin → pre-written TTS line → static card → (optional, never-blocking) AI video. The game must never wait on AI video.
12. `broadcast_fallback_sim`: event outcome makes a broadcast; text always exists; missing audio/video does not crash.

**That is the Minimum Viable Slice.** If it's fun, expand into drones (Phase 3), crime/bodies (Phase 4), jail (Phase 5), cloning (Phase 6), seats/co-op/PvP (the `COOP_PVP_MOBILE.md` track), then the paperdoll and everything else. **If it's not fun, no amount of robots/consoles/clones saves it** — so prove Florida first (the specs are emphatic about this; see LIVING_WORLD_DSOA §24, §26 "Cut List").

### The lore keystone to thread through it (from COOP_PVP_MOBILE.md)
**AI caused the collapse of the Divided States.** Drones, robots, Carousel tech, radio propaganda, and the phone uplink are all remnants of a national logistics/security AI that "optimized" the country into controllable territories. Put one line of this in a drone boot screen / radio glitch / Carousel terminal so the tech reads as *one world*, not random gadgets. (This also unifies with the existing Carousel "flesh not steel" framing.)

### What to do RIGHT NOW (first session, concrete)
1. Read `docs/design/LIVING_WORLD_DSOA.md` §4, §20 (Phase 0), §21.1, §24.
2. Grep `save_game`/`load_game` in `proto3d.gd`; add the seven world-state save keys + `last_played_at_utc`. Prove the round-trip in `save_sim` first — **persistence before progression.**
3. Build `EventDirector` around `events.gd`'s existing `roll_daily`; write `offline_catchup_sim` to the acceptance criteria in §21.1 **before** wiring the briefing UI (iron rule: real path, sim-proven).
4. Only then build the Return Briefing screen and the two law profiles.
5. Commit each phase with its sim green; push to `origin main`.

---

## 1. TL;DR — the honest state of the game

DRIVN is a **deep, sim-proven vertical slice** of a top-down 3D vehicular-combat + survival game (Godot 4.5, GDScript, res:// = `game/`, 3D mainline in `game/proto3d/`). **199 commits. ~68 headless sims. 118 distinct systems are built AND sim-asserted.** You can launch to a title screen, get guided through a first loop, drive a data-defined fleet across a compressed USA, fight on foot and from the car with melee/guns/explosives/knockback, tame and lose dogs, hire and lose crew, run a fast-travel meta-game, build a home base, and play co-op over ENet.

**It is not shippable yet.** The gaps are not "missing features" so much as three honest holes:

1. **Persistence leaks.** Many *working, sim-proven* systems silently reset on save/load — weather, hunger, hired crew, metaworld dog-records, active world-events. A shippable game cannot forget a hired gunner or a starving belly across a reload. **This is the single highest-value fix area.**
2. **Breadth is one town deep.** Only **Meridian** is populated. Every other city on the 150×85 map is empty. The economy, bounties, and NPC life exist — in exactly one place.
3. **The big designed pillars are unbuilt** (700-pt skill tree, robotics/farming, 19-slot equipment, seven faction families, 50 distinct-ruler content, vehicle weapon mounts that actually attach, hover/rail/boat, host-authoritative MP). These are weeks each. **Do not start them** until §1's holes are closed (see §7 scope discipline).

**Art direction is undecided** — everything is procedural boxes + solid-color meshes + a sin()-driven puppet rig. That is deliberate (the "Art Range" experiment was never run) but it means the game *looks* like a prototype even though it *plays* deep.

---

## 2. HAVE vs. SHOULD-HAVE (the gap analysis)

### 2a. SHIPPED & sim-proven — 118 systems (the spine is real)

Grouped; each has at least one sim that asserts the behavior (not just that code exists).

- **Combat & feel:** 8-weapon data-row arsenal (pistol/shotgun/pipe_rocket/wrench/machete/axe/bat/car_mg) on 4 Behavior enums; hitscan; shotgun multi-pellet w/ data-driven shove; rocket & grenade blast; melee arc swing (stamina-gated, crit, QUIET); **melee wall-law** (no hitting through walls, both ways); **explosion shockwave** (full damage + distance-falloff knockback over combatant∪threat); reticle bloom/spread flying the rolled vector; timed reload from backpack; fire-from-vehicle (your gun out the window); **twin-stick aim decouple** (gun snaps to mouse, eyes lag); **THE SHOOTDODGE** (Max-Payne dive: aim/fire mid-air + prone, cancelable get-up, time-dilation that restores the *previous* scale); combat stance on fire.
- **Vehicles:** VehicleBody3D raycast-suspension from data rows; data-driven fleet fold+materialize; 5-part anatomy + death spiral (smoke→fire→cook→husk salvage); fuel drain + breached-tank bleed; drivable damage you FEEL (tire cap/shimmy); surface×tires grip (offroad bog, water); handbrake drift (no 180 whip); two-wheel PD upright+lean; trailer coupling (400 kg towed); trunk per-class capacity; field repair loop; hotwire; **Carousel garage** store/deliver rig with fuel+cargo across save; skid marks.
- **World & map:** macro map from `usmap.json` (150×85 @500 m, 48 states); cell/biome/state anchors; `road_near` + **road CHARACTER rows** (danger/family/nickname/toll) + welcome-sign READ; chunk streaming; interstate→asphalt; surface→grip; biome-driven scatter; state-line announcements; two-level world map (M) fog + atlas click-to-course; placement layer at exact coords.
- **NPCs & life:** town archetypes on the puppet rig; act overlays (gesture/scan/pace/aim-crouch); trade economy (scrip flow); esteem/infamy price scaling; **Sec-Man bounty chain**; crime→SUSPECT closure; contextual barks; **motorists drive city-to-city**; route planning; passenger seat + take-the-wheel.
- **Weather/day-night:** moon night-floor (never blind); headlights/pack-spawn consumers; 4-state weather with taxes (dust→vision, rain→grip, heat→engine cook).
- **Dogs:** 4 types × 12 breeds; adopt/bond/register; follow/stay w/ per-type obedience; **rear-smell** alert*; Hunter nose-ping; Cuddle calm-aura→stress→stamina; **BOND tiers**; **SHIELD** (SOULBOUND-gated); **PERMADEATH** (bleed-out→bandage-save or grave+collar+memorial); buryable grave; whistle 4-in-1; SIC bite w/ wall-law; **metaworld** dehydrate/hydrate + come-home. *(*the rear-smell red is FIXED — see §8; `dog_sim` 12/12.)*
- **Crew:** data rows on the puppet; hire w/ scrip; follow; mechanic/medic/gunner jobs on the game clock; **mortality** (corpse chest + memorial); scout reveal; riding shotgun + gunning from the moving bed.
- **Character:** 10 skills level-by-doing w/ real effect helpers consumed at real call sites; 6-part body paper-doll; **wounds become behavior** (limp/aim-wobble/narrowed cone/stamina tax); **revive + soft respawn** (safehouse, toll, rig left, deaths++); hunger spine; perception traits; procedural puppet sin()-rig; respect ledger price_mult + standing gates.
- **UI/meta:** front-door menu (save-gated); **THE FIRST RUN** onboarding (retires itself); death screen; jump-sickness flash; moodle column; character sheet (K); one container/loot/trade panel (modal input-lock); DEV MODE (F10); secondary-view PiP (DOGCAM/REARVIEW/DRONE); **save one-file round-trip**; jack→scrip migration on load; **THE CIRCUIT** loop (4 idempotent beats + payoff); border reactions; deterministic daily world-events; two-tier audio (mp3 override + synth fallback); **Drivn* data spine** (vehicle fold) + expanded 34-item inventory.
- **Multiplayer:** ENet co-op, remote players + vehicles (client-auth 20 Hz, seq-interpolated), host-authoritative enemies — proven in `net_sim` (16 checks) **and** a live 2-process loopback.
- **The Carousel:** full dungeon ladder (PAIR/ROULETTE/DIAL, occupiers, garages, ring sieges, flesh-not-steel).

### 2b. PARTIAL — built but incomplete (33). *These are the traps.*

The most important, condensed. Full list is in the audit; the recurring theme is **persistence** and **dead metadata**:

| Feature | What's there | What's missing |
|---|---|---|
| **Crew persistence** | hire/jobs/fight/death all work | **crew are NOT saved** — vanish on load; only their death-memorial persists |
| **Weather persistence** | full state machine + taxes | **weather not saved**; `grip_now` is a process-wide static (last force wins for all cars) |
| **Hunger persistence** | drains/feeds/taxes, sim-proven | `character.to_record` **omits hunger** — starving loads back full |
| **Metaworld persistence** | dehydrate/hydrate works | `metaworld.records` **not saved**; a guarding/downed dog is dropped on load; offscreen raid is one hardcoded stub |
| **World-events persistence** | roll_daily deterministic | active war/caravan **not saved** — lost until next dawn |
| **Vehicle weapon mounts** | `car_mg` row + fire/reload code complete; `mounts` array in rows | **`mount_weapon` is never assigned anywhere** — the fire path is permanently dead-gated; the attach half doesn't exist |
| **Vehicle armor** | fields + Forge editing + data_sim | **armor is inert** — `take_damage` ignores it entirely |
| **Car takes combat damage** | crash/explosion splash hit it | enemies & the mount MG never damage the car — **you can't be shot in your ride** |
| **Road CHARACTER rows** | parsed, surfaced, toasted | **zero consumers** — toll never billed, danger never weights ambush, family read by nothing (the READ only) |
| **Data-spine read-back** | schemas + JSON + 45 .tres + write tools | runtime is **vehicle-only**; items/NPCs/loot still read hardcoded consts. "A new item = a ROW" is **not true** for these. `items.json` is stale (27 vs code's 34) |
| **Town population** | economy/bounty/NPCs all work | **only Meridian is populated** — every other city is empty |
| **Bounty board** | one hardcoded set-piece contract | not a repeatable/data-driven board |
| **Hire archetypes** | drifter→Sam works | mechanic/medic (Hazel/Mercer) **never spawn** in the world — those hire branches are dead; `_recon_name` hardcodes "SAM (yours)" for all crew |
| **Per-chunk persistence** | streaming + placements work | looted containers / wrecks / doors you leave **do not persist** |
| **Crit / camera-shake / get-up-stamina / misfire-battery** | all implemented | **no sim asserts them** — combat juice rides untested |

### 2c. DESIGNED in the docs, NOT built (33 — the roadmap ceiling)

The big ones (all doc-referenced, effectively zero code): full **700-pt skill tree** + 5 attributes + 60 skills; **robotics** (8 tiers) & **taming** ladder (wolf→beetle-mount) & **agriculture**; **base construction** ladder + power grid (Pillar 8); **19-slot equipment paperdoll** + material tiers + set bonuses; **body afflictions** + treatment-as-gameplay Body Panel; **repair screen**; **seven faction FAMILIES** with law profiles (tolls/curfews/contraband/checkpoints/debt); **50 distinct state rulers** with gameplay (only lore text exists); **Carousel misjump risk + key economy + vision-blur**; **RV pocket-instance camp**; **HARDCORE LEGACY** permadeath-with-inheritance + death-legacy deltas; **PCAS pedestrian tiers** + gossip network; **car weapon system** (turret/mines/oil/ram-plate) + Scout/Raider/Tank/Mule builds; **stealth backstab**; **cruise/fast-travel modes**; **cartography-as-loot**; **content pipeline** (loot-table roll, seeded save, WFC towns, AI→3D art); **dialogue system**; **job board + named-enemy nemesis**; **four measured endings + mystery spine**; **doors** (openable/lockable/cone-blocking); **procedural building→town assembly**; **akimbo/dual-wield**; **Art Range** (aesthetic undecided); **hover/rail/boat + tanks/treads + bicycles + trailer variants**.

### 2d. SPOKEN this session, UNBUILT (17 — your own asks not yet in the game)

1. **SIGNS for the illiterate** — a symbol marks "this is words"; hover the mouse OR get it in your sight cone to read it. **No sign/symbol system exists.** *(bounded, buildable next — see §10)*
2. **Vehicle weapon mounts actually usable** — the equip/attach half; firing code is done, `mount_weapon` never assigned.
3. **Deployables** (mines / oil slick) — no drop-place system at all.
4. **Taming beyond dogs** (wolves→beasts) — only dog adoption.
5. **Armoring & combat-mod tiers** (Scout/Raider/Tank/Mule) — armor fields inert.
6. **Drone tiers 2-8** — only the single scout drone.
7. **Hover / rail / boat** vehicle classes — no non-wheel locomotion.
8. **Full 700-pt skill tree + robotics + farming** — only 10 learn-by-doing skills.
9. **AoI interest management** (32-scale) — MP replicates everything.
10. **Host-authoritative hit resolution** — damage is client-side.
11. **MP join-flow / scene polish** — menu HOST/JOIN exist; polished join-into-loaded-world is future.
12. **ElevenLabs SFX pipeline** from web descriptions — `generate.mjs` exists, 57 files banked, but no wired repeatable describe→generate→wire loop; many banked-not-wired.
13. **Procedural exit-towns** — only Meridian; other exits empty.
14. **Per-chunk persistence** — deltas you leave don't save.
15. **Biome/theme variety at exits** — scatter exists; authored per-exit theme doesn't.
16. **lurker.gd → shared puppet rig** — last bespoke enemy; refactor undone.
17. **Carousel jump-sickness BLUR** — the white-tear/teal *flash* shipped; the vision-*blur* post-effect is unbuilt.

---

## 3. The reined-in roadmap (what to actually do next)

From the synthesizer, lightly edited. **Ranked. Respect the scope discipline in #7.**

1. **QUICK WIN — Close the persistence holes** (weather, hunger, crew, metaworld records, today_event/war). Highest value-per-hour: makes *existing* content trustworthy instead of adding new content. A shippable game cannot lose a hired crew or a guarding dog across a reload.
2. **QUICK WIN — One source of truth for magic constants + a save `version` field.** Four near-but-different safehouse coords are hand-synced today (§8). Cheap; kills a class of drift bugs.
3. **QUICK WIN — Wire the data-spine read-back for items/NPCs/loot** (read `items.json`/npcs/loot_tables like the game already reads `vehicles.json`) and regenerate the stale `items.json`/.tres. Makes "a new item = a ROW" true instead of a lie; unlocks all future content authoring.
4. **MEDIUM — Ship the road-row CONSUMERS** (bill tolls, weight ambush by danger, wire family). The READ is done; this is your stated P3 priority; turns dead-but-authored data into felt gameplay cheaply.
5. **MEDIUM — Finish the mount attach path** (assign `mount_weapon` from the `mounts` array + one loot/equip entry) and let the car body take hostile combat damage. Both are your P5 asks; the firing code already exists; "you can't be shot in your ride" undercuts the core fantasy.
6. **MEDIUM — Harden the flaky sims** and add the missing assertions (crit, camera trauma, get-up stamina, misfire/battery, timer-driven traffic/pirate/respawn). Combat-feel is the AAA pillar; its juice currently rides untested timing-sensitive tests. *(Since done: the dog_sim red is FIXED — §8 — and the crit/trauma/misfire/get-up assertions landed per the banner.)*
7. **SCOPE DISCIPLINE — Do NOT start the big designed pillars** (700-pt tree, robotics/farming/base, paperdoll, faction families, 50-ruler content, hover/rail/boat, AoI/host-auth MP, RV pocket-instance, procedural exit-towns). Weeks each. Polishing and truthfully persisting what exists reads as *more* shippable than another half-wired system.
8. **SMALL — lurker→puppet refactor and signs-for-illiterate** as bounded one-offs; both are your asks, self-contained, each closes a gap without opening a pillar.
9. **PROCESS — Reconcile the docs with reality** (§9). A new dev decides from these docs; stale status is itself a shipping risk.

---

## 4. Architecture (how the thing is built)

**One engine, everything is a ROW.** The design north star: *content ≠ code*. Adding a vehicle/item/NPC/base/upgrade should be a data row that one engine consumes.

- **res:// == `game/`.** res:// holds exactly four dirs: `addons/ assets/ data/ proto3d/`. Everything else (the old 2D game) is **quarantined** at `legacy-2d/` outside res:// and can never load (see `legacy-2d/README.md`).
- **`game/proto3d/proto3d.gd`** is the ~2800-line main scene / god-object: owns player, cars, the CIRCUIT, save/load, `on_explosion`, respawn, the per-frame update fan-out (`_update_*`), and hosts every subsystem node.
- **Components over inheritance; signals over coupling.** `Damageable` is the *one* damage class. The **ONE DAMAGE LAW**: every fighter is in group `combatant`; the player is an ordinary body with `take_damage` + a `damaged` signal. Melee/blast scan `combatant ∪ threat`.
- **The puppet rig** (`puppet.gd`, `quadruped.gd`): one sin()-driven box rig fed data rows — players/NPCs/crew and dogs/howlers. *(lurker is the last enemy NOT on it — a pending refactor.)*
- **The data spine** (`game/proto3d/data/*.gd`, `Drivn*` schemas, `stamp.gd` JSON→.tres): **fully wired for vehicles only.** Items/NPCs/loot still read hardcoded consts (`ProtoContainer.ITEMS`, `ProtoNPC.ARCHETYPES/PRICES`). Closing this is roadmap #3.
- **The systems table** in `CLAUDE.md` is the current, accurate index of every subsystem, its file(s), and its one-liner. Keep it in sync — it's the map a new dev reads.
- **Tools** (write-side content authoring, run under Node): `tools/mapforge` (:8899, map editor + REST), `tools/vehicleforge` (:8898, fleet editor), `tools/soundforge` (ElevenLabs SFX + TTS). Philosophy: *models/humans tune content via tools, never code.*

---

## 5. How to work here

- **Run the game:** `Godot --path game res://proto3d/proto3d.tscn` (exe: `C:/Users/taskm/Downloads/projects/Godot/Godot_v4.5.1-stable_win64.exe`; `_console.exe` for headless). Play/F5 in the editor also works — `run/main_scene` is correctly pointed at proto3d now.
- **The iron rule of testing:** headless sims must exercise the **REAL path — inputs, not teleports** (staging *positions* is the one documented exception). Every feature lands with a sim; every bug fix leaves a regression check.
- **Run one sim:** `Godot_console --headless --path game res://proto3d/tests/<name>.tscn` → look for `ALL CHECKS PASSED`.
- **After adding any new `class_name` script:** run `--headless --path game --import` once before headless sims, or they won't find the class.
- **Commit after every feature; push to `origin main`.** Clean messages, **no `Co-Authored-By`** lines (owner's standing rule). Commit-message backticks execute in the bash subshell — avoid them or words get dropped.
- **Never use purple** in any UI/art/chart (owner's absolute rule). House palette is ink/bone/amber.

---

## 6. Paid-for gotchas (do not re-pay these)

- New `class_name` scripts need `--headless --path game --import` before headless runs.
- **`get_tree().current_scene` is the SIM harness** in tests — fall back to `get_parent()` for main. (Recurs constantly; the menu/onboarding gate on `current_scene == self`.)
- First headless frame can be >100 ms; tweens run on real frames; input events need several `process_frame`s to land; **give every main-scene sim a WATCHDOG timer.**
- **`queue_free` clears at frame end** — sims counting immediately need an `await`.
- Cinematics/sims must restore the **PREVIOUS** `Engine.time_scale`, never blindly 1.0. **[low-confidence]** `dive_dilation`, `on_explosion`, and `cinematic_kill` share `_cine_lock` — a shootdodge airborne during an explosion silently loses its dilation.
- `take_wound` drains core hp too — top hp between staged wounds or the character dies mid-test.
- Chassis-critical + breached tank = fire spiral — separate damage phases in tests.
- Positive `engine_force` pushes **+Z** (forward is negative).
- **Dictionary element access needs explicit types** (`var x: float = dict["k"]`) or `:=` inference fails the parser. (Bit three sims this session.)
- **Howlers BURN OFF in daylight** — sims that spawn howlers as targets must set `daynight.hour = 0.0` first, or the target frees mid-test.
- Retargeting a group (e.g. `threat`→`combatant`) can orphan test dummies — melee scans the UNION so any hostile is meleeable however tagged.
- **`DataVehicle`/`DataItem` class names were TAKEN by the legacy 2D code** — the spine uses `Drivn*`. (The 2D quarantine freed the names, but keep the convention.)
- Kill zombie `*_console.exe` processes if a headless run hangs a port/lock.
- **ENet ports:** `net_sim`/`menu_sim` HOST checks fail if the live game (or a prior run in TIME_WAIT) holds UDP 24555 — an *environment* conflict, not a code bug.
- **Sims flake under CPU contention** — stretched physics frames blow tight timing windows (0.15 s obey window, dive-fire window). Run suspect sims alone/quiet before believing a red.
- Git will warn `LF will be replaced by CRLF` on Windows — cosmetic, ignore.

---

## 7. The test suite

**~104 headless sims** (+ `net_host`/`net_client` for the 2-process loopback). **The last FULL clean run was 71/71 green** (2026-07-07). Since that run the suite grew again: `strike_sim` **38/38**, `strike_author_sim` **37/37**, `data_sim` **19/19**, and `motion_stage_sim` **12/13** (documented baseline — a known restore-flake on its last check).

- **`dive_sim`** — a **load-flake**: fails only under heavy concurrent CPU (its dive/fire timing windows stretch); passes clean when run alone. Harden by gating on frames, not seconds.
- ~~**`dog_sim`** — a REAL red~~ — **FIXED** (commit `2787e64`, see §8): `dog_sim` 12/12 + `dogverb_sim` 11/11 verified 2026-07-07.
- Historically flaky under back-to-back load: `dark_sim`, `dogmeta_sim`, `stage4_sim`, `combat_feel_sim` — all pass solo. (Open task: harden.)

**Coverage gaps (systems with working code but NO sim):** camera look-ahead/FOV-widen, and the timer-driven `_update_traffic`/`_update_pirates`/`KEY_R`-respawn cadences (sims call helpers directly, never drive the timers). *(The crit / camera-trauma / get-up / misfire / mount-fire gaps have since been closed — `melee_sim`, `feel_sim`, `getup_sim`, `misfire_sim`, `mount_sim`, per the banner.)*

**[historical caveat]** Every "sim asserts X" in the original audit came from auditors *reading assert lines*, not observing a green pass — that caveat produced §8. It has since been discharged: a full clean 71/71 run was observed and the one real red was fixed. Keep the suspicion for future "shipped" claims: run, don't read.

---

## 8. RESOLVED: the `dog_sim` rear-smell red (fixed in `2787e64`)

- **Symptom (historical):** `dog_sim` failed at `rear-smell: dog alerted, flagged BEHIND` — consistently, even run alone/quiet. Not a flake.
- **Root cause (confirmed — it was (b)):** the dog *did* alert; `behind` computed `false` because `dog._sense` reads the **gaze** (`player.sight_facing()`), and the test had staged the threat behind the player's *movement*, not the gaze — post-walk facing wasn't the −Z the test assumed.
- **The fix (`2787e64` — "dog_sim green: rear-smell staged behind the GAZE, obey check converges"):** the test now stages the gaze explicitly (the design intent — *a dog always knows what's behind your GAZE* — was right; the code hadn't regressed), and the Companion-obey flake converges instead of racing a fixed window. **Verified 2026-07-07: `dog_sim` 12/12 + `dogverb_sim` 11/11.**
- **The lesson stands:** this was the concrete proof of the auditor's #1 caveat — "shipped" was read, not run. Keep treating flaky sims with that suspicion.

---

## 9. Doc drift — which docs to trust, which over-claim

The status fields in the design docs are **stale relative to the mainline**. A new dev must not treat them as ground truth:

- **`STAGES.md`** marks Stage 2/3/4 (living car, body/health, aim-cone) as *future/unclear* — but they're substantially **BUILT**. The roadmap lags the code.
- **`ENGINE.md` / `VEHICLES.md`** list tanks/treads and the turret mount as *done* — **no tread locomotion exists** (tanks remain unbuilt). *(The mount half has since SHIPPED — `mount_schematic` bolts a `car_mg` on, `mount_sim`/`car_combat_sim` — so only the tanks/treads over-claim remains.)*
- **`DIVIDED_STATES.md`** promises 50 distinct rulers + Carousel key-economy + misjump — the code has ~14 `rulers.json` rows and none of the key/misjump systems. Massive over-promise vs the shipped state-reaction slice. *(Its code-rename section, however, is now correctly marked done — that sweep shipped.)*
- **Trust, in order:** this HANDOFF (§2) → `CLAUDE.md` systems table → the sims themselves → then the design docs (for *intent*, not *status*).

**Recommended process fix (roadmap #9): ✅ DONE (2026-07-07)** — STAGES/ENGINE/DIVIDED_STATES/VEHICLES all carry the "see HANDOFF §2" banner, and the finished one-shot plan docs (MASTER_PLAN, cinema, MOVESET, CAROUSEL, RV_PLAN, UI_UX_PLAN, LOOP2) were retired in the 2026-07-07 doc audit (git history preserves them).

---

## 10. Where to start each unbuilt spoken ask

Bounded starting points so the next dev doesn't have to re-derive the seams:

- **Signs for the illiterate:** add a `ProtoSign` interactable (a data row: `pos`, `glyph`, `text`). Reuse the existing **vision-cone reveal** hook (`vision_cone.reveal_at`, already used by dog alerts) to gate "readable" — when a sign enters the cone (or the mouse hovers, like the existing interact-prompt raycast), pop its text via the same toast/prompt UI. The symbol-over-sign is a `Label3D` (as `dog._mark_threat` already does). ~1 focused slice + a `sign_sim`.
- **Vehicle mounts usable:** the fire path (`fire_mount`/`_reload_mount`) is complete and dead-gated on `active_car.mount_weapon == null`. Assign it: read the `mounts` array already on `vehicles.json` rows, attach a `car_mg` (or a looted mount item) → set `mount_weapon`. One equip entry + a positive sim (currently only a *negative* "no default mount" check exists).
- **Car takes combat damage:** enemies/mount only damage on-foot bodies today. Route hostile hits that land on a `ProtoCar3D` into its existing 5-part `take_damage` (armor fields are sitting there inert — wire them here too).
- **Deployables (mines/oil):** new `usable` item rows that spawn a world node on USE; reuse the `on_explosion` blast law for mines and a `grip_now`-style patch for oil.
- **lurker→puppet:** port `lurker.gd`'s bespoke visual to the `ProtoPuppet`/`quadruped` rig the way `howler` already is; keep its unique AI, swap only the body. A `puppet_sim`-style check confirms it animates.
- **ElevenLabs SFX pipeline:** `tools/soundforge/generate.mjs` + `voices.mjs` exist; the missing piece is a repeatable `describe→generate→wire` loop and a manifest so generated files auto-load (many are banked-not-wired). **[low-confidence]** `voices.json` source lines still say "jack" — a `--force` re-roll would speak the pre-rename currency; fix the source strings first.

---

## 11. Numbers & pointers

- **280+ commits**, single `main` branch, pushed to `origin`.
- **~104 sims**, 118+ proven systems, ~44 GDScript files in `game/proto3d/`.
- **Master vision:** `docs/ENGINE.md`. **Pillars:** `docs/WORLD_PILLARS.md`. **Lore:** `docs/DIVIDED_STATES.md`. **Per-system design:** `docs/systems/*`. **This gap analysis is the source of truth for STATUS.**
- **Open tasks at handoff:** harden the flaky/red sims (start with §8), the P3 road-row consumers, and everything in §2b/§2d above.

---

*Handed off with the tree clean, everything committed and pushed, and the suite at its honest ~66/68. It was a good build. — the retiring dev.*
