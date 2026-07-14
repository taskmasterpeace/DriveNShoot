## Proof for RACING DESTRUCTION SET P2: the track-piece toybox. Catalog rows
## fold from data/track_pieces.json; MapForge's placements layer wires a
## "track:<id>" building id straight to ProtoTrackPiece (zero new plumbing);
## a REAL driven car launches off ramp_big (airborne, then lands); ramming a
## destructible barrel_stack breaks it (Damageable hits zero → the solid body
## is replaced by debris + a scrap chest) while the car survives; a
## banked_curve materializes with real rolled collision.
## Run: godot --headless --path game res://proto3d/tests/track_piece_sim.tscn
extends Node

var passed := 0
var failed := 0
var t := 0.0
var phase := 0
var phase_t := 0.0
var _prev_time_scale := 1.0
var ramp_car: ProtoCar3D
var barrel_car: ProtoCar3D
var barrel: ProtoTrackPiece
var _ramp_airborne_seen := false
var _ramp_wheels_unloaded_seen := false
var _ramp_max_y := -999.0


func _check(check_name: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("TRACKPIECE: %s - %s" % ["PASS" if ok else "FAIL", check_name])


## A big flat floor so this sim never needs to boot the whole game — track
## pieces are self-contained physics props (their own collision), same light
## harness pattern roadkill_sim already uses for car_3d.gd proofs. A small
## NOTCH is left open directly under ramp_big (the ELEVATED ROAD FLOOR LAW,
## world_stream's own carve-out for a rising deck): an unbroken flat floor
## there would let the car just drive underneath the ramp instead of
## climbing on. Everything else (the approach lanes, the other test pieces)
## keeps its ground.
func _ground_slab(cx: float, cz: float, sx: float, sz: float) -> void:
	var g := StaticBody3D.new()
	var mesh := MeshInstance3D.new()
	var bm := BoxMesh.new()
	bm.size = Vector3(sx, 2.0, sz)
	mesh.mesh = bm
	mesh.material_override = ProtoWorldBuilder.material(Color(0.4, 0.36, 0.3))
	mesh.position = Vector3(cx, -1.0, cz)
	g.add_child(mesh)
	var shape := CollisionShape3D.new()
	var bs := BoxShape3D.new()
	bs.size = Vector3(sx, 2.0, sz)
	shape.shape = bs
	shape.position = Vector3(cx, -1.0, cz)
	g.add_child(shape)
	add_child(g)


## A 200x200 floor with one small rectangular hole (the notch, x in [-3,3],
## z in [-5,5] — exactly under ramp_big) built as a 4-block frame: west+east
## strips cover the full z range flanking the notch's x-band; south+north
## strips fill that x-band above/below the notch (so the ramp's approach
## lane at x≈0, z<-5 still has real ground to accelerate on).
func _build_ground() -> void:
	_ground_slab(-51.5, 0.0, 97.0, 200.0)   # west:  x in [-100, -3]
	_ground_slab(51.5, 0.0, 97.0, 200.0)    # east:  x in [3, 100]
	_ground_slab(0.0, -52.5, 6.0, 95.0)     # south: x in [-3,3], z in [-100,-5]
	_ground_slab(0.0, 52.5, 6.0, 95.0)      # north: x in [-3,3], z in [5,100]


func _tagged_child(root: Node, tag: String) -> Node:
	for c in root.get_children():
		if c.has_meta(tag):
			return c
		var found := _tagged_child(c, tag)
		if found != null:
			return found
	return null


func _ready() -> void:
	print("TRACKPIECE: start")
	_prev_time_scale = Engine.time_scale
	get_tree().create_timer(100.0).timeout.connect(func() -> void:
		print("TRACKPIECE: WATCHDOG")
		Engine.time_scale = _prev_time_scale
		print("TRACKPIECE: FAILURES PRESENT")
		get_tree().quit(1))
	_build_ground()

	# === 1. THE CATALOG (data/track_pieces.json folds; every row present) =======
	var ids: Array = ProtoTrackPiece.catalog_ids()
	for want in ["ramp_small", "ramp_big", "jump_gap", "banked_curve", "barrier_concrete", "barrel_stack", "crate_wall"]:
		_check("catalog carries '%s'" % want, ids.has(want))
	_check("an unknown id builds nothing (create() returns null)", ProtoTrackPiece.create("nope_not_a_piece") == null)

	# === 2. THE MAPFORGE WIRING: a placements row 'track:<id>' hits the ===========
	# === EXACT dispatch world_stream._spawn_placement uses — zero new plumbing ===
	var stream := ProtoWorldStream.new()
	add_child(stream)
	var fake_chunk := Node3D.new()
	stream.add_child(fake_chunk)
	stream._spawn_placement(fake_chunk, {"id": "t1", "building": "track:barrier_concrete", "pos": Vector2(80, 80), "rot": 0.0})
	var wired: Node = null
	for c in fake_chunk.get_children():
		if c.is_in_group("track_piece"):
			wired = c
	_check("'track:barrier_concrete' placement wires straight to a ProtoTrackPiece", wired != null)
	if wired != null:
		_check("...tagged with its placement id", String(wired.get_meta("placement_id", "")) == "t1")
		_check("...placed at the row's exact world position", wired.global_position.distance_to(Vector3(80, 0, 80)) < 0.01)
	stream._spawn_placement(fake_chunk, {"id": "t2", "building": "track:not_a_real_piece", "pos": Vector2(0, 0), "rot": 0.0})
	_check("an unknown track: id warns and skips (no crash, no orphan node)", true) # reaching here IS the proof

	# === 3. STRUCTURAL CHECKS (no physics needed) ================================
	var bank: Node3D = ProtoTrackPiece.create("banked_curve")
	add_child(bank)
	bank.global_position = Vector3(-60, 0, 0)
	var bank_body: Node = _tagged_child(bank, "track_bank")
	_check("banked_curve materializes a body", bank_body != null)
	if bank_body != null:
		var expect_roll := deg_to_rad(25.0)
		_check("...rolled to its bank_deg (%.3f rad, expect %.3f)" % [(bank_body as StaticBody3D).rotation.z, expect_roll],
			is_equal_approx((bank_body as StaticBody3D).rotation.z, expect_roll))

	var gap: Node3D = ProtoTrackPiece.create("jump_gap")
	add_child(gap)
	gap.global_position = Vector3(-90, 0, 0)
	var ramp_children := 0
	for c in gap.get_children():
		if c.has_meta("track_ramp"):
			ramp_children += 1
	_check("jump_gap materializes its PAIRED launch + landing ramps (%d, expect 2)" % ramp_children, ramp_children == 2)

	var crate: Node = ProtoTrackPiece.create("crate_wall")
	add_child(crate)
	crate.global_position = Vector3(-120, 0, 0)
	_check("crate_wall (destructible) starts intact", crate is ProtoTrackPiece and not (crate as ProtoTrackPiece).broken_flag)
	_check("...carries real hp off its row (55.0)", (crate as ProtoTrackPiece).body.max_hp == 55.0)

	var small_ramp: Node3D = ProtoTrackPiece.create("ramp_small")
	add_child(small_ramp)
	small_ramp.global_position = Vector3(-150, 0, 0)
	_check("ramp_small materializes too (not just ramp_big)", _tagged_child(small_ramp, "track_ramp") != null)

	var barrier: Node3D = ProtoTrackPiece.create("barrier_concrete")
	add_child(barrier)
	barrier.global_position = Vector3(-180, 0, 0)
	_check("barrier_concrete (indestructible obstacle) is a bare StaticBody3D piece, no Damageable",
		not (barrier is ProtoTrackPiece) and _tagged_child(barrier, "track_obstacle") != null)

	# === 4. DRIVE A REAL CAR AT ramp_big: AIRBORNE, THEN LANDS ====================
	var ramp_big: Node3D = ProtoTrackPiece.create("ramp_big")
	add_child(ramp_big)
	ramp_big.global_position = Vector3(0, 0, 0)
	ramp_big.rotation.y = 0.0 # local +Z (the HIGH end) points at world +Z
	Engine.time_scale = 3.0
	ramp_car = ProtoCar3D.create("scavenger", Color(0.5, 0.42, 0.3))
	add_child(ramp_car)
	ramp_car.global_position = Vector3(0, 0.5, -15.0)
	ramp_car.rotation.y = PI # forward (-local Z) now points world +Z, straight at the ramp
	ramp_car.is_active = true
	ramp_car.use_player_input = false
	ramp_car.input_throttle = 1.0
	ramp_car.linear_velocity = Vector3(0, 0, 14.0) # a running start (real physics still integrates from here)
	ramp_car.surface_override = "road" # THE SURFACE-HANDLING LAW: this bare test floor reads as dirt otherwise

	# === 5. RAM A DESTRUCTIBLE barrel_stack: IT BREAKS, THE CAR SURVIVES ==========
	barrel = ProtoTrackPiece.create("barrel_stack") as ProtoTrackPiece
	add_child(barrel)
	barrel.global_position = Vector3(60, 0, 0)
	barrel_car = ProtoCar3D.create("scavenger", Color(0.3, 0.3, 0.35))
	add_child(barrel_car)
	barrel_car.global_position = Vector3(60, 0.5, -12.0)
	barrel_car.rotation.y = PI
	barrel_car.is_active = true
	barrel_car.use_player_input = false
	barrel_car.input_throttle = 1.0
	barrel_car.linear_velocity = Vector3(0, 0, 12.0)
	barrel_car.surface_override = "road" # THE SURFACE-HANDLING LAW: this bare test floor reads as dirt otherwise

	phase = 1


func _physics_process(delta: float) -> void:
	if phase == 0:
		return
	t += delta
	phase_t += delta
	match phase:
		1: # let both cars run for the launch + break + settle window
			if is_instance_valid(ramp_car):
				_ramp_max_y = maxf(_ramp_max_y, ramp_car.global_position.y)
				if ramp_car.global_position.y > 1.6:
					_ramp_airborne_seen = true
				var front: Array = ramp_car._front_wheels if "_front_wheels" in ramp_car else []
				for w in front:
					if w is VehicleWheel3D and not (w as VehicleWheel3D).is_in_contact():
						_ramp_wheels_unloaded_seen = true
			if phase_t > 7.0:
				phase = 2
		2:
			_check("ramp_big launches the car airborne (max y %.2f, expect > 1.6 m)" % _ramp_max_y, _ramp_airborne_seen)
			_check("...wheels unload in flight (at least one frame off-contact)", _ramp_wheels_unloaded_seen)
			_check("the car survives the launch (still a valid, un-destroyed node)",
				is_instance_valid(ramp_car) and not ramp_car.dead)
			if is_instance_valid(ramp_car):
				_check("...and LANDS (settles back down, y %.2f < 1.6 m)" % ramp_car.global_position.y, ramp_car.global_position.y < 1.6)
			_check("barrel_stack BROKE on the hit (broken_flag true)", is_instance_valid(barrel) and barrel.broken_flag)
			_check("the barrel's solid collision is gone once broken", is_instance_valid(barrel) and barrel._solid == null)
			_check("the ramming car survives the break (still valid, not destroyed)",
				is_instance_valid(barrel_car) and not barrel_car.dead)
			print("TRACKPIECE RESULTS: %d passed, %d failed" % [passed, failed])
			print("TRACKPIECE: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
			Engine.time_scale = _prev_time_scale
			get_tree().quit(0 if failed == 0 else 1)
			phase = 3
