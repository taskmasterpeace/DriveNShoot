## PUBLIC SCREENS (docs/cinema.md Phase 5): a TV bolted to a bar wall, running
## a LOOP nobody chose — trailers, clips, propaganda — picked by a CHANNEL ROW
## (data/media_channels.json: region + faction + allowed categories). A world
## event's tv bulletin (with a clip_id) PREEMPTS the loop: the world's news cuts
## into the world's screens. No interaction; it plays because somebody powers it.
class_name ProtoPublicScreen
extends Node3D

static var CHANNELS: Array = [
	# The floor: one free-counties feed that runs trailers + clips anywhere.
	{"id": "open_air", "state": "", "faction": "", "categories": ["trailers", "clips"]},
]
static var _channels_folded: bool = false

var channel: Dictionary = {}
var now_showing: String = ""
var preempted_by: String = "" ## the bulletin id that cut in ("" = the loop)
var _main: Node = null
var _video: VideoStreamPlayer
var _viewport: SubViewport
var _loop_idx: int = 0
var _recheck: float = 0.0


static func ensure_channels() -> void:
	if _channels_folded:
		return
	_channels_folded = true
	var path := "res://data/media_channels.json"
	if not FileAccess.file_exists(path):
		return
	var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string(path))
	if parsed is Dictionary:
		for row in (parsed as Dictionary).get("channels", []):
			if row is Dictionary and String((row as Dictionary).get("id", "")) != "":
				var have := false
				for c in CHANNELS:
					if String(c["id"]) == String(row["id"]):
						have = true
				if not have:
					CHANNELS.append((row as Dictionary).duplicate(true)) # rows only ADD


static func create(main: Node) -> ProtoPublicScreen:
	ensure_channels()
	var s := ProtoPublicScreen.new()
	s._main = main
	# A wall set on a pole — small, glowing, ignorable until it isn't.
	var pole := MeshInstance3D.new()
	var pm := BoxMesh.new()
	pm.size = Vector3(0.18, 2.4, 0.18)
	pole.mesh = pm
	pole.material_override = ProtoWorldBuilder.material(Color(0.25, 0.23, 0.2), 0.9)
	pole.position.y = 1.2
	s.add_child(pole)
	var frame := MeshInstance3D.new()
	var fm := BoxMesh.new()
	fm.size = Vector3(1.6, 1.0, 0.14)
	frame.mesh = fm
	frame.material_override = ProtoWorldBuilder.material(Color(0.1, 0.1, 0.09), 0.85)
	frame.position.y = 2.5
	s.add_child(frame)
	s._viewport = SubViewport.new()
	s._viewport.size = Vector2i(256, 144)
	s._viewport.render_target_update_mode = SubViewport.UPDATE_ALWAYS
	s.add_child(s._viewport)
	s._video = VideoStreamPlayer.new()
	s._video.expand = true
	s._video.size = Vector2(256, 144)
	# AMBIENT = VISUAL ONLY. A VideoStreamPlayer's audio is NON-positional, so an
	# always-on wall TV would blare across the whole compressed map (the "emergency
	# tone" bug — the test reel is a 440 Hz sine). Muted: you SEE the screen glow,
	# you don't hear it map-wide. (Audible bar TVs later = positional-audio work.)
	s._video.volume_db = -80.0
	s._viewport.add_child(s._video)
	s._video.finished.connect(s._next)
	var screen := MeshInstance3D.new()
	var qm := QuadMesh.new()
	qm.size = Vector2(1.5, 0.9)
	screen.mesh = qm
	var mat := StandardMaterial3D.new()
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	mat.albedo_color = Color(0.04, 0.04, 0.04)
	mat.albedo_texture = s._viewport.get_texture()
	screen.material_override = mat
	screen.position = Vector3(0, 2.5, 0.09)
	s.add_child(screen)
	return s


## Pick MY channel: the most specific row that matches where I stand and who
## runs this state (faction rows outrank state rows outrank the open feed).
func tune() -> void:
	var my_state := ""
	var my_faction := ""
	if _main != null and "stream" in _main and _main.stream != null and _main.stream.usmap != null:
		my_state = _main.stream.usmap.state_at(global_position)
	if _main != null and "world_state" in _main and _main.world_state != null and my_state != "":
		my_faction = String(_main.world_state.controller_of(my_state))
	var best: Dictionary = {}
	var best_score := -1
	for c in CHANNELS:
		var want_state := String(c.get("state", ""))
		var want_fac := String(c.get("faction", ""))
		if want_state != "" and want_state != my_state:
			continue
		if want_fac != "" and want_fac != my_faction:
			continue
		var score := (2 if want_fac != "" else 0) + (1 if want_state != "" else 0)
		if score > best_score:
			best_score = score
			best = c
	channel = best


## The loop: everything the registry has in my channel's categories, in order.
func _playlist() -> Array:
	var out: Array = []
	if _main == null or not ("media_registry" in _main) or _main.media_registry == null:
		return out
	var reg: ProtoMediaRegistry = _main.media_registry
	for id in reg.order:
		var row: Dictionary = reg.rows[id]
		if (channel.get("categories", []) as Array).has(String(row.get("category", ""))) \
				and reg.installed(String(id)):
			out.append(String(id))
	return out


func power_on() -> void:
	tune()
	_loop_idx = 0
	_next()


func _next() -> void:
	# The world's news CUTS IN: an unheard tv bulletin with a clip rides first.
	if _main != null and "world_state" in _main and _main.world_state != null:
		for b in _main.world_state.broadcast_queue:
			if String(b.get("medium", "")) == "tv" and not bool(b.get("heard", false)) \
					and String(b.get("clip_id", "")) != "" \
					and _main.media_registry.installed(String(b["clip_id"])):
				preempted_by = String(b["id"])
				b["heard"] = true # aired, on a real public screen
				now_showing = String(b["clip_id"])
				_video.stream = _main.media_registry.open_stream(now_showing)
				_video.play()
				return
	preempted_by = ""
	var list := _playlist()
	if list.is_empty():
		now_showing = ""
		return # a dark screen is a sad bar, not a crash
	now_showing = list[_loop_idx % list.size()]
	_loop_idx += 1
	_video.stream = _main.media_registry.open_stream(now_showing)
	if _video.stream != null:
		_video.play()
