## Proof for THE ADDRESS LAW (AMERICAN_ROAD M3, ruling 0.1): exit numbers are
## MILEPOSTS from every highway's south/west origin (one EXIT_MILE_M game-mile),
## tuned so MERIDIAN = I-95 EXIT 9; strictly increasing along each highway's
## arc; ids NEVER change (saves survive); town_id stamps the address book.
## Pure data — no scene boot.
## Run: godot --headless --path game res://proto3d/tests/exit_address_sim.tscn
extends Node

var passed := 0
var failed := 0


func _check(check_name: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("ADDR: %s - %s" % ["PASS" if ok else "FAIL", check_name])


func _arc_at(road: Dictionary, p: Vector2) -> float:
	var pts: Array = road["pts"]
	var best_d := 1e18
	var best_arc := 0.0
	var arc := 0.0
	for i in range(pts.size() - 1):
		var a: Vector2 = pts[i]
		var b: Vector2 = pts[i + 1]
		var l := (b - a).length()
		var t := clampf((p - a).dot(b - a) / maxf(l * l, 0.001), 0.0, 1.0)
		var d := (a + (b - a) * t).distance_to(p)
		if d < best_d:
			best_d = d
			best_arc = arc + t * l
		arc += l
	return best_arc


func _ready() -> void:
	print("ADDR: start")
	get_tree().create_timer(30.0).timeout.connect(func() -> void:
		print("ADDR: WATCHDOG")
		print("ADDR: FAILURES PRESENT")
		get_tree().quit(1))

	var um := ProtoUSMap.get_default()
	_check("usmap loads", um != null and um.ok)

	# --- MERIDIAN = I-95 EXIT 9, id unchanged (the canon) -------------------------
	var mer: Dictionary = {}
	for e in um.exits:
		if String(e["id"]) == "I-95_X1":
			mer = e
	_check("MERIDIAN is I-95 EXIT 9 (the world_builder sign + races.json were canon; the map now agrees)",
		not mer.is_empty() and int(mer["exit_number"]) == 9)
	_check("...and its ID never changed (saves/known_to_player survive)", String(mer.get("id", "")) == "I-95_X1")
	_check("...and it knows its town (town_id 'meridian')", String(mer.get("town_id", "")) == "meridian")

	# --- strictly increasing along every highway's south/west-origin arc ----------
	var ordered_ok := true
	var positive_ok := true
	var by_hwy: Dictionary = {}
	for e in um.exits:
		if int(e["exit_number"]) < 1:
			positive_ok = false
		var h := String(e["highway_id"])
		if not by_hwy.has(h):
			by_hwy[h] = []
		(by_hwy[h] as Array).append(e)
	for h in by_hwy:
		var road: Dictionary = um.road_by_id(String(h))
		if road.is_empty():
			continue
		var pts: Array = road["pts"]
		var p0: Vector2 = pts[0]
		var pn: Vector2 = pts[pts.size() - 1]
		var total := 0.0
		for i in range(pts.size() - 1):
			total += ((pts[i + 1] as Vector2) - (pts[i] as Vector2)).length()
		var origin_at_start: bool = (p0.y > pn.y) if absf(pn.y - p0.y) >= absf(pn.x - p0.x) else (p0.x < pn.x)
		var lst: Array = by_hwy[h]
		lst.sort_custom(func(a, b) -> bool:
			var aa := _arc_at(road, a["pos"] as Vector2)
			var bb := _arc_at(road, b["pos"] as Vector2)
			if not origin_at_start:
				aa = total - aa
				bb = total - bb
			return aa < bb)
		for i in range(lst.size() - 1):
			if int(lst[i]["exit_number"]) >= int(lst[i + 1]["exit_number"]):
				ordered_ok = false
				print("ADDR: ORDER BREAK on %s: %s(%d) !< %s(%d)" % [h,
					lst[i]["id"], lst[i]["exit_number"], lst[i + 1]["id"], lst[i + 1]["exit_number"]])
	_check("every exit_number >= 1", positive_ok)
	_check("exit numbers STRICTLY INCREASE along each highway's origin arc (all 10 highways)", ordered_ok)

	# --- the address book: town-anchored exits carry town_id ----------------------
	var stamped := 0
	for e in um.exits:
		if String(e.get("town_id", "")) != "":
			stamped += 1
	_check("town-anchored exits carry town_id (%d >= 20)" % stamped, stamped >= 20)

	print("ADDR RESULTS: %d passed, %d failed" % [passed, failed])
	print("ADDR: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)
