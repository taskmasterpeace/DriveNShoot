## WORLD EVENTS (goal: reasons to log back in the world generates for free).
## One roll per DAWN, deterministic off the day number — every player's Tuesday
## is the same Tuesday. Daily: a trader CARAVAN parks on the shoulder, or a
## BLOOD MOON strips the night's floor. Weekly (every 7th day): a STATE AT WAR —
## its roads crawl with pirates until the week turns.
class_name ProtoEvents
extends Node

const WAR_STATES: Array = ["KENTUCKY", "TEXAS", "COLORADO", "NORTH CAROLINA", "KANSAS"]

var _main: Node = null
var today_event: String = "" ## sim/HUD hook
var war_state: String = ""   ## roads here run triple pirates
var _last_day: int = 0


static func create(main: Node) -> ProtoEvents:
	var e := ProtoEvents.new()
	e._main = main
	return e


func _physics_process(_delta: float) -> void:
	if _main.daynight.day != _last_day:
		_last_day = _main.daynight.day
		roll_daily(_last_day)


## Deterministic: hash(day) picks. Sims call this directly with a chosen day.
func roll_daily(day: int) -> String:
	# RING EVENTS ride the calendar too: every few days the ring bites back and
	# one of your lit nodes comes under SIEGE (never your first — that's home).
	if _main.carousel != null and day % 4 == 0 and _main.carousel.any_under_siege().is_empty():
		_main.carousel.rng.seed = hash("siege:%d" % day)
		_main.carousel.besiege_random(2)
	# The WEEKLY beat: every 7th day a state goes to WAR.
	if day % 7 == 0:
		war_state = WAR_STATES[hash(day) % WAR_STATES.size()]
		today_event = "state_at_war"
		_main.notify("📻 ⚔️ WAR IN %s — the %s's roads run thick with pirates this week" % [war_state, war_state])
		if "audio" in _main and _main.audio:
			_main.audio.play_ui("vo_radio_war", -4.0)
		return today_event
	match hash(day) % 3:
		0:
			today_event = "caravan"
			_spawn_caravan()
		1:
			today_event = "blood_moon"
			_main.daynight.moon_phase = 0.04 # tonight the floor drops out
			_main.notify("🌘 BLOOD MOON tonight — the dark comes all the way down. Pack light, drive fast.")
			if "audio" in _main and _main.audio:
				_main.audio.play_ui("vo_radio_blood_moon", -4.0) # the DJ calls it through the static
		_:
			today_event = "quiet"
			war_state = "" if day % 7 != 0 else war_state
	return today_event


## A trader CARAVAN parks on the shoulder up the road: one fat trunk, honest
## prices already handled by the ledger — just get there before dusk.
func _spawn_caravan() -> void:
	var origin: Vector3 = _main.player.global_position
	var pos := origin + Vector3(1, 0, 0.4).normalized() * 350.0
	var van := ProtoCar3D.create("van", Color(0.5, 0.42, 0.2))
	_main.add_child(van)
	van.global_position = Vector3(pos.x, 1.0, pos.z)
	van.trunk.add("medkit", 2)
	van.trunk.add("jerry_can", 2)
	van.trunk.add("12ga", 16)
	van.trunk.add("power_cell", 1)
	van.trunk.add("canned_food", 4)
	_main.set_map_course("🐫 CARAVAN", Vector3(pos.x, 0, pos.z))
	_main.notify("🐫 A trader CARAVAN is parked up the road — first come, first served")


## The war tax on the pirate dice (main reads this in _update_pirates).
func pirate_mult(state: String) -> float:
	return 3.0 if (war_state != "" and state == war_state) else 1.0
