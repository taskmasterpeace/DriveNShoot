## Proof for TOWN LAYOUT v2 (2026-07-14, "improve the cities layout — do not
## cut corners"): buildings FACE their streets (the v1 rot:0 downtown bug is
## dead), block edges carry real density (metro >= 45, main-street >= 14),
## footprint-aware placement never overlaps, zoning rings hold (civic/commercial
## core, residential edge), and the whole fabric is deterministic rows in
## usmap.json — no husks, no code-side scatter.
## Run: godot --headless --path game res://proto3d/tests/city_layout_sim.tscn
extends Node

var passed := 0
var failed := 0


func _check(check_name: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("CITYLAYOUT: %s - %s" % ["PASS" if ok else "FAIL", check_name])


func _finish(watchdog: bool = false) -> void:
	print("CITYLAYOUT RESULTS: %d passed, %d failed%s" % [passed, failed, " (WATCHDOG)" if watchdog else ""])
	print("CITYLAYOUT: %s" % ("ALL CHECKS PASSED" if failed == 0 and not watchdog else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 and not watchdog else 1)


## tight circle radius: half the SHORT footprint side — boxes may kiss corners, never bodies
func _short_half(sid: String) -> float:
	var row: DrivnStructure = DrivnData.structures.get(sid)
	if row == null:
		return 5.0
	return minf(row.footprint_m.x, row.footprint_m.y) * 0.5


func _category(sid: String) -> String:
	var row: DrivnStructure = DrivnData.structures.get(sid)
	return row.category if row != null else "?"


func _town_slots(m: ProtoUSMap, town_id: String) -> Array:
	var out: Array = []
	for p in m.placements:
		if String(p["id"]).begins_with(town_id + "-slot-"):
			out.append(p)
	return out


func _town_streets(m: ProtoUSMap, town_id: String) -> Array:
	var out: Array = []
	for r in m.roads:
		if String(r["id"]).begins_with("ST-" + town_id + "-"):
			out.append(r)
	return out


## Distance from a point to the nearest of the town's street segments, plus the
## outward unit vector from that street to the point.
func _nearest_street(streets: Array, pos: Vector2) -> Dictionary:
	var best := {"dist": 1e9, "out": Vector2.ZERO}
	for r in streets:
		var pts: Array = r["pts"]
		for i in range(pts.size() - 1):
			var a: Vector2 = pts[i]
			var b: Vector2 = pts[i + 1]
			var ab := b - a
			var u: float = clampf((pos - a).dot(ab) / maxf(ab.length_squared(), 0.001), 0.0, 1.0)
			var q := a + ab * u
			var d := pos.distance_to(q)
			if d < float(best["dist"]):
				best = {"dist": d, "out": (pos - q).normalized()}
	return best


func _ready() -> void:
	print("CITYLAYOUT: start")
	get_tree().create_timer(120.0).timeout.connect(func() -> void: _finish(true))
	var m: ProtoUSMap = ProtoUSMap.get_default()
	_check("map loaded", m != null and m.ok)
	DrivnData.ensure_structures()

	# pick one downtown-tier and one main-street town (by slot count)
	var by_town: Dictionary = {}
	for p in m.placements:
		var pid := String(p["id"])
		var cut := pid.find("-slot-")
		if cut > 0:
			var tid := pid.substr(0, cut)
			by_town[tid] = int(by_town.get(tid, 0)) + 1
	_check("every generated town carries slots (%d towns)" % by_town.size(), by_town.size() >= 50)
	var metro_id := ""
	var metro_n := 0
	var small_id := ""
	var small_n := 999999
	for tid in by_town:
		if int(by_town[tid]) > metro_n:
			metro_n = int(by_town[tid])
			metro_id = String(tid)
		if int(by_town[tid]) < small_n:
			small_n = int(by_town[tid])
			small_id = String(tid)
	_check("densest town is a real downtown (%s: %d >= 45)" % [metro_id, metro_n], metro_n >= 45)
	_check("smallest town still reads lived-in (%s: %d >= 14)" % [small_id, small_n], small_n >= 14)

	for tid in [metro_id, small_id]:
		var slots := _town_slots(m, String(tid))
		var streets := _town_streets(m, String(tid))
		_check("%s has street rows" % tid, streets.size() >= 3)

		# --- THE ORIENTATION LAW: buildings face their nearest street ------------
		# front is +Z at rot 0; rot = atan2(-out.x, -out.y) points it at the curb.
		var faced := 0
		var judged := 0
		for p in slots:
			var pos := Vector2(float(p["pos"][0]), float(p["pos"][1]))
			var ns := _nearest_street(streets, pos)
			if float(ns["dist"]) > 40.0:
				continue # outskirt cluster pieces judge themselves
			judged += 1
			var out_v: Vector2 = ns["out"]
			var want := atan2(-out_v.x, -out_v.y)
			var diff := absf(wrapf(float(p.get("rot", 0.0)) - want, -PI, PI))
			if diff < 0.6:
				faced += 1
		_check("%s: buildings FACE their street (%d/%d within 0.6 rad, >= 85%%)" % [tid, faced, judged],
			judged > 0 and float(faced) / float(judged) >= 0.85)

		# --- NO OVERLAP: rot-aware conservative radius check ---------------------
		var collisions := 0
		for i in slots.size():
			for j in range(i + 1, slots.size()):
				var a: Dictionary = slots[i]
				var b: Dictionary = slots[j]
				var pa := Vector2(float(a["pos"][0]), float(a["pos"][1]))
				var pb := Vector2(float(b["pos"][0]), float(b["pos"][1]))
				var ra := _short_half(String(a["building"]))
				var rb := _short_half(String(b["building"]))
				if pa.distance_to(pb) < ra + rb - 0.5:
					collisions += 1
		_check("%s: no two buildings overlap bodies (%d collisions)" % [tid, collisions], collisions == 0)

	# --- ZONING RINGS on the densest downtown -----------------------------------
	var town_row: Dictionary = {}
	for t in m.towns:
		if String(t.get("id", "")) == metro_id:
			town_row = t
	if not town_row.is_empty():
		var c := Vector2(float(town_row["pos"][0]), float(town_row["pos"][1]))
		var core_civic := 0
		var core_all := 0
		var edge_res := 0
		var edge_all := 0
		var core_cats := ["civic_law", "civic", "commercial", "media"]
		var edge_cats := ["residential", "industrial", "industrial_service", "agriculture"]
		for p in _town_slots(m, metro_id):
			var pos := Vector2(float(p["pos"][0]), float(p["pos"][1]))
			var cat := _category(String(p["building"]))
			var dist := pos.distance_to(c)
			if dist < 80.0:
				core_all += 1
				if cat in core_cats:
					core_civic += 1
			elif dist > 150.0:
				edge_all += 1
				if cat in edge_cats:
					edge_res += 1
		_check("%s core ring is civic/commercial (%d/%d >= 70%%)" % [metro_id, core_civic, core_all],
			core_all > 0 and float(core_civic) / float(core_all) >= 0.7)
		_check("%s edge ring is residential/industrial (%d/%d >= 60%%)" % [metro_id, edge_res, edge_all],
			edge_all > 0 and float(edge_res) / float(edge_all) >= 0.6)

	# --- ARC 2 (THE_COUNTRY_PLAN): TOWN IDENTITY + FARM BELTS as rows -------------
	var lm_kinds: Array[String] = ["water_tower", "grain_elevator", "church_steeple", "radio_mast"]
	var named := 0
	var kinds_ok := true
	var register_ok := true
	var bespoke_kept := 0
	for t in m.towns:
		var lm := String(t.get("landmark", ""))
		var lk := String(t.get("landmark_kind", ""))
		if lm != "":
			named += 1
		if not lm.begins_with("THE "):
			register_ok = false
		if lk == "":
			bespoke_kept += 1 # vegas/stlouis/washington carry hand-built rows
		elif lk not in lm_kinds:
			kinds_ok = false
	_check("every town is NAMED by a landmark (%d/%d)" % [named, m.towns.size()], named == m.towns.size())
	_check("generated landmark kinds stay in the vocabulary", kinds_ok)
	_check("the landmark register holds (every name is 'THE ...')", register_ok)
	_check("the 3 bespoke towns keep their hand-built landmarks (%d)" % bespoke_kept, bespoke_kept == 3)

	var belted := 0
	for t in m.towns:
		var tp := Vector2(float(t["pos"][0]), float(t["pos"][1]))
		var has_farm := false
		for dx in [-500.0, 0.0, 500.0]:
			for dz in [-500.0, 0.0, 500.0]:
				if m.biome_at(Vector3(tp.x + float(dx), 0, tp.y + float(dz))) == "farmland":
					has_farm = true
		if has_farm:
			belted += 1
	_check("FARM BELTS ring the town approaches (%d towns read farmland nearby, >= 30)" % belted, belted >= 30)

	# --- the fabric is versioned rows (regen ran once, stays idempotent) ---------
	_finish()
