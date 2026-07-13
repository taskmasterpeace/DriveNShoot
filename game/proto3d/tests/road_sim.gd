## Proof for PILLAR 1 road rows (WORLD_PILLARS.md): roads are CHARACTERS. The data
## rows (danger/family/nickname/toll) fold through usmap.road_near, and driving onto
## a named road greets you like a welcome sign (nickname + danger + toll), once.
## Run: godot --headless --path game res://proto3d/tests/road_sim.tscn
extends Node

var passed := 0
var failed := 0
var main: Node3D


func _check(check_name: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("ROAD: %s - %s" % ["PASS" if ok else "FAIL", check_name])


func _ready() -> void:
	print("ROAD: start")
	get_tree().create_timer(60.0).timeout.connect(func() -> void:
		print("ROAD: WATCHDOG")
		print("ROAD: FAILURES PRESENT")
		get_tree().quit(1))
	main = (load("res://proto3d/proto3d.tscn") as PackedScene).instantiate()
	add_child(main)
	for _i in 8:
		await get_tree().process_frame

	var um = main.stream.usmap
	_check("the macro map loaded", um != null and um.ok)

	# --- The DATA ROWS fold through road_near -----------------------------------
	# Find a named road and a world point sitting on it.
	var named: Dictionary = {}
	var on_pt := Vector3.ZERO
	for road in um.roads:
		if String(road.get("nickname", "")) != "":
			named = road
			var pts: PackedVector2Array = road["pts"]
			on_pt = Vector3(pts[0].x, 0.5, pts[0].y)
			break
	_check("a road carries CHARACTER (nickname/danger/family rows)",
		named.get("nickname", "") != "" and named.has("danger") and named.has("family"))

	var hit: Dictionary = um.road_near(on_pt, 60.0)
	_check("road_near surfaces the character fields",
		String(hit.get("nickname", "")) == String(named["nickname"]) and hit.has("danger") and hit.has("toll"))

	# --- The WELCOME-SIGN read: drive onto it → greeted ONCE --------------------
	main.mode = main.Mode.DRIVE
	main.active_car = main.cars[0]
	main.active_car.global_position = on_pt
	main._last_road_id = "" # fresh
	main.hud._toast_q.clear() # toast() is a QUEUE now (LWE §0.9); clear it too or a
	main.hud._toast_label.text = "" # backlog (or the 5-flood cap) eats the welcome toast
	main._update_road_read()
	var greeted: bool = main.hud._toast_label.text.contains(String(named["nickname"]))
	_check("driving onto '%s' greets you (welcome-sign toast)" % named["nickname"], greeted)
	_check("the road latched (no re-greet spam)", main._last_road_id == String(named["id"]))

	main.hud._toast_label.text = ""
	main._update_road_read() # same road, same frame-ish
	_check("staying on the road does NOT re-toast", main.hud._toast_label.text == "")

	# --- danger is a real CONSUMER: it scales the ambush odds -------------------
	# On the named (danger>0) road, ambush_odds() beats a danger-0 baseline.
	var dgr: int = int(named.get("danger", 0))
	main.daynight.hour = 12.0 # daytime baseline (remove night bonus noise)
	main.bounty_hunted = false
	main.active_car.global_position = on_pt
	var odds_named: float = main.ambush_odds()
	# a point far from any road (danger 0)
	main.active_car.global_position = Vector3(90000, 0.5, 90000)
	var odds_empty: float = main.ambush_odds()
	_check("road danger %d makes it deadlier (%.2f > %.2f)" % [dgr, odds_named, odds_empty],
		dgr == 0 or odds_named > odds_empty + 0.001)

	# --- toll is a real CONSUMER: driving onto a toll road bills scrip -----------
	var toll_road: Dictionary = {}
	var toll_pt := Vector3.ZERO
	for road in um.roads:
		if int(road.get("toll", 0)) > 0:
			toll_road = road
			var tp: PackedVector2Array = road["pts"]
			toll_pt = Vector3(tp[0].x, 0.5, tp[0].y)
			break
	if not toll_road.is_empty():
		var toll: int = int(toll_road.get("toll", 0))
		main.backpack.slots.clear()
		main.backpack.add("scrip", 100)
		main.mode = main.Mode.DRIVE
		main.active_car.global_position = toll_pt
		main._last_road_id = "" # fresh entry
		main._update_road_read()
		_check("driving onto '%s' bills the %d-scrip toll (100 → %d)" % [toll_road.get("nickname", "?"), toll, main.backpack.count("scrip")],
			main.backpack.count("scrip") == 100 - toll)
	else:
		_check("(no toll road in the map to bill)", true)

	# --- On foot the read stays quiet -------------------------------------------
	main.mode = main.Mode.FOOT
	main._last_road_id = ""
	main.hud._toast_label.text = ""
	main._update_road_read()
	_check("no road-read on foot (it's a driving read)", main.hud._toast_label.text == "")

	print("ROAD RESULTS: %d passed, %d failed" % [passed, failed])
	print("ROAD: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)
