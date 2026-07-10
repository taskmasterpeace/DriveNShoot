## THE BODY DOLL proof — the K sheet shows wounds ON the figure: real drivn_sheet
## input opens the sheet, the doll carries the character's live part tiers, and
## the vehicle doll's flash-on-worsen juice arms. Widget laws (art loads, anchors
## self-calibrate, absent parts stay quiet) check at widget level.
## Run: godot --headless --path game res://proto3d/tests/bodydoll_sim.tscn
extends Node

var passed: int = 0
var failed: int = 0
var main: Node3D


func _check(name: String, ok: bool) -> void:
	if ok:
		passed += 1
		print("BODYDOLL: PASS - %s" % name)
	else:
		failed += 1
		print("BODYDOLL: FAIL - %s" % name)


func _ready() -> void:
	var dog := Timer.new()
	dog.wait_time = 30.0
	dog.one_shot = true
	dog.timeout.connect(func() -> void:
		print("BODYDOLL: WATCHDOG — force quit")
		_finish())
	add_child(dog)
	dog.start()
	call_deferred("_run")


func _run() -> void:
	# --- Widget laws, no game needed ---
	_check("silhouette art exists (assets/ui/doll/body_doll.png)",
		ResourceLoader.exists(ProtoBodyDoll.TEX_PATH))
	var w := ProtoBodyDoll.new()
	add_child(w)
	await get_tree().process_frame
	_check("art loads + figure bbox self-calibrates (frac w %.2f > 0.2)" % ProtoBodyDoll._fig_frac.size.x,
		ProtoBodyDoll._tex != null and ProtoBodyDoll._fig_frac.size.x > 0.2)
	w.set_tiers({"torso": 2, "l_arm": 1})
	_check("tiers store + read back (torso 2, l_arm 1, head 0)",
		w.tier_of("torso") == 2 and w.tier_of("l_arm") == 1 and w.tier_of("head") == 0)

	# --- Vehicle-doll juice: a part that WORSENS flashes for a beat ---
	var vd := ProtoDamageDoll.new()
	add_child(vd)
	await get_tree().process_frame
	var base: Dictionary = {"doll": ProtoCar3D.doll_spec_for("scavenger"),
		"engine": 0, "tires": 0, "battery": 0, "fuel_tank": 0, "chassis": 0, "on_fire": false}
	vd.update_state(base)
	var worse: Dictionary = base.duplicate()
	worse["engine"] = 2
	vd.update_state(worse)
	_check("engine 0->2 arms the flash pulse", float(vd._flash.get("engine", 0.0)) > 0.0)
	_check("flash puts the doll on the clock (processing)", vd.is_processing())
	# Real-clock wait — headless PROCESS frames spin faster than time, and the
	# 0.7s pulse decays on delta (real seconds), not frame count.
	await get_tree().create_timer(1.0).timeout
	_check("the pulse decays and the clock stops", vd._flash.is_empty() and not vd.is_processing())

	# --- The REAL path: wound the character, press K, read the sheet's doll ---
	main = (load("res://proto3d/proto3d.tscn") as PackedScene).instantiate()
	add_child(main)
	for _i in 10:
		await get_tree().process_frame
	var chr: ProtoCharacter = main.character
	var arm: Damageable = chr.body["l_arm"]
	arm.hp = arm.max_hp * 0.5 # WORN band, staged directly (take_wound drains core hp — the paid-for gotcha)
	var want: int = arm.tier()
	var ev := InputEventAction.new()
	ev.action = "drivn_sheet"
	ev.pressed = true
	Input.parse_input_event(ev)
	var ev2 := InputEventAction.new()
	ev2.action = "drivn_sheet"
	ev2.pressed = false
	Input.parse_input_event(ev2)
	for _i in 6:
		await get_tree().process_frame
	_check("real K press opens the sheet", main.hud.sheet_open())
	_check("the sheet's body doll exists", main.hud._body_doll != null)
	if main.hud._body_doll != null:
		_check("the wounded arm's tier (%d) reads on the doll" % want,
			main.hud._body_doll.tier_of("l_arm") == want and want >= 1)
		_check("whole parts stay quiet (head tier 0)", main.hud._body_doll.tier_of("head") == 0)
	_finish()


func _finish() -> void:
	print("BODYDOLL RESULTS: %d passed, %d failed" % [passed, failed])
	if failed == 0:
		print("ALL CHECKS PASSED")
	get_tree().quit(0 if failed == 0 else 1)
