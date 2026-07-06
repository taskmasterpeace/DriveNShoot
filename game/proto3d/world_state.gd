## THE LIVING WORLD (docs/design/LIVING_WORLD_DSOA.md — the greenlit next arc, HANDOFF §0).
## The map is politically ALIVE: every state has a controlling FACTION and an active LAW
## PROFILE, and while the player is gone the EVENT DIRECTOR rolls offline days — a state
## can FALL. The signature beat: "Four Days Later: Florida Under New Law." On return you
## wake SAFE inside the safehouse (never punished at home) and learn what changed from the
## briefing before you ever step outside. This node owns the world-state + the catch-up.
class_name ProtoWorldState
extends Node

const WORLD_VERSION := 1
const OFFLINE_CATCHUP_THRESHOLD_HOURS := 12.0 ## under this: normal load, no catch-up
const MAX_OFFLINE_DAYS := 7                    ## a six-month absence can't wreck the game
const TAKEOVER_DAYS := 4                        ## the canonical "four days later" threshold

## LAW PROFILES — an ADDITIVE fold on a code floor (the proven ensure_* spine: items/loot/
## prices/NPC already do this). A JSON row with a NEW id becomes a real law; existing ids
## stay code-authoritative so stale JSON can't corrupt the two the slice depends on.
static var LAWS: Dictionary = {
	"free_counties_law": {
		"name": "Free Counties Law", "controller": "free_counties",
		"guns": "legal", "curfew": false,
		"contraband": [], # nothing you carry is illegal here
		"blurb": "Guns legal and common. Checkpoints suspicious but negotiable. Militia country.",
	},
	"faith_occupation_law": {
		"name": "Faith Occupation Law", "controller": "broadcast_church",
		"guns": "contraband", "curfew": true,
		"contraband": ["pistol", "shotgun", "machete", "axe", "pipe_rocket", "9mm", "12ga"],
		"blurb": "Unlicensed guns are contraband. Curfew after dark. The Witness Hour on every band.",
	},
}
static var _laws_folded := false

## Fold data/law_profiles.json onto the code floor, once. New ids only (floor wins).
static func ensure_laws() -> void:
	if _laws_folded:
		return
	_laws_folded = true
	var path := "res://data/law_profiles.json"
	if not FileAccess.file_exists(path):
		return
	var j: Variant = JSON.parse_string(FileAccess.get_file_as_string(path))
	if j is Dictionary:
		for id in j:
			if String(id).begins_with("_") or not (j[id] is Dictionary):
				continue # skip notes/metadata rows
			if not LAWS.has(String(id)): # code floor is authoritative for existing ids
				LAWS[String(id)] = (j[id] as Dictionary).duplicate(true)


var _main: Node = null
## STATE (uppercase, e.g. "FLORIDA", matches usmap.state_at) -> controlling faction id.
## Absent = the default free_counties.
var state_control: Dictionary = {}
## STATE -> law_profile id. Absent = free_counties_law.
var active_laws: Dictionary = {}
## Diegetic media the world queued while you were gone: {id, medium, text, day, heard}.
var broadcast_queue: Array = []
## The unresolved catch-up result the HUD briefing (and the sim) reads. {} = nothing pending.
var pending_briefing: Dictionary = {}
## Set to "now" on every save; the load path compares it against wall-clock to size the gap.
var last_played_utc: int = 0


static func create(main: Node) -> ProtoWorldState:
	ensure_laws()
	var w := ProtoWorldState.new()
	w._main = main
	return w


# --- reads (every law consumer calls these; default is always the free profile) ----------

func law_id_for(state: String) -> String:
	return String(active_laws.get(state, "free_counties_law"))


func law_for(state: String) -> Dictionary:
	return LAWS.get(law_id_for(state), LAWS["free_counties_law"])


func controller_of(state: String) -> String:
	return String(state_control.get(state, "free_counties"))


## What in a bag is illegal under a state's CURRENT law. Returns the contraband ids only.
func contraband_in(state: String, item_ids: Array) -> Array:
	var banned: Array = law_for(state).get("contraband", [])
	var flags: Array = []
	for id in item_ids:
		if banned.has(String(id)) and not flags.has(String(id)):
			flags.append(String(id))
	return flags


## The player's contraband RIGHT NOW under a state: what's in the backpack + the car trunk.
## (Possession is not a crime — this only tells the briefing/checkpoint what would flag.)
func player_contraband(state: String) -> Array:
	var ids: Array = []
	if "backpack" in _main and _main.backpack != null:
		ids.append_array(_main.backpack.slots.keys())
	if "active_car" in _main and _main.active_car != null and _main.active_car.trunk != null:
		ids.append_array(_main.active_car.trunk.slots.keys())
	return contraband_in(state, ids)


# --- THE EVENT DIRECTOR: offline catch-up ------------------------------------------------
# Deterministic: same save + same gap + same seed => same result (a fairness + debug rule).
# It rolls each offline day through the EXISTING events.roll_daily (the calendar still turned
# while you were away — see events.gd), then layers the political sim on top. It NEVER spawns
# actors offline (the "calculated"/far layer only) and NEVER kills the player at home.

## Called by load_game after the save is applied. Sizes the gap and runs catch-up if it
## crosses the threshold. Returns the digest ({} if no catch-up ran).
func catchup_on_load(now_utc: int) -> Dictionary:
	if last_played_utc <= 0:
		return {}
	var gap_h := float(now_utc - last_played_utc) / 3600.0
	if gap_h < OFFLINE_CATCHUP_THRESHOLD_HOURS:
		return {}
	var days := int(floor(gap_h / 24.0))
	return run_offline_catchup(days, last_played_utc)


## Roll `days` of absence (capped). seed_base makes it reproducible. Returns the OfflineDigest.
func run_offline_catchup(days: int, seed_base: int) -> Dictionary:
	days = clampi(days, 0, MAX_OFFLINE_DAYS)
	var digest: Dictionary = {"days": days, "changes": [], "took_state": "", "new_law": "", "broadcasts": []}
	# The calendar still turned while you were gone (daily/weekly beats), wrapping the
	# existing deterministic roller — no actors spawned, just the record.
	if "events" in _main and _main.events != null:
		var base_day := int(_main.daynight.day) if ("daynight" in _main and _main.daynight != null) else 0
		for i in days:
			_main.events.roll_daily(base_day + i + 1)
	# THE SIGNATURE POLITICAL BEAT: at the major-event threshold, FLORIDA falls to the
	# Faith Bloc if it isn't already theirs. Deterministic on the threshold (the canonical
	# slice); the seed only flavors which bulletin voice reports it.
	if days >= TAKEOVER_DAYS and controller_of("FLORIDA") != "broadcast_church":
		_apply_takeover("FLORIDA", "broadcast_church", "faith_occupation_law", digest, seed_base)
	pending_briefing = digest
	return digest


func _apply_takeover(state: String, faction: String, law_id: String, digest: Dictionary, seed_base: int) -> void:
	state_control[state] = faction
	active_laws[state] = law_id
	digest["took_state"] = state
	digest["new_law"] = law_id
	digest["changes"].append("%s fell to the %s" % [state, faction])
	var voices: Array = ["The Witness Hour", "Southern Emergency Feed", "a church relay"]
	var voice: String = voices[absi(hash(seed_base)) % 3]
	queue_broadcast("radio",
		"%s: %s reports %s is under new law. All unlicensed firearms must be surrendered. Curfew begins at dusk." % [voice, voice, state],
		digest)


## Queue a diegetic bulletin. Text-first ALWAYS works (the fallback stack's floor — a missing
## TTS/video never blocks). The HUD/radio drains this.
func queue_broadcast(medium: String, text: String, digest: Variant = null) -> void:
	var day := int(_main.daynight.day) if ("daynight" in _main and _main.daynight != null) else 0
	var b: Dictionary = {"id": "bc_%d_%d" % [day, broadcast_queue.size()], "medium": medium, "text": text, "day": day, "heard": false}
	broadcast_queue.append(b)
	if digest is Dictionary:
		(digest["broadcasts"] as Array).append(b)
