# DRIVN / Divided States of America
## Technology, Offline World Progression, Broadcast Media, Clones, Crime, Jail, Drones, and In-World Games - Detailed Spec

**Document version:** 0.1  
**Date:** 2026-07-06  
**Project:** DRIVN / Divided States of America (DSOA)  
**Purpose:** Convert the latest brainstorm into a buildable engineering and design specification.  
**Source:** Owner conversation + current engineering handoff.  
**Status:** Design spec. Not a fresh code audit. Current code references are based on the provided handoff.

---

## 0. Brutal Read Before Building

The ideas are strong, but they are dangerous because they can explode the scope. Robots, drones, AI video, gaming consoles, clones, mobile play, jail, military bases, and dynamic state takeovers sound like separate features. They cannot be built as separate features. That would create ten half-finished systems and no game.

The correct interpretation is this:

> **The world keeps moving when the player is gone, and technology is how the player observes it, survives it, manipulates it, and sometimes cheats death.**

That is the spine. Everything below must serve that spine.

The dream feature is not merely AI video. It is not merely a phone app. It is not merely drones. The dream feature is:

> **The Return-to-a-Changed-State sequence: the player logs back in after days away, wakes inside their safehouse, sees that the state has changed politically, hears it on radio/TV/phone, sends a drone to verify the streets, decides whether their gear is now contraband, and plans the next move.**

If this works, DSOA feels alive in a way most open-world games do not.

---

## 1. Design North Star

### 1.1 One-Sentence Feature Identity

**DSOA is a survival road game where the map is politically alive: states can fall, laws can change, factions can ban your gear, towns can host traps, and the player uses vehicles, dogs, drones, radio, TV, phones, in-world games, and cloning insurance to survive the consequences.**

### 1.2 Player Fantasy

The player should feel:

- They live in a dangerous, changing America.
- Their home state is not guaranteed to stay theirs.
- Their house matters because it is the one place they can gather intelligence before stepping outside.
- Technology is power, but also a tracking surface and legal risk.
- Death can be softened by money, cloning, and insurance, but never made meaningless.
- The world is not waiting for them. It moves.

### 1.3 Core Design Rule

**No feature is allowed unless it creates one of these pressures:**

1. **Route pressure:** Where do I go, and how dangerous is the trip?
2. **Law pressure:** What is legal here today that was illegal yesterday, or vice versa?
3. **Visibility pressure:** Who can see, hear, record, or report me?
4. **Survival pressure:** Can I keep myself, my dog, my crew, my vehicle, and my home alive?
5. **Legacy pressure:** If I die, what survives me and what changes?
6. **Tech pressure:** Can I use drones, broadcasts, consoles, insurance, or robots without becoming dependent on them?

---

## 2. Current Game Context From Handoff

### 2.1 Existing Systems to Reuse

The provided handoff says the game already has several pieces that make this spec realistic:

| Existing system | Current state | How this spec uses it |
|---|---:|---|
| `metaworld.gd` | Offscreen dog/raid rolls | Becomes cheap offline simulation layer. |
| `events.gd` | Deterministic daily world events | Becomes the daily political/event tick. |
| `motorist.gd` | NPCs actually drive city-to-city | Used to render nearby convoys, patrols, caravans, tournament traffic, raids. |
| Carousel ring events | Besiege/relieve/lose template | Used as the interruptible world-event template. |
| `radio.gd` | Broadcast seam | Expanded into radio/TV/phone broadcast system. |
| Respect ledger/rulers | Prices and standing | Expanded into state control, law profiles, contraband, arrest rules. |
| Dogs | Strongest pillar | Extended into military K9s, drone detection, offscreen hunger risk. |
| Vehicles | Seats, trunk, damage, fuel, mounts partial | Expanded into multiple passengers, mobile drone transport, checkpoint recognition. |
| Save/load | One-file round trip | Adds `last_played_at`, offline ticks, world-state version, active laws, clone backups. |
| ENet co-op | Working client-auth co-op | Later supports passengers, arrests, jailbreaks, but not first. |

### 2.2 Biggest Existing Gap This Spec Must Not Ignore

The game has many systems, but the pressure loop is still underbuilt. The most important missing foundation remains:

> **The road must become a gauntlet of choices, not just a way to move between features.**

That means the technology layer should not replace the Journey Board / Route System. It should strengthen it.

The correct build order is:

1. EventDirector + Offline Catch-Up.
2. State Law Profiles.
3. Safehouse Return Briefing via radio/TV/phone.
4. Journey Board consumes live events and law changes.
5. Drones/robots as scouting and enforcement tools.
6. Cloning/insurance as a death modifier.
7. In-world console/tournaments as event bait.
8. Mobile drone mode.

---

## 3. Feature Inventory From Latest Brainstorm

This section captures the raw asks and translates them into buildable systems.

| Brainstorm idea | Spec system | Priority |
|---|---|---:|
| Player gone four days, logs back in, home state changed | Offline World Progression + Return Briefing | P0 |
| Florida taken by Georgia religious faction, guns banned | State Control + Law Profiles + Contraband | P0 |
| Player stays inside and checks radio/TV/news before walking out | Safehouse Intelligence Interface | P0 |
| AI-generated 15-30 sec news clips on TV | Broadcast Media Pipeline | P1 |
| Same anchor/logo/news format | Broadcast Channel Identity | P1 |
| Robots and drones | Tech Layer: Drones, Bots, Enforcement Robotics | P2 |
| Phone interface to play/assist from mobile | Mobile Drone Ops Mode | P3 |
| Control drone from helipad/home while away | Safehouse Drone Dock + Remote Piloting | P2/P3 |
| Gaming console inside game | In-World Console Platform | P3 |
| Play many games inside the game | Mini-game Runtime | P3+ |
| Tournament in Virginia that may be a trap | Tournament Live Event | P2/P3 |
| Multiple people inside vehicles | Seat System / Passenger Roles | P1/P2 |
| Military bases, soldiers, military dogs | Military Site Archetype | P2 |
| Killing people creates murderer status | Crime, Witness, Evidence, Reputation | P1/P2 |
| Move bodies before police/community sees them | Body/Evidence Handling | P2 |
| Jail, time passes, dog hunger risk | Arrest + Jail + Time Consequence | P2 |
| Jailbreaks | Jailbreak Mission Template | P3 |
| Death is different if rich: cloning/life insurance | Clone Insurance / Backup System | P2 |
| Cloning illegal in some religious states | Regional Clone Law | P2 |

---

## 4. Signature Feature: The Return-to-a-Changed-State Sequence

### 4.1 Goal

When the player has not played for a while, DSOA should make absence feel like the world continued without them.

Example:

1. The player lives in Florida because it has strong gun loot and gun-friendly laws.
2. The player does not play for four real days.
3. On return, the save calculates four days of world events.
4. Georgia's religious faction has expanded south and taken control of Florida.
5. Florida's law profile changes: open carry is banned, clone clinics are illegal, churches and checkpoints are active, gun ownership may require faction permit.
6. The player wakes in their safehouse, not immediately punished.
7. The player turns on TV/radio/phone.
8. A bulletin explains the state takeover and new laws.
9. The player can send a drone outside to inspect checkpoints/patrols.
10. The player must decide: hide guns, smuggle them, fight, flee, pay, disguise, join, or retake territory.

### 4.2 Non-Negotiable Fairness Rules

Offline progression must be exciting, not abusive.

1. **No instant unavoidable death while offline.** If the player logged out safely, they should wake safely unless their safehouse was already compromised or poorly secured.
2. **Major changes need a briefing.** If laws or faction control changed, the player must be told before they walk into punishment.
3. **Offline punishment must be bounded.** The game can change the world, damage property, starve dogs if neglected, or shift faction control, but it should not silently wipe the player without counterplay.
4. **Every offline result creates gameplay.** A lost state should create missions, routes, opportunities, rescue operations, smuggling choices, or rebellion options.
5. **The simulation must be deterministic.** Same save, same absence length, same seed should produce the same offline result for debugging and fairness.
6. **Caps are required.** Simulate a maximum number of offline days at once, such as 7 or 14, so a six-month absence does not destroy the whole game.

### 4.3 Return Flow

**Trigger:** On load, compare `now_utc` against `save.last_played_at_utc`.

**If absence < threshold:** Normal load.

**If absence >= threshold:** Run catch-up.

Recommended thresholds:

| Absence | Result |
|---:|---|
| < 12 hours | No catch-up, maybe local timers only. |
| 12-24 hours | Minor local changes, market/prices/weather. |
| 1-3 days | Daily events, small faction movement, patrol changes. |
| 4-7 days | Major event possible: state takeover, embargo, tournament, siege, base activation. |
| 8+ days | Cap at configured maximum, generate larger digest, avoid runaway destruction. |

### 4.4 Return Briefing UI

When catch-up has run, do not dump the player into normal play. Show a **State of the State** screen from inside the safehouse.

The screen should show:

- Days passed.
- Current state and controlling faction.
- New laws.
- Contraband warnings based on the player's inventory.
- Nearby patrols/checkpoints.
- Safehouse status.
- Dog/crew status.
- Vehicle status.
- Active broadcasts.
- Recommended route warnings.

Player actions from this screen:

1. Watch TV.
2. Turn on radio.
3. Open phone.
4. Check map/Journey Board.
5. Send scout drone.
6. Hide/stash contraband.
7. Change outfit/vehicle.
8. Feed dog/crew.
9. Leave safehouse.

### 4.5 Pseudocode

```gdscript
func load_game(record):
    restore_save(record)
    var gap_hours := hours_between(record.last_played_at_utc, now_utc())
    if gap_hours >= OFFLINE_CATCHUP_THRESHOLD_HOURS:
        var result := event_director.run_offline_catchup(record, gap_hours)
        apply_world_result(result)
        broadcast_system.queue_digest(result)
        ui.show_return_briefing(result)
    else:
        enter_world_normally()
```

```gdscript
func run_offline_catchup(record, gap_hours):
    var days := clamp(floor(gap_hours / 24.0), 0, MAX_OFFLINE_DAYS)
    var digest := OfflineDigest.new()
    for i in days:
        var day_seed := hash(record.save_id + record.world_day + i)
        var events := roll_daily_events(day_seed, record.world_state)
        for event in events:
            var outcome := resolve_event_calculated(event, record.world_state)
            apply_outcome_to_world(outcome)
            digest.add(outcome)
    return digest
```

---

## 5. EventDirector: The System That Makes the World Move

### 5.1 Purpose

The EventDirector unifies the existing metaworld rolls, daily events, real rendered events, ring sieges, and radio broadcasts.

It should answer:

- What happened while the player was gone?
- What is happening far away right now?
- What should render near the player?
- What did the player interrupt?
- How does the world broadcast the result?

### 5.2 Event Modes

| Mode | Distance from player | Simulation style | Example |
|---|---:|---|---|
| Calculated | Far/offline | Cheap roll, no actors spawned | Georgia faction pressures Florida. |
| Semi-rendered | Adjacent/near route | Spawn markers, radio, patrol hints | Convoy appears on Journey Board. |
| Rendered | Near player | Real actors/vehicles/dogs/drones spawned | Religious checkpoint blocks highway. |
| Interruptible | Player engages | Combat, stealth, negotiation, sabotage | Player destroys convoy, flips outcome. |
| Resolved | After event | Apply deltas and broadcast result | Radio reports road reopened. |

### 5.3 Event Data Row

```json
{
  "id": "ga_faith_pushes_florida_001",
  "kind": "state_takeover",
  "title": "Georgia Faith Bloc pushes into North Florida",
  "primary_faction": "broadcast_church",
  "secondary_faction": "free_counties",
  "route_or_site": "I-75_North_Florida",
  "states_affected": ["GA", "FL"],
  "min_world_day": 12,
  "offline_eligible": true,
  "render_distance_km": 25,
  "severity": 4,
  "prerequisites": {
    "broadcast_church_strength_gte": 60,
    "florida_instability_gte": 45
  },
  "calculated_resolution": {
    "broadcast_church_win_weight": 0.62,
    "stalemate_weight": 0.25,
    "free_counties_hold_weight": 0.13
  },
  "on_success": {
    "set_state_controller": {"FL": "broadcast_church"},
    "apply_law_profile": {"FL": "faith_occupation_law"},
    "price_delta": {"guns": 2.5, "ammo": 3.0, "food": 1.2},
    "spawn_checkpoints": ["I-75", "I-95", "US-1"],
    "radio_template": "faith_bloc_florida_takeover"
  },
  "on_interrupt_player_win": {
    "respect_delta": {"free_counties": 15, "broadcast_church": -25},
    "state_instability_delta": {"FL": 10},
    "radio_template": "player_stalls_faith_bloc"
  }
}
```

### 5.4 Outcome Data Row

```json
{
  "event_id": "ga_faith_pushes_florida_001",
  "outcome": "broadcast_church_victory",
  "world_day": 42,
  "affected_states": ["FL", "GA"],
  "new_laws": ["gun_permit_required", "clone_clinic_ban", "curfew_after_dark"],
  "player_relevance": "home_state_changed",
  "broadcast_ids": ["tv_fl_takeover_42", "radio_fl_takeover_42"],
  "journey_board_hazards": ["faith_checkpoint", "weapon_search", "permit_scan"]
}
```

---

## 6. State Control and Law Profiles

### 6.1 Goal

Faction control must change how the player behaves. A state line should feel like crossing into another country.

### 6.2 Law Profile Categories

Each state has a controlling faction and an active law profile.

Law profile controls:

- Gun legality.
- Open carry vs concealed carry.
- Ammo restrictions.
- Drone legality.
- Clone legality.
- Curfews.
- Toll enforcement.
- Checkpoint behavior.
- Contraband categories.
- Arrest rules.
- Jail severity.
- Dog rules.
- Vehicle inspection rules.
- Faction uniform/disguise usefulness.
- Broadcast propaganda style.
- Quarantine rules (herd corridors, bio-contraband, fever body-scans, advisory broadcasts — THE_INFECTED.md I2; `journey_board_hazards` vocab gains `quarantine_checkpoint`/`herd_crossing`).

### 6.3 Example Law Profiles

#### Free Counties Law

- Guns legal and common.
- Checkpoints are suspicious but negotiable.
- Taxes/tolls low.
- Strong militia presence.
- Cloning tolerated if private.
- Drones tolerated if unarmed.
- Crime response is fast if locals like the victim, slow if they do not.

#### Broadcast Church / Religious Occupation Law

- Guns illegal without faction blessing/permit.
- Clone clinics banned or burned.
- Curfew after dark.
- Religious broadcast towers active.
- Dogs may be tolerated, but aggressive breeds draw suspicion.
- Drones considered spycraft unless faction-owned.
- Public murder triggers harsh pursuit.
- Black-market gun trade becomes valuable.

#### Corporate Corridor Law

- Guns legal only for licensed security or paying customers.
- Drones common and heavily tracked.
- Cloning available through expensive insurance plans.
- Debt replaces jail for many crimes.
- Checkpoints scan vehicles, cargo, and identity.
- High prices, clean roads, brutal repossession.

#### Federal Remnant Law

- Strict IDs/checkpoints.
- Heavy military patrols.
- Gun registration enforced.
- Clone tech might be classified.
- Jail and interrogation common.
- Drones and robots used for enforcement.

### 6.4 Law Profile Data Row

```json
{
  "id": "faith_occupation_law",
  "display_name": "Faith Occupation Law",
  "controlling_family": "broadcast_church",
  "gun_policy": "permit_required",
  "open_carry": false,
  "ammo_policy": "restricted",
  "clone_policy": "illegal",
  "drone_policy": "faction_only",
  "curfew": {"enabled": true, "start_hour": 21, "end_hour": 5},
  "checkpoint_density": 0.75,
  "contraband": ["unlicensed_gun", "clone_contract", "armed_drone", "federal_badge"],
  "public_murder_response": "zealot_manhunt",
  "jail_profile": "hard_labor_or_conversion",
  "broadcast_style": "sermon_news",
  "search_behavior": {
    "scan_vehicle_trunk": true,
    "scan_player_inventory": true,
    "scan_dog_tags": false
  }
}
```

### 6.5 Player Inventory Contraband Check

When entering a law zone or loading after a state changed:

```gdscript
func evaluate_contraband(player, law_profile):
    var flags := []
    for item in player.inventory:
        if law_profile.contraband.has(item.legal_tag):
            flags.append(item)
    for vehicle_item in active_car.trunk:
        if law_profile.contraband.has(vehicle_item.legal_tag):
            flags.append(vehicle_item)
    return flags
```

Important: Being inside the safehouse with contraband should not instantly arrest the player. The risk triggers when they are seen, searched, reported, scanned, or raided.

---

## 7. Safehouse Intelligence Interface

### 7.1 Goal

The safehouse becomes the player's command center. When the world changes, the smart player does not walk outside blind. They check the feeds first.

### 7.2 Safehouse Devices

| Device | Function | Build priority |
|---|---|---:|
| Radio | Audio bulletins, emergency alerts, faction propaganda | P0 |
| TV | News digest, 15-30 sec clips, maps, faction speeches | P1 |
| Phone | Alerts, map, drone interface, crew/safehouse status | P1/P2 |
| Game console | Mini-games, tournaments, event bait | P3 |
| Drone dock/helipad | Launch/recall drones | P2 |
| Security panel | Lockdown, cameras, doors, alarms, power | P2 |
| Clone terminal | Insurance status, backup age, body activation | P2 |

### 7.3 Return Briefing Example

```
FOUR DAYS PASSED

HOME STATE: FLORIDA
CONTROL: Broadcast Church occupation forces
OLD LAW: Free Counties firearm law
NEW LAW: Faith Occupation Law

WARNING:
- 3 items in your house are now contraband.
- 1 gun in your car trunk will trigger checkpoint search.
- Clone insurance is no longer honored inside Florida.
- Curfew begins at 21:00.

LOCAL REPORTS:
- Checkpoint reported at I-75 northbound.
- Church patrols seen near your district.
- Black-market trader rumor: old marina after midnight.

OPTIONS:
[Watch TV] [Radio] [Phone] [Launch Drone] [Hide Contraband] [Journey Board] [Leave House]
```

### 7.4 Safehouse Lockdown Rules

If the player logs out inside a secured safehouse:

- Player body is protected from random murder.
- Doors lock.
- NPCs cannot casually enter.
- Dog/crew consume stored supplies over time.
- Safehouse can be raided only if an event specifically targets it, and only if security/supply conditions allow it.
- Alarms, cameras, doors, and drone dock become meaningful upgrades.

This protects fairness while preserving consequences.

---

## 8. Broadcast System: Radio, TV, Phone, and AI Video

### 8.1 Goal

The world must announce itself. The player should learn about state takeovers, road closures, tournaments, raids, laws, and opportunities through diegetic media.

### 8.2 Broadcast Types

| Broadcast type | Medium | Example |
|---|---|---|
| Emergency alert | Radio/TV/phone | Curfew active in Florida. |
| Faction propaganda | Radio/TV | Broadcast Church claims liberation. |
| Local news | TV/phone | Checkpoints opened on I-95. |
| Road bulletin | Radio/Journey Board | Crimson Road ambushes near Exit 142. |
| Tournament ad | TV/console/phone | Retro arcade tournament in Virginia. |
| Black-market rumor | Radio/phone | Clone doctor operating near swamp clinic. |
| Personal alert | Phone | Dog food low, crew injured, safehouse alarm tripped. |
| Player legend | Radio/TV | Player destroyed a convoy or escaped jail. |

### 8.3 AI Video Pipeline

AI video should be treated as a premium presentation layer, not as a dependency.

Required fallback stack:

1. **Text bulletin** always works.
2. **Synth voice / pre-written radio line** works offline.
3. **Static TV card** works if video generation is unavailable.
4. **AI-generated clip** plays if provider succeeds.

Do not hard-code a single provider into game logic. Use a provider adapter.

```json
{
  "broadcast_id": "tv_fl_takeover_42",
  "medium": "tv",
  "channel": "southern_emergency_news",
  "event_id": "ga_faith_pushes_florida_001",
  "script_template": "Florida authorities confirm new Faith Bloc control in multiple counties...",
  "anchor_profile": "anchor_01",
  "lower_third": "FLORIDA UNDER NEW LAW",
  "duration_seconds": 15,
  "provider": "ai_video_provider",
  "asset_status": "queued",
  "fallback_card": "fl_takeover_card.png",
  "fallback_voice": "fl_takeover_radio.ogg"
}
```

### 8.4 Media Server

A small local/server-side service can generate and cache media.

Responsibilities:

- Receive event outcome.
- Pick template.
- Generate script.
- Generate TTS/voice if available.
- Generate video clip if enabled.
- Return file path/URL/manifest to game.
- Cache output by `broadcast_id`.
- Fall back to pre-written text/voice.

Important: The game must never block waiting for AI video. If video is late, show the text/voice version first and replace with video later.

### 8.5 Broadcast Channel Identity

Channels should feel regional and faction-controlled.

Examples:

| Channel | Controlled by | Tone |
|---|---|---|
| State Emergency Feed | Whoever controls state | Official warnings. |
| Road Dog Radio | Independent truckers | Road rumors, traps, convoy calls. |
| Corporate Safety Network | Corporate Corridor | Clean, cold, debt enforcement. |
| The Witness Hour | Broadcast Church | Sermon-news propaganda. |
| Militia Band AM | Free Counties | Gun talk, local alerts, suspicion. |
| Federal Relay | Federal Remnant | Order, IDs, curfews, military law. |
| ConsoleNet | Game console network | Tournaments, leaderboards, bait. |

---

## 9. Technology Layer: Drones, Robots, Jamming, and Enforcement

### 9.1 Goal

Technology should not make the game easier by default. It should create new options and new risks.

### 9.2 Player Drone Classes

| Drone | Role | Strength | Weakness |
|---|---|---|---|
| Scout Drone | Recon, map reveal, road check | Cheap, quiet, useful from home | Low battery, fragile. |
| News Drone | Records events, improves broadcast detail | Evidence capture, faction proof | Can expose player crimes. |
| Mule Drone | Moves small cargo | Supply drops, medicine, ammo | Slow, theft risk. |
| Signal Drone | Extends control range, jams scans | Enables remote ops | High legal risk. |
| Combat Drone | Armed support | Firepower | Loud, illegal in many states. |
| Decoy Drone | Distracts patrols/dogs | Stealth utility | Disposable. |
| Repair Drone | Fixes car/safehouse systems slowly | Passive utility | Expensive, fragile. |

### 9.3 Enemy/Faction Robotics

| Faction | Tech style |
|---|---|
| Corporate Corridor | Surveillance drones, debt repossession bots, turret vans. |
| Federal Remnant | Military drones, checkpoints, ID scanners, armored sentries. |
| Broadcast Church | Repurposed surveillance drones, tower speakers, signal jammers. |
| Crimson Road | Weaponized car drones, suicide RC cars, road trap bots. |
| Green Belt | Low-tech mostly, but strong anti-drone nets and animal tracking. |
| Military bases | Sentry bots, patrol drones, robotic turrets, K9 teams. |

### 9.4 Drone Legality

Drone laws depend on state law profiles.

Examples:

- Free Counties: unarmed drones tolerated; armed drones suspicious.
- Broadcast Church: non-faction drones considered spycraft.
- Corporate Corridor: drones legal if registered/paid; unregistered drones get hacked or fined.
- Federal Remnant: drones illegal near bases/checkpoints.

### 9.5 Drone Control Modes

| Mode | Description |
|---|---|
| Direct control | Player actively pilots drone. |
| Follow mode | Drone follows player/car at safe distance. |
| Route scout | Drone flies ahead on chosen route and reports hazards. |
| Home patrol | Drone guards safehouse while player is away. |
| Mobile ops | Player controls drone from phone/remote interface while character stays home. |

### 9.6 Drone Counterplay

The world must push back.

- Battery limits.
- Signal range.
- Jamming zones.
- Weather penalties.
- Birds/dogs/enemies can detect drones.
- Drones can be shot down.
- Some factions confiscate or trace drones.
- Drones create evidence. If a drone records a crime, that helps or hurts depending who gets the footage.

---

## 10. Mobile Companion / Drone Ops Mode

### 10.1 Goal

The mobile interface should let the player participate in the same world without running the full game. It should not try to be the full game on a phone.

Correct scope:

> **Mobile mode is remote drone operations, news, map, safehouse management, and light event response.**

Wrong scope:

> Full top-down driving/combat on mobile first.

### 10.2 Unlock Requirements

To use mobile drone mode, the player needs:

- Safehouse.
- Power.
- Network/radio uplink.
- Drone dock or helipad.
- At least one drone.
- Lockdown enabled.
- Character physically at safehouse or a remote-control station.

### 10.3 Mobile Features

| Feature | MVP? | Notes |
|---|---:|---|
| Read news/radio digest | Yes | Easy and high value. |
| View current map/law profile | Yes | Shows state control changes. |
| Launch/recall scout drone | Yes | Signature mobile feature. |
| Control drone camera | Yes | Narrow gameplay loop. |
| Mark hazards for Journey Board | Yes | Makes mobile useful to main game. |
| Feed dog from stored supplies | Maybe | Useful, simple. |
| Manage safehouse lockdown | Maybe | Door/camera/security settings. |
| Send crew on jobs | Later | Risky due simulation complexity. |
| Combat drone from mobile | Later | High balance and MP risk. |
| Full vehicle driving | No | Too expensive for first pass. |

### 10.4 Mobile Risk

While controlling a drone:

- Player body remains at home.
- Safehouse can be attacked only through explicit events.
- Drone loss is possible.
- Drone discovery can create suspicion.
- Phone connection can be jammed.

---

## 11. Cloning, Life Insurance, and Death Economy

### 11.1 Goal

The owner statement is strategically correct: if the player has money, death should not always mean death. But if cloning is too easy, permadeath dies. The system must preserve fear while allowing rich/late-game players to bend the rules.

### 11.2 Core Rule

> **Cloning is not a save slot. It is an expensive, political, legal, and unreliable death-continuation system.**

### 11.3 Clone Insurance Flow

1. Player visits clone clinic or black-market lab.
2. Player pays for a backup scan.
3. Backup records body, identity, skills, debts, injuries, implants, reputation.
4. Player dies.
5. If policy is active and legal/reachable, clone wakes.
6. Corpse/stash/car still remain in world.
7. Death is broadcast or hidden depending evidence.
8. Player inherits debt, cooldown, memory gaps, clone sickness, or legal risk.

### 11.4 Clone Variables

| Variable | Meaning |
|---|---|
| Backup age | How old the last scan is. Older backups lose recent progress/items/knowledge. |
| Policy tier | Determines body quality, location, cooldown, debt. |
| Legal state | Some states ban cloning. |
| Facility control | If faction takes the state, the clone lab may be seized. |
| Identity risk | Clone may be wanted if original was wanted. |
| Memory drift | Player may lose recent map intel or faction changes. |
| Debt | Expensive policies create corporate debt. |
| Body grade | Cheap clones have weaker stats or afflictions. |

### 11.5 Clone Policy Examples

| Tier | Cost | Result |
|---|---:|---|
| Street Backup | Low | Black-market body, skill penalty, random location, illegal in many states. |
| Clinic Basic | Medium | Stable body, last clinic location, some memory loss. |
| Corporate Gold | High | Fast activation, good body, huge debt, corporate tracking. |
| Federal Reserve | Very high | Classified body, legal only under Federal Remnant, faction strings attached. |
| Heretic Revival | Variable | Illegal religious or cult variant, may alter identity/reputation. |

### 11.6 Cloning and State Law

Example:

- Florida under Free Counties: clone clinic tolerated.
- Florida under Broadcast Church: clone clinic illegal, policy suspended, clone contract becomes contraband.
- Corporate Corridor: cloning legal but debt-bound.
- Federal Remnant: cloning restricted to military/authorized personnel.

### 11.7 What Happens to Dogs?

Recommendation: **Do not allow dog cloning in MVP.**

Reason: dog permadeath is currently the strongest emotional pillar. Cloning dogs too early cheapens it. If added later, make it rare, ethically ugly, expensive, and emotionally complicated.

### 11.8 Clone Death Acceptance Criteria

- Death without policy uses existing legacy/death loop.
- Death with valid policy activates clone.
- Clone wakes at correct facility.
- Original corpse/stash persists.
- Car can be stolen/impounded by killer/faction.
- Backup age matters.
- State law can block or criminalize clone activation.
- Radio/TV can report player death or suspicious revival.

---

## 12. Gaming Console, Mini-Games, and Tournament Traps

### 12.1 Goal

The in-world gaming console should not be a gimmick. It should create culture, distraction, economy, traps, tournaments, and travel reasons.

### 12.2 Feature Identity

> **A console is a safehouse entertainment item that connects to a dangerous real-world tournament network.**

### 12.3 Console Uses

| Use | Gameplay value |
|---|---|
| Play mini-games | Fun downtime, collectibles, skill expression. |
| Tournament board | Creates travel goals. |
| Leaderboards | Reputation and rivalry. |
| Faction recruitment | Some tournaments are propaganda or talent scouting. |
| Trap events | Raiders or killers use tournaments to gather targets. |
| Betting/scrip prizes | Rewards, but keep economy controlled. |
| Player legend | Winning tournaments can create radio/TV fame. |

### 12.4 Mini-Game Runtime

Start tiny. One mini-game first.

MVP mini-game requirements:

- Launch from safehouse console.
- Has score.
- Has local high score.
- Can produce a tournament invitation.
- Can be interrupted by world event.

Possible first mini-games:

1. Top-down tank arena.
2. Retro racing loop.
3. Dog rescue arcade.
4. Drone hacking puzzle.
5. Shooting gallery.

### 12.5 Tournament Live Event

Tournament event row:

```json
{
  "id": "virginia_console_tournament_001",
  "kind": "console_tournament",
  "site": "VA_Roanoke_ArcadeHall",
  "game_id": "tank_arena_01",
  "advertised_reward_scrip": 800,
  "entry_fee_scrip": 50,
  "trap_chance": 0.35,
  "possible_traps": ["raider_robbery", "murderer_hunt", "faction_recruitment", "police_sting"],
  "radio_template": "console_tournament_ad_va",
  "on_player_win": {
    "scrip": 800,
    "reputation_title": "Arcade Killer",
    "broadcast_template": "player_wins_va_tournament"
  }
}
```

### 12.6 Tournament Ambush Flow

1. Player hears tournament ad on console/TV/radio.
2. Journey Board shows route to venue.
3. Player arrives and enters building.
4. Player starts mini-game.
5. While distracted, attackers enter.
6. Player can keep playing, abandon game, fight, escape, or use crew/dog.
7. Outcome updates reputation and broadcast.

This is strong because the game uses comfort as bait.

---

## 13. Military Bases, Soldiers, and Military Dogs

### 13.1 Goal

Military bases should be high-risk, high-reward sites with unique enemies, laws, loot, vehicles, drones, and dogs.

### 13.2 Base Types

| Base type | Status | Gameplay |
|---|---|---|
| Active Federal Base | Still defended | IDs, patrols, drones, armory, jail. |
| Abandoned Base | Collapsed | Loot, traps, feral dogs, old robots. |
| Occupied Base | Captured by faction | Faction-specific law and loot. |
| Black Site | Hidden | Clone tech, robotics, experiments. |
| Airfield | Drone/vehicle focus | Helipad, aircraft wrecks, fuel. |
| Naval Yard | Boats/fuel later | Maritime expansion. |

### 13.3 Soldier Enemy Types

| Enemy | Behavior |
|---|---|
| Rifleman | Standard patrol, cover fire. |
| Shotgun Breacher | Buildings/doors, close range. |
| Sniper | Long line-of-sight, towers. |
| Drone Operator | Launches scout/attack drones. |
| K9 Handler | Commands military dog. |
| Heavy Gunner | Suppression, vehicle damage. |
| Medic | Revives soldiers if not stopped. |
| Commander | Calls reinforcements/checkpoint lockdown. |

### 13.4 Military Dogs

Military dogs should not just be tougher dogs. They need handler logic.

Behaviors:

- Track player scent/blood.
- Alert to contraband or corpses.
- Chase drones if trained/near enough.
- Attack dog companion if commanded.
- Retreat or panic if handler dies, depending training.
- Can possibly be rescued/tamed only through rare advanced mechanics.

### 13.5 Military Base Rewards

- Guns/ammo.
- Armor.
- Vehicle mounts.
- Drone parts.
- Clone tech files.
- Military vehicles.
- Dog gear.
- Restricted maps.
- Radio codes.

---

## 14. Multiple Passengers and Vehicle Roles

### 14.1 Goal

Cars must support crews, dogs, and co-op players. This makes road travel social, tactical, and cinematic.

### 14.2 Seat Roles

| Seat role | Function |
|---|---|
| Driver | Controls vehicle. |
| Front passenger | Shoots, navigates, uses radio/map. |
| Rear passenger | Shoots from window, protects cargo/dog. |
| Gunner | Uses mounted weapon. |
| Cargo bed | Crew/dog ride in open back, vulnerable. |
| Dog seat | Dog rides inside or truck bed depending vehicle. |
| Drone operator seat | Controls drone while vehicle moves. |

### 14.3 Seat Data Row

```json
{
  "vehicle_id": "pickup_rust",
  "seats": [
    {"id": "driver", "role": "driver", "entry_side": "left"},
    {"id": "front_passenger", "role": "passenger_shooter", "entry_side": "right"},
    {"id": "bed_left", "role": "cargo_bed", "exposed": true},
    {"id": "bed_right", "role": "dog_or_crew", "exposed": true},
    {"id": "mount", "role": "gunner", "requires_mount": true}
  ]
}
```

### 14.4 Required Gameplay Rules

- Multiple players can enter the same vehicle.
- Crew can be assigned seats.
- Dogs can ride in designated areas.
- Exposed passengers take more damage.
- Crashes can injure/eject exposed passengers.
- Mount gunner needs ammo and reload timing.
- Player can switch seats when stopped or slowly moving.
- In multiplayer, driver authority and gunner authority must be clearly assigned.

---

## 15. Crime, Witnesses, Bodies, and Murderer Status

### 15.1 Goal

Killing should not be a simple wanted meter. It should be a social/evidence system that respects state laws and community behavior.

### 15.2 Crime Detection Sources

| Source | Detects |
|---|---|
| Direct witness | Murder, assault, theft, gunfire. |
| Gunshot noise | Investigation area, not instant identity unless seen. |
| Body discovered | Triggers case. |
| Blood trail | Connects scene to player route. |
| Spent casings | Weapon type evidence. |
| Vehicle tracks | Links car to scene. |
| Drone/camera footage | Strong evidence. |
| Dog/K9 alert | Finds hidden body, blood, contraband. |
| Radio call | NPC reports suspicious behavior. |
| Faction checkpoint | Searches for wanted player/item. |

### 15.3 Crime States

| State | Meaning |
|---|---|
| Clean | No known crime. |
| Suspicious | Gunshots/noise/body nearby, identity unknown. |
| Person of Interest | Witness saw player near crime or evidence points to them. |
| Suspect | Faction/community thinks player did it. |
| Wanted | Arrest/attack on sight depending law. |
| Murderer | Persistent regional reputation for confirmed unlawful killing. |
| Legend/Monster | Cross-state fame if crime is notorious. |

### 15.4 Body Handling

Current handoff says killed NPCs become corpse chests and can collide badly. This needs changing.

New body object:

- Has light collision that does not destroy cars unfairly.
- Can be searched.
- Can be dragged/carried with stamina penalty.
- Can be loaded into trunk/bed.
- Can be hidden in dumpsters, woods, buildings, water, or shallow grave.
- Decays or becomes evidence over time.
- Can be found by NPCs, K9s, drones, or patrols.

### 15.5 Body/Evidence Data Row

```json
{
  "body_id": "body_98321",
  "victim_id": "npc_local_45",
  "death_time_day": 44,
  "death_location": "FL_Gainesville_Suburb_03",
  "killer_known": false,
  "suspect_ids": ["player"],
  "evidence": ["gunshot", "blood_pool", "tire_tracks"],
  "hidden_state": "visible",
  "discovered_by": null,
  "case_id": null
}
```

### 15.6 Murder in a House vs Public Murder

The owner's instinct is correct: location matters.

- Killing someone privately inside your house may stay hidden if no witness/no evidence escape.
- Gunshots can still be heard.
- Neighbors can investigate.
- If the body is moved/hidden before discovery, the case may remain missing-person/suspicious.
- If police/community find the body, evidence escalates.
- If the state has surveillance drones or informants, private murder is riskier.

### 15.7 Regional Murder Laws

- Free Counties: revenge or local posse if victim connected.
- Broadcast Church: public execution/manhunt/conversion jail.
- Corporate Corridor: debt, asset seizure, bounty contractor.
- Federal Remnant: arrest, interrogation, prison transport.
- Crimson Road: murder may earn fear unless victim was protected.

---

## 16. Arrest, Jail, Time Passing, and Jailbreaks

### 16.1 Goal

Jail should be a consequence system, not just a cutscene. It should hurt because time passes and the world keeps moving.

### 16.2 Arrest Triggers

- Surrender at checkpoint.
- Knocked down by law faction.
- Caught with contraband.
- Confirmed murderer status.
- Curfew violation after warnings.
- Failed bribe/inspection.
- Clone violation in anti-clone state.

### 16.3 Jail Flow

1. Player is arrested.
2. Contraband and weapons are impounded.
3. Vehicle may be impounded/towed/stolen.
4. Dog/crew status updates.
5. Time passes.
6. Player wakes in holding cell/prison/camp depending law profile.
7. Options appear: serve time, pay fine, bribe, call contact, escape, wait for crew, trial, forced job.

### 16.4 Jail Consequences

| Consequence | Gameplay |
|---|---|
| Time passes | Dogs/crew consume supplies; world events advance. |
| Inventory impounded | Player must recover or replace gear. |
| Vehicle impounded | Creates retrieval mission. |
| Dog neglected | If no one feeds dog, hunger/stress rises. |
| Crew response | Loyal crew may bail or rescue player. |
| Reputation | Some factions respect escape; others escalate. |
| Clone/legal status | Jail can detect illegal clone identity. |

### 16.5 Single-Player vs Multiplayer

Single-player jail can skip time aggressively. Multiplayer cannot casually skip time for everyone.

Recommended split:

| Mode | Jail handling |
|---|---|
| Single-player | Time skip allowed; world catch-up applies. |
| Co-op | Arrested player goes to jail instance; others continue. They can bail, break out, or abandon. |
| Host migration/future MP | Avoid until host-auth/AoI is stronger. |

### 16.6 Jailbreak Mission Types

- Break out from inside.
- Crew breaks in.
- Bribe guard.
- Start riot.
- Fake illness.
- Clone transfer exploit.
- Prison convoy ambush.
- Dog tracks prison transport.

---

## 17. Robots and Drones in Crime/Jail/Law Systems

Technology should connect to law.

Examples:

- Corporate drone records a murder -> instant evidence if footage reaches server.
- Broadcast Church jamming towers block player drones.
- Federal scanner detects clone contract and flags the player.
- Military K9 finds body hidden in woods.
- Player news drone records faction atrocity -> can sell to radio/TV or blackmail faction.
- Drone footage can exonerate player if used correctly.

This is where technology becomes more than gadgets. It becomes evidence, surveillance, counter-surveillance, and propaganda.

---

## 18. Data Schemas to Add

### 18.1 World State Record

```json
{
  "world_state_version": 3,
  "last_played_at_utc": "2026-07-06T20:12:00Z",
  "world_day": 44,
  "state_control": {
    "FL": "broadcast_church",
    "GA": "broadcast_church",
    "VA": "federal_remnant"
  },
  "active_laws": {
    "FL": "faith_occupation_law",
    "GA": "faith_core_law",
    "VA": "federal_checkpoint_law"
  },
  "active_events": ["ga_faith_pushes_florida_001"],
  "resolved_events": ["crimson_raid_i95_040"],
  "broadcast_queue": ["tv_fl_takeover_42"],
  "crime_cases": ["case_8831"],
  "clone_records": ["clone_policy_player_01"],
  "safehouses": ["safehouse_fl_01"]
}
```

### 18.2 Faction Record

```json
{
  "id": "broadcast_church",
  "display_name": "The Broadcast Church",
  "family": "religious_authoritarian",
  "tech_level": 4,
  "drone_policy": "controlled",
  "clone_policy": "forbidden",
  "gun_policy": "blessed_permits_only",
  "broadcast_channels": ["the_witness_hour"],
  "preferred_events": ["conversion_drive", "tower_takeover", "contraband_burn", "state_crusade"],
  "enemy_tags": ["corporate_corridor", "free_counties", "clone_clinics"]
}
```

### 18.3 Safehouse Record

```json
{
  "id": "safehouse_fl_01",
  "state": "FL",
  "location": "Gainesville outskirts",
  "lockdown_enabled": true,
  "security_level": 2,
  "power_level": 1,
  "radio_installed": true,
  "tv_installed": true,
  "phone_uplink": true,
  "drone_dock": "small_roof_pad",
  "stored_food_days": 3,
  "dog_food_days": 2,
  "crew_food_days": 1,
  "contraband_hidden": false,
  "known_by_factions": ["free_counties"],
  "raid_risk": 0.12
}
```

### 18.4 Drone Record

```json
{
  "id": "drone_scout_mk1_001",
  "class": "scout",
  "owner": "player",
  "home_dock": "safehouse_fl_01",
  "battery": 84,
  "max_range_km": 2.5,
  "signal_strength": 0.9,
  "stealth": 0.7,
  "camera_quality": 1,
  "armed": false,
  "legal_tags": ["civilian_drone"],
  "damage": 0,
  "status": "docked"
}
```

### 18.5 Clone Policy Record

```json
{
  "id": "clone_policy_player_01",
  "owner_id": "player",
  "tier": "clinic_basic",
  "provider_faction": "corporate_corridor",
  "last_backup_day": 41,
  "backup_location": "Clinic 9 - Jacksonville",
  "legal_states": ["FL", "NC", "SC"],
  "blocked_states": ["GA"],
  "active": true,
  "debt_scrip": 1200,
  "activation_cooldown_days": 5,
  "body_grade": "standard",
  "memory_loss_days": 1
}
```

### 18.6 Crime Case Record

```json
{
  "id": "case_8831",
  "state": "FL",
  "law_profile": "faith_occupation_law",
  "crime_type": "murder",
  "victim_id": "npc_neighbor_02",
  "suspect_ids": ["player"],
  "evidence_ids": ["body_98321", "blood_8831", "gunshot_report_22"],
  "witness_ids": ["npc_neighbor_05"],
  "status": "suspect",
  "bounty_scrip": 500,
  "response_level": 3,
  "expires_day": null
}
```

### 18.7 Broadcast Record

```json
{
  "id": "radio_fl_takeover_42",
  "event_id": "ga_faith_pushes_florida_001",
  "medium": "radio",
  "channel": "the_witness_hour",
  "region": "FL",
  "priority": 9,
  "script": "Citizens of Florida, remain indoors as the new order restores peace...",
  "audio_asset": "broadcasts/radio_fl_takeover_42.ogg",
  "video_asset": null,
  "expires_day": 47,
  "heard_by_player": false
}
```

---

## 19. UI and Player Flow Specs

### 19.1 Safehouse TV UI

Screens:

1. Channel list.
2. Latest alerts.
3. Selected broadcast player.
4. Law changes.
5. Map overlay.
6. Archive of broadcasts.

Inputs:

- Up/down channel.
- Select broadcast.
- Mark on map.
- Open Journey Board from warning.
- Send to phone.

### 19.2 Radio UI

Radio should be usable while driving and at home.

Driving radio:

- Road bulletins.
- Weather.
- Faction warnings.
- Music/static.
- Emergency interrupt.

Home radio:

- More detailed local updates.
- Rumor channels.
- Law profile warnings.

### 19.3 Phone UI

Tabs:

1. Alerts.
2. Map.
3. Drone.
4. Safehouse.
5. Dog/Crew.
6. Legal/Wanted.
7. ConsoleNet.

### 19.4 Clone Terminal UI

Shows:

- Active policy.
- Last backup day.
- Backup location.
- Legality in current state.
- Debt.
- Activation conditions.
- Upgrade/cancel options.

### 19.5 Crime/Wanted UI

Do not simply show stars. Show regional legal risk.

Example:

```
FLORIDA - FAITH OCCUPATION LAW
Status: SUSPECT
Known Evidence: gunshot report, witness saw vehicle
Current Risk: Search if stopped
Public Gun Carry: illegal
Clone Contract: illegal contraband
```

---

## 20. Implementation Roadmap

### Phase 0 - Foundation: EventDirector and Offline Catch-Up

Build first.

Tasks:

1. Add `last_played_at_utc` to save.
2. Add `world_state_version` to save.
3. Create `EventDirector` node/module.
4. Move/wrap existing `events.roll_daily` behind EventDirector.
5. Add deterministic offline catch-up.
6. Generate OfflineDigest.
7. Add Return Briefing screen.
8. Add template broadcast queue.

Acceptance:

- Setting save timestamp four days ago triggers catch-up.
- Catch-up can change state law/control.
- Player loads into safehouse briefing.
- No instant arrest inside home.
- Broadcast/radio line appears.

### Phase 1 - State Law Profiles and Contraband

Tasks:

1. Create law profile rows.
2. Add state control mapping.
3. Add contraband tags to items/weapons/clones/drones.
4. Add inventory/trunk contraband check.
5. Add checkpoint/public visibility trigger.
6. Add law profile to Journey Board route warnings.

Acceptance:

- Same gun can be legal in one state and contraband in another.
- State takeover changes law profile.
- Carrying contraband in public creates risk, not instant punishment.

### Phase 2 - Broadcast Interface: Radio/TV/Phone Digest

Tasks:

1. Expand `radio.gd` into BroadcastSystem or wrapper.
2. Add TV interactable in safehouse.
3. Add phone alert screen.
4. Add template-driven broadcast content.
5. Add media manifest and fallback card/audio.
6. Optional: connect AI video provider via local service.

Acceptance:

- Player can watch TV after offline catch-up.
- Broadcast describes actual event outcome.
- If AI service missing, fallback still works.

### Phase 3 - Drones and Safehouse Remote Ops

Tasks:

1. Add drone item/class rows.
2. Add safehouse drone dock.
3. Add direct drone control camera.
4. Add route scout action.
5. Add battery/range/signal.
6. Add drone legality check.
7. Add basic enemy drone detection/shootdown.

Acceptance:

- Player launches drone from home.
- Drone scouts outside without moving player body.
- Drone can mark hazard on map/Journey Board.
- Drone can be lost/damaged.

### Phase 4 - Crime, Bodies, and Evidence

Tasks:

1. Replace corpse chest with body/evidence object.
2. Add body drag/carry/hide.
3. Add gunshot/noise reports.
4. Add witness detection.
5. Add investigation states.
6. Add murderer regional status.
7. Add K9/body discovery hooks.

Acceptance:

- Killing privately can remain hidden if evidence is handled.
- Public murder escalates.
- Body discovery creates case.
- Moving body before discovery matters.

### Phase 5 - Arrest and Jail

Tasks:

1. Add arrest trigger state.
2. Add impound inventory/vehicle logic.
3. Add jail location/instance.
4. Add time-passing consequences.
5. Add bail/bribe/serve/escape options.
6. Add single-player time skip.
7. Add co-op handling later.

Acceptance:

- Arrest moves player to jail.
- Time passes and dog/crew supplies tick.
- Player can recover gear through mission or payment.

### Phase 6 - Cloning and Insurance

Tasks:

1. Add clone policy data.
2. Add clone clinic/terminal.
3. Add backup scan.
4. Add death interception.
5. Add clone activation with penalties.
6. Add legal profile restrictions.
7. Add corpse/stash persistence.

Acceptance:

- Valid clone policy revives player with cost.
- Invalid/illegal policy fails or creates crime.
- Death still creates world consequences.

### Phase 7 - Gaming Console and Tournament Event

Tasks:

1. Add console item/interactable.
2. Add one mini-game.
3. Add score/high score.
4. Add tournament event row.
5. Add venue site.
6. Add trap variant.
7. Add broadcast and reputation outcome.

Acceptance:

- Player can play mini-game at home.
- Tournament invite appears.
- Traveling to tournament can become trap.

### Phase 8 - Military Bases, Soldiers, K9s, Robots

Tasks:

1. Create military site archetype.
2. Add soldier enemy rows.
3. Add K9 handler + military dog behavior.
4. Add restricted loot.
5. Add drones/sentries.
6. Add trespass/arrest rules.

Acceptance:

- Base feels different from normal town/building.
- K9s track player/body/contraband.
- Military loot is powerful but risky.

### Phase 9 - Mobile Companion Mode

Build only after drones, broadcasts, and safehouse systems work in-game.

Tasks:

1. Expose minimal API: news, map, drone state, safehouse state.
2. Build phone-first UI or web/mobile client.
3. Allow drone launch/control.
4. Sync hazard markers back to main save.
5. Add connection loss/jamming behavior.

Acceptance:

- Player can use phone to read world state and fly drone.
- Actions affect main game.
- No full-game mobile scope creep.

---

## 21. Required Sims / Tests

### 21.1 Offline Catch-Up Sim

**Name:** `offline_catchup_sim`

Setup:

- Player home state: Florida.
- Last played: 4 days ago.
- Event seed guarantees Georgia/Broadcast Church takeover.

Assert:

- Florida controller changes.
- Law profile changes.
- Return briefing appears.
- Gun becomes contraband.
- Player is not arrested inside safehouse.
- Broadcast queued.

### 21.2 Law Profile Sim

**Name:** `law_profile_sim`

Assert:

- Gun legal under Free Counties.
- Same gun illegal under Broadcast Church.
- Public visibility/search triggers enforcement.
- Hidden safehouse possession does not instantly punish.

### 21.3 Broadcast Fallback Sim

**Name:** `broadcast_fallback_sim`

Assert:

- Event outcome creates broadcast.
- Text bulletin exists.
- Audio/video missing does not crash.
- TV/radio UI can play fallback.

### 21.4 Drone Scout Sim

**Name:** `drone_scout_sim`

Assert:

- Drone launches from safehouse dock.
- Player body remains inside.
- Drone battery drains.
- Drone reveals hazard.
- Hazard appears on Journey Board/map.

### 21.5 Clone Insurance Sim

**Name:** `clone_insurance_sim`

Assert:

- Active policy intercepts death.
- Clone wakes at backup location.
- Debt/penalty applies.
- Original corpse/stash persists.
- Illegal state can block activation.

### 21.6 Crime Body Sim

**Name:** `crime_body_sim`

Assert:

- NPC death creates body object.
- Body can be moved/hidden.
- Witness/body discovery creates case.
- No witness/no discovery stays suspicious/unknown.

### 21.7 Jail Sim

**Name:** `jail_sim`

Assert:

- Arrest moves player to jail.
- Inventory/vehicle impounded.
- Time passes.
- Dog hunger ticks.
- Player can exit through bail/serve/escape path.

### 21.8 Tournament Trap Sim

**Name:** `tournament_trap_sim`

Assert:

- Console tournament event is advertised.
- Venue spawns.
- Mini-game launches.
- Trap variant interrupts.
- Outcome updates reputation/broadcast.

### 21.9 Passenger Seat Sim

**Name:** `passenger_seat_sim`

Assert:

- Two humans and dog can occupy vehicle seats.
- Driver controls vehicle.
- Passenger/gunner can shoot.
- Exposed passenger can be injured.

### 21.10 Military K9 Sim

**Name:** `military_k9_sim`

Assert:

- Handler commands dog.
- Dog tracks blood/body/contraband.
- Handler death changes dog behavior.

---

## 22. Example Scenarios

### 22.1 Florida Falls While Player Is Gone

Player lived in Florida for gun access. They leave the game for four days.

On return:

- Safehouse loads in lockdown.
- TV says Faith Bloc units entered Florida after a failed Free Counties defense.
- Radio warns all unlicensed firearms must be surrendered.
- Phone flags two guns in the trunk and one clone policy as contraband.
- Drone shows checkpoint two blocks away.
- Journey Board marks I-75 as high-risk due weapon searches.

Player options:

1. Hide guns under floor.
2. Smuggle guns out at night.
3. Join resistance.
4. Pay for permit.
5. Use drone to map patrol gaps.
6. Drive backroads.
7. Try to retake local tower.

### 22.2 Tournament in Virginia Is a Trap

Player sees a ConsoleNet tournament ad.

- Prize: rare mount schematic and scrip.
- Location: Virginia arcade hall.
- Journey Board shows route risks.
- Player arrives, starts mini-game.
- Attackers enter while player is playing.
- Dog barks first if bonded.
- Player can finish the round for bonus reputation or bail immediately.
- If player survives, radio calls it either a massacre, robbery, or legendary win depending result.

### 22.3 Lunch-Break Drone Session

Player is away from main computer but opens mobile mode.

- Safehouse confirms lockdown.
- Drone battery 92%.
- Florida under curfew.
- Player launches drone.
- Drone spots patrol route and hidden roadblock.
- Player marks roadblock.
- Main game Journey Board now warns that route is unsafe.

This gives the player meaningful progression without full mobile combat/driving.

### 22.4 Clone Saves the Rich Player, But Not Cleanly

Player dies in a corporate state with Gold Clone insurance.

- Clone wakes in clinic.
- Debt increases.
- Original car remains at death site.
- Killer faction steals some gear.
- Radio reports the player's death, then rumor of illegal revival.
- Religious neighboring state now treats player as abomination/contraband.

Death did not end the run, but it created a new problem.

### 22.5 Private Murder Goes Wrong

Player brings an NPC into their house and kills them.

- No direct witness.
- Gunshot heard by neighbor.
- Neighbor investigates after delay.
- Player can move body to trunk before discovery.
- If body remains visible, case opens.
- If hidden poorly, K9 finds it later.
- If hidden well, missing-person rumor appears instead.

---

## 23. Balance Rules and Hard Calls

### 23.1 Do Not Let Offline Simulation Destroy Trust

Players should fear logging back in, but not feel cheated.

Good:

- State changed.
- Laws changed.
- Prices changed.
- Dog is hungry because no food stored.
- Car got impounded because it was left outside in a raided zone.

Bad:

- Player instantly dies while offline.
- Dog dies with no warning despite food/security.
- All gear deleted with no trail.
- Home state flips every time randomly.
- AI video is required to understand what happened.

### 23.2 Do Not Let Clones Delete Stakes

Clones need pain:

- Money cost.
- Debt.
- Legal risk.
- Memory loss.
- Backup age.
- Facility control risk.
- Reputation consequences.
- Corpse/stash persistence.

### 23.3 Do Not Build Full Mobile Game First

The phone interface is a companion layer. Keep it narrow until the main game systems are strong.

### 23.4 Do Not Build Many Mini-Games First

One good mini-game that creates one good tournament trap is worth more than ten throwaway games.

### 23.5 Do Not Build Robots Without Laws

Robots and drones become generic enemies unless tied to surveillance, contraband, state control, roads, and evidence.

---

## 24. Minimum Viable Slice

The smallest build that proves the whole vision:

### Slice Name

**Four Days Later: Florida Under New Law**

### Required Content

- One safehouse in Florida.
- One controlling faction that can take Florida.
- Two law profiles: gun-friendly and gun-restrictive.
- One offline event that flips Florida.
- One TV/radio/phone briefing.
- One scout drone.
- One checkpoint outside.
- One contraband gun in player inventory/trunk.
- One Journey Board warning.
- One route out of town.

### Player Experience

1. Player loads save after simulated four-day absence.
2. Safehouse briefing says Florida changed.
3. TV/radio explains takeover.
4. Gun is now contraband.
5. Drone scouts checkpoint.
6. Player chooses a route or hides/smuggles/fights.
7. Leaving house with visible gun creates risk.

If this slice is fun, expand. If this slice is not fun, robots, consoles, and clones will not save the game.

---

## 25. Build Priority Matrix

| Priority | Feature | Why |
|---:|---|---|
| 1 | EventDirector/offline catch-up | Makes world alive. |
| 2 | Law profiles/contraband | Makes state control matter. |
| 3 | Safehouse return briefing | Makes offline change fair and dramatic. |
| 4 | Broadcast radio/TV/phone | Makes world explain itself diegetically. |
| 5 | Journey Board consumes events/laws | Turns changes into route decisions. |
| 6 | Basic scout drone | Lets player verify danger before leaving. |
| 7 | Body/evidence/crime | Makes murder and public violence meaningful. |
| 8 | Jail/arrest | Gives law teeth. |
| 9 | Clone insurance | Adds rich-player death economy. |
| 10 | Multi-passenger seats | Supports crew/co-op fantasy. |
| 11 | Military base/K9s | High-value content site. |
| 12 | Console/tournament trap | Excellent flavor, but not core foundation. |
| 13 | Mobile drone ops | Powerful, but only after in-game drone works. |
| 14 | AI video generation | Presentation upgrade, not gameplay foundation. |

---

## 26. Cut List For Now

Do not build these first:

- Many mini-games.
- Full mobile driving/combat.
- Full robotics tech tree.
- Every state flipping dynamically.
- Fully simulated offscreen battles with real actors.
- Complex courtroom system.
- Dog cloning.
- Dozens of AI video channels.
- Live multiplayer jail with full time skip.
- Big map expansion.

These are seductive distractions. Build the one Florida slice first.

---

## 27. Engineering Notes Against Existing Handoff

### 27.1 Save System

Must add:

- `last_played_at_utc`.
- `world_state_version`.
- `state_control`.
- `active_laws`.
- `active_events`.
- `resolved_events`.
- `broadcast_queue`.
- `crime_cases`.
- `clone_records`.
- `safehouses`.
- `drone_records`.

Do not add offline progression without persistence. That would recreate the same handoff problem: impressive systems that reset.

### 27.2 Data Spine

The handoff warns that vehicles are data-driven but items/NPCs/loot are not fully read back from rows. This spec depends on data rows for laws, drones, clones, broadcasts, events, and crimes. The data-spine read-back needs to be fixed or these systems will become hardcoded mess.

### 27.3 Sim Discipline

Every phase needs a headless sim. Do not add this as pure UI or pure data. The point is consequence.

### 27.4 Multiplayer

Do not design Phase 0-6 around multiplayer first. Make systems deterministic and state-driven so they can later replicate. Multiplayer-specific jail, clone, and mobile complications come after the single-player version is stable.

---

## 28. Final Spec Decision

The next major feature should not be robots, not AI video, not console games, not cloning.

The next major feature should be:

> **A persistent EventDirector that can change state control and laws while the player is gone, then brief the player safely inside their home through radio/TV/phone.**

Everything else becomes stronger after that.

Robots become enforcers of new laws.  
Drones become tools to scout the changed world.  
AI video becomes the way the world announces itself.  
The console becomes bait that pulls the player into live events.  
Cloning becomes the rich player's way to survive a world that keeps moving.  
Jail becomes the legal consequence when the player ignores the new state reality.  

That is the spec.
