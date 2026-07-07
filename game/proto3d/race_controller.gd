## THE RACE CONTROLLER — a generic checkpoint-race engine, extracted from the
## Proving Grounds (track.gd) so the SAME ring logic runs standalone (the
## training track) or IN THE SHARED WORLD (a race board on the road — no scene
## switch, so saves/dogs/co-op stay alive). Feed it a race ROW (checkpoints +
## laps + a pass radius) and a target body; it ticks ordered checkpoints, laps,
## and elapsed time, and persists best times per race+vehicle to user:// (an
## export's res:// tree is READ-ONLY — see the note on track.gd's legacy path).
##
## Deterministic under manual ticks: `tick(delta)` does the whole job, so a
## sim can drive it frame-by-frame with no camera/HUD/input required.
class_name ProtoRaceController
extends Node

signal checkpoint_hit(index: int)
signal lap_done(time: float)
signal race_finished(total_time: float)

const BEST_TIMES := "user://race_times.json"

var race_id: String = ""
var race_name: String = ""
var checkpoints: Array[Vector3] = []
var laps: int = 1
var check_r: float = 12.0
var vehicle_id: String = "scavenger"

var body: Node3D = null ## the target — a ProtoCar3D or any Node3D with global_position

var running: bool = false
var next_cp: int = 1 ## index into checkpoints; 0 is start/finish
var lap_t: float = 0.0
var elapsed: float = 0.0
var laps_done: int = 0
var last_lap_time: float = 0.0
var best_time: float = 0.0 ## best TOTAL race time for this race_id+vehicle, loaded on start()


## race_row: {id, name, checkpoints: Array[Vector3], laps, check_r}. body is
## whatever's being timed — the controller only ever reads its global_position.
static func create(race_row: Dictionary, body_in: Node3D) -> ProtoRaceController:
	var c := ProtoRaceController.new()
	c.race_id = String(race_row.get("id", ""))
	c.race_name = String(race_row.get("name", c.race_id))
	var cps: Array[Vector3] = []
	for p in (race_row.get("checkpoints", []) as Array):
		cps.append(p if p is Vector3 else Vector3.ZERO)
	c.checkpoints = cps
	c.laps = int(race_row.get("laps", 1))
	c.check_r = float(race_row.get("check_r", 12.0))
	c.body = body_in
	return c


## Arms the line: resets counters, loads this race+vehicle's best time from disk.
func start(vehicle_id_in: String = "scavenger") -> void:
	vehicle_id = vehicle_id_in
	running = checkpoints.size() >= 2 and body != null
	next_cp = 1
	lap_t = 0.0
	elapsed = 0.0
	laps_done = 0
	last_lap_time = 0.0
	best_time = _load_best()


func stop() -> void:
	running = false


## Advance the race by one tick. Call every physics frame (or, in a sim, every
## manual step) while running — body-agnostic, reads only global_position.
func tick(delta: float) -> void:
	if not running or body == null or not is_instance_valid(body) or checkpoints.is_empty():
		return
	lap_t += delta
	elapsed += delta
	var target: Vector3 = checkpoints[next_cp % checkpoints.size()]
	var d := (body.global_position * Vector3(1, 0, 1)) - (target * Vector3(1, 0, 1))
	if d.length() < check_r:
		checkpoint_hit.emit(next_cp % checkpoints.size())
		next_cp += 1
		if next_cp > checkpoints.size(): # every gate + back through start = a LAP
			_on_lap_done()


func _on_lap_done() -> void:
	last_lap_time = lap_t
	laps_done += 1
	lap_done.emit(last_lap_time)
	lap_t = 0.0
	next_cp = 1
	if laps_done >= laps:
		running = false
		if best_time <= 0.0 or elapsed < best_time:
			best_time = elapsed
			_save_best(elapsed)
		race_finished.emit(elapsed)


func progress() -> String:
	return "%s  ·  lap %d/%d  ·  cp %d/%d  ·  %.2fs  ·  best %s" % [
		race_name, mini(laps_done + 1, laps), laps, next_cp - 1, checkpoints.size(), elapsed,
		("%.2fs" % best_time) if best_time > 0.0 else "—"]


# --- Best-time persistence: user://, NOT res:// -----------------------------
# track.gd's ring writes to res://data/laptimes.json — that's fine for a dev
# build (the project folder IS writable), but an EXPORTED game's res:// is
# packed read-only. user:// is the one path guaranteed writable in an export;
# every NEW persistence path in the engine (saves, ghosts-to-be) should follow
# this, not the legacy one.

static func _read_all() -> Dictionary:
	var data: Dictionary = {"races": {}}
	if FileAccess.file_exists(BEST_TIMES):
		var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string(BEST_TIMES))
		if parsed is Dictionary:
			data = parsed
	if not data.has("races"):
		data["races"] = {}
	return data


func _load_best() -> float:
	var data := _read_all()
	var races: Dictionary = data["races"]
	if not races.has(race_id):
		return 0.0
	var per_vehicle: Dictionary = races[race_id]
	return float(per_vehicle.get(vehicle_id, 0.0))


func _save_best(total_t: float) -> void:
	var data := _read_all()
	var races: Dictionary = data["races"]
	if not races.has(race_id):
		races[race_id] = {}
	var per_vehicle: Dictionary = races[race_id]
	var prev: float = float(per_vehicle.get(vehicle_id, 0.0))
	if prev <= 0.0 or total_t < prev:
		per_vehicle[vehicle_id] = total_t
	races[race_id] = per_vehicle
	data["races"] = races
	var f := FileAccess.open(BEST_TIMES, FileAccess.WRITE)
	f.store_string(JSON.stringify(data, "  "))
	f.close()
