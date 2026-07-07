## Proof for THE GATOR + the corridor pass data (MAP_POLISH_PLAN §3.3/§8):
## the ambush law (still until a close pass OR a lingerer), the 0.4s flat lunge
## + bite through the one damage law, the 4s recover crawl (the counterplay
## window), death at the row's hp — plus the plan's data acceptance: 46 new
## exits at the right per-highway counts, no adjacent archetype repeats, Maple
## Hill reachable ONLY by its spur (never an exit), the swamp band painted on
## Alligator Alley, the swamp population row, and the radio breadcrumb.
## Run: godot --headless --path game res://proto3d/tests/gator_sim.tscn
extends Node

var passed := 0
var failed := 0


func _check(check_name: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("GATOR: %s - %s" % ["PASS" if ok else "FAIL", check_name])


class Dummy extends CharacterBody3D:
	var hp: float = 999.0
	var dead: bool = false
	func _init() -> void:
		add_to_group("combatant")
	func take_damage(amount: float) -> void:
		hp -= amount


func _ready() -> void:
	print("GATOR: start")
	get_tree().create_timer(60.0).timeout.connect(func() -> void:
		print("GATOR: WATCHDOG")
		print("GATOR: FAILURES PRESENT")
		get_tree().quit(1))

	# === 1. THE AMBUSH LAW =========================================================
	var g := ProtoGator.create()
	add_child(g)
	g.global_position = Vector3.ZERO
	var mark := Dummy.new()
	add_child(mark)
	# A FAST PASS outside the lunge ring: 1.5s inside the detect ring but moving —
	# under the 2s linger bar, and never within 6m. The gator must not move.
	mark.global_position = Vector3(10.0, 0.5, -8.0)
	for _i in 90: # 1.5s
		mark.global_position.z += 0.18 # ~11 m/s drive-by at 10m lateral
		await get_tree().physics_frame
	_check("a fast pass at 10m does NOT trigger (state still AMBUSH)", g.state == ProtoGator.GState.AMBUSH)
	_check("...and the gator hasn't moved (%.2fm)" % g.global_position.distance_to(Vector3.ZERO),
		g.global_position.distance_to(Vector3.ZERO) < 0.5)

	# === 2. THE LINGERER: stopped at the pump too long ============================
	mark.global_position = Vector3(9.0, 0.5, 0.0)
	var t := 0.0
	var lunged := false
	while t < 3.5:
		await get_tree().physics_frame
		t += get_physics_process_delta_time()
		if g.state == ProtoGator.GState.LUNGE:
			lunged = true
			break
	_check("LINGERING inside the detect ring (~2s) earns the lunge", lunged)
	var hp0 := mark.hp
	for _i in 40: # ride out the 0.4s lunge
		await get_tree().physics_frame
	_check("the lunge BITES through the one damage law (hp %.0f -> %.0f)" % [hp0, mark.hp], mark.hp < hp0)
	_check("...then RECOVERS (the counterplay window)", g.state == ProtoGator.GState.RECOVER)

	# === 3. THE WINDOW: no second lunge until the crawl home ends =================
	mark.global_position = Vector3(3.0, 0.5, 0.0) # deep inside the lunge ring
	for _i in 60: # 1s — still recovering (4s law)
		await get_tree().physics_frame
	_check("inside the recover window it can NOT lunge again", g.state == ProtoGator.GState.RECOVER)
	for _i in 260: # finish the crawl + re-ambush + retrigger
		await get_tree().physics_frame
		if g.state == ProtoGator.GState.LUNGE:
			break
	_check("after the crawl it hunts again", g.state != ProtoGator.GState.RECOVER)

	# === 4. IT DIES BY THE ROW ====================================================
	g.take_damage(100.0)
	_check("40hp of gator dies to a full mag", g.dead)
	mark.queue_free()

	# === 5. THE CORRIDOR PASS DATA (plan §8 acceptance, in-engine) ================
	var m: ProtoUSMap = ProtoUSMap.get_default()
	var by_hwy: Dictionary = {}
	for e in m.exits:
		var h := String(e["highway_id"])
		if not by_hwy.has(h):
			by_hwy[h] = []
		(by_hwy[h] as Array).append(e)
	var want := {"I-95": 9, "I-75": 9, "I-40": 10, "I-10": 9, "I-90": 10}
	var counts_ok := true
	for h2 in want:
		if (by_hwy.get(h2, []) as Array).size() != int(want[h2]):
			counts_ok = false
			print("GATOR:   count mismatch %s: %d (want %d)" % [h2, (by_hwy.get(h2, []) as Array).size(), want[h2]])
	_check("exit counts match the corridor budgets (I-95:9 I-75:9 I-40:10 I-10:9 I-90:10)", counts_ok)
	# No two adjacent exits (by exit_number) share an archetype on any corridor.
	var variety_ok := true
	for h3 in by_hwy:
		var lst: Array = by_hwy[h3]
		lst.sort_custom(func(a, b): return int(a["exit_number"]) < int(b["exit_number"]))
		for i in range(1, lst.size()):
			if String(lst[i]["archetype"]) == String(lst[i - 1]["archetype"]):
				variety_ok = false
				print("GATOR:   adjacent repeat on %s at X%d (%s)" % [h3, int(lst[i]["exit_number"]), lst[i]["archetype"]])
	_check("no two adjacent exits share an archetype (the variety rule)", variety_ok)
	# Maple Hill: a town, NEVER an exit; its spur road exists with 4+ winding points.
	var maple_exit := false
	for e2 in m.exits:
		if String(e2["name"]).containsn("maple"):
			maple_exit = true
	var spur: Dictionary = {}
	for r in m.roads:
		if String(r["id"]) == "SPUR-maple-hill":
			spur = r
	var maple_town := false
	for tn in m.towns:
		if String(tn["name"]) == "MAPLE HILL":
			maple_town = true
	_check("MAPLE HILL is a town on a WINDING SPUR (4+ pts), never an exit node",
		maple_town and not maple_exit and not spur.is_empty()
		and (spur["pts"] as PackedVector2Array).size() >= 4 and String(spur["kind"]) == "exit")
	# Alligator Alley: swamp painted along I-75's final span.
	var i75: Dictionary = {}
	for r2 in m.roads:
		if String(r2["id"]) == "I-75":
			i75 = r2
	var pts: PackedVector2Array = i75["pts"]
	var a_pt: Vector2 = pts[pts.size() - 3]
	var b_pt: Vector2 = pts[pts.size() - 1]
	var swampy := 0
	for k in range(1, 6):
		var q := a_pt.lerp(b_pt, float(k) / 6.0)
		if m.biome_at(Vector3(q.x, 0, q.y)) == "swamp":
			swampy += 1
	_check("ALLIGATOR ALLEY's band is painted swamp (%d/5 samples)" % swampy, swampy >= 3)
	# The 14 communities stand (13 new + Meridian).
	_check("the named communities stand (towns >= 14, got %d)" % m.towns.size(), m.towns.size() >= 14)

	# === 6. THE POPULATION ROW + THE RADIO BREADCRUMB =============================
	var pt: Variant = JSON.parse_string(FileAccess.get_file_as_string("res://data/population_targets.json"))
	_check("population_targets carries the SWAMP row (threat-weighted)",
		pt is Dictionary and (pt as Dictionary).get("targets", {}).has("swamp")
		and int(((pt as Dictionary)["targets"]["swamp"] as Dictionary).get("threat", 0)) >= 3)
	var lore_hit := false
	for line in ProtoRadio.LORE:
		if String(line).containsn("maple hill"):
			lore_hit = true
	_check("the radio LORE carries the Maple Hill breadcrumb", lore_hit)

	print("GATOR RESULTS: %d passed, %d failed" % [passed, failed])
	print("GATOR: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)
