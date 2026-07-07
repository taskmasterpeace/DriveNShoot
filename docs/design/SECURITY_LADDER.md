# SECURITY LADDER — Town Guard / State Enforcer / Bounty Hunter

**Date:** 2026-07-07
**Builds on:** `LOOT_NPC_PRODUCTION_WANTED_SPAWN.md` §6 (NPC tiers N0-N4), §10 (jurisdiction layers, wanted levels, state-line crossing) · `POPULATION_WAR.md` §1 (population groups as war units) · `data/rulers.json` (per-state ruler flavor) · `data/law_profiles.json` (the laws enforcers enforce) · `respect.gd` (the standing ledger every tier reads)
**Companion data file:** `data/security_forces.json`
**Status:** design + data only — this pass does not touch `npc.gd`, `weapon.gd`, `world_state.gd`, or `population.gd`. Those are owned by builders working tonight; this spec is written so their wiring is a straight additive fold, the same pattern every other `ensure_*` system in this codebase already uses.

---

## 1. Overview

DRIVN has one law-adjacent NPC today: `ProtoNPC`'s `secman` archetype (Bridger), who sights the player the instant town standing drops to SUSPECT. That is correct as far as it goes, but it is one guard for one town, with no concept of a *state's own* law, and no concept of *someone who follows you home*. The SECURITY LADDER names and specs the three tiers of armed response the Divided States actually has, in order of who they work for and how far they'll chase you:

1. **TOWN GUARD** — paid by the local baron/council, patrols one community, cares only about what happens inside sight of that community, backs off the instant you're over the horizon. Bridger is a Town Guard. This tier is npc.gd's `secman` archetype formalized and given data-driven variety (multiple named/flavored rows, not one).
2. **STATE ENFORCER** — the ruler's own uniform, works the whole state, mans checkpoints, enforces that state's actual law profile (gun bans, curfews, contraband), styled per-ruler so Free Counties rangers and Faith Bloc marshals do not read the same. They do not care what you did three states over.
3. **BOUNTY HUNTER** — independent contractors who do not answer to any one ruler, activated only by a broadcast warrant or a hostile-standing border crossing, and unlike the first two tiers they do not stop at a state line — they are the only tier built to follow the player anywhere.

The ladder is a **jurisdiction ladder**, not a difficulty ladder (though it happens to also escalate in gear/hp — see §4). The real axis is *who sent them and how far that mandate reaches*, per `LOOT_NPC_PRODUCTION_WANTED_SPAWN.md` §10.1's core rule: **police do not know what they did not witness, receive, or infer from evidence.** A Town Guard's whole world is the community he's posted in. A State Enforcer's whole world is the state he's sworn to. A Bounty Hunter's whole world is the warrant in his hand, and a warrant travels.

## 2. Player Fantasy

The player should feel the **weight of who they're up against change with distance from the crime**, not just the number on a wanted meter. Punching a shopkeeper in Meridian should mean Bridger gets in your face and the trade window slams shut — a local, personal, embarrassing consequence you can walk off by driving to the next town over. Running a State Enforcer checkpoint with a banned gun in the trunk should feel like tripping a wire that belongs to someone much bigger than the town you're standing in — rifles, a radio call, a state that now has your plate. And hearing a bounty hunter's engine on your tail three states after you thought you'd gotten away clean should feel *personal and unfair in the right way* — not a random encounter, a **debt that has your name on it**, the one kind of trouble that does not respect a welcome sign.

This is Self-Determination Theory in three layers:
- **Autonomy** — the player chooses how hot to run, and the ladder rewards discretion (stay clean, town guards salute) without removing the option to burn it all down (there is always a path back — pay it off, kill the hunter, wait out the warrant).
- **Competence** — beating a Town Guard is a bar fight; surviving a State Enforcer checkpoint fight is a real firefight against a rifle-class squad; killing a named Bounty Hunter is a story you tell, because that hunter had a name, a rig, and maybe a dog, and now they're gone.
- **Relatedness** — standing is legible and *remembered*. A hero's welcome from enforcers who salute you is the ledger made visible in the mouths of armed men. A hunter who's been chasing you across three states is the ledger made visible as a recurring character.

Flow-wise, this is the sawtooth: Town Guard encounters are frequent and low-cost (a scuffle, a slammed trading window), State Enforcer encounters are rarer and mid-cost (a checkpoint fight, a fine, a chase), and Bounty Hunter encounters are rare, high-stakes, and *proportional to how badly the player burned a state* — exactly the escalating-then-releasing tension curve flow state needs.

## 3. Detailed Rules

### 3.1 The three tiers at a glance

| | TOWN GUARD | STATE ENFORCER | BOUNTY HUNTER |
|---|---|---|---|
| N-tier (§6) | N1-N2 | N2-N3 | N3 |
| Employer | `town` (the local baron/council) | `state_ruler` (the ruler named in `rulers.json`, or the controlling faction from `world_state.gd`) | `contract` (nobody's payroll — paid per head) |
| Jurisdiction | one community | one state | interstate — the only tier with none |
| Weapon class | pistol-class | rifle-class | pistol-or-rifle, hunter's choice (row-specified) |
| Patrol kind | `beat` (paces a fixed anchor, per `npc.gd`'s existing `_do_pace`) | `highway` / `checkpoint` (fixed border posts + road patrol) | `pursuit` (follows the player's last-known road, not a fixed post) |
| Trigger | witnessed local crime (wanted 1-2) | state heat (wanted ≥3) OR law-profile violation (contraband caught at a stop) | broadcast warrant (wanted ≥5-6) OR hostile-standing border crossing (`bounty_hunted`) |
| Crosses state lines | **never** | **never** (a State Enforcer for Kentucky is powerless the moment you're in Tennessee) | **always** — this is the entire point of the tier |
| De-escalates | yes — leaving town range drops them instantly | yes — leaving the state drops them instantly (per §10.4, unless a warrant was already broadcast, in which case the NEXT tier picks it up, not this one) | no — only paid off, killed, or timed out (warrant expiry) |
| Named individuals | no (archetype rows, styled like Bridger) | no (per-ruler flavor rows, not individuals) | **yes** — 4 fixed named hunters, hand-authored, the one place this ladder gets personal |

### 3.2 TOWN GUARD (N1-N2)

**What it is.** The formal name for what `ProtoNPC`'s `secman` archetype already is, expanded from one row (Bridger) into a small family of archetype rows sharing the same behavior contract. Every Town Guard row is paid by `town` — the baron/council that owns the community — and every one of them uses the *exact* trigger `ProtoNPC` already implements: `respect.standing(TOWN_FACTION) == "SUSPECT"` flips their `act` from their patrol act (`"pace"` or `"scan"`) to `"aim_crouch"` and they sight the player.

**Jurisdiction.** A Town Guard's whole world is the community they're posted to. This is deliberately the smallest, cheapest-to-reason-about jurisdiction in the game: `LOOT_NPC_PRODUCTION_WANTED_SPAWN.md` §10.2's "Community" layer, verbatim. They know local theft, assault, murder, trespass — and nothing else. They do not know what the player did in the next town over, let alone the next state.

**Response trigger:** `witnessed_crime` only. A Town Guard never activates off a wanted number alone — they activate off the town's own standing ledger going SUSPECT, which today is *driven by* witnessed crime (see `on_npc_attacked`/`add_infamy` in `proto3d.gd`) — same effect, correctly scoped cause. Wanted levels 1-2 (`Suspicious`/`Local Wanted`, §10.3) are the levels this tier is built to answer; it should never be the response to a level 4+ event (that has already outgrown the town — see §3.5 handoff).

**De-escalation.** The instant the player is outside the tier's patrol radius (a fixed meters-from-anchor radius per community — see §4.3 for the formula and §6 for why this is the buildable default over a population-cell boundary), the guard's `act` reverts to its base patrol act and standing-based re-aggro stops being checked. A Town Guard does not remember you left and come back suspicious later within the SAME visit — leaving resets the local encounter, though the underlying respect ledger (which persists) still gates trading/greetings per the existing `TIER_STOCK`/refuse-line system. In short: **the guard forgets you're a threat the moment you're gone, but the town does not forget you're disliked.**

**Weapon class:** pistol-class (uses `pistol` row 1:1, `weapon.gd:21`). This is deliberate — a Town Guard should be a real threat in a fistfight-scale encounter (mag 12, 18 dmg, 42m range) but should never be the reason the player needs to plan an approach the way a checkpoint requires. Some rows may carry `shotgun` instead (close-range brawler flavor) but never a rifle-class weapon — that would blur the tier boundary the whole ladder depends on.

**Archetype variety.** Bridger stays the canonical Meridian row. New Town Guard rows are archetype variants (same behavior contract, different name/look/color/lines) so different towns can have a guard who reads differently without new code — a nervous rookie deputy in a T1 exit town, a grizzled old-timer in a T3 county seat. This is exactly the `ensure_archetypes()` fold `npc.gd` already runs; the security ladder does not ask for a second fold mechanism.

### 3.3 STATE ENFORCER (N2-N3)

**What it is.** The ruler's own — not town payroll, not a contractor, sworn directly to whoever holds the state (`rulers.json`'s named ruler, or, where `world_state.gd`'s faction-control has actually taken the state, that controlling faction). A State Enforcer's job is enforcing the **state's actual law profile** (`law_profiles.json` / `world_state.LAWS`), which is the single biggest thing this tier does that Town Guards structurally cannot: Town Guards respond to *witnessed crime against people*; State Enforcers additionally respond to *possession itself*, because a state's law profile can make simple possession illegal (Faith Occupation Law's `contraband: ["pistol","shotgun","machete","axe","pipe_rocket","9mm","12ga"]` is not a crime against a person, it's a crime against the state's rules).

**Jurisdiction.** One state, full stop — `LOOT_NPC_PRODUCTION_WANTED_SPAWN.md` §10.2's "State" layer. A Kentucky State Enforcer has zero authority, zero knowledge, and (per §3.5) zero pursuit the instant the player crosses into Tennessee. This is the tier that makes state lines feel like *jurisdiction* lines and not just paint-color changes on the map.

**Response triggers (either fires the encounter):**
- `state_heat` — the player's wanted level in that state has reached **Active Pursuit (3)** or higher (§10.3). This is the "you did something bad enough that the whole state, not just one town, is now looking" trigger.
- `law_profile_violation` — a **contraband stop**. This is new mechanical texture the Town Guard tier cannot produce: a State Enforcer checkpoint (see Patrol below) can scan the player's carried/trunk contraband (the exact same list `world_state.player_contraband(state)` already computes for the border-crossing notify line) and initiate a stop *even at wanted level 0*, because the crime here is possession under that state's law, not an act the player has to be caught doing. This is the mechanical payoff for `law_profiles.json` existing at all — right now it only produces a warning toast; State Enforcers make it produce a consequence.

**Patrol kind:** `highway` (roving patrol along state road segments, biased toward `road_shoulder`/`house_field` zone tags per `POPULATION_WAR.md`'s zone vocabulary) plus `checkpoint` (fixed posts at border crossings and major town exits — the natural home for the contraband-stop trigger, since a checkpoint is the one place a stop-and-scan reads as diegetic rather than magical).

**Per-ruler styling.** This is where the owner's ask lands hardest: a State Enforcer is not one generic "cop with a bigger gun," it is dressed in the state's actual politics. §4's data rows carry this as a `faction` field (one of the four `world_state.gd` ideological controllers, which is the mechanically load-bearing axis — law profile, contraband list, and de-escalation-vs-pursuit all key off *faction*, not off the cosmetic ruler name) plus a `ruler_flavor` field referencing a specific `rulers.json` id for naming/color/legend text where the owner wants a named-ruler feel *now*, ahead of `world_state.gd`'s per-state faction control being fully wired beyond Florida. Concretely: **Free Counties rangers** patrol loose and challenge-first (their own law profile has no contraband list, so their checkpoints are about behavior, not possession); **Faith Bloc marshals** (zealot-marshal flavor, the Broadcast Church's own law) run hard possession checks and treat an unlicensed gun as the crime itself; **Corporate Corridor** enforcers check licenses and drone registration and treat unpaid debt like contraband; **Federal Remnant** checkpoint troops run the strictest ID/registration stop of the four. Named-ruler rows (Bridger's Council Rangers, the Knox Warlord's Enforcers, President-General Hood's Border Guard, etc.) reference one of these four factions for their actual mechanical behavior and add ruler-specific dressing on top (name, title, legend line, weapon/color skin) — see §4.4 for the exact rows.

**De-escalation.** Leaving the state drops a State Enforcer instantly and unconditionally **unless** the encounter already escalated to a broadcast warrant (§3.5) — in which case the *State Enforcer* stops (their mandate genuinely ends at the line), but the **Bounty Hunter** tier may already be inbound, because the warrant, not the enforcer, is what crossed. This is the precise reading of §10.4: "if the crime was major, a state can broadcast a warrant" — the warrant is the thing that travels, never the enforcer.

**Weapon class:** rifle-class. No rifle-class weapon row exists in `weapon.gd` yet — see Dependencies §6 for the exact ready-to-paste row spec. Until that row lands, State Enforcer data references weapon id `"rifle"` as a forward reference; this is intentional and documented, not an oversight (see §6).

### 3.4 BOUNTY HUNTER (N3)

**What it is.** Independent contractors, not payroll. Nobody's uniform. A Bounty Hunter answers to the warrant, and the warrant is bought and sold — a state posts it, a hunter claims it, the hunter gets paid on proof of kill (or capture, later). This is the tier that gives teeth to §10.3's Level 5 (State Blacklist) and Level 6 (Interstate/Federal Heat), and it is the **only** tier in this ladder built to cross a state line and keep coming.

**Jurisdiction.** None, structurally — that's the point. A Bounty Hunter's working area is "wherever the warrant's target is," which by construction can span every state the player drives through. This is the interstate/federal layer of §10.2 made into a character instead of a menu number.

**Activation triggers (either is sufficient):**
- `broadcast_warrant` — the state actually broadcast (per §10.4: "a state can broadcast a warrant... every state can receive the notice"), which in this codebase's existing hooks is the natural graduation of `wanted level ≥5-6`. A broadcast warrant is a **persistent flag on the player's record for that state**, independent of the player's live wanted meter — it does not clear when the player calms down locally, only when paid off, when the warrant's poster hunter is killed, or when the warrant expires (see §4 tuning knob `warrant_expiry_days`).
- `border_standing` — the exact mechanic `proto3d.gd`'s `bounty_hunted` flag already implements: crossing into a state where `respect.standing(state) == "SUSPECT"` sets `bounty_hunted = true` today. The Security Ladder formalizes this existing flag as a Bounty Hunter activation trigger rather than inventing a parallel one — `bounty_hunted == true` is read directly as "a hunter is active on this state's roads for you," which is *already* the flavor text `on_state_entered` prints ("hunters run %s's roads").

**Persistence — the tier's whole reason to exist.** Once activated (by either trigger), a Bounty Hunter **does not de-escalate on a state line.** They track the player's last-known road/position across states until one of exactly three things happens: **paid off** (the player settles the warrant/bounty at a `state_ruler` or courthouse-equivalent — cost scales with wanted level, see §4 formula), **killed** (the specific hunter instance dies — their warrant contract dies with them; a *new* hunter can still be dispatched later if the underlying warrant is still open, but the immediate pursuit ends), or **warrant expires** (a time-boxed safety valve so a forgotten crime from ten hours of play ago doesn't haunt a save file forever — see §4).

**Named individuals.** Unlike the first two tiers (behavior archetypes with cosmetic variety), Bounty Hunters are **4 fixed, hand-authored named characters** — matching the house convention every other named NPC in this codebase already follows (Bridger, Mercy, Sam, Hazel, Mercer are all fixed named individuals, never proc-gen). Each carries a rig (their own vehicle, matching `vehicles.json`'s existing schema) and, per the owner's ask, "possible" dog companionship (optional, row-flagged) — see §4.5 for the four rows and their legends.

**Weapon class:** hunter's choice — a row-specified field, not a fixed tier-wide class, because part of a named hunter's characterization is *how* they hunt (one favors a rifle and distance, another favors a shotgun and closing fast). This is the one place the ladder trades jurisdiction-cleanliness for character.

### 3.5 Escalation / handoff between tiers

This is the mechanical heart of §10.4 ("a local crime does NOT summon hunters unless witnessed+broadcast"), made precise as a state machine per crime:

```text
Crime occurs
  -> witnessed by a Town Guard's sight cone / reported by a witness NPC
       -> TOWN GUARD responds (community-scoped, local wanted 1-2)
            -> if the player is caught/killed/de-escalates locally: DONE, nothing travels
            -> if local wanted climbs to 3+ (Active Pursuit) inside that state:
                 -> STATE ENFORCER takes over (state-scoped, no longer town-limited)
                      -> if the player leaves the state before wanted hits 5+: STATE ENFORCER
                         drops at the line, NOTHING follows (the state never broadcast)
                      -> if wanted reaches 5 (State Blacklist) or 6 (Interstate/Federal Heat)
                         BEFORE the player leaves, OR the crime itself is a broadcast-tier
                         crime per §10.2's Interstate/Federal row (murder spree, ruler hit,
                         convoy terrorism) REGARDLESS of local wanted number:
                           -> a BROADCAST WARRANT is issued (persists on the player's per-state
                              record, independent of the live wanted meter)
                           -> BOUNTY HUNTER activates, and DOES follow across the line
```

A second, independent path to Bounty Hunter activation never touches wanted levels at all: crossing INTO a state where the player's respect standing is already SUSPECT (the `bounty_hunted` flag) — this is the "you're already hated here before you did anything today" path, and it fires regardless of the crime-escalation chain above.

**The load-bearing rule, stated once, for anyone wiring this:** a Town Guard kill witnessed by nobody and not resulting in a broadcast produces **zero** consequence outside that community — no State Enforcer response, no warrant, no hunter, ever. Consequence requires either (a) climbing the wanted ladder high enough inside one state to cross the broadcast threshold, or (b) already being hated enough in a state that the border itself is the trigger. Nothing "just knows."

### 3.6 Interaction with player standing (respect/esteem/infamy)

All three tiers read `respect.gd`, but at **different keys**, matching the jurisdiction the tier actually has:

- **TOWN GUARD** reads the *town's own faction key* (today: `"meridian"`, per `ProtoNPC.FACTION`) — town-scoped standing, town-scoped reaction. A HERO in Meridian gets warm greetings from Bridger; a SUSPECT gets sighted. This is the existing behavior, unchanged.
- **STATE ENFORCER** reads the *state's key* (`respect.standing("KENTUCKY")`, the same key `on_state_entered` already reads) — a HERO or TRUSTED standing in that state means enforcers **salute rather than stop** (a `de-escalation on approach` behavior: an Enforcer who would otherwise initiate a checkpoint stop skips it entirely at TRUSTED+, and at HERO the per-ruler flavor text should acknowledge the player by name/reputation the way `_welcomed_states` already triggers a scrip gift). A NEUTRAL standing gets the normal patrol/checkpoint behavior. A SUSPECT standing means an Enforcer initiates a stop **even with wanted level 0** (their own state hates you on sight; this is the border-hostility read fed through the state layer instead of the interstate layer).
- **BOUNTY HUNTER** reads the state's key too, for activation (`border_standing`, §3.4), but once a specific hunter is actively pursuing, that pursuit is tracked on the **player's per-state warrant record** (§4's `active_warrants` shape), not re-derived from live standing every frame — a hunter who's already inbound does not un-summon just because the player does a good deed and standing ticks up mid-chase. Standing recovery only prevents *future* activations; it does not cancel an already-active hunt (only pay-off/kill/expiry do, per §3.4).

### 3.7 Co-op / PvP notes

- **Co-op (shared world, both players friendly):** all three tiers evaluate jurisdiction/response **per player**, but a Town Guard or State Enforcer encounter triggered by one player's crime should engage that player's threat first (the witnessed party), with the second player treated as a bystander unless *they* also commit a witnessed act or are caught carrying the same contraband at a shared checkpoint stop. A Bounty Hunter's warrant is tied to the specific player id who earned it (their per-state warrant record, keyed by player id) — one player being hunted does not put the other player's face on the same warrant, though nothing stops the hunted player from asking their partner for help in the fight once it's rendered.
- **PvP (F6 rules):** none of the three tiers should treat a PvP kill (player-vs-player, victim-authoritative per `net.gd`) as a witnessed crime by default — PvP already has its own kill-toast/session-bounty system (`proto3d.gd`'s `pvp_bounties`) and double-counting it into the Security Ladder's wanted pipeline would conflate two different reputation systems. The one deliberate exception: PvP violence committed **inside a town's sight-radius while NOT in an active PvP duel/FFA mode** (i.e., ambushing a peaceful player under `pvp_mode == "peace"`, which the rules already forbid at the mechanical level) should be witnessable by Town Guards exactly like any other assault — this makes "peace mode" mean something enforced by the world, not just a menu toggle.
- **Bounty Hunters as a PvP lever:** per `LOOT_NPC_PRODUCTION_WANTED_SPAWN.md` §13's PvP example ("player B accepts a bounty to hunt player A across state lines"), a later pass could let a *human* player claim an open interstate warrant against another human player instead of an NPC hunter spawning — this spec does not build that hook, but the warrant-record shape in §4 (state-keyed, player-id-keyed, reward-valued) is intentionally the same shape such a claim system would need, so it is not a redesign later, just a new consumer of the same row.

### 3.8 Population cells / war units (POPULATION_WAR.md)

Per `POPULATION_WAR.md` §1's five population groups (`civilian`, `worker`, `threat`, `law`, `faction_troops`), the Security Ladder tiers map onto exactly two of those groups, and the mapping is deliberate, not a rename:

- **TOWN GUARD -> `law` group.** A community's desired `law` count (per `population_targets.json`'s zone rows — e.g. `suburbs: {"law": 1}`, `industrial: {"law": 1}`) is the population-cell-level expression of "this place has a guard posted." When population cells materialize a `law`-group actor into a real node (the instantiation bridge, §3.2 of `POPULATION_WAR.md`), it should materialize as a TOWN GUARD archetype row from `security_forces.json`, chosen by the cell's zone tag / nearest town.
- **STATE ENFORCER -> `faction_troops` group, specifically the `law`-flavored subset patrolling roads rather than massed at a `military_perimeter`.** `population_targets.json`'s `military_perimeter` row already carries `faction_troops: 4`; a new `road_shoulder`-adjacent checkpoint presence (see §5 tuning knob) is the natural home for State Enforcer materialization along highway cells, consistent with `POPULATION_WAR.md` §3.4's framing that `faction_troops` are also war units — a State Enforcer checkpoint squad and a war-front squad draw from the exact same population pool and the exact same `unit_types.json`-style stat rows that document specs (not invented here — see Dependencies), meaning **an active war can visibly thin State Enforcer checkpoint presence in a state that's losing troops to a front**, for free, because they are counted from the same bucket.
- **BOUNTY HUNTERS are never population-cell actors.** They are not ambient population — they are warrant-driven, individually tracked, and spawned/despawned by the warrant state machine (§3.4/§4), not by a cell's `current_pop`/`desired_pop` refill tick. This is a deliberate exclusion: a population cell's `law` or `faction_troops` count going to zero (a town overrun, a state's troops routed) should never accidentally "spawn a bounty hunter" — that would blur a jurisdictional character into an ambient number.

---

## 4. Formulas

### 4.1 Town Guard patrol radius (de-escalation distance)

```text
guard_range_m = TOWN_GUARD_BASE_RANGE_M * tier_mult(community_tier)

TOWN_GUARD_BASE_RANGE_M = 40.0   (tuning knob, §5)
tier_mult: T1 = 0.75, T2 = 1.0, T3 = 1.4, T4 = 2.0
  (per LOOT_NPC_PRODUCTION_WANTED_SPAWN.md §3.1's four community tiers —
   a bigger town's guards watch a bigger footprint)
```

**Example:** Meridian, read as a T2 hamlet (`tier_mult 1.0`) -> `guard_range_m = 40.0`. Bridger de-escalates (reverts to base patrol act, stops evaluating standing-based re-aggro) the instant the player is more than 40m from his patrol anchor. A T3 county seat's guards would hold a 56m range (`40.0 * 1.4`); a T4 metro district's guards hold 80m (`40.0 * 2.0`).

**Upgrade path (near-term, not aspirational):** `POPULATION_WAR.md` names a 500m population cell grid and a builder is actively wiring `population.gd` tonight. Once population cells are live, `guard_range_m` should be superseded by "still inside the same population cell as the patrol's home cell" — a cleaner, systemic boundary that needs zero new tuning per town. Until that lands, the flat radius above is the correct, buildable default; see Dependencies §6.2.

### 4.2 State Enforcer contraband-stop chance

```text
stop_chance = BASE_STOP_CHANCE
            * (1.0 + CONTRABAND_STACK_BONUS * min(contraband_count, 4))
            * standing_mult(respect.standing(state))

BASE_STOP_CHANCE = 0.35            (tuning knob, §5 — checkpoint-only; roving
                                     highway patrol uses HIGHWAY_STOP_CHANCE = 0.12)
CONTRABAND_STACK_BONUS = 0.15      (each additional banned item found in the player's
                                     carried/trunk contraband list raises the roll,
                                     capped at 4 stacks so a hoarder isn't a guaranteed stop)
standing_mult:
  SUSPECT  = 1.6   (their own state already hates you — near-certain stop)
  NEUTRAL  = 1.0
  TRUSTED  = 0.35  (mostly waved through even carrying something borderline)
  HERO     = 0.0   (never stopped — this is the mechanical form of "enforcers salute")
```

**Example:** the player crosses a Faith Bloc checkpoint carrying a `pistol` and a `machete` (2 contraband items under Faith Occupation Law) at NEUTRAL standing: `stop_chance = 0.35 * (1.0 + 0.15*2) * 1.0 = 0.35 * 1.3 = 0.455` — a 45.5% chance the checkpoint initiates a stop. The same player at TRUSTED standing: `0.35 * 1.3 * 0.35 = 0.159` (15.9%). At HERO: `0.0` regardless of contraband count.

### 4.3 Bounty Hunter payoff cost

```text
payoff_scrip = BASE_PAYOFF * wanted_level_mult(wanted_level_at_broadcast) * days_open_mult(days_since_broadcast)

BASE_PAYOFF = 150                          (tuning knob, §5)
wanted_level_mult: level 5 = 1.0, level 6 = 1.75
days_open_mult = clamp(1.0 + 0.05 * days_since_broadcast, 1.0, 2.0)
                 (a warrant left open accrues "interest" — a hunter's expenses,
                  fictionally — capped at double so it never becomes unpayable)
```

**Example:** a level-6 warrant broadcast 6 days ago: `payoff_scrip = 150 * 1.75 * min(1.0 + 0.05*6, 2.0) = 150 * 1.75 * 1.3 = 341.25` -> **341 scrip** (round to nearest whole scrip) to pay off at a `state_ruler` courthouse-equivalent, clearing the warrant and recalling any active hunter instance for that warrant.

### 4.4 Bounty Hunter warrant expiry

```text
expires_after_days = WARRANT_EXPIRY_DAYS_BASE / days_open_mult_inverse(wanted_level)

WARRANT_EXPIRY_DAYS_BASE = 21           (tuning knob, §5 — three real weeks of
                                          in-game days; per the 60x compression this
                                          is roughly 84 real driving-hours, generous)
days_open_mult_inverse: level 5 = 1.0, level 6 = 1.5
  (a level-6 federal-heat warrant is watched harder and expires FASTER, not slower —
   the state actively wants this one closed, not forgotten)
```

**Example:** a level-5 warrant expires after 21 in-game days untouched; a level-6 warrant expires after `21 / 1.5 = 14` days. On expiry: the warrant clears from the player's per-state record with no payment, any actively-pursuing hunter for that warrant breaks off (their contract lapsed), and a one-line notify fires ("the {ruler}'s warrant on you has gone cold").

### 4.5 Ambush-odds interaction (existing formula, extended)

`proto3d.gd`'s existing `ambush_odds()` formula (`odds = (0.55 if dark else 0.3) * (2.0 if bounty_hunted else 1.0) * events.pirate_mult(...) * (1.0 + 0.35*road.danger)`) already doubles ambush odds while `bounty_hunted` is true. The Security Ladder does not replace this — a Bounty Hunter's actual pursuit-encounter chance is a **separate, additive** roll on top of the general ambush odds, because a hunter is a specific tracked pursuer, not flavor for "more raiders happen to be around":

```text
hunter_encounter_chance_per_road_tick = HUNTER_BASE_CHANCE * proximity_mult(km_since_last_sighting)

HUNTER_BASE_CHANCE = 0.08                (tuning knob, §5, evaluated on the same
                                           per-road-tick cadence ambush_odds() already uses)
proximity_mult: starts at 1.4 immediately after activation (a hunter that JUST
  picked up the trail closes fast), decays toward 0.6 floor over the first
  ~15 in-game km as the trail cools, per the standard "leads go cold" pacing —
  exact decay curve is a tuning knob (§5), not hardcoded here
```

## 5. Edge Cases

- **Player kills a Town Guard witnessed by nobody, then leaves town before any other NPC finds the body.** Per §3.5's load-bearing rule: zero consequence outside the community. If the body IS later found (evidence pipeline, §10.5), it should raise LOCAL wanted retroactively but never skip straight to State Enforcer or Bounty Hunter response — the crime was never broadcast, so it cannot summon a tier scoped above the community.
- **Player has a broadcast warrant in Kentucky, then earns HERO standing in Kentucky through good deeds before paying it off.** The warrant does not auto-clear from good standing alone (§3.6) — standing recovery prevents *future* activations and lets State Enforcers salute on sight, but an already-broadcast warrant is a separate persistent record that only clears via payoff, hunter-kill, or expiry. This is deliberate: it means a player can be simultaneously "beloved by the state" and "still hunted" for a specific past act, which is a more interesting and more honest state than instant forgiveness.
- **Two Bounty Hunters' triggers fire at once** (player crosses a hostile-standing border while ALSO carrying an existing broadcast warrant for that same state). Do not stack two hunter instances for the same warrant — a single warrant record activates at most one currently-pursuing hunter at a time (see §4's `active_warrants` shape has one `hunter_id` slot, not a list). If both triggers point at the *same* state's warrant, it's one activation. If they point at *different* states' warrants (a broadcast warrant in Kentucky, a hostile-standing crossing into Texas), both can be independently active — the player can be hunted by two different named hunters in two different states at once; this is intended (it's the natural cost of burning multiple states).
- **Player pays off a warrant while the pursuing hunter is mid-chase, actively rendered nearby.** The hunter's AI should break off pursuit within the same tick the payoff confirms (read the warrant state, not a cached "currently hunting" bool) — a hunter that keeps attacking for several more seconds after being paid off reads as broken, not tense.
- **A named Bounty Hunter is killed, but the underlying wanted level that triggered the original broadcast is still active** (player is still doing crimes in that state). Per §3.4: the specific pursuit ends with the hunter's death, but if wanted stays at broadcast-threshold, a **new** dispatch can fire later (a different hunter, or the same hunter respawned after a cooldown — designer's call, tuning knob `hunter_redispatch_cooldown_days`, default 3). A killed hunter is not a permanent "get out of jail free" for that state.
- **State Enforcer checkpoint fires a contraband stop on a player who is also, separately, at wanted level 4 in that same state.** Both triggers can co-occur; treat it as one encounter (a checkpoint stop that escalates into a manhunt-tier response) rather than two simultaneous NPC groups spawning independently — the wiring builder should resolve to the HIGHER-tier response body count/composition when both fire in the same tick, not both.
- **Player is in a state where the controlling faction (world_state.gd) has changed via offline catch-up** (e.g., Florida falls to Broadcast Church while the player was away, per `world_state.gd`'s `_apply_takeover`). State Enforcer flavor for that state should read the NEW `controller_of(state)` value at spawn-time, never cache the old faction — a Florida checkpoint encountered the day after a takeover should already be dressed as Faith Bloc marshals, not legacy Free Counties rangers, with zero special-case code (this falls out for free if enforcer archetype selection always reads `world_state.controller_of(state)` live rather than storing it once).
- **Co-op: one player is HERO in a state, the other is SUSPECT.** State Enforcers evaluate the encountered player's own standing (§3.7) — the HERO player gets saluted/skipped, the SUSPECT player (even standing right next to their partner) gets stopped. This can look strange in the fiction (an enforcer ignoring one player and stopping the other at the same checkpoint) but is the correct per-player read and should not be "fixed" by averaging standings.
- **Bounty Hunter's rig is destroyed but the hunter (on foot) survives.** Treat as an ongoing pursuit, now on foot/hitching — do not auto-kill the hunter when their vehicle dies; only their own hp reaching zero ends the pursuit (their vehicle is gear, per §4.5's row schema, not their life total).

## 6. Dependencies

### 6.1 Systems this ladder reads (already live, unchanged by this spec)

- `respect.gd` — `standing(key)`/`esteem(key)`/`infamy(key)`/`add_esteem`/`add_infamy`. Confirmed dual-keyed today (called with both `"meridian"` and state names like `"VIRGINIA"` in `proto3d.gd`) — no change needed to support Town Guard reading a town key and State Enforcer reading a state key off the same ledger class.
- `proto3d.gd`'s `bounty_hunted: bool` (line ~2821) and `on_state_entered()` — this is the EXISTING implementation of the border-standing trigger this spec names `border_standing`. The Security Ladder does not ask for a new flag; it names this one and specifies a persistent per-state warrant record (§4) to sit alongside it for the broadcast-warrant path, which does not exist yet.
- `world_state.gd` — `controller_of(state)`, `law_for(state)`, `player_contraband(state)`, and the four faction ids (`free_counties`, `broadcast_church`, `corporate_corridor`, `federal_remnant`). State Enforcer flavor rows key off these faction ids directly (§4.4 of the data file). `law_profiles.json`'s `contraband` lists are read as-is for the contraband-stop formula (§4.2 of this doc).
- `data/rulers.json` — the 14 named per-state ruler rows, read for `ruler_flavor` naming/legend text on enforcer rows (§3.3). Not all 14 need an enforcer row this pass; the data file ships 6-8 representative rows per the approved scope, and any state without a specific `ruler_flavor` row falls back to its `faction`'s generic flavor row.
- `npc.gd`'s `ProtoNPC.ARCHETYPES["secman"]` (Bridger) — this IS a Town Guard row in every load-bearing sense (behavior contract, trigger, de-escalation). This spec's `security_forces.json` Town Guard rows are written to be data-compatible with that existing archetype shape (name/title/role/look/act/color/greet/refuse/stock) so a wiring pass can fold `security_forces.json`'s town-guard rows into `ProtoNPC.ARCHETYPES` the same way `npcs.json`'s `archetypes` array already folds in Hazel/Mercer — **this is an additive superset, not a competing system.**
- `POPULATION_WAR.md` §3.1/§3.2 (`population_targets.json`'s `law`/`faction_troops` groups, the instantiation bridge) — a builder is actively wiring `population.gd` tonight (confirmed: the file exists in the tree now). Per §3.8 above, Town Guard rows are the natural `law`-group materialization and State Enforcer rows are the natural road-adjacent `faction_troops` materialization. This is a near-term-real dependency, not aspirational — once `population.gd` lands, the wiring pass should point its `law`/`faction_troops` materialization at `security_forces.json` rows rather than a generic placeholder actor.

### 6.2 The population-cell upgrade path for Town Guard de-escalation range (§4.1)

Stated once here since it touches both formula sections and dependency tracking: the flat-radius formula in §4.1 is the correct default to BUILD today (nothing else needs to exist for it to work), but the design intent is for it to be superseded by "still inside the guard's home population cell" the moment `population.gd`'s cell grid is queryable. This is not a breaking change — a wiring builder can ship §4.1's radius now and swap the boundary check later without touching any `security_forces.json` row, because the row only says `patrol_kind: "beat"`; it does not encode the boundary math itself.

### 6.3 The rifle-class weapon row — ready to paste for the wiring builder

`weapon.gd`'s `WEAPONS` dictionary (line 20) has no rifle-class row today — only `pistol` (pistol-class, correct for Town Guard), `shotgun`, `pipe_rocket`, four melee rows, and `car_mg` (a vehicle-mount hitscan, not a carried rifle). State Enforcer rows in `security_forces.json` reference weapon id `"rifle"` as a **forward reference** — this is intentional, not an oversight, and the exact row is specified below so the weapons-owning builder can paste it without needing this doc re-explained. Values are chosen to sit clearly above `pistol` (18 dmg/42m/12 mag) and below `pipe_rocket` (60 dmg) on every axis that matters for "this is what a state trooper's rifle should feel like," reusing existing SFX ids (`"shot"` is already the shared hitscan fire sound; no new SFX asset is implied) and the existing `hand_pose`/`two_handed` convention:

```gdscript
"rifle": {"name": "Service rifle", "emoji": "🔫", "behavior": Behavior.HITSCAN, "damage": 26.0,
    "mag_size": 20, "ammo": "rifle_ammo", "cooldown": 0.22, "spread_deg": 2.0, "range": 75.0, "reload_s": 1.4,
    "fire_sfx": "shot", "hit_stop": false,
    "hand_pose": {"offset": Vector3(-0.10, 0.18, -0.04), "two_handed": true}}, # both hands, raised to the shoulder
```

Rationale for each value against the two neighboring rows:
- `damage: 26.0` — sits between pistol (18) and axe's melee-committed 34; a rifle hit should read as meaningfully harder than a pistol hit without matching the biggest single-hit weapon in the game.
- `mag_size: 20` — bigger than pistol's 12 (a rifle should sustain fire longer at a checkpoint standoff) but far short of `car_mg`'s 40 (that's a vehicle-mounted weapon, a different power class).
- `cooldown: 0.22` — faster cyclic rate than pistol's 0.32 (a rifle fires quicker) but not full-auto-fast; this keeps a State Enforcer dangerous without turning a checkpoint fight into a bullet-hose.
- `spread_deg: 2.0` — tighter than pistol's 4.0 — a rifle should be the accurate option, rewarding the player for closing distance or using cover rather than trading at range.
- `range: 75.0` — nearly double pistol's 42m, matching the fictional and mechanical read of "this is why State Enforcers can hold a checkpoint at distance and Town Guards can't."
- `ammo: "rifle_ammo"` — a **new ammo item id**, distinct from `9mm`/`12ga`/`rocket`. This is a deliberate economy lever: rifle ammo should NOT drop from the same pool as pistol ammo, so looting a State Enforcer checkpoint feels like a distinct, valuable haul rather than "more of the same 9mm." The wiring/economy builder should add a `rifle_ammo` row to `items.json`/`prices.json` alongside this weapon row landing (suggested price band: between `12ga` at 2 and `pipe_rocket`'s ammo `rocket` at 15 — a reasonable starting price is 4-6 scrip per round, a tuning knob for that builder, not fixed here).
- `hit_stop: false` — matches `pistol`/`car_mg`'s existing rationale (rapid-fire guns default false so a steady cadence doesn't read as stutter).

This row is written so `security_forces.json`'s State Enforcer rows can reference `"weapon_row": "rifle"` **today**, before the row exists in code — exactly the same forward-reference pattern `carousel.json`'s `occupier` field already uses for actors that get resolved at a different layer.

### 6.4 Systems this ladder does NOT touch or gate on

- Jail/arrest (§10.6 of the grounding doc) — out of scope; a Town Guard or State Enforcer "win" against the player in this pass should use whatever arrest/consequence MVP already exists or is being built elsewhere (fade-out/time-skip per §10.6), not a new consequence invented here.
- Evidence objects (§10.5) — the witnessed-crime trigger for Town Guard and the wanted-level trigger for State Enforcer both assume SOME upstream wanted-level pipeline exists or is landing separately; this spec consumes wanted levels and standing, it does not define how a corpse becomes evidence.
- `npc.gd`, `weapon.gd`, `world_state.gd`, `population.gd` — no code in this pass. Every rule above is written to be foldable additively by whichever builder owns each file, the same way `ensure_archetypes()`/`ensure_prices()`/`ensure_laws()` already fold their respective JSON files onto a code floor.

## 7. Tuning Knobs

| Knob | Default | Range | Category | Notes |
|---|---|---|---|---|
| `TOWN_GUARD_BASE_RANGE_M` | 40.0 | 20-100 | feel | §4.1 base de-escalation radius before tier multiplier |
| `tier_mult` (T1/T2/T3/T4) | 0.75/1.0/1.4/2.0 | 0.5-3.0 each | curve | scales guard range by community tier |
| `BASE_STOP_CHANCE` (checkpoint) | 0.35 | 0.1-0.7 | gate | §4.2, contraband stop base roll at a fixed checkpoint |
| `HIGHWAY_STOP_CHANCE` (roving) | 0.12 | 0.05-0.3 | gate | same formula, roving highway patrol variant (lower — spot checks, not a wall) |
| `CONTRABAND_STACK_BONUS` | 0.15 | 0.05-0.3 | curve | per additional contraband item, capped at 4 stacks |
| `standing_mult` (SUSPECT/NEUTRAL/TRUSTED/HERO) | 1.6/1.0/0.35/0.0 | designer-authored per band | curve | HERO=0.0 is the "enforcers salute" mechanical floor, not a range |
| `BASE_PAYOFF` | 150 scrip | 50-500 | gate | §4.3 warrant payoff base cost |
| `wanted_level_mult` (5/6) | 1.0/1.75 | 1.0-3.0 | curve | payoff scales with the warrant's severity at broadcast time |
| `days_open_mult` cap | 2.0x | 1.5-3.0 | gate | payoff "interest" ceiling — never unpayable |
| `WARRANT_EXPIRY_DAYS_BASE` | 21 days | 7-45 | gate | §4.4 — three in-game weeks; a real-money-time safety valve |
| `days_open_mult_inverse` (5/6) | 1.0/1.5 | 1.0-2.0 | curve | higher wanted level expires FASTER (more actively pursued, not forgotten) |
| `hunter_redispatch_cooldown_days` | 3 days | 1-10 | gate | how soon a NEW hunter can be dispatched after one is killed, warrant still open |
| `HUNTER_BASE_CHANCE` | 0.08 | 0.02-0.2 | gate | §4.5 per-road-tick hunter encounter roll once activated |
| `proximity_mult` start/floor | 1.4 / 0.6 | 1.0-2.0 / 0.3-1.0 | curve | decays over ~15 in-game km since activation/last sighting |
| `RENDER_HOLD_M` (state enforcer checkpoint visual range) | matches existing render-distance conventions | n/a | gate | not re-specified here — reuse whatever streaming/render-distance constant `world_stream.gd` already exposes; this is a wiring detail, not a new number |

## 8. Acceptance Criteria

**Functional:**
- A Town Guard row (Bridger or any new archetype) de-escalates (reverts patrol act, stops standing-reaggro checks) the instant the player exceeds `guard_range_m` for that community's tier, and does not require the player to leave the whole state — only the community radius.
- A State Enforcer row initiates a contraband stop at a checkpoint per §4.2's formula, correctly reading the state's OWN law profile's `contraband` list (a `pistol` is contraband under Faith Occupation Law but not under Free Counties Law — the same item in the same backpack produces different stop odds in different states).
- A State Enforcer row never engages the player the instant they cross the state line out of that enforcer's state, with zero exception (no lingering pursuit) — matching §10.4's "local pursuit drops unless identified/broadcast," scoped correctly one layer up from Town Guard.
- A Bounty Hunter activates ONLY via `broadcast_warrant` or `border_standing` (never off a bare local/state wanted number alone) and, once activated, continues pursuing across at least one state line without de-escalating — the one testable difference between this tier and the other two.
- Paying off a warrant (§4.3's formula) clears the per-state warrant record and causes any actively-pursuing hunter tied to that warrant to break off within the same tick.
- A warrant past its `expires_after_days` (§4.4) auto-clears with a notify line and no payment required, and any active hunter for it breaks off.
- All three tiers' archetype selection for a given state reads `world_state.controller_of(state)` LIVE at spawn time (never a cached value), so a state that changes controlling faction mid-game (offline catch-up or a future war outcome) immediately dresses new encounters in the new faction's flavor.
- The rifle weapon row (§6.3) is a complete, valid `WEAPONS` dictionary entry with every field `pistol`'s row has, using only existing SFX ids.

**Experiential:**
- A playtester who commits a witnessed local crime, flees town, and stays in-state should report feeling like they "got away with it locally" — no state-level or interstate consequence should be perceptible to them.
- A playtester who trips a State Enforcer checkpoint with contraband in the trunk should describe the encounter as "this state's rules," distinguishable in feel/dressing from the town guard scuffle that preceded it in the same session (per-ruler/per-faction flavor text and rifle-class threat should both be legible without reading a tooltip).
- A playtester who earns a broadcast warrant and is later caught by a named Bounty Hunter three states away should describe it as "that felt personal" / "I thought I got away with it" — the hallmark of this tier successfully reading as distinct from ambient ambush encounters (`ambush_odds()`'s general raider spawns).
- A playtester who reaches HERO standing in a state should notice and comment on enforcers behaving differently toward them (salute/skip-stop) without being told to look for it — the mechanical `standing_mult = 0.0` at HERO should be legible as "the guards like me now," not just a silent probability change.
