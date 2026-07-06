## Proof for THE FOUR-LEGGED PUPPET (Rung 3): the quadruped rig + the tail-as-readout.
## Legs trot in diagonal pairs off speed, the head dips to sniff when slow, and the
## TAIL WAGS FAST when happy / TUCKS when scared — the mood made visible. Then the
## real dog: morale() drops when a threat closes in, so the tail actually reports it.
## Run: godot --headless --path game res://proto3d/tests/quad_sim.tscn
extends Node3D

var passed := 0
var failed := 0


func _check(check_name: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("QUAD: %s - %s" % ["PASS" if ok else "FAIL", check_name])


## Sweep the tail's wag over `frames`, returning [range, zero_crossings] so we can
## measure both amplitude and SPEED of the wag deterministically.
func _wag_stats(q: ProtoQuadruped, frames: int, speed: float, morale: float) -> Array:
	var lo := 1.0e9
	var hi := -1.0e9
	var crossings := 0
	var prev := 0.0
	for i in frames:
		q.animate(1.0 / 60.0, speed, morale)
		var y: float = q.tail_pivot.rotation.y
		lo = minf(lo, y)
		hi = maxf(hi, y)
		if i > 8 and signf(y) != signf(prev) and absf(y) > 0.02:
			crossings += 1
		prev = y
	return [hi - lo, crossings]


func _ready() -> void:
	print("QUAD: start")

	var q := ProtoQuadruped.create({})
	add_child(q)
	_check("the rig builds (body/head/tail/4 legs)", q.body != null and q.head != null and q.tail_pivot != null and q.legs.size() == 4)

	# --- Legs TROT in diagonal pairs -----------------------------------------
	for _i in 30:
		q.animate(1.0 / 60.0, 6.0, 0.7)
	var fl: float = q.legs[0].rotation.x
	var fr: float = q.legs[1].rotation.x
	var bl: float = q.legs[2].rotation.x
	var br: float = q.legs[3].rotation.x
	_check("diagonal pairs move together (FL≈BR, FR≈BL)", absf(fl - br) < 0.01 and absf(fr - bl) < 0.01)
	_check("the two pairs are OPPOSITE (a trot, not a hop)", signf(fl) != signf(fr) or absf(fl - fr) > 0.3)

	# --- Head DIPS to sniff when slow ----------------------------------------
	var sniffer := ProtoQuadruped.create({})
	add_child(sniffer)
	for _i in 60:
		sniffer.animate(1.0 / 60.0, 0.2, 0.7) # standing/creeping
	_check("the head DIPS to sniff when slow (neck pitch %.2f, want <-0.05)" % sniffer.neck.rotation.x, sniffer.neck.rotation.x < -0.05)

	# --- THE TAIL IS THE READOUT ---------------------------------------------
	var happy := ProtoQuadruped.create({})
	var scared := ProtoQuadruped.create({})
	add_child(happy)
	add_child(scared)
	var h := _wag_stats(happy, 120, 0.0, 0.95)  # happy dog
	var s := _wag_stats(scared, 120, 0.0, 0.08)  # terrified dog
	_check("a HAPPY dog wags WIDER (happy %.2f > scared %.2f)" % [h[0], s[0]], h[0] > s[0] * 1.8)
	_check("a HAPPY dog wags FASTER (happy %d > scared %d crossings)" % [h[1], s[1]], h[1] > s[1])
	_check("a SCARED dog TUCKS the tail under (pitch %.2f, want <-0.3)" % scared.tail_pivot.rotation.x, scared.tail_pivot.rotation.x < -0.3)
	_check("a HAPPY dog holds the tail UP (pitch %.2f, want >-0.1)" % happy.tail_pivot.rotation.x, happy.tail_pivot.rotation.x > -0.1)

	# --- The REAL dog: morale() reports threats ------------------------------
	var dog := ProtoDog.create(ProtoDog.DogType.COMPANION, "Rex", "Shepherd")
	add_child(dog)
	dog.global_position = Vector3.ZERO
	var owner := Node3D.new()
	add_child(owner)
	owner.global_position = Vector3(1.5, 0, 0) # owner right next to the dog
	dog._owner_ref = owner
	dog.hp = dog.max_hp
	var calm := dog.morale()
	_check("a healthy dog by its owner is HAPPY (morale %.2f, want >0.6)" % calm, calm > 0.6)
	# Drop a threat right beside it.
	var threat := Node3D.new()
	threat.add_to_group("threat")
	add_child(threat)
	threat.global_position = Vector3(2.0, 0, 0)
	var scaredm := dog.morale()
	_check("a close threat SCARES it (morale %.2f < calm %.2f)" % [scaredm, calm], scaredm < calm - 0.2)
	_check("the rig is wearing on the dog (quad built)", dog._quad != null)

	print("QUAD RESULTS: %d passed, %d failed" % [passed, failed])
	print("QUAD: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)
