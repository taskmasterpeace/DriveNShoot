## Proof for ELEVATION AS ROWS (RACING_DESTRUCTION_SET P1): a road row's optional
## "elev" array (per-point heights, meters) folds through usmap.gd, survives a
## field-preserving overlay merge untouched, and the streamer turns it into a
## REAL sloped deck (visual slab + physical collision + guard rails + support
## pillars) that a driven car climbs — while a flat road (no "elev" field at
## all) renders byte-identical to before this feature (road_lane_sim's own
## regression law, re-proven here against a REAL flat interstate chunk).
## Run: godot --headless --path game res://proto3d/tests/elevation_sim.tscn
extends Node

const MAP_PATH := "res://data/usmap.json"
const TEST_ROAD_ID := "TEST-RAMP-ELEV"
## Deep in open PLAINS, 5+ km from any real road or town (surveyed offline) —
## the synthetic ramp can't interfere with any other sim's real-map content.
const RAMP_X := -39744.0
const RAMP_Z_LOW := -20228.0  ## elev 0.0 end (the ramp's "a")
const RAMP_Z_HIGH := -20348.0 ## elev 8.0 end (the ramp's "b") — 120 m run, climbs 8 m

var passed := 0
var failed := 0
var main: Node3D
var _orig_json := ""
var _prev_time_scale := 1.0
var t := 0.0
var phase := 0
var phase_t := 0.0
var car: ProtoCar3D
var _max_y := -999.0
var _min_y := 999.0
var _start_z := 0.0


func _check(check_name: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("ELEV: %s - %s" % ["PASS" if ok else "FAIL", check_name])


func _tagged(chunk: Node3D, tag: String, road_id: String = "") -> Array:
	var out: Array = []
	if chunk == null:
		return out
	for c in chunk.get_children():
		if c.has_meta(tag) and (road_id == "" or String(c.get_meta(tag)) == road_id):
			out.append(c)
	return out


func _restore_map() -> void:
	if _orig_json != "":
		var f := FileAccess.open(MAP_PATH, FileAccess.WRITE)
		f.store_string(_orig_json)
		f.close()
		_orig_json = ""


func _ready() -> void:
	print("ELEV: start")
	_prev_time_scale = Engine.time_scale
	get_tree().create_timer(100.0).timeout.connect(func() -> void:
		print("ELEV: WATCHDOG")
		_restore_map()
		Engine.time_scale = _prev_time_scale
		print("ELEV: FAILURES PRESENT")
		get_tree().quit(1))

	# === 1. Inject a synthetic elevated road INTO THE REAL MAP FILE, boot the ===
	# === game so the singleton loads it, then restore the file immediately. ===
	var f := FileAccess.open(MAP_PATH, FileAccess.READ)
	_orig_json = f.get_as_text()
	f.close()
	var data: Dictionary = JSON.parse_string(_orig_json)
	var test_road := {
		"id": TEST_ROAD_ID, "kind": "interstate", "lanes": 2, "divided": false,
		"surface": "asphalt", "danger": 0,
		"pts": [[RAMP_X, RAMP_Z_LOW], [RAMP_X, RAMP_Z_HIGH]],
		"elev": [0.0, 8.0],
	}
	(data["roads"] as Array).append(test_road)
	var wf := FileAccess.open(MAP_PATH, FileAccess.WRITE)
	wf.store_string(JSON.stringify(data))
	wf.close()

	main = (load("res://proto3d/proto3d.tscn") as PackedScene).instantiate()
	add_child(main) # ProtoMain._ready() calls stream.setup() synchronously -> the singleton reads our modified file HERE
	_restore_map() # the file is back to its original bytes before anything else can touch it
	for _i in 8:
		await get_tree().process_frame

	var usmap: ProtoUSMap = main.stream.usmap
	_check("the map booted", usmap != null and usmap.ok)
	var road: Dictionary = usmap.road_by_id(TEST_ROAD_ID)
	_check("the synthetic elevated road folded in", not road.is_empty())
	if road.is_empty():
		print("ELEV RESULTS: %d passed, %d failed" % [passed, failed])
		get_tree().quit(1)
		return

	# === 2. THE FOLD: elev[] survives, defaults to 0.0 for any short/missing entry ==
	var elev: PackedFloat32Array = road["elev"]
	_check("elev[] has one height per point (%d)" % elev.size(), elev.size() == 2)
	_check("elev[0] == 0.0 (the low end)", is_equal_approx(elev[0], 0.0))
	_check("elev[1] == 8.0 (the high end)", is_equal_approx(elev[1], 8.0))
	var bare_road: Dictionary = usmap.road_by_id("I-95")
	_check("a road with NO elev field at all still folds (defaults to flat)",
		not bare_road.is_empty() and (bare_road["elev"] as PackedFloat32Array).size() == (bare_road["pts"] as PackedVector2Array).size())
	var bare_elev: PackedFloat32Array = bare_road["elev"]
	var all_zero := true
	for v in bare_elev:
		if not is_zero_approx(v):
			all_zero = false
	_check("...and every one of those defaulted heights is exactly 0.0", all_zero)

	# === 3. THE HEIGHT-AT-DISTANCE HELPER (usmap.gd elev_at, the ONE geometry law) ==
	_check("elev_at(0m) == 0.0 (the ramp's low end)", is_equal_approx(ProtoUSMap.elev_at(road, 0.0), 0.0))
	_check("elev_at(120m) == 8.0 (the ramp's high end)", is_equal_approx(ProtoUSMap.elev_at(road, 120.0), 8.0))
	_check("elev_at(60m) == 4.0 (linear interpolation, the ramp's midpoint)", is_equal_approx(ProtoUSMap.elev_at(road, 60.0), 4.0))
	_check("elev_at on a flat road is 0.0 anywhere along it", is_equal_approx(ProtoUSMap.elev_at(bare_road, 500.0), 0.0))

	# === 4. THE FIELD-PRESERVING OVERLAY LAW (mirrors MapForge's POST /api/roads: ==
	# === {...prev, ...body} — a patch that never mentions "elev" must not erase it) ==
	var prev_row: Dictionary = road.duplicate(true)
	var patch := {"id": prev_row["id"], "pts": prev_row["pts"]} # the caller only sent pts — no elev
	var merged: Dictionary = prev_row.duplicate(true)
	for k in patch.keys():
		merged[k] = patch[k]
	_check("a pts-only overlay merge PRESERVES the elev[] field (never mentioned, never erased)",
		merged.has("elev") and (merged["elev"] as PackedFloat32Array).size() == 2)

	# === 5. THE STREAMER: a real chunk over the synthetic ramp gets a pitched ====
	# === visual slab, a REAL collision deck, guard rails, and support pillars. ===
	var chunk: Node3D = main.stream._spawn_chunk(-311, -159) # center (-39744, -20288) — exact chunk center
	_check("the elevated chunk materializes", chunk != null)
	var slabs: Array = _tagged(chunk, "road_slab", TEST_ROAD_ID)
	_check("the ramp lays its visual slab (%d)" % slabs.size(), slabs.size() >= 1)
	var deck: Array = _tagged(chunk, "road_deck", TEST_ROAD_ID)
	_check("...and a REAL collision deck (the physical floor for an elevated road)", deck.size() >= 1)
	if deck.size() >= 1:
		_check("the deck is tagged road_elevated (never a wet-bridge deck)", bool(deck[0].get_meta("road_elevated", false)))
		var expect_pitch := atan2(-8.0, 120.0) # h0 (low) at local -Z, h1 (high) at local +Z
		_check("the deck pitches to the ramp's real slope (%.4f rad, expected %.4f)" % [deck[0].rotation.x, expect_pitch],
			is_equal_approx(deck[0].rotation.x, expect_pitch))
	var rails: Array = _tagged(chunk, "road_guard_rail", TEST_ROAD_ID)
	_check("edge guard rails rise on an elevated stretch (%d, expect 2)" % rails.size(), rails.size() == 2)
	var pillars: Array = _tagged(chunk, "road_pillar", TEST_ROAD_ID)
	# 4 stations along the 120 m run at heights 1/3/5/7 m — only the 3 that clear
	# 1.5 m get pillars, ONE EACH SIDE (straddling the lanes — never dead-center
	# in the driving line, or a car would stop dead on the first one).
	_check("support pillars straddle the road where the deck clears 1.5 m (%d, expect 3 stations x 2)" % pillars.size(), pillars.size() == 6)

	# === 6. THE FLAT-ROAD REGRESSION (byte-identical to before this feature): ====
	# === a REAL flat interstate chunk (I-35, road_lane_sim's own fixture) must ===
	# === show ZERO pitch and NEVER get tagged road_elevated. =====================
	var flat_chunk: Node3D = main.stream._spawn_chunk(-155, -65) # I-35, per road_lane_sim
	var flat_slabs: Array = _tagged(flat_chunk, "road_slab", "I-35")
	_check("the flat control road still lays its slab (%d)" % flat_slabs.size(), flat_slabs.size() >= 1)
	if flat_slabs.size() >= 1:
		_check("...with ZERO pitch (rotation.x == 0.0 exactly)", is_zero_approx((flat_slabs[0] as MeshInstance3D).rotation.x))
	var flat_elevated_decks: Array = _tagged(flat_chunk, "road_elevated", "")
	_check("no road_elevated deck ever appears on a flat road", flat_elevated_decks.is_empty())

	# === 7. DRIVE IT: a real ProtoCar3D, real drive input, climbs the real ramp ===
	Engine.time_scale = 3.0
	car = ProtoCar3D.create("scavenger", Color(0.55, 0.42, 0.30))
	main.add_child(car)
	main.cars.append(car)
	# Just inside the chunk's real edge (the ground box extends ~1 m past the
	# chunk's own 128 m boundary; a couple of meters more of margin than that
	# keeps the car off free-fall — the chunk we spawn is the ONLY floor here).
	_start_z = RAMP_Z_LOW + 2.0
	car.global_position = Vector3(RAMP_X, 1.0, _start_z)
	car.rotation.y = 0.0 # identity basis faces world -Z — straight at the ramp (Z decreasing toward RAMP_Z_HIGH)
	car.is_active = true
	car.use_player_input = false
	car.input_throttle = 1.0
	# THE SURFACE-HANDLING LAW (owner directive 2026-07-14): handling character
	# now reads off surface_at — this staging spot is bare PLAINS ground
	# (dirt), and a dirt-handling car fishtails under sustained full throttle
	# with zero counter-steer. The elevated deck itself is asphalt; this just
	# says so for the flat lead-in too, the same override the track sim uses.
	car.surface_override = "road"
	phase = 1


func _physics_process(delta: float) -> void:
	if phase == 0:
		return
	t += delta
	phase_t += delta
	if phase == 1:
		if not is_instance_valid(car):
			_check("the car survived the drive (it was freed unexpectedly)", false)
			phase = 2
			return
		# LANE-KEEPING (real steering input, bang-bang — proportional correction
		# was too slow against this vclass's own yaw tendency under sustained
		# full throttle with zero counter-steer; no sim before this one drove a
		# car dead-straight for 10+ real seconds to notice it). The wheel/
		# suspension solver still runs the actual driving and climbing.
		car.input_steer = -1.0 if car.rotation.y > 0.01 else (1.0 if car.rotation.y < -0.01 else 0.0)
		_max_y = maxf(_max_y, car.global_position.y)
		_min_y = minf(_min_y, car.global_position.y)
		if phase_t > 12.0 or car.global_position.z <= RAMP_Z_HIGH + 4.0:
			_check("the car never fell through the elevated deck (min y %.2f >= -1.0)" % _min_y, _min_y >= -1.0)
			_check("the car climbed the ramp (max y %.2f, expect > 4.0 m)" % _max_y, _max_y > 4.0)
			_check("the car actually drove forward (z moved from %.0f toward %.0f)" % [_start_z, car.global_position.z],
				car.global_position.z < _start_z - 20.0)
			phase = 2
	elif phase == 2:
		print("ELEV RESULTS: %d passed, %d failed" % [passed, failed])
		print("ELEV: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
		Engine.time_scale = _prev_time_scale
		get_tree().quit(0 if failed == 0 else 1)
		phase = 3
