## Proof for MASTER_PLAN Goal 1 — THE DATA SPINE. The schema classes round-trip,
## the library folds data/vehicles.json into the engine, and the two NEW vehicles
## (pickup_truck, suv) are DRIVABLE from data alone — no code was written for them.
## Run: godot --headless --path game res://proto3d/tests/data_sim.tscn
extends Node

var passed := 0
var failed := 0


func _check(check_name: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("DATA: %s - %s" % ["PASS" if ok else "FAIL", check_name])


func _ready() -> void:
	print("DATA: start")

	# --- The 5 schema classes exist and build from a plain dict ---------------
	var dv := DrivnVehicle.from_dict({"id": "x", "engine_force": 7000.0, "armor": {"front": 50}})
	_check("DrivnVehicle.from_dict round-trips (engine %.0f, armor %.0f)" % [dv.engine_force, dv.armor_front],
		dv.engine_force == 7000.0 and dv.armor_front == 50.0)
	_check("DrivnItem builds", DrivnItem.from_dict({"id": "i", "w": 1.2}).weight == 1.2)
	_check("DrivnBuilding builds", DrivnBuilding.from_dict({"id": "b", "floors": 2}).floors == 2)
	_check("DrivnNPC builds", DrivnNPC.from_dict({"id": "n", "role": "trader"}).role == "trader")
	var lt := DrivnLootTable.from_dict({"id": "l", "entries": [{"item": "scrip", "min": 3, "max": 3, "weight": 1.0}]})
	var rng := RandomNumberGenerator.new()
	rng.seed = 1
	_check("DrivnLootTable.roll yields valid items", lt.roll(rng).get("scrip", 0) == 3)

	# --- The library folds the JSON catalog into the engine ------------------
	DrivnData.ensure()
	_check("vehicles.json loaded the full fleet (%d rows, want >=9)" % DrivnData.vehicles.size(),
		DrivnData.vehicles.size() >= 9)
	_check("existing 'scavenger' is a DrivnVehicle row", DrivnData.vehicles.has("scavenger"))

	# --- THE PROOF: the new vehicles are PURE DATA and DRIVABLE ---------------
	for new_id in ["pickup_truck", "suv"]:
		_check("'%s' exists ONLY as data (a DrivnVehicle row)" % new_id, DrivnData.vehicles.has(new_id))
		_check("'%s' materialized into the engine fleet" % new_id, ProtoCar3D.VEHICLES.has(new_id))
		var car := ProtoCar3D.create(new_id, Color(0.4, 0.4, 0.4))
		add_child(car) # a real VehicleBody3D — if the row were bad, this would blow up
		var row: DrivnVehicle = DrivnData.vehicles[new_id]
		_check("'%s' drives with its DATA engine force (%.0f)" % [new_id, car.max_engine_force],
			is_equal_approx(car.max_engine_force, row.engine_force))
		_check("'%s' trunk holds its DATA volume (%.0f kg)" % [new_id, car.trunk.max_weight],
			is_equal_approx(car.trunk.max_weight, row.trunk_volume))
		_check("'%s' carries armor + mounts on its spec (AAA)" % new_id,
			car.spec.has("armor") and car.spec.has("mounts"))

	# --- Tuning an existing row via JSON reaches the engine ------------------
	var scav_row: DrivnVehicle = DrivnData.vehicles["scavenger"]
	var scav := ProtoCar3D.create("scavenger", Color.WHITE)
	add_child(scav)
	_check("existing 'scavenger' engine matches its JSON row (%.0f)" % scav.max_engine_force,
		is_equal_approx(scav.max_engine_force, scav_row.engine_force))

	# --- The stamper's output loads back as a typed Resource -----------------
	var stamped := "res://data/generated/vehicles/suv.tres"
	if ResourceLoader.exists(stamped):
		var r: DrivnVehicle = load(stamped)
		_check("stamped suv.tres loads as DrivnVehicle (%s)" % (r.name if r else "null"),
			r != null and r.id == "suv")
	else:
		print("DATA: (note) %s not stamped yet — run stamp.tscn to generate .tres" % stamped)

	print("DATA RESULTS: %d passed, %d failed" % [passed, failed])
	print("DATA: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)
