## Proof for THE TRACTION MATRIX (MUD_AND_MONSTERS T1): the matrix folds from
## rows; THE SLOW-NEVER-STUCK LAW holds across EVERY combo (speed floor 0.25 —
## nothing ever immobilizes, owner ruling); MUD exists only on dirt-class
## ground where water_rot says it actually rained (WEATHER's W-WET); the worked
## rows compute (street crawls in mud, BIG wheels barely notice, treads are
## flat-1.0-but-LOUD); and the car consults the matrix off the asphalt.
## Run: godot --headless --path game res://proto3d/tests/traction_sim.tscn
extends Node

var passed := 0
var failed := 0


func _check(check_name: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("TRAC: %s - %s" % ["PASS" if ok else "FAIL", check_name])


func _ready() -> void:
	print("TRAC: start")
	get_tree().create_timer(30.0).timeout.connect(func() -> void:
		print("TRAC: WATCHDOG")
		print("TRAC: FAILURES PRESENT")
		get_tree().quit(1))

	ProtoTraction.ensure()

	# --- the worked rows (the spec's own examples) --------------------------------
	var sm: Dictionary = ProtoTraction.traction("dirt", "mud", "street")
	_check("street tires in MUD = a miserable fishtailing crawl (0.30/0.45, got %.2f/%.2f)" % [sm["speed"], sm["grip"]],
		is_equal_approx(float(sm["speed"]), 0.3) and is_equal_approx(float(sm["grip"]), 0.45))
	var km: Dictionary = ProtoTraction.traction("dirt", "mud", "knobby")
	_check("knobbies in mud (0.55/0.70)", is_equal_approx(float(km["speed"]), 0.55) and is_equal_approx(float(km["grip"]), 0.7))
	var bm: Dictionary = ProtoTraction.traction("dirt", "mud", "big")
	_check("BIG WHEELS barely notice the mud (0.90/0.85 — THE reason to build the truck)",
		is_equal_approx(float(bm["speed"]), 0.9) and is_equal_approx(float(bm["grip"]), 0.85))
	var fm: Dictionary = ProtoTraction.traction("dirt", "mud", "farm")
	_check("farm lugs work the mud (0.80/0.90)", is_equal_approx(float(fm["speed"]), 0.8) and is_equal_approx(float(fm["grip"]), 0.9))

	# --- treads: flat 1.0 EVERYWHERE, and LOUD -------------------------------------
	var tread_flat := true
	for surf in ["asphalt", "gravel", "dirt", "grass"]:
		for wet in ["dry", "wet", "mud"]:
			var t: Dictionary = ProtoTraction.traction(surf, wet, "tread")
			if not is_equal_approx(float(t["speed"]), 1.0) or not is_equal_approx(float(t["grip"]), 1.0):
				tread_flat = false
	_check("TREADS are flat 1.0 everywhere (nothing slows a dozer but its own top speed)", tread_flat)
	_check("...and LOUD (noise ×%.1f — the county hears a half-track coming)" % ProtoTraction.tire_noise("tread"),
		is_equal_approx(ProtoTraction.tire_noise("tread"), 1.6))
	_check("mud itself is QUIET (surface noise ×0.7 — predators hear you less)",
		is_equal_approx(float(ProtoTraction.noise_mult["mud_surface"]), 0.7))

	# --- THE SLOW-NEVER-STUCK LAW across the WHOLE matrix ---------------------------
	var floor_holds := true
	var combos := 0
	for surf in ProtoTraction.matrix:
		for wet in (ProtoTraction.matrix[surf] as Dictionary):
			for tire in (ProtoTraction.matrix[surf][wet] as Dictionary):
				combos += 1
				if float(ProtoTraction.traction(String(surf), String(wet), String(tire))["speed"]) < 0.25:
					floor_holds = false
					print("TRAC: FLOOR BREACH %s/%s/%s" % [surf, wet, tire])
	_check("THE SLOW-NEVER-STUCK LAW: every combo's speed >= 0.25 (%d combos — nothing EVER bogs)" % combos,
		floor_holds and combos >= 40)
	_check("...even an UNKNOWN combo falls back above the floor",
		float(ProtoTraction.traction("nonsense", "hail", "tracksuit")["speed"]) >= 0.25)

	# --- MUD needs dirt-class ground AND real rain ----------------------------------
	_check("dirt + water_rot 0.6 = MUD (it rained HERE)", ProtoTraction.wetness("dirt", 0.6, 0.0) == "mud")
	_check("dirt + water_rot 0.4 = merely WET", ProtoTraction.wetness("dirt", 0.4, 0.0) == "wet")
	_check("dirt + water_rot 0.2, dry sky = DRY (the desert never muds)", ProtoTraction.wetness("dirt", 0.2, 0.0) == "dry")
	_check("ASPHALT never muds however hard it rains (0.9 rot = wet, not mud)",
		ProtoTraction.wetness("asphalt", 0.9, 1.0) == "wet")
	_check("rain overhead wets even a dry cell (I=0.5 = wet now)", ProtoTraction.wetness("gravel", 0.2, 0.5) == "wet")

	# --- the CAR consults the matrix off the asphalt --------------------------------
	var car: ProtoCar3D = ProtoCar3D.create("scavenger", Color(0.4, 0.4, 0.4))
	add_child(car)
	car.global_position = Vector3(6, 0.35, 388) # the staging spot, no cell rot
	_check("the scavenger derives its tire class from the shipped knobby law ('%s')" % car.tire_class(),
		car.tire_class() == "knobby")
	car.surface_override = "dirt"
	var want: Dictionary = ProtoTraction.traction("dirt", "dry", "knobby")
	_check("off-road grip IS the matrix row (%.2f)" % float(want["grip"]),
		is_equal_approx(car.surface_grip_mult(), float(want["grip"])))
	_check("...and the drivetrain speed floor rides offroad_factor (>= 0.25 x tire drag)",
		car.offroad_factor() >= 0.25 * 0.55)
	car.queue_free()

	print("TRAC RESULTS: %d passed, %d failed" % [passed, failed])
	print("TRAC: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)
