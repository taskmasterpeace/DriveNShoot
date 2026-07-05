## Stage 5 v1: seeded CONTENT streaming (the ground slab was never the cost —
## the WORLD is). Chunks of scatter/wrecks/lurkers/loot spawn in a ring around
## you and unload behind, deterministic from the world seed. Plus: state bands
## with welcome signs, and the world map (M) with fog-of-war from visited chunks.
class_name ProtoWorldStream
extends Node3D

const CHUNK := 128.0
const RING := 3 ## load radius in chunks
const WORLD_SEED := 0xD817D
## The hand-authored zone (highway + Meridian) — streaming skips it.
const AUTHORED := Rect2(-60, -440, 280, 900) ## x, z, w, d

const STATES: Array = ["VIRGINIA", "KENTUCKY", "MISSOURI", "KANSAS", "COLORADO", "UTAH", "NEVADA", "CALIFORNIA"]

var loaded: Dictionary = {} ## "cx,cz" -> Node3D
var visited: Dictionary = {} ## "cx,cz" -> Vector2 (chunk center) — the map's fog-of-war
var last_state: String = ""

var _map_layer: CanvasLayer = null
var _map_panel: PanelContainer = null
var _map_canvas: Control = null
var _map_player: Vector3 = Vector3.ZERO
var _pois: Array = []


func setup(pois: Array) -> void:
	_pois = pois


## Which state band this x sits in (800 m per compressed state, east→west).
func current_state(x: float) -> String:
	var idx := clampi(int(floor((x + 400.0) / 800.0)) + 3, 0, STATES.size() - 1)
	return STATES[idx]


func update_stream(body_pos: Vector3, main: Node) -> void:
	_map_player = body_pos
	var ccx := int(floor(body_pos.x / CHUNK))
	var ccz := int(floor(body_pos.z / CHUNK))
	# Load ring
	for dx in range(-RING, RING + 1):
		for dz in range(-RING, RING + 1):
			var key := "%d,%d" % [ccx + dx, ccz + dz]
			if not loaded.has(key):
				loaded[key] = _spawn_chunk(ccx + dx, ccz + dz)
				visited[key] = Vector2((ccx + dx + 0.5) * CHUNK, (ccz + dz + 0.5) * CHUNK)
	# Unload beyond ring+1
	for key in loaded.keys().duplicate():
		var parts: PackedStringArray = key.split(",")
		if absi(int(parts[0]) - ccx) > RING + 1 or absi(int(parts[1]) - ccz) > RING + 1:
			if loaded[key] != null and is_instance_valid(loaded[key]):
				loaded[key].queue_free()
			loaded.erase(key)
	# State line crossings announce themselves
	var st := current_state(body_pos.x)
	if st != last_state:
		if last_state != "" and main.has_method("notify"):
			main.notify("🪧 WELCOME TO %s" % st)
		last_state = st


func _spawn_chunk(cx: int, cz: int) -> Node3D:
	var center := Vector3((cx + 0.5) * CHUNK, 0, (cz + 0.5) * CHUNK)
	if AUTHORED.has_point(Vector2(center.x, center.z)):
		return null # hand-built land — leave it alone
	var chunk := Node3D.new()
	add_child(chunk)
	var rng := RandomNumberGenerator.new()
	rng.seed = hash("%d:%d:%d" % [WORLD_SEED, cx, cz])
	# GROUND under the whole world: the authored slab ends at ±6 km, but the
	# states run past it — chunks beyond the slab bring their own floor.
	# (Playtest bug: drove to the far states and fell off the earth.)
	if absf(center.x) > 5800.0 or absf(center.z) > 5800.0:
		var g := StaticBody3D.new()
		var gm := MeshInstance3D.new()
		var plane := BoxMesh.new()
		plane.size = Vector3(CHUNK + 2.0, 0.5, CHUNK + 2.0)
		gm.mesh = plane
		gm.material_override = ProtoWorldBuilder.material(Color(0.52, 0.42, 0.28), 1.0)
		gm.position.y = -0.26
		g.add_child(gm)
		var gs := CollisionShape3D.new()
		var gb := BoxShape3D.new()
		gb.size = Vector3(CHUNK + 2.0, 0.5, CHUNK + 2.0)
		gs.shape = gb
		gs.position.y = -0.26
		g.add_child(gs)
		g.position = Vector3(center.x, 0, center.z)
		chunk.add_child(g)
	# Scatter (visual only)
	for i in 26:
		var pos := center + Vector3(rng.randf_range(-60, 60), 0, rng.randf_range(-60, 60))
		var s := rng.randf_range(0.5, 1.6)
		ProtoWorldBuilder.box_visual(chunk, Vector3(0.7, 0.5, 0.7) * s, pos + Vector3(0, 0.25 * s, 0), Color(0.33, 0.36, 0.22) if rng.randf() > 0.4 else Color(0.42, 0.4, 0.37))
	# A wreck sometimes (cover + flavor)
	if rng.randf() < 0.3:
		var wpos := center + Vector3(rng.randf_range(-40, 40), 0.45, rng.randf_range(-40, 40))
		ProtoWorldBuilder.box_body(chunk, Vector3(2.0, 0.9, 4.4), wpos, Color(0.35, 0.22, 0.14), rng.randf_range(0, TAU))
	# A lurker sometimes (the deep waste is not empty)
	if rng.randf() < 0.22:
		var l := ProtoLurker.create()
		chunk.add_child(l)
		l.position = center + Vector3(rng.randf_range(-50, 50), 0.4, rng.randf_range(-50, 50))
	# A supply crate rarely (reason to leave the road)
	if rng.randf() < 0.12:
		var c := ProtoChest.create("Cache", {"scrap": rng.randi_range(1, 3), "9mm": rng.randi_range(4, 10), "bandage": 1 if rng.randf() < 0.5 else 0})
		chunk.add_child(c)
		c.position = center + Vector3(rng.randf_range(-45, 45), 0.05, rng.randf_range(-45, 45))
	return chunk


# --- The world map (M): fog-of-war from where you've actually been -------------

func toggle_map() -> void:
	if _map_layer == null:
		_map_layer = CanvasLayer.new()
		_map_layer.layer = 3
		add_child(_map_layer)
		_map_panel = PanelContainer.new()
		_map_panel.set_anchors_preset(Control.PRESET_CENTER)
		_map_panel.offset_left = -260.0
		_map_panel.offset_right = 260.0
		_map_panel.offset_top = -240.0
		_map_panel.offset_bottom = 240.0
		var style := StyleBoxFlat.new()
		style.bg_color = Color(0.08, 0.075, 0.06, 0.96)
		style.border_color = Color(0.96, 0.72, 0.2)
		style.set_border_width_all(2)
		_map_panel.add_theme_stylebox_override("panel", style)
		_map_layer.add_child(_map_panel)
		_map_canvas = Control.new()
		_map_canvas.custom_minimum_size = Vector2(520, 480)
		_map_canvas.draw.connect(_draw_map)
		_map_panel.add_child(_map_canvas)
		_map_layer.visible = false # fresh layer starts hidden; the toggle below shows it
	_map_layer.visible = not _map_layer.visible
	if _map_layer.visible:
		_map_canvas.queue_redraw()


func map_open() -> bool:
	return _map_layer != null and _map_layer.visible


func _draw_map() -> void:
	var size: Vector2 = _map_canvas.size
	var center := size * 0.5
	var scale := 0.10 # px per meter → ~±2.4 km view
	# Fog-of-war: only chunks you've SEEN are drawn
	for key in visited:
		var w: Vector2 = visited[key]
		var p := center + (w - Vector2(_map_player.x, _map_player.z)) * scale
		if Rect2(Vector2.ZERO, size).has_point(p):
			_map_canvas.draw_rect(Rect2(p - Vector2(5, 5), Vector2(10, 10)), Color(0.35, 0.30, 0.22, 0.55))
	# The interstate (you know the road you're on)
	_map_canvas.draw_line(center + Vector2(0 - _map_player.x, -430 - _map_player.z) * scale,
		center + Vector2(0 - _map_player.x, 430 - _map_player.z) * scale, Color(0.55, 0.5, 0.42), 2.0)
	# POIs
	for poi in _pois:
		var tpos: Vector3 = poi[1].global_position if poi[1] is Node3D else poi[1]
		var p2 := center + (Vector2(tpos.x, tpos.z) - Vector2(_map_player.x, _map_player.z)) * scale
		if Rect2(Vector2.ZERO, size).has_point(p2):
			_map_canvas.draw_circle(p2, 4.0, Color(0.96, 0.72, 0.2))
			_map_canvas.draw_string(ThemeDB.fallback_font, p2 + Vector2(7, 4), poi[0], HORIZONTAL_ALIGNMENT_LEFT, -1, 12, Color(0.92, 0.89, 0.82))
	# You
	_map_canvas.draw_circle(center, 5.0, Color(0.9, 0.25, 0.12))
	_map_canvas.draw_string(ThemeDB.fallback_font, Vector2(12, 20), "DEATHLANDS — %s" % last_state, HORIZONTAL_ALIGNMENT_LEFT, -1, 14, Color(0.96, 0.72, 0.2))