## Proof for THE FIRST CHOIR (THE_INFECTED.md I1 part 2): fort_benning is a
## Choir ZONE (the one registry, choir_r 220); THE DIAL BLEEDS inside it (the
## driver's guaranteed read); the wildlife bed DIES inside (the deepest silence
## in the game is a place); the DOG refuses the ring; the congregation spawns
## as a shambler herd; and THE 0.55 CAP LAW holds — corpse-farming away from an
## anchor can NEVER mint total silence (NO-BIRDS stays a PLACE).
## Run: godot --headless --path game res://proto3d/tests/choir_zone_sim.tscn
extends Node

var passed := 0
var failed := 0
var main: Node = null


func _check(check_name: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("CHOIR: %s - %s" % ["PASS" if ok else "FAIL", check_name])


func _finish(prev_scale: float) -> void:
	Engine.time_scale = prev_scale
	print("CHOIR RESULTS: %d passed, %d failed" % [passed, failed])
	print("CHOIR: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)


func _ready() -> void:
	print("CHOIR: start")
	var prev_scale := Engine.time_scale
	Engine.time_scale = 1.0
	get_tree().create_timer(150.0).timeout.connect(func() -> void:
		print("CHOIR: WATCHDOG")
		failed += 1
		_finish(prev_scale))

	main = load("res://proto3d/proto3d.tscn").instantiate()
	add_child(main)
	for i in range(40):
		await get_tree().physics_frame

	var benning := Vector3(-8200, 0, 7300)

	# --- 1) THE REGISTRY: one truth, benning in it --------------------------------
	var anchors: Array = ProtoCarousel.choir_anchors()
	var has_benning := false
	for a in anchors:
		if String(a["id"]) == "fort_benning" and is_equal_approx(float(a["r"]), 220.0):
			has_benning = true
	_check("the registry holds fort_benning at choir_r 220 (%d anchors)" % anchors.size(), has_benning)
	_check("inside the ring IS the zone (180 m out)", ProtoCarousel.choir_zone_at(benning + Vector3(180, 0, 0)))
	_check("outside is NOT (300 m out)", not ProtoCarousel.choir_zone_at(benning + Vector3(300, 0, 0)))

	# --- 2) THE DIAL BLEEDS (the driver's read) ------------------------------------
	main.mode = main.Mode.FOOT # the game boots you AT THE WHEEL — probe the walker
	main.active_car = null
	var pl: Node3D = main.player
	var was := pl.global_position
	pl.global_position = benning + Vector3(100, 0.4, 0) # staged position — the documented exception
	main.radio._cd = 0.0
	main.radio.scan()
	_check("the dial dissolves into the machine language inside the zone",
		String(main.radio.last_signal) == "choir_bleed")
	# --- 3) THE SILENCE: the ambient bed dies inside --------------------------------
	_check("the wildlife bed DIES inside the ring (the deepest silence is a place)",
		String(main._ambient_bed()) == "")
	pl.global_position = was
	main.radio._cd = 0.0
	main.radio.scan()
	_check("outside, the dial and the bed come back",
		String(main.radio.last_signal) != "choir_bleed" and String(main._ambient_bed()) != "")

	# --- 4) THE DOG refuses the ring -------------------------------------------------
	var d := ProtoDog.create(ProtoDog.DogType.SECURITY, "Reed", "Shepherd")
	main.add_child(d)
	d.global_position = benning + Vector3(226, 0.4, 0) # just outside the ring
	d.interact(main) # adopt → heel
	pl.global_position = benning + Vector3(190, 0.4, 0) # the player walks IN
	var balked := false
	for i in range(240):
		await get_tree().physics_frame
		if d.balking:
			balked = true
	_check("the dog BALKS at the ring (stops, growls, will not enter)", balked)
	_check("...and holds OUTSIDE the zone", not ProtoCarousel.choir_zone_at(d.global_position))
	pl.global_position = was
	d.queue_free()

	# --- 5) THE CONGREGATION: the base wakes as a herd -------------------------------
	var benning_gate: Variant = main.carousel.gates.get("fort_benning")
	_check("fort_benning's gate exists", benning_gate != null)
	if benning_gate != null:
		benning_gate._spawn_occupation(main)
		var shamblers := 0
		for o in benning_gate.occupiers:
			if o is ProtoInfected:
				shamblers += 1
		_check("the congregation holds the ground (%d shamblers >= 10)" % shamblers, shamblers >= 10)
		for o2 in benning_gate.occupiers:
			if is_instance_valid(o2):
				(o2 as Node).queue_free()

	# --- 6) THE 0.55 CAP LAW (F-IP): silence is only ever a PLACE --------------------
	var dyn := 0.0
	for i in range(200): # farm corpses + a big herd for 200 game-hours straight
		dyn = ProtoInfected.ip_dyn_tick(dyn, 6.0, 40, 1.0)
	_check("anchorless dyn saturates AT the cap (%.3f == 0.55) — corpse-farming can't mint silence" % dyn,
		is_equal_approx(dyn, 0.55))
	var far_ip: float = ProtoInfected.ip_at(Vector3(50000, 0, 50000), dyn)
	_check("...so anchorless pressure NEVER crosses INFECT_ABSENT 0.6 (ip %.2f)" % far_ip, far_ip < 0.6)
	var near_ip: float = ProtoInfected.ip_at(benning + Vector3(80, 0, 0), dyn)
	_check("...while the SAME rot beside the anchor goes silent (ip %.2f >= 0.6)" % near_ip, near_ip >= 0.6)
	var decayed := dyn
	for i in range(72):
		decayed = ProtoInfected.ip_dyn_tick(decayed, 0.0, 0, 1.0)
	_check("the taint DECAYS over days once the source leaves (%.2f < %.2f)" % [decayed, dyn], decayed < dyn * 0.5)

	_finish(prev_scale)
