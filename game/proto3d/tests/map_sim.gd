## Headless proof for the DIVIDED STATES USA macro map (Stage 5 v2, 60× scale law).
## Verifies the data (grid/states/roads/towns), the geography anchors (Vegas is
## in NEVADA, Miami in FLORIDA...), water as a surface, interstates materializing
## as drivable asphalt under streaming — and then DRIVES a real car (inputs only)
## across a biome border while chunks stream and a state line announces itself.
## Run: godot --headless --path game res://proto3d/tests/map_sim.tscn
extends Node3D

enum Phase { DATA, ANCHORS, WATER, ROADS, DRIVE_PREP, DRIVE, DONE }

var usmap: ProtoUSMap
var stream: ProtoWorldStream
var car: ProtoCar3D
var phase: Phase = Phase.DATA
var t: float = 0.0
var phase_t: float = 0.0
var passed: int = 0
var failed: int = 0

var notices: Array[String] = []
var drive_start_biome: String = ""
var drive_biomes: Dictionary = {}
var drive_target: String = ""
var drive_pos: Vector3
var drive_prepped: bool = false ## _step-style single-fire (time windows fire ~6 frames)


func notify(text: String) -> void:
	notices.append(text)


func _check(check_name: String, ok: bool) -> void:
	if ok:
		passed += 1
		print("SIM: PASS - %s" % check_name)
	else:
		failed += 1
		print("SIM: FAIL - %s" % check_name)


func _town(id: String) -> Dictionary:
	for tw in usmap.towns:
		if tw["id"] == id:
			return tw
	return {}


func _town_pos3(id: String) -> Vector3:
	var tw := _town(id)
	var p: Vector2 = tw["pos"]
	return Vector3(p.x, 0, p.y)


func _ready() -> void:
	print("SIM: start (DIVIDED STATES USA macro map)")
	usmap = ProtoUSMap.get_default()
	ProtoWorldBuilder.usmap = usmap
	ProtoWorldBuilder.extra_road_rects.clear()
	stream = ProtoWorldStream.new()
	add_child(stream)
	stream.setup([])


func _physics_process(delta: float) -> void:
	t += delta
	phase_t += delta
	match phase:
		Phase.DATA:
			_check("usmap loads (res://data/usmap.json)", usmap.ok)
			_check("grid is 150x85 of 500 m cells (75x42.5 km — the 60x law)",
				usmap.w == 150 and usmap.h == 85 and usmap.cell_m == 500.0)
			var rows_ok := true
			for row in usmap.grid:
				if row.length() != usmap.w:
					rows_ok = false
			var srows_ok := true
			for row in usmap.states_grid:
				if row.length() != usmap.w:
					srows_ok = false
			_check("every biome row + state row is full width", rows_ok and srows_ok and usmap.states_grid.size() == usmap.h)
			_check("the interstate network exists (%d roads, want >=10)" % usmap.roads.size(), usmap.roads.size() >= 10)
			_check("towns across the country (%d, want >=30)" % usmap.towns.size(), usmap.towns.size() >= 30)
			_check("state legend covers 48 states (%d)" % usmap.state_legend.size(), usmap.state_legend.size() == 48)
			# THE GPS MAP UI (state zoom + pixel markers), wired 2026-07-09.
			stream.last_state = "COLORADO"
			var sb := stream._state_bounds()
			var wb := usmap.world_bounds()
			_check("state zoom is a real sub-rect of the country", sb.size.x > 0.0 and sb.size.x < wb.size.x and sb.size.y < wb.size.y)
			_check("map markers load (pin/home/drone/arrow)",
				stream._marker("pin") is Texture2D and stream._marker("home") is Texture2D \
				and stream._marker("drone") is Texture2D and stream._marker("arrow") is Texture2D)
			for _mi in 4:
				stream.toggle_map()
			_check("M cycles off->local->state->country->off (4 modes)", stream._map_mode == 0)
			# GPS INTERACTIVITY (owner ask 2026-07-10): zoom clamps, pan clamps, DSA titles,
			# and the handheld's own buttons drive the map.
			stream.toggle_map() # local
			stream.toggle_map() # state
			_check("state title reads like a GPS (%s)" % stream.atlas_title(), stream.atlas_title() == "DSA — COLORADO")
			stream.zoom_at(Vector2(100, 100), 100.0)
			_check("zoom clamps at x8", is_equal_approx(stream._atlas_zoom, 8.0))
			var pan_before: float = stream._atlas_pan.x
			stream.pan_step(Vector2(1, 0))
			_check("d-pad pan moves the zoomed view east (%.0f -> %.0f)" % [pan_before, stream._atlas_pan.x],
				stream._atlas_pan.x > pan_before)
			stream.zoom_at(Vector2(100, 100), 0.0001)
			_check("zoom out clamps at x1 and re-centers (pan -> 0)",
				is_equal_approx(stream._atlas_zoom, 1.0) and stream._atlas_pan == Vector2.ZERO)
			stream._on_gps_button("menu") # state -> country
			_check("MENU button cycles to the country view", stream._map_mode == 3)
			_check("country title is just DSA", stream.atlas_title() == "DSA")
			stream._on_gps_button("power")
			_check("POWER button shuts the set", stream._map_mode == 0 and not stream.map_open())
			# DEVICE SKINS (owner ask 2026-07-10): the 9:16 PHONE frames the same map.
			_check("phone skin art exists (assets/ui/device/phone.png)",
				ResourceLoader.exists("res://assets/ui/device/phone.png"))
			stream.toggle_map() # local, on the brick
			stream._swap_device_skin()
			_check("swap chip flips to the PHONE mid-session", stream.device_skin == "phone")
			_check("the map survives the swap on the same view (local)",
				stream.map_open() and stream._map_mode == 1)
			stream._swap_device_skin()
			_check("and flips back to the brick", stream.device_skin == "gps" and stream.map_open())
			stream._on_gps_button("power")
			_next(Phase.ANCHORS)
		Phase.ANCHORS:
			var meridian := Vector3(110, 0, -325)
			_check("Meridian (the authored town) sits in VIRGINIA", usmap.state_at(meridian) == "VIRGINIA")
			var mb := usmap.biome_at(meridian)
			_check("Meridian's ground is land, not water (%s)" % mb, mb != "water" and mb != "ocean")
			for pair in [["vegas", "NEVADA"], ["miami", "FLORIDA"], ["seattle", "WASHINGTON"],
					["denver", "COLORADO"], ["dallas", "TEXAS"], ["chicago", "ILLINOIS"]]:
				var pos := _town_pos3(pair[0])
				_check("%s is in %s (got %s)" % [pair[0], pair[1], usmap.state_at(pos)], usmap.state_at(pos) == pair[1])
			var vegas_biome := usmap.biome_at(_town_pos3("vegas"))
			_check("Vegas rises from urban/desert (got %s)" % vegas_biome, vegas_biome in ["urban", "desert", "scrub"])
			_check("far off the coast is ocean", usmap.biome_at(Vector3(-90000, 0, 0)) == "ocean")
			_next(Phase.WATER)
		Phase.WATER:
			# Find a real water cell and prove the whole pipeline: grid -> world ->
			# biome_at -> surface_at ("water") — and that a car BOGS on it.
			var wcell := Vector2i(-1, -1)
			for cz in range(usmap.h):
				for cx in range(usmap.w):
					if usmap.grid[cz][cx] == "w":
						wcell = Vector2i(cx, cz)
						break
				if wcell.x >= 0:
					break
			_check("the map has inland water (lakes/rivers)", wcell.x >= 0)
			if wcell.x >= 0:
				var wc := usmap.cell_center(wcell)
				var wpos := Vector3(wc.x, 0, wc.y)
				_check("biome_at over that cell says water", usmap.biome_at(wpos) == "water")
				_check("surface_at says water (the car will bog)", ProtoWorldBuilder.surface_at(wpos) == "water")
				var probe := ProtoCar3D.create("scavenger", Color(0.5, 0.3, 0.2))
				probe.surface_override = "water"
				var wet_drive := probe.offroad_factor()
				probe.surface_override = "road"
				var dry_drive := probe.offroad_factor()
				probe.free()
				_check("water drive factor is a BOG (%.2f vs road %.2f)" % [wet_drive, dry_drive], wet_drive < dry_drive * 0.5)
			_next(Phase.ROADS)
		Phase.ROADS:
			# Stand on I-70 mid-country: streaming must materialize asphalt there.
			var i70: Dictionary = {}
			for r in usmap.roads:
				if r["id"] == "I-70":
					i70 = r
			_check("I-70 exists in the network", not i70.is_empty())
			var pts: PackedVector2Array = i70["pts"]
			var mid: Vector2 = (pts[2] + pts[3]) * 0.5 # Kansas stretch
			var mid3 := Vector3(mid.x, 0, mid.y)
			stream.update_stream(mid3, self)
			_check("streaming loaded a ring of chunks (%d)" % stream.loaded.size(), stream.loaded.size() >= 40)
			_check("I-70 materialized as ROAD surface under the wheels", ProtoWorldBuilder.surface_at(mid3) == "road")
			_check("HUD would name the road (road_near hits I-70)", usmap.road_near(mid3, 20.0).get("id", "") == "I-70")
			var st := usmap.state_at(mid3)
			_check("mid-I-70 is deep flyover country (got %s)" % st, st in ["KANSAS", "COLORADO", "MISSOURI"])
			_next(Phase.DRIVE_PREP)
		Phase.DRIVE_PREP:
			if not drive_prepped:
				drive_prepped = true
				# Find a farm→forest border along +X somewhere mid-country, put a
				# real car on real ground, and DRIVE across it (inputs only).
				drive_pos = Vector3.ZERO
				for cz in range(20, usmap.h - 20):
					for cx in range(20, usmap.w - 20):
						if usmap.grid[cz][cx] == "a" and usmap.grid[cz][cx + 1] == "F":
							var cc := usmap.cell_center(Vector2i(cx, cz))
							drive_pos = Vector3(cc.x, 0, cc.y)
							break
					if drive_pos != Vector3.ZERO:
						break
				_check("found a farmland→forest border to drive", drive_pos != Vector3.ZERO)
				var ground := StaticBody3D.new()
				var shape := CollisionShape3D.new()
				var box := BoxShape3D.new()
				box.size = Vector3(4000, 1, 4000)
				shape.shape = box
				shape.position.y = -0.5
				ground.add_child(shape)
				ground.position = drive_pos
				add_child(ground)
				car = ProtoCar3D.create("scavenger", Color(0.6, 0.2, 0.1))
				car.position = drive_pos + Vector3(0, 1.2, 0)
				car.rotation.y = -PI / 2.0 # -Z forward → face +X (east)
				car.use_player_input = false
				car.is_active = true
				add_child(car)
				drive_start_biome = usmap.biome_at(car.global_position)
				drive_target = "forest"
				stream.last_state = "" # fresh ear for the welcome sign
			if phase_t > 0.4:
				_next(Phase.DRIVE)
		Phase.DRIVE:
			car.input_throttle = 1.0
			stream.update_stream(car.global_position, self)
			drive_biomes[usmap.biome_at(car.global_position)] = true
			if usmap.biome_at(car.global_position) == drive_target or phase_t > 40.0:
				car.input_throttle = 0.0
				_check("drove from %s into %s on real inputs (saw: %s)" % [drive_start_biome, drive_target, ", ".join(drive_biomes.keys())],
					drive_biomes.has(drive_target))
				_check("chunks streamed around the drive (%d loaded)" % stream.loaded.size(), stream.loaded.size() >= 40)
				var tree_chunks := get_tree().get_nodes_in_group("biome_trees").size()
				_check("forest chunks grew TREES (%d tree stands)" % tree_chunks, tree_chunks > 0)
				var crop_chunks := get_tree().get_nodes_in_group("biome_crops").size()
				_check("farmland chunks grew CROP ROWS (%d fields)" % crop_chunks, crop_chunks > 0)
				# State lines announce themselves: stand in TEXAS, then COLORADO.
				stream.update_stream(_town_pos3("dallas"), self)
				notices.clear()
				stream.update_stream(_town_pos3("denver"), self)
				_check("crossing a state line announces it (got: %s)" % ", ".join(notices),
					notices.size() >= 1 and notices[0].contains("WELCOME TO COLORADO"))
				_next(Phase.DONE)
		Phase.DONE:
			_report()

	if t > 90.0:
		print("SIM: TIMEOUT in phase %s" % Phase.keys()[phase])
		_report()


func _next(p: Phase) -> void:
	print("SIM: phase %s -> %s at t=%.1f" % [Phase.keys()[phase], Phase.keys()[p], t])
	phase = p
	phase_t = 0.0


func _report() -> void:
	print("SIM RESULTS: %d passed, %d failed" % [passed, failed])
	print("SIM: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)
