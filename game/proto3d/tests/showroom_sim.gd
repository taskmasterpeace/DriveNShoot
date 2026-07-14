## THE SHOWROOM's headless coverage guard (the geometry-side proof, not the
## pixels — image capture needs a real GPU swapchain, so the actual render is
## windowed: SHOWROOM.bat / tools/showroom/run.mjs / THE FORGE's SHOWROOM tab).
## This sim proves the two things a sim CAN prove without a screen:
##   1. every current VEHICLE row (ProtoCar3D.VEHICLES, folded w/ vehicles.json)
##      and every current STRUCTURE row (structure_profiles.json) actually
##      BUILDS — nonzero meshes, no script error — so the showroom stage has
##      something real to point a camera at.
##   2. the LAST real render's manifest.json (docs/renders/showroom/) covers
##      the WHOLE catalog: every id present, with the full angle list showroom.gd
##      promises (front34/side/rear34/top/scale [+seated for two-wheel] for
##      vehicles; 34/top for structures). A stale or partial manifest FAILS this
##      half — re-run SHOWROOM.bat — but never blocks part 1 (the build proof
##      stands on its own).
## Run: Godot_console --headless --path game res://proto3d/tests/showroom_sim.tscn
extends Node

const MANIFEST_PATH := "res://../docs/renders/showroom/manifest.json"
const VEHICLE_ANGLES := ["front34", "side", "rear34", "top", "scale"]
const STRUCTURE_ANGLES := ["34", "top"]

var passed: int = 0
var failed: int = 0


func _check(name: String, ok: bool) -> void:
	if ok:
		passed += 1
		print("SHOWROOM_SIM: PASS - %s" % name)
	else:
		failed += 1
		print("SHOWROOM_SIM: FAIL - %s" % name)


func _mesh_count(root: Node) -> int:
	if root == null:
		return 0
	var count := 1 if (root is MeshInstance3D and (root as MeshInstance3D).mesh != null) else 0
	for child in root.get_children():
		count += _mesh_count(child)
	return count


func _ready() -> void:
	print("SHOWROOM_SIM: start")
	get_tree().create_timer(60.0).timeout.connect(func() -> void:
		print("SHOWROOM_SIM: WATCHDOG"); _finish())

	# a floor for the vehicles (VehicleBody3D) to build on top of — build-only,
	# no physics settling needed for a mesh-count check.
	var ground := StaticBody3D.new()
	var shape := CollisionShape3D.new()
	var box := BoxShape3D.new()
	box.size = Vector3(200, 1, 200)
	shape.shape = box
	shape.position.y = -0.5
	ground.add_child(shape)
	add_child(ground)

	_check_vehicle_builds()
	_check_structure_builds()
	_check_manifest_coverage()
	_finish()


# =============================================================================
# PART 1 — every row BUILDS (the geometry-side proof)
# =============================================================================
func _check_vehicle_builds() -> void:
	DrivnData.ensure()
	var ids: Array = ProtoCar3D.VEHICLES.keys()
	_check("the fleet has rows to show (%d)" % ids.size(), ids.size() >= 8)
	for vid_v in ids:
		var vid: String = String(vid_v)
		var car := ProtoCar3D.create(vid, Color(0.4, 0.4, 0.4))
		add_child(car)
		_check("vehicle '%s' builds a real body" % vid, car != null)
		if car != null:
			_check("vehicle '%s' has real geometry (%d meshes)" % [vid, _mesh_count(car)], _mesh_count(car) > 0)
			car.queue_free()


func _check_structure_builds() -> void:
	DrivnData.ensure_structures()
	var ids: Array = DrivnData.structures.keys()
	_check("the structure catalog has rows to show (%d)" % ids.size(), ids.size() >= 15)
	for sid_v in ids:
		var sid: String = String(sid_v)
		var st := ProtoStructureBuilder.materialize(sid)
		_check("structure '%s' builds a real shell" % sid, st != null)
		if st != null:
			add_child(st)
			_check("structure '%s' has real geometry (%d meshes)" % [sid, _mesh_count(st)], _mesh_count(st) > 0)
			st.queue_free()


# =============================================================================
# PART 2 — the LAST render's manifest actually covers the whole catalog
# =============================================================================
func _check_manifest_coverage() -> void:
	var abs_path := ProjectSettings.globalize_path(MANIFEST_PATH)
	if not FileAccess.file_exists(abs_path):
		_check("a render manifest exists at %s (run SHOWROOM.bat first)" % abs_path, false)
		return
	var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string(abs_path))
	if not (parsed is Dictionary) or not (parsed as Dictionary).has("shots"):
		_check("manifest.json parses as {shots:[...]}", false)
		return
	var doc: Dictionary = parsed
	var shots: Array = doc["shots"]
	var by_id: Dictionary = {} # "category/id" -> angles Array
	for s_v in shots:
		var s: Dictionary = s_v
		by_id["%s/%s" % [String(s.get("category", "")), String(s.get("id", ""))]] = s.get("angles", [])

	var v_ids: Array = ProtoCar3D.VEHICLES.keys()
	for vid_v in v_ids:
		var vid: String = String(vid_v)
		var key := "vehicles/%s" % vid
		var want: Array = VEHICLE_ANGLES.duplicate()
		if bool((ProtoCar3D.VEHICLES[vid] as Dictionary).get("two_wheel", false)):
			want.append("seated")
		if not by_id.has(key):
			_check("manifest covers vehicle '%s'" % vid, false)
			continue
		var got: Array = by_id[key]
		var missing: Array = want.filter(func(a): return not got.has(a))
		_check("manifest's '%s' shot list has every promised angle (missing: %s)" % [vid, missing], missing.is_empty())

	var s_ids: Array = DrivnData.structures.keys()
	for sid_v in s_ids:
		var sid: String = String(sid_v)
		var key := "structures/%s" % sid
		if not by_id.has(key):
			_check("manifest covers structure '%s'" % sid, false)
			continue
		var got: Array = by_id[key]
		var missing: Array = STRUCTURE_ANGLES.filter(func(a): return not got.has(a))
		_check("manifest's '%s' shot list has every promised angle (missing: %s)" % [sid, missing], missing.is_empty())


func _finish() -> void:
	print("SHOWROOM_SIM RESULTS: %d passed, %d failed" % [passed, failed])
	if failed == 0:
		print("ALL CHECKS PASSED")
		get_tree().quit(0)
	else:
		print("SHOWROOM_SIM: FAILURES PRESENT")
		get_tree().quit(1)
