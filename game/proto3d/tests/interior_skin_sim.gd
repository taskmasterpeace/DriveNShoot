## INTERIOR SKIN SIM (I0 — the generalized house laws). Bare-scene: materialize
## wave-1 shells through the REAL builder, walk a "player3d" dummy in and out
## (position staging — the documented exception), and assert the three laws:
##   • walkin_roofed (police_station): roof exists, hides when inside, returns
##     when out; front wall FADES inside; player_inside meta tracks.
##   • walkin (diner_roadside): NO roof (open-top is EARNED honesty), but the
##     skin still detects inside + fades the front.
##   • "none" rows (bar_roadhouse): byte-identical bare shell — no skin at all.
## Run: godot --headless --path game res://proto3d/tests/interior_skin_sim.tscn
extends Node

var passed := 0
var failed := 0


func _check(n: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("SKIN: %s - %s" % ["PASS" if ok else "FAIL", n])


func _skin_of(root: Node3D) -> ProtoInteriorSkin:
	for ch in root.get_children():
		if ch is ProtoInteriorSkin:
			return ch
	return null


func _ready() -> void:
	print("SKIN: start")
	get_tree().create_timer(30.0).timeout.connect(func() -> void:
		print("SKIN: WATCHDOG")
		print("SKIN RESULTS: %d passed, %d failed" % [passed, failed + 1])
		print("SKIN: FAILURES PRESENT")
		get_tree().quit(1))

	# A stand-in player the skin's group scan will find.
	var player := Node3D.new()
	player.add_to_group("player3d")
	add_child(player)
	player.global_position = Vector3(500, 0.4, 500) # far away = OUTSIDE everything

	# --- walkin_roofed: the full three-law skin --------------------------------
	var police := ProtoStructureBuilder.materialize("police_station")
	add_child(police)
	police.global_position = Vector3.ZERO
	var skin := _skin_of(police)
	_check("police_station wears the InteriorSkin", skin != null)
	if skin == null:
		_finish()
		return
	_check("the EARNED roof exists on walkin_roofed", skin.roof != null)
	_check("front wall registered for fade (%d mats)" % skin.front_mats.size(), skin.front_mats.size() >= 2)
	await _frames(4)
	_check("outside: the roof is VISIBLE", skin.roof.visible)
	_check("outside: front wall solid (a=%.2f)" % skin.front_mats[0].albedo_color.a,
		skin.front_mats[0].albedo_color.a > 0.9)

	# step INSIDE (position staging)
	player.global_position = Vector3(0, 0.4, 0)
	await _frames(6)
	_check("inside: the roof HIDES", not skin.roof.visible)
	await _frames(20) # let the fade lerp settle
	_check("inside: front wall fades (a=%.2f < 0.3)" % skin.front_mats[0].albedo_color.a,
		skin.front_mats[0].albedo_color.a < 0.3)
	_check("inside: player_inside meta set", bool(police.get_meta("player_inside", false)))

	# step back OUT
	player.global_position = Vector3(500, 0.4, 500)
	await _frames(24)
	_check("back out: roof RETURNS", skin.roof.visible)
	_check("back out: front wall resolidifies (a=%.2f > 0.8)" % skin.front_mats[0].albedo_color.a,
		skin.front_mats[0].albedo_color.a > 0.8)
	_check("back out: player_inside meta cleared", not bool(police.get_meta("player_inside", true)))
	police.queue_free()

	# --- walkin: open-top honesty — skin without a roof ------------------------
	var diner := ProtoStructureBuilder.materialize("diner_roadside")
	add_child(diner)
	diner.global_position = Vector3(60, 0, 0)
	var dskin := _skin_of(diner)
	_check("diner wears the skin too", dskin != null)
	if dskin != null:
		_check("…but NO roof (open-top is the honest default)", dskin.roof == null)
		player.global_position = Vector3(60, 0.4, 0)
		await _frames(6)
		_check("open-top shell still DETECTS inside", bool(diner.get_meta("player_inside", false)))
		player.global_position = Vector3(500, 0.4, 500)
	diner.queue_free()

	# --- "none" rows: byte-identical bare shells -------------------------------
	var bar := ProtoStructureBuilder.materialize("bar_roadhouse")
	add_child(bar)
	bar.global_position = Vector3(-60, 0, 0)
	_check("a 'none' row builds NO skin (backward compat)", _skin_of(bar) == null)
	bar.queue_free()

	_finish()


func _frames(n: int) -> void:
	for _i in n:
		await get_tree().physics_frame


func _finish() -> void:
	print("SKIN RESULTS: %d passed, %d failed" % [passed, failed])
	print("SKIN: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)
