## THE RACE BOARD — a post + sign standing at a real road, same interactable
## contract as every chest/board in the engine (drone_dock.gd, homebase.gd).
## v0 UI (full panel later): E CYCLES through data/races.json's rows and
## TOASTS the picked race's name; E AGAIN on the same pick STARTS it. Standing
## alone (no proto3d wiring yet — that's a later pass, see the wiring diff in
## the build report) it spawns its OWN ProtoRaceController on the player's
## active car so the board is testable in isolation; wired into the shared
## world, `race_started` lets the host hook up whatever body should be timed.
class_name ProtoRaceBoard
extends StaticBody3D

signal race_started(race_row: Dictionary)

const RACES_PATH := "res://data/races.json"
const ARM_WINDOW := 6.0 ## seconds the picked race stays "armed" for a confirming E

static var _races_cache: Array = []

var races: Array = []
var pick_idx: int = 0
var _armed: bool = false
var _arm_t: float = 0.0
var _main: Node = null
var controller: ProtoRaceController = null ## only set when THIS board spawned one (standalone test)


static func load_races() -> Array:
	if not _races_cache.is_empty():
		return _races_cache
	if not FileAccess.file_exists(RACES_PATH):
		return []
	var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string(RACES_PATH))
	if parsed is Dictionary and (parsed as Dictionary).has("races"):
		_races_cache = (parsed["races"] as Array).duplicate(true)
	return _races_cache


static func race_by_id(id: String) -> Dictionary:
	for r in load_races():
		if String(r.get("id", "")) == id:
			return _row_with_vectors(r)
	return {}


## races.json stores checkpoints as [x,y,z] arrays (JSON has no Vector3) — this
## folds a race row into the {checkpoints: Array[Vector3]} shape the controller wants.
static func _row_with_vectors(row: Dictionary) -> Dictionary:
	var out := row.duplicate(true)
	var cps: Array = []
	for p in (row.get("checkpoints", []) as Array):
		cps.append(Vector3(float(p[0]), float(p[1]), float(p[2])))
	out["checkpoints"] = cps
	if row.has("start") and (row["start"] as Array).size() == 3:
		var s: Array = row["start"]
		out["start"] = Vector3(float(s[0]), float(s[1]), float(s[2]))
	return out


static func create(main: Node = null) -> ProtoRaceBoard:
	var b := ProtoRaceBoard.new()
	b._main = main
	b.races = load_races()
	b.add_to_group("interactable")
	var post := MeshInstance3D.new()
	var pm := BoxMesh.new()
	pm.size = Vector3(0.18, 2.1, 0.18)
	post.mesh = pm
	post.material_override = ProtoWorldBuilder.material(Color(0.34, 0.26, 0.16), 0.75)
	post.position.y = 1.05
	b.add_child(post)
	# The board — AMBER per the UI design language (racing = a driving decision,
	# same visual grammar as the exit signs, not a purple/generic billboard).
	var board := MeshInstance3D.new()
	var bm := BoxMesh.new()
	bm.size = Vector3(1.6, 1.0, 0.1)
	board.mesh = bm
	board.material_override = ProtoWorldBuilder.material(Color(0.15, 0.13, 0.08), 0.6)
	board.position.y = 2.0
	b.add_child(board)
	var trim := MeshInstance3D.new()
	var tm := BoxMesh.new()
	tm.size = Vector3(1.68, 1.08, 0.04)
	trim.mesh = tm
	trim.material_override = ProtoWorldBuilder.material(Color(0.96, 0.72, 0.2), 0.5, true) # amber edge, emissive — reads at a glance
	trim.position = Vector3(0, 2.0, -0.05)
	b.add_child(trim)
	var label := Label3D.new()
	label.text = "🏁"
	label.font_size = 72
	label.pixel_size = 0.006
	label.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	label.position.y = 2.0
	b.add_child(label)
	var shape := CollisionShape3D.new()
	var bs := BoxShape3D.new()
	bs.size = Vector3(1.6, 2.4, 0.4)
	shape.shape = bs
	shape.position.y = 1.1
	b.add_child(shape)
	return b


func interact_position() -> Vector3:
	return global_position


func interact_prompt(_m: Node) -> String:
	if races.is_empty():
		return "🏁 Race board — no races loaded (data/races.json)"
	var row: Dictionary = races[pick_idx]
	if _armed:
		return "E — START %s" % String(row.get("name", row.get("id", "")))
	return "E — %s (cycle: %d/%d)" % [String(row.get("name", row.get("id", ""))), pick_idx + 1, races.size()]


func interact(main: Node) -> void:
	if races.is_empty():
		_notify(main, "🏁 No races in data/races.json")
		return
	var row: Dictionary = races[pick_idx]
	var race_name := String(row.get("name", row.get("id", "")))
	if _armed:
		_start_race(main, row)
		_armed = false
		return
	# First press on a fresh pick ARMS it (toast + "E again to start"); a
	# second press elsewhere in the cycle just re-picks the next row.
	if not _armed:
		pick_idx = (pick_idx + 1) % races.size()
		row = races[pick_idx]
		race_name = String(row.get("name", row.get("id", "")))
		_armed = true
		_arm_t = ARM_WINDOW
		_notify(main, "🏁 %s — E again to start" % race_name)


func _start_race(main: Node, row: Dictionary) -> void:
	var full_row := _row_with_vectors(row)
	race_started.emit(full_row)
	_notify(main, "🏁 GO — %s" % String(row.get("name", row.get("id", ""))))
	# Standalone (no wiring pass yet): spawn our own controller on whatever car
	# the caller hands us. proto3d.gd's own board-spawn/tick hookup is a LATER
	# pass (see the build report's wiring diff) — this keeps the board directly
	# testable today without touching that contended file.
	if main != null and "active_car" in main and main.active_car != null:
		_spawn_own_controller(full_row, main.active_car)
	elif main != null and "cars" in main and not (main.cars as Array).is_empty():
		_spawn_own_controller(full_row, main.cars[0])


func _spawn_own_controller(row: Dictionary, target_body: Node3D) -> void:
	if controller != null and is_instance_valid(controller):
		controller.queue_free()
	controller = ProtoRaceController.create(row, target_body)
	add_child(controller)
	var vid: String = target_body.vclass if "vclass" in target_body else "scavenger"
	controller.start(vid)


func _notify(main: Node, text: String) -> void:
	if main != null and main.has_method("notify"):
		main.notify(text)
	else:
		print(text)


func _physics_process(delta: float) -> void:
	if _armed:
		_arm_t -= delta
		if _arm_t <= 0.0:
			_armed = false # the window lapsed — next E starts a fresh cycle, not a stale start
	if controller != null and is_instance_valid(controller) and controller.running:
		controller.tick(delta)
