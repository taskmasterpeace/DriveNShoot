## THE FIRST RUN — the guiding hand a new player gets and a veteran never sees.
##
## The game is deep, but NEW GAME used to drop you on the interstate with a rich
## world and zero direction. This is a SHORT, data-driven objective chain that
## teaches THE CIRCUIT in miniature — drive, pull over, scavenge, carry it home —
## then RETIRES itself and gets out of the way. One line under the circuit pips.
##
## Every beat completes on REAL game state (distance driven, mode==FOOT, the pack
## growing, standing at the safehouse), never a timer — so the sim proves it the
## honest way: by playing. Armed only by begin_new_game(); CONTINUE restores its
## progress from the save so a mid-onboarding player picks up where they left off.
class_name ProtoObjectives
extends Node

signal advanced(index: int, text: String)

## The safehouse door, matching the SAFEHOUSE waypoint in proto3d._ready().
const HOME := Vector3(110, 0, -323) ## keep synced with ProtoMain.SAFEHOUSE (the one door anchor)
const DRIVE_DIST := 40.0   ## meters down the road before "you're driving" clears
const HOME_RADIUS := 16.0  ## how close to the safehouse counts as "home"

## The chain. Each row: id, the line shown, and the kind that drives its check.
const BEATS: Array = [
	{"id": "drive", "text": "▸ DRIVE — hold W. Follow the interstate.", "kind": "drove"},
	{"id": "pull_over", "text": "▸ PULL OVER — press E to step out of the car.", "kind": "on_foot"},
	{"id": "scavenge", "text": "▸ SCAVENGE — grab something. Loot is scrip and survival.", "kind": "looted"},
	{"id": "go_home", "text": "▸ GO HOME — follow the ⌂ arrow back to the safehouse.", "kind": "at_home"},
]

var _main: Node = null
var active: bool = false
var index: int = -1
var _drive_from: Vector3 = Vector3.ZERO
var _loot_baseline: int = 0


static func create(main: Node) -> ProtoObjectives:
	var o := ProtoObjectives.new()
	o._main = main
	o.name = "ProtoObjectives"
	return o


## Called by begin_new_game(): light the first beat.
func arm() -> void:
	active = true
	index = 0
	_enter_beat()


func retire() -> void:
	active = false
	index = BEATS.size()
	if _main.hud != null:
		_main.hud.set_objective("")


# --- Per-beat setup + the tick that watches for completion -----------------------

func _enter_beat() -> void:
	if index < 0 or index >= BEATS.size():
		return
	var beat: Dictionary = BEATS[index]
	# Snapshot whatever a beat measures relative to.
	match String(beat["kind"]):
		"drove":
			_drive_from = _car_pos()
		"looted":
			_loot_baseline = _bp_total()
		"at_home":
			if _main.has_method("point_home_waypoint"):
				_main.point_home_waypoint() # light the ⌂ arrow so there's a marker to follow
	if _main.hud != null:
		_main.hud.set_objective(String(beat["text"]))


var _t: float = 0.0
func tick(delta: float) -> void:
	if not active or index < 0 or index >= BEATS.size():
		return
	_t += delta
	if _t < 0.25: # cheap: check ~4x a second, not every frame
		return
	_t = 0.0
	if _done(String(BEATS[index]["kind"])):
		_advance()


func _done(kind: String) -> bool:
	match kind:
		"drove":
			return _main.mode == _main.Mode.DRIVE and _car_pos().distance_to(_drive_from) > DRIVE_DIST
		"on_foot":
			return _main.mode == _main.Mode.FOOT
		"looted":
			return _bp_total() > _loot_baseline
		"at_home":
			return _main.player != null and _main.player.global_position.distance_to(HOME) < HOME_RADIUS
	return false


func _advance() -> void:
	var finished: Dictionary = BEATS[index]
	index += 1
	advanced.emit(index, "" if index >= BEATS.size() else String(BEATS[index]["text"]))
	if _main.has_method("notify"):
		_main.notify("✓ %s" % _short(String(finished["id"])))
	if _main.audio != null:
		_main.audio.play_ui("blip", -2.0)
	if index >= BEATS.size():
		# The whole arc is done — name THE CIRCUIT and step back forever.
		if _main.has_method("notify"):
			_main.notify("★ THE CIRCUIT: scavenge → upgrade → push → node. It's yours now — go run it.")
		retire()
	else:
		_enter_beat()


func _short(id: String) -> String:
	match id:
		"drive": return "On the road."
		"pull_over": return "Out of the car."
		"scavenge": return "Scavenged."
		"go_home": return "Home."
	return id


# --- Helpers --------------------------------------------------------------------

func _car_pos() -> Vector3:
	if _main.active_car != null and is_instance_valid(_main.active_car):
		return _main.active_car.global_position
	if _main.player != null:
		return _main.player.global_position
	return Vector3.ZERO


func _bp_total() -> int:
	var n := 0
	for id in _main.backpack.slots:
		n += int(_main.backpack.slots[id])
	return n


# --- Save/load (part of the one save file) --------------------------------------

func to_record() -> Dictionary:
	return {
		"active": active,
		"index": index,
		"drive_from": [_drive_from.x, _drive_from.y, _drive_from.z],
		"loot_baseline": _loot_baseline,
	}


func from_record(rec: Dictionary) -> void:
	active = bool(rec.get("active", false))
	index = int(rec.get("index", -1))
	var df: Array = rec.get("drive_from", [0, 0, 0])
	_drive_from = Vector3(df[0], df[1], df[2])
	_loot_baseline = int(rec.get("loot_baseline", 0))
	if _main.hud != null:
		if active and index >= 0 and index < BEATS.size():
			_main.hud.set_objective(String(BEATS[index]["text"]))
		else:
			_main.hud.set_objective("")
