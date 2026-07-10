## FURNISHER LOD SIM (I1 — the footprint furnisher + AR 0.11's LOD law).
## Bare-scene: materialize wave-1 shells through the REAL builder and prove:
##   • a shell streams FURNITURE-FREE (walls+sign+chest only)
##   • furniture WAKES when a player closes to 40 m — from the building-type
##     ROW's furniture_set, door-safe grid, facing the room
##   • it FREES again past 55 m (the town never carries a town of fridges)
##   • determinism: the same shell wakes the SAME pieces twice running
##   • two instances of the same type get DIFFERENT loot uids (position-keyed)
## Run: godot --headless --path game res://proto3d/tests/furnisher_lod_sim.tscn
extends Node

var passed := 0
var failed := 0


func _check(n: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("FURNLOD: %s - %s" % ["PASS" if ok else "FAIL", n])


func _furnisher_of(root: Node3D) -> ProtoFurnisher:
	for ch in root.get_children():
		if ch is ProtoFurnisher:
			return ch
	return null


func _ready() -> void:
	print("FURNLOD: start")
	get_tree().create_timer(40.0).timeout.connect(func() -> void:
		print("FURNLOD: WATCHDOG")
		print("FURNLOD RESULTS: %d passed, %d failed" % [passed, failed + 1])
		print("FURNLOD: FAILURES PRESENT")
		get_tree().quit(1))

	var player := Node3D.new()
	player.add_to_group("player3d")
	add_child(player)
	player.global_position = Vector3(800, 0.4, 800) # far OUTSIDE every wake radius

	var police := ProtoStructureBuilder.materialize("police_station")
	add_child(police)
	police.global_position = Vector3.ZERO
	var f := _furnisher_of(police)
	_check("police_station carries a Furnisher", f != null)
	if f == null:
		_finish()
		return
	await _frames(25)
	_check("far away: shell is FURNITURE-FREE (LOD law)", f.pieces.is_empty() and not f.awake)

	# close to 30 m → WAKE
	player.global_position = Vector3(30, 0.4, 0)
	await _frames(25)
	_check("at 30 m the furniture WAKES (%d pieces)" % f.pieces.size(), f.awake and f.pieces.size() >= 3)
	var first_ids: Array = []
	for p in f.pieces:
		first_ids.append(String(p._uid) if "_uid" in p else "?") # the loot-law key IS the determinism surface (node names are session-unique)
	var inside_footprint := true
	for p in f.pieces:
		var lp: Vector3 = (p as Node3D).position
		if absf(lp.x) > f.half_w or absf(lp.z) > f.half_d:
			inside_footprint = false
	_check("every piece lands INSIDE the footprint", inside_footprint)
	var doorway_clear := true
	for p in f.pieces:
		var lp: Vector3 = (p as Node3D).position
		if lp.z > f.half_d - 1.6 and absf(lp.x) < 1.4:
			doorway_clear = false
	_check("the doorway stays clear", doorway_clear)

	# leave past 55 m → FREE
	player.global_position = Vector3(90, 0.4, 0)
	await _frames(30)
	_check("past 55 m the furniture FREES", not f.awake and f.pieces.is_empty())

	# return → same pieces (determinism)
	player.global_position = Vector3(30, 0.4, 0)
	await _frames(25)
	var second_ids: Array = []
	for p in f.pieces:
		second_ids.append(String(p._uid) if "_uid" in p else "?")
	_check("re-approach wakes the SAME set (%d == %d pieces)" % [second_ids.size(), first_ids.size()],
		second_ids == first_ids)

	# two instances of one type: different loot uids (position-keyed)
	var h1 := ProtoStructureBuilder.materialize("house_small")
	var h2 := ProtoStructureBuilder.materialize("house_small")
	add_child(h1)
	add_child(h2)
	h1.global_position = Vector3(200, 0, 0)
	h2.global_position = Vector3(400, 0, 0)
	var f1 := _furnisher_of(h1)
	var f2 := _furnisher_of(h2)
	_check("house_small shells carry furnishers", f1 != null and f2 != null)
	if f1 != null and f2 != null:
		player.global_position = Vector3(200, 0.4, 6)
		await _frames(25)
		var f1_uids: Array = []
		for p in f1.pieces:
			f1_uids.append(p._uid if "_uid" in p else "")
		player.global_position = Vector3(400, 0.4, 6)
		await _frames(30)
		var f2_uids: Array = []
		for p in f2.pieces:
			f2_uids.append(p._uid if "_uid" in p else "")
		_check("two instances key DIFFERENT loot uids", not f1_uids.is_empty()
			and not f2_uids.is_empty() and f1_uids[0] != f2_uids[0])

	# a walkin row with a building-type row also furnishes (diner)
	var diner := ProtoStructureBuilder.materialize("diner_roadside")
	add_child(diner)
	diner.global_position = Vector3(-200, 0, 0)
	_check("diner carries a furnisher too", _furnisher_of(diner) != null)

	# THE PER-CHUNK CAP (AR 0.11 / audit F13): four shells in ONE 128 m chunk,
	# a player in the middle — at most 3 wake; the 4th holds until a slot frees.
	var pack: Array = []
	for i in 4:
		var s := ProtoStructureBuilder.materialize("house_small")
		add_child(s)
		s.global_position = Vector3(940.0 + 18.0 * i, 0, 1000.0) # chunk 7 spans 896..1024 — all four INSIDE it
		pack.append(s)
	player.global_position = Vector3(967, 0.4, 1000) # within 40 m of all four
	await _frames(30)
	var awake_n := 0
	for s in pack:
		var fr := _furnisher_of(s)
		if fr != null and fr.awake:
			awake_n += 1
	_check("per-chunk cap holds (%d awake ≤ 3 of 4 clustered shells)" % awake_n,
		awake_n >= 2 and awake_n <= 3)

	_finish()


func _frames(n: int) -> void:
	for _i in n:
		await get_tree().physics_frame


func _finish() -> void:
	print("FURNLOD RESULTS: %d passed, %d failed" % [passed, failed])
	print("FURNLOD: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)
