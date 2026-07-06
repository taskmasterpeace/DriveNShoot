## THE GHOST — record a lap, race it back. Samples {x, z, yaw} at a fixed rate
## while you drive; the best lap per vehicle persists to res://data/ghosts/ so
## the TOOLS can see them and any session can race any rig's best line. The ghost
## body is a translucent shell with NO collision — and it doubles as the moving
## target for chase-AI tests (the navigation groundwork).
class_name ProtoTrackGhost
extends Node3D

const DIR := "res://data/ghosts"
const DT := 0.05 ## sample every 50 ms (20 Hz — smooth enough, tiny on disk)

# --- recording ---
var rec_samples: Array = []
var _rec_t: float = 0.0
var recording: bool = false

# --- playback ---
var samples: Array = [] ## [[x, z, yaw], ...]
var meta: Dictionary = {}
var play_t: float = 0.0
var playing: bool = false
var _shell: Node3D = null


static func path_for(vehicle_id: String) -> String:
	return "%s/%s.json" % [DIR, vehicle_id]


static func available() -> Array:
	var out: Array = []
	var d := DirAccess.open(DIR)
	if d:
		for f in d.get_files():
			if f.ends_with(".json"):
				out.append(f.trim_suffix(".json"))
	out.sort()
	return out


# --- RECORD side -------------------------------------------------------------

func start_recording() -> void:
	rec_samples = []
	_rec_t = 0.0
	recording = true


func record(delta: float, body: Node3D) -> void:
	if not recording:
		return
	_rec_t += delta
	if _rec_t >= DT or rec_samples.is_empty():
		_rec_t = 0.0
		rec_samples.append([body.global_position.x, body.global_position.z, body.global_rotation.y])


## Persist the finished lap as this vehicle's ghost (caller decides if it's best).
func save_recording(vehicle_id: String, lap_time: float) -> void:
	recording = false
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(DIR))
	var f := FileAccess.open(path_for(vehicle_id), FileAccess.WRITE)
	f.store_string(JSON.stringify({"vehicle": vehicle_id, "time": lap_time, "dt": DT,
		"samples": rec_samples}))
	f.close()


# --- PLAYBACK side -----------------------------------------------------------

func load_ghost(vehicle_id: String) -> bool:
	var p := path_for(vehicle_id)
	if not FileAccess.file_exists(p):
		return false
	var d: Variant = JSON.parse_string(FileAccess.get_file_as_string(p))
	if not (d is Dictionary) or not (d as Dictionary).has("samples"):
		return false
	meta = d
	samples = d["samples"]
	if _shell == null:
		_shell = _build_shell()
		add_child(_shell)
	return samples.size() > 1


func start_playback() -> void:
	play_t = 0.0
	playing = samples.size() > 1
	if _shell:
		_shell.visible = playing


func advance(delta: float) -> void:
	if not playing or _shell == null:
		return
	play_t += delta
	var dt: float = float(meta.get("dt", DT))
	var idx := int(play_t / dt)
	if idx >= samples.size() - 1:
		playing = false # the ghost finished its lap; it parks at the line
		idx = samples.size() - 2
	var frac := clampf(play_t / dt - float(idx), 0.0, 1.0)
	var a: Array = samples[idx]
	var b: Array = samples[idx + 1]
	_shell.global_position = Vector3(lerpf(a[0], b[0], frac), 0.0, lerpf(a[1], b[1], frac))
	_shell.global_rotation.y = lerp_angle(a[2], b[2], frac)


func ghost_body() -> Node3D:
	return _shell


## A translucent phantom rig — pure visual, zero collision.
func _build_shell() -> Node3D:
	var n := Node3D.new()
	var m := MeshInstance3D.new()
	var bm := BoxMesh.new()
	bm.size = Vector3(2.0, 0.8, 4.4)
	m.mesh = bm
	var mat := StandardMaterial3D.new()
	mat.albedo_color = Color(0.55, 0.85, 0.95, 0.35) # spectral ice — reads GHOST at a glance
	mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	mat.emission_enabled = true
	mat.emission = Color(0.4, 0.7, 0.85)
	mat.emission_energy_multiplier = 0.6
	m.material_override = mat
	m.position.y = 0.6
	n.add_child(m)
	return n
