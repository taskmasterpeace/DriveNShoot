## Proof for THE FRONTIER PASS (owner goal + docs/LORE_BIBLE.md): the highway
## system grows its WESTERN half (I-70/I-5/I-35/I-25/I-80 exits + communities +
## cities), BACKROADS knit towns across corridors (2-lane shortcuts ambient
## traffic ignores), CHICAGO wears the Black Beanie Crown, the EAST's deep
## forests are DENSE and collidable (car-proof, bike/horse-threadable — solid
## trunks 2m apart), the WEST stays open country, deep MOUNTAINS stack real
## ridge rock, WILD HORSES graze the western plains, and the machine's voice
## rides the radio dial. East is not west — the map itself says so.
## Run: godot --headless --path game res://proto3d/tests/frontier_sim.tscn
extends Node

var passed := 0
var failed := 0
var main: Node3D


func _check(check_name: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("FRONTIER: %s - %s" % ["PASS" if ok else "FAIL", check_name])


## First grid cell of a biome matching an east/west band + road-distance rule.
func _find_cell(m: ProtoUSMap, want_biome: String, x_min: float, x_max: float, road_far: bool) -> Vector3:
	for iz in range(4, m.h - 4):
		for ix in range(2, m.w - 2):
			var wx := m.offset.x + (ix + 0.5) * m.cell_m
			if wx < x_min or wx > x_max:
				continue
			var p := Vector3(wx, 0, m.offset.y + (iz + 0.5) * m.cell_m)
			if m.biome_at(p) != want_biome:
				continue
			var near := m.road_near(p, 220.0)
			if road_far and not near.is_empty():
				continue
			if not road_far and (near.is_empty() or float(near.get("dist", 999.0)) > 90.0):
				continue
			if absf(p.x) < 6200.0 and absf(p.z) < 6200.0:
				continue # stay off the authored slab region
			return p
	return Vector3.INF


func _spawn_chunk_at(p: Vector3) -> Node3D:
	return main.stream._spawn_chunk(int(floor(p.x / 128.0)), int(floor(p.z / 128.0)))


func _tagged_count(chunk: Node3D, tag: String) -> Array:
	var out: Array = []
	if chunk == null:
		return out
	for c in chunk.get_children():
		if c.has_meta(tag):
			out.append(c)
	return out


func _ready() -> void:
	print("FRONTIER: start")
	get_tree().create_timer(160.0).timeout.connect(func() -> void:
		print("FRONTIER: WATCHDOG")
		print("FRONTIER: FAILURES PRESENT")
		get_tree().quit(1))

	# === 1. THE WESTERN CORRIDORS carry their exits ================================
	var m: ProtoUSMap = ProtoUSMap.get_default()
	var by_hwy: Dictionary = {}
	for e in m.exits:
		var h := String(e["highway_id"])
		by_hwy[h] = int(by_hwy.get(h, 0)) + 1
	var want := {"I-70": 9, "I-5": 9, "I-35": 7, "I-25": 6, "I-80": 10}
	var counts_ok := true
	for h2 in want:
		if int(by_hwy.get(h2, 0)) != int(want[h2]):
			counts_ok = false
			print("FRONTIER:   %s has %d (want %d)" % [h2, int(by_hwy.get(h2, 0)), want[h2]])
	_check("the western pass landed (I-70:9 I-5:9 I-35:7 I-25:6 I-80:10 — %d exits map-wide)" % m.exits.size(),
		counts_ok and m.exits.size() >= 87)
	var metro_found := false
	for e2 in m.exits:
		if String(e2["archetype"]) == "metro":
			metro_found = true
	_check("a WEST-COAST METRO stands on the Produce Line (SAN PERDIDO)", metro_found)

	# === 2. BACKROADS: the drifter's 2-lane shortcuts ==============================
	# The road-rows normalization retired the "backroad" kind — the town-knitters
	# live as "county" rows now (the corridor pass also added straight county
	# connectors, so WINDING is a character a subset carries, not all).
	var backroads: Array = []
	for r in m.roads:
		if String(r["kind"]) == "county":
			backroads.append(r)
	_check("BACKROADS knit the towns across corridors (%d county laid, want >=5)" % backroads.size(),
		backroads.size() >= 5)
	var br_ok := true
	var winding := 0
	for br in backroads:
		if int(br["lanes"]) != 2 or bool(br["divided"]):
			br_ok = false
		if (br["pts"] as PackedVector2Array).size() >= 4:
			winding += 1
	_check("...every county road is a 2-lane, never divided (+%d keep the WINDING character, want >=5)" % winding,
		br_ok and winding >= 5)

	# === 3. CHICAGO — THE BLACK BEANIE CROWN =======================================
	var chi: Dictionary = {}
	for t in m.towns:
		if String(t["id"]) == "chicago":
			chi = t
	_check("CHICAGO wears the Crown (lore bible: TruFoe's city)",
		not chi.is_empty() and String(chi["name"]).contains("BLACK BEANIE CROWN"))
	var crown_buildings := 0
	if not chi.is_empty():
		for pl in m.placements:
			if (pl["pos"] as Vector2).distance_to(chi["pos"]) < 220.0:
				crown_buildings += 1
	_check("...with its identity buildings placed (%d within the crown, want >=6)" % crown_buildings,
		crown_buildings >= 6)

	# === Boot the game for the terrain probes ======================================
	main = (load("res://proto3d/proto3d.tscn") as PackedScene).instantiate()
	add_child(main)
	for _i in 8:
		await get_tree().process_frame

	# === 4. EAST IS NOT WEST: dense forest law =====================================
	var east_cell := _find_cell(m, "forest", -10000.0, 99999.0, true)
	var west_cell := _find_cell(m, "forest", -999999.0, -35000.0, true)
	_check("the map HAS deep forest on both coasts (east %s, west %s)" % [east_cell != Vector3.INF, west_cell != Vector3.INF],
		east_cell != Vector3.INF and west_cell != Vector3.INF)
	var east_chunk := _spawn_chunk_at(east_cell)
	var west_chunk := _spawn_chunk_at(west_cell)
	var east_trunks := _tagged_count(east_chunk, "dense_trunk")
	var west_trunks := _tagged_count(west_chunk, "dense_trunk")
	_check("EASTERN deep forest is DENSE — car-proof trunk field (%d solid, want >=24)" % east_trunks.size(),
		east_trunks.size() >= 24)
	_check("WESTERN forest stays open country (%d solid, want <=10)" % west_trunks.size(),
		west_trunks.size() <= 10)
	var min_gap := 999.0
	for i in east_trunks.size():
		for j in range(i + 1, east_trunks.size()):
			min_gap = minf(min_gap, (east_trunks[i] as Node3D).position.distance_to((east_trunks[j] as Node3D).position))
	_check("...and the dense field still THREADS a bike/horse (min trunk spacing %.2fm >= 1.9)" % min_gap,
		min_gap >= 1.9)
	var roadside_cell := _find_cell(m, "forest", -10000.0, 99999.0, false)
	if roadside_cell != Vector3.INF:
		var roadside_chunk := _spawn_chunk_at(roadside_cell)
		_check("forest NEAR a road keeps its cleared shoulders (%d solid, <=6 — the road is the way through)" %
			_tagged_count(roadside_chunk, "dense_trunk").size(),
			_tagged_count(roadside_chunk, "dense_trunk").size() <= 6)

	# === 5. THE RIDGE LAW: deep mountains stack real rock ==========================
	var mtn_cell := _find_cell(m, "mountains", -999999.0, 99999.0, true)
	_check("the map has deep mountains", mtn_cell != Vector3.INF)
	if mtn_cell != Vector3.INF:
		var mtn_chunk := _spawn_chunk_at(mtn_cell)
		_check("deep mountains stack RIDGE ROCK (%d solid outcrops, want >=6)" %
			_tagged_count(mtn_chunk, "ridge_rock").size(),
			_tagged_count(mtn_chunk, "ridge_rock").size() >= 6)

	# === 6. WILD HORSES graze the western plains ===================================
	var found_horse := false
	var tried := 0
	for iz in range(4, m.h - 4):
		if found_horse or tried >= 90:
			break
		for ix in range(2, m.w - 2):
			var wx := m.offset.x + (ix + 0.5) * m.cell_m
			if wx > -35000.0:
				continue
			var p := Vector3(wx, 0, m.offset.y + (iz + 0.5) * m.cell_m)
			if m.biome_at(p) != "plains":
				continue
			tried += 1
			var ck := _spawn_chunk_at(p)
			if ck != null and not _tagged_count(ck, "wild_horse").is_empty():
				found_horse = true
			if found_horse or tried >= 90:
				break
	_check("WILD HORSES graze the western plains (found one within %d chunks)" % tried, found_horse)

	# === 7. THE MACHINE ON THE DIAL (lore bible §19) ================================
	var lore_hits := 0
	for line in ProtoRadio.LORE:
		var t2 := String(line)
		if t2.containsn("It split") or t2.containsn("waiting for instructions") or t2.containsn("got a king"):
			lore_hits += 1
	_check("the machine's voice rides the radio (%d bible lines on the dial)" % lore_hits, lore_hits >= 3)

	print("FRONTIER RESULTS: %d passed, %d failed" % [passed, failed])
	print("FRONTIER: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)
