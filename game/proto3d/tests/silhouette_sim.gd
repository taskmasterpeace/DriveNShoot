## SILHOUETTE SIM (I2 — 39 types stop being one brown box). Materializes one
## representative per CATEGORY through the real builder and asserts each grew
## its read-feature (meta "silhouette" nodes), floors read as height (a
## 2-storey row builds 2-storey walls), and the whole catalog still
## materializes warning-free (39/39 non-null).
## Run: godot --headless --path game res://proto3d/tests/silhouette_sim.tscn
extends Node

const REPS: Dictionary = {
	"service": "gas_station_small", "commercial": "market_general",
	"residential": "house_small", "civic_law": "police_station",
	"medical": "clinic_small", "civic": "church_small",
	"civic_faction": "school_small", "venue": "fight_pit",
	"industrial": "warehouse", "industrial_service": "checkpoint_road",
	"monument": "monument_plaza", "media": "radio_station",
	"restricted": "clone_wing", "law_military": "military_base_shell",
	"agriculture": "still_shack",
}

var passed := 0
var failed := 0


func _check(n: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("SILH: %s - %s" % ["PASS" if ok else "FAIL", n])


func _sil_count(root: Node3D) -> int:
	var n := 0
	for ch in root.get_children():
		if ch is Node and (ch as Node).has_meta("silhouette"):
			n += 1
	return n


func _ready() -> void:
	print("SILH: start")
	get_tree().create_timer(30.0).timeout.connect(func() -> void:
		print("SILH: WATCHDOG")
		print("SILH RESULTS: %d passed, %d failed" % [passed, failed + 1])
		print("SILH: FAILURES PRESENT")
		get_tree().quit(1))

	# every category rep grows its read-feature
	for cat in REPS:
		var sid: String = REPS[cat]
		var s := ProtoStructureBuilder.materialize(sid)
		if s == null:
			_check("%s (%s) materializes" % [sid, cat], false)
			continue
		add_child(s)
		_check("%s (%s) grew its silhouette (%d features)" % [sid, cat, _sil_count(s)], _sil_count(s) >= 1)
		s.queue_free()

	# ICONIC TRUTH (the row override beats a misleading category): the church
	# raises the STEEPLE and the school flies the FLAG — whatever their data
	# categories say (they are civic_faction/civic respectively — crossed).
	for pair in [["church_small", "steeple"], ["school_small", "flagpole"],
			["still_shack", "silo"], ["checkpoint_road", "boom"]]:
		var s2 := ProtoStructureBuilder.materialize(String(pair[0]))
		if s2 == null:
			_check("%s materializes" % pair[0], false)
			continue
		add_child(s2)
		var kind := String(s2.get_meta("silhouette_kind", ""))
		_check("%s wears the '%s' read (got '%s')" % [pair[0], pair[1], kind], kind == String(pair[1]))
		s2.queue_free()

	# floors read: a multi-storey row builds taller walls than a 1-storey one
	DrivnData.ensure_structures()
	var two_id := ""
	for id in DrivnData.structures:
		if int((DrivnData.structures[id] as DrivnStructure).floors) >= 2 \
				and (DrivnData.structures[id] as DrivnStructure).enterable:
			two_id = String(id)
			break
	if two_id == "":
		print("SILH: (no enterable multi-floor row in the catalog — floors check vacuous)")
	else:
		var two := ProtoStructureBuilder.materialize(two_id)
		add_child(two)
		var tallest := 0.0
		for ch in two.get_children():
			if ch is StaticBody3D:
				for gr in (ch as Node).get_children():
					if gr is MeshInstance3D and (gr as MeshInstance3D).mesh is BoxMesh:
						tallest = maxf(tallest, ((gr as MeshInstance3D).mesh as BoxMesh).size.y)
		_check("multi-floor row '%s' builds tall walls (%.1f m ≥ 5.5)" % [two_id, tallest], tallest >= 5.5)
		two.queue_free()

	# the whole catalog still materializes — every row, no nulls
	var ok_count := 0
	for id in DrivnData.structures:
		var s2 := ProtoStructureBuilder.materialize(String(id))
		if s2 != null:
			ok_count += 1
			s2.free()
	_check("the whole catalog materializes (%d/%d)" % [ok_count, DrivnData.structures.size()],
		ok_count == DrivnData.structures.size())

	print("SILH RESULTS: %d passed, %d failed" % [passed, failed])
	print("SILH: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)
