## The DIVIDED STATES USA macro map — the single source of truth for the compressed
## country (60×: 4 real hours of driving = 4 in-game minutes; 150×85 cells of
## 500 m = 75×42.5 km). Generated/edited by MapForge (tools/mapforge — editor,
## REST API, and generator all read/write the SAME res://data/usmap.json), and
## consumed here by streaming, surfaces, the HUD and the world map.
class_name ProtoUSMap
extends RefCounted

const PATH := "res://data/usmap.json"

static var _instance: ProtoUSMap = null

var ok: bool = false
var map_name: String = "DIVIDED STATES USA"
var compression: int = 60
var cell_m: float = 500.0
var offset: Vector2 = Vector2(-60000, -20500)
var w: int = 0
var h: int = 0
var legend: Dictionary = {}       ## char -> biome name
var state_legend: Dictionary = {} ## char -> state name
var grid: PackedStringArray = []
var states_grid: PackedStringArray = []
var relief_grid: PackedStringArray = [] ## painted 0-9 digits (THE_COUNTRY_PLAN 1A); empty = unpainted
var _river_segs: Array = [] ## 1B: [[a: Vector2, b: Vector2, width: float], ...] — cached at load
## THE SEGMENT GRID (1B perf law): road segments bucketed into 256m cells at load,
## so road_near/roads_near scan a 3x3 neighborhood instead of the whole country.
## ground_y consults roads per SAMPLE now (the road-meets-land law) — without this
## index a single chunk floor cost 289 full-country scans and wedged headless runs.
const SEG_BUCKET_M := 256.0
var _seg_grid: Dictionary = {} ## "bx,bz" -> Array of [road_index, seg_index]
var roads: Array = []             ## [{id, kind, pts: PackedVector2Array (world m)}]
var rivers: Array = []
var towns: Array = []             ## [{id, name, pos: Vector2, kind, landmark?}]
var placements: Array = []        ## AUTHORED LAYER (MapForge v2): [{id, building, pos: Vector2, rot}]
## EXIT NODES (World_Structures spec §5): the content sockets on the highways.
## [{id, highway_id, exit_number, name, archetype, community_tier, service_tags,
##   risk_rating, has_return_ramp, pos: Vector2 (ON the highway), dest: Vector2}]
var exits: Array = []
var junctions: Array = [] ## baked junction rows (AMERICAN_ROAD M1 schema 0.2)


static func get_default() -> ProtoUSMap:
	if _instance == null:
		_instance = ProtoUSMap.new()
		_instance.load_file(PATH)
	return _instance


func load_file(path: String) -> bool:
	ok = false
	var f := FileAccess.open(path, FileAccess.READ)
	if f == null:
		push_warning("usmap: cannot open %s" % path)
		return false
	var data: Variant = JSON.parse_string(f.get_as_text())
	if typeof(data) != TYPE_DICTIONARY:
		push_warning("usmap: bad JSON in %s" % path)
		return false
	var d: Dictionary = data
	map_name = d.get("name", map_name)
	compression = int(d.get("compression", 60))
	cell_m = float(d.get("cell_m", 500.0))
	var off: Array = d.get("world_offset", [-60000, -20500])
	offset = Vector2(float(off[0]), float(off[1]))
	w = int(d.get("w", 0))
	h = int(d.get("h", 0))
	legend = d.get("legend", {})
	state_legend = d.get("state_legend", {})
	grid = PackedStringArray(d.get("grid", []))
	states_grid = PackedStringArray(d.get("states_grid", []))
	# PAINTED RELIEF (THE_COUNTRY_PLAN 1A): digits 0-9 per cell — the macro
	# height amplitude MapForge's RELIEF layer paints. Absent = no macro (the
	# per-state fallback keeps the pre-paint behavior byte-identical).
	relief_grid = PackedStringArray(d.get("relief", []))
	roads.clear()
	for r in d.get("roads", []):
		var pts := PackedVector2Array()
		for p in r["pts"]:
			pts.append(Vector2(float(p[0]), float(p[1])))
		# PILLAR 1 (WORLD_PILLARS.md): a road is a CHARACTER — danger, patrol
		# family, a nickname the world greets you with, and a toll if it bills.
		# ROAD OVERHAUL (ROAD_TRAFFIC_OVERHAUL.md §3.1): lanes + median division
		# are ROWS too. Defaults: interstate 4 / exit 2; divided iff lanes >= 6
		# (a six-lane without a median is a death trap) — both overridable per row.
		var kind := String(r.get("kind", "interstate"))
		var lanes := int(r.get("lanes", 4 if kind == "interstate" else 2))
		# ELEVATION AS ROWS (RACING_DESTRUCTION_SET P1): optional per-point heights
		# (meters), same length as pts — missing/short entries default to 0.0 so a
		# road with no "elev" field at all folds byte-identical to before.
		var elev_raw: Array = r.get("elev", [])
		var elev := PackedFloat32Array()
		for ei in range(pts.size()):
			elev.append(float(elev_raw[ei]) if ei < elev_raw.size() else 0.0)
		roads.append({"id": r["id"], "kind": kind, "pts": pts, "elev": elev,
			# 1A: "ground" = terrain-following baked relief (the land BLENDS to it);
			# anything else (ramps, bridge humps, authored jumps) keeps real clearance.
			"elev_mode": String(r.get("elev_mode", "")),
			"danger": int(r.get("danger", 1 if kind == "interstate" else 0)),
			"family": String(r.get("family", "")), "nickname": String(r.get("nickname", "")),
			"toll": int(r.get("toll", 0)),
			"side": int(r.get("side", 0)), # exit ramps: +1 along the highway's pts order, -1 against (0.18b)
			"surface": String(r.get("surface", "asphalt")), # 0.17: asphalt|concrete|gravel|dirt
			"leads_to": (r.get("leads_to", {}) as Dictionary).duplicate(), # dirt spurs: the payload law (0.19)
			"lanes": lanes, "divided": bool(r.get("divided", lanes >= 6))})
	# 1B: rivers become REAL — polyline + width (m). Cached as Vector2s once.
	rivers = d.get("rivers", [])
	_river_segs.clear()
	for rv in rivers:
		var rpts: Array = rv.get("pts", [])
		var rw := float(rv.get("width", 26.0))
		for i in range(rpts.size() - 1):
			_river_segs.append([Vector2(float(rpts[i][0]), float(rpts[i][1])),
				Vector2(float(rpts[i + 1][0]), float(rpts[i + 1][1])), rw])
	towns.clear()
	for t in d.get("towns", []):
		towns.append({"id": t["id"], "name": t["name"],
			"pos": Vector2(float(t["pos"][0]), float(t["pos"][1])),
			"kind": t.get("kind", "holdout"), "landmark": t.get("landmark", ""),
			"landmark_kind": t.get("landmark_kind", ""),
			"authored": t.get("authored", false)})
	placements.clear()
	for p in d.get("placements", []):
		placements.append({"id": p.get("id", ""), "building": p.get("building", ""),
			"pos": Vector2(float(p["pos"][0]), float(p["pos"][1])), "rot": float(p.get("rot", 0.0)),
			"label": String(p.get("label", ""))}) # M4b: the water tower says the TOWN's name
	exits.clear()
	for e in d.get("exits", []):
		if not (e is Dictionary) or not (e as Dictionary).has("pos"):
			continue
		exits.append({"id": String(e.get("id", "")), "highway_id": String(e.get("highway_id", "")),
			"exit_number": int(e.get("exit_number", 0)), "name": String(e.get("name", "")),
			"archetype": String(e.get("archetype", "service")),
			"community_tier": String(e.get("community_tier", "T1")),
			"service_tags": (e.get("service_tags", []) as Array).duplicate(),
			"risk_rating": int(e.get("risk_rating", 1)),
			"has_return_ramp": bool(e.get("has_return_ramp", false)),
			"ramp_ids": (e.get("ramp_ids", []) as Array).duplicate(), # 0.5: the dead-code fix — resolution by ids, never name patterns
			"town_id": String(e.get("town_id", "")),
			"known_to_player": bool(e.get("known_to_player", false)),
			"pos": Vector2(float(e["pos"][0]), float(e["pos"][1])),
			"dest": Vector2(float(e.get("dest", e["pos"])[0]), float(e.get("dest", e["pos"])[1]))})
	# THE JUNCTION TABLE (AMERICAN_ROAD M1, schema 0.2): baked by MapForge
	# (tools/mapforge/bake_junctions.mjs), folded typed here, verified at load.
	# gap_half is DERIVED (0.3) via junction_gap_half(), never stored.
	junctions.clear()
	for j in d.get("junctions", []):
		if not (j is Dictionary) or not (j as Dictionary).has("pos"):
			continue
		var legs: Array = []
		for l in j.get("legs", []):
			legs.append({"road": String((l as Dictionary).get("road", "")),
				"arc_m": float((l as Dictionary).get("arc_m", 0.0))})
		junctions.append({"id": String(j.get("id", "")), "kind": String(j.get("kind", "cross")),
			"grade": String(j.get("grade", "flat")), "control": String(j.get("control", "none")),
			"deck_road": String(j.get("deck_road", "")),
			"pos": Vector2(float(j["pos"][0]), float(j["pos"][1])), "legs": legs})
	ok = w > 0 and h > 0 and grid.size() == h
	_build_seg_grid()
	return ok


## Bucket every road segment into 256m cells (stepping long segments so a 5km
## interstate span registers in every cell it crosses). Built once per load.
func _build_seg_grid() -> void:
	_seg_grid.clear()
	for ri in roads.size():
		var pts: PackedVector2Array = roads[ri]["pts"]
		for si in range(pts.size() - 1):
			var a := pts[si]
			var b := pts[si + 1]
			var seg_l := a.distance_to(b)
			var steps := int(seg_l / SEG_BUCKET_M) + 1
			var marked: Dictionary = {}
			for k in steps + 1:
				var p := a.lerp(b, float(k) / float(steps))
				var bx := int(floor(p.x / SEG_BUCKET_M))
				var bz := int(floor(p.y / SEG_BUCKET_M))
				# stamp the 3x3 around each step so max_d up to ~256 stays exact
				for dz in [-1, 0, 1]:
					for dx in [-1, 0, 1]:
						var bkey := "%d,%d" % [bx + dx, bz + dz]
						if marked.has(bkey):
							continue
						marked[bkey] = true
						if not _seg_grid.has(bkey):
							_seg_grid[bkey] = []
						(_seg_grid[bkey] as Array).append([ri, si])


## Candidate [road_index, seg_index] pairs near a point (the grid's 1-cell reach
## covers max_d <= SEG_BUCKET_M; callers needing more fall back to the full scan).
func _seg_candidates(p: Vector2) -> Array:
	return _seg_grid.get("%d,%d" % [int(floor(p.x / SEG_BUCKET_M)), int(floor(p.y / SEG_BUCKET_M))], [])


## Authored placements whose world position falls inside a chunk's box (world m).
## The streamer calls this per chunk so pinned structures appear at exact coords
## while the biome scatter around them stays procedural.
func placements_in(rect: Rect2) -> Array:
	var out: Array = []
	for p in placements:
		if rect.has_point(p["pos"]):
			out.append(p)
	return out


## Exit NODES whose highway anchor falls inside a chunk's box — the streamer
## raises each one's EXIT SIGN there (spec §18: every exit needs a highway sign).
func exits_in(rect: Rect2) -> Array:
	var out: Array = []
	for e in exits:
		if rect.has_point(e["pos"]):
			out.append(e)
	return out


## Baked junction rows whose node falls inside a chunk's box (the streamer gaps
## barriers + paints the intersection slab off these — AMERICAN_ROAD M1).
func junctions_in(rect: Rect2) -> Array:
	var out: Array = []
	for j in junctions:
		if rect.has_point(j["pos"]):
			out.append(j)
	return out


func road_by_id(rid: String) -> Dictionary:
	for r in roads:
		if String(r["id"]) == rid:
			return r
	return {}


## THE GAME-MILE (ADDRESS LAW 0.1): mile markers use the SAME constant the exit
## renumber used, so EXIT N stands near MILE N — the real American invariant.
const EXIT_MILE_M := 2395.0


## Arc-length along a road measured from its SOUTH/WEST origin (AASHTO — the
## bake's arcFromOrigin, mirrored so signs and exits agree).
func arc_from_origin(road: Dictionary, pos: Vector2) -> float:
	var pts: Array = road["pts"]
	var total := 0.0
	var best_d := 1e18
	var best_arc := 0.0
	var arc := 0.0
	for i in range(pts.size() - 1):
		var a: Vector2 = pts[i]
		var b: Vector2 = pts[i + 1]
		var l := (b - a).length()
		var t := clampf((pos - a).dot(b - a) / maxf(l * l, 0.001), 0.0, 1.0)
		var d := (a + (b - a) * t).distance_to(pos)
		if d < best_d:
			best_d = d
			best_arc = arc + t * l
		arc += l
	total = arc
	var p0: Vector2 = pts[0]
	var pn: Vector2 = pts[pts.size() - 1]
	var origin_at_start: bool = (p0.y > pn.y) if absf(pn.y - p0.y) >= absf(pn.x - p0.x) else (p0.x < pn.x)
	return best_arc if origin_at_start else total - best_arc


## ARC 2 (THE_COUNTRY_PLAN): a road's exits as [{arc, row}] sorted by arc from
## the road's own origin — lazy, built once per road, so billboards can name
## the REAL next exit at its REAL distance without rescanning 88 rows.
var _exit_arcs: Dictionary = {}


func exit_arcs(rid: String) -> Array:
	if _exit_arcs.has(rid):
		return _exit_arcs[rid]
	var out: Array = []
	var full := road_by_id(rid)
	if not full.is_empty():
		for e in exits:
			if String((e as Dictionary).get("highway_id", "")) == rid:
				out.append({"arc": arc_from_origin(full, (e as Dictionary)["pos"]), "row": e})
	out.sort_custom(func(x: Dictionary, y: Dictionary) -> bool: return float(x["arc"]) < float(y["arc"]))
	_exit_arcs[rid] = out
	return out


## THE GAP FORMULA (0.3, derived never stored): the barrier gap a junction opens
## in road_id's median = half the CROSS road's full width + 6 m each side.
## Worked (the sim asserts it): I-80 tee onto I-95 (6-lane divided, 27.2 m wide)
## -> 13.6 + 6.0 = 19.6 m each side, a 39.2 m mouth. Returns 0.0 when the
## junction doesn't gap this road (riro ramps NEVER open the median — 0.2).
func junction_gap_half(j: Dictionary, road_id: String) -> float:
	if String(j.get("control", "none")) != "gap":
		return 0.0
	var cross_id := ""
	for l in j.get("legs", []):
		if String(l["road"]) != road_id:
			cross_id = String(l["road"])
			break
	if cross_id == "":
		return 0.0
	var cross_road := road_by_id(cross_id)
	if cross_road.is_empty():
		return 0.0
	return float(ProtoUSMap.road_geometry(cross_road)["width"]) * 0.5 + 6.0


func cell_of(x: float, z: float) -> Vector2i:
	return Vector2i(int(floor((x - offset.x) / cell_m)), int(floor((z - offset.y) / cell_m)))


func cell_center(c: Vector2i) -> Vector2:
	return Vector2(offset.x + (c.x + 0.5) * cell_m, offset.y + (c.y + 0.5) * cell_m)


func biome_char(x: float, z: float) -> String:
	var c := cell_of(x, z)
	if c.x < 0 or c.x >= w or c.y < 0 or c.y >= h:
		return "."
	return grid[c.y][c.x]


func biome_at(pos: Vector3) -> String:
	return legend.get(biome_char(pos.x, pos.z), "ocean")


func state_at(pos: Vector3) -> String:
	var c := cell_of(pos.x, pos.z)
	if c.x < 0 or c.x >= w or c.y < 0 or c.y >= h:
		return ""
	return state_legend.get(states_grid[c.y][c.x], "")


## PAINTED RELIEF, 0..1 (THE_COUNTRY_PLAN 1A): BILINEAR between cell centers so
## the macro land rolls smoothly across 500m cells instead of stepping. -1.0
## when the map carries no relief layer (callers fall back to the per-state law).
func relief01(x: float, z: float) -> float:
	if relief_grid.is_empty():
		return -1.0
	var fx := (x - offset.x) / cell_m - 0.5
	var fz := (z - offset.y) / cell_m - 0.5
	var x0 := int(floor(fx))
	var z0 := int(floor(fz))
	var tx := fx - float(x0)
	var tz := fz - float(z0)
	var v00 := _relief_cell(x0, z0)
	var v10 := _relief_cell(x0 + 1, z0)
	var v01 := _relief_cell(x0, z0 + 1)
	var v11 := _relief_cell(x0 + 1, z0 + 1)
	return lerpf(lerpf(v00, v10, tx), lerpf(v01, v11, tx), tz)


## Nearest river segment within max_d: {dist, width} or {} (1B — rivers are real).
func river_near(x: float, z: float, max_d: float) -> Dictionary:
	var p := Vector2(x, z)
	var best_d := max_d
	var best_w := 0.0
	for seg in _river_segs:
		var d := _seg_dist(p, seg[0], seg[1])
		if d < best_d:
			best_d = d
			best_w = float(seg[2])
	if best_w <= 0.0:
		return {}
	return {"dist": best_d, "width": best_w}


func _relief_cell(cx: int, cz: int) -> float:
	if cx < 0 or cz < 0 or cz >= relief_grid.size():
		return 0.0
	var row := relief_grid[cz]
	if cx >= row.length():
		return 0.0
	return float(row.unicode_at(cx) - 48) / 9.0 # '0'..'9' -> 0..1


## THE ONE GEOMETRY LAW (ROAD_TRAFFIC_OVERHAUL.md §3.2): every consumer of lane
## math — the streamer's slabs, the traffic system's offsets, the autopilot's
## lane-keeping, grip registration — reads THIS, so the painted road and the
## driven road can never disagree.
const LANE_W: float = 3.6
const SHOULDER_W: float = 1.0
const MEDIAN_W: float = 2.4


static func road_geometry(road: Dictionary) -> Dictionary:
	var lanes := int(road.get("lanes", 4))
	var divided := bool(road.get("divided", lanes >= 6))
	var per_side := maxi(1, lanes / 2)
	if divided:
		var carriage := per_side * LANE_W + 1.6
		return {"lanes": lanes, "per_side": per_side, "divided": true,
			"carriage_w": carriage, "median_w": MEDIAN_W,
			"width": 2.0 * carriage + MEDIAN_W, "center_gap": MEDIAN_W * 0.5 + 0.8}
	return {"lanes": lanes, "per_side": per_side, "divided": false,
		"carriage_w": lanes * LANE_W + 2.0 * SHOULDER_W, "median_w": 0.0,
		"width": lanes * LANE_W + 2.0 * SHOULDER_W, "center_gap": 0.0}


## Lateral distance from the centerline to the CENTER of lane N (0 = innermost),
## on the right-hand side of travel. The traffic system mirrors the sign by
## direction; this is pure magnitude.
static func lane_offset(road: Dictionary, lane: int) -> float:
	var g := road_geometry(road)
	return float(g["center_gap"]) + (float(lane) + 0.5) * LANE_W


## Nearest interstate within max_d meters of a world point (2D). Returns {} or
## {id, kind, dist, a, b} — a/b are the closest segment's endpoints (world m).
func road_near(pos: Vector3, max_d: float) -> Dictionary:
	var p := Vector2(pos.x, pos.z)
	var best: Dictionary = {}
	var best_d := max_d
	# THE SEGMENT GRID fast path (1B perf law): a 256m-bucket lookup covers every
	# query up to the bucket size — ground_y calls this per SAMPLE now, and the
	# full-country scan wedged headless runs. Bigger radii keep the honest scan.
	if max_d <= SEG_BUCKET_M and not _seg_grid.is_empty():
		for cand in _seg_candidates(p):
			var road: Dictionary = roads[cand[0]]
			var i: int = cand[1]
			var pts: PackedVector2Array = road["pts"]
			var d := _seg_dist(p, pts[i], pts[i + 1])
			if d < best_d:
				best_d = d
				var ep := _elev_pair(road, i)
				best = {"id": road["id"], "kind": road["kind"], "dist": d, "a": pts[i], "b": pts[i + 1],
					"elev_a": ep[0], "elev_b": ep[1], "elev_mode": String(road.get("elev_mode", "")),
					"danger": int(road.get("danger", 0)), "family": String(road.get("family", "")),
					"nickname": String(road.get("nickname", "")), "toll": int(road.get("toll", 0)),
					"surface": String(road.get("surface", "asphalt")),
					"lanes": int(road.get("lanes", 4)), "divided": bool(road.get("divided", false))}
		return best
	for road in roads:
		var pts: PackedVector2Array = road["pts"]
		for i in range(pts.size() - 1):
			var d := _seg_dist(p, pts[i], pts[i + 1])
			if d < best_d:
				best_d = d
				var ep := _elev_pair(road, i)
				best = {"id": road["id"], "kind": road["kind"], "dist": d, "a": pts[i], "b": pts[i + 1],
					"elev_a": ep[0], "elev_b": ep[1], "elev_mode": String(road.get("elev_mode", "")),
					"danger": int(road.get("danger", 0)), "family": String(road.get("family", "")),
					"nickname": String(road.get("nickname", "")), "toll": int(road.get("toll", 0)),
					"surface": String(road.get("surface", "asphalt")),
					"lanes": int(road.get("lanes", 4)), "divided": bool(road.get("divided", false))}
	return best


## EVERY road within max_d of a point — one entry per road, each with its own
## closest segment (the junction fix: an exit ramp must not displace its own
## interstate in the chunk that hosts them both).
func roads_near(pos: Vector3, max_d: float) -> Array:
	var p := Vector2(pos.x, pos.z)
	var out: Array = []
	# THE SEGMENT GRID fast path (1B): per-road best segment from the bucket only.
	if max_d <= SEG_BUCKET_M and not _seg_grid.is_empty():
		var best_by_road: Dictionary = {} # road_index -> [best_d, best_i]
		for cand in _seg_candidates(p):
			var ri: int = cand[0]
			var si: int = cand[1]
			var rpts: PackedVector2Array = roads[ri]["pts"]
			var dd := _seg_dist(p, rpts[si], rpts[si + 1])
			if dd >= max_d:
				continue
			if not best_by_road.has(ri) or dd < float((best_by_road[ri] as Array)[0]):
				best_by_road[ri] = [dd, si]
		for ri in best_by_road:
			var road: Dictionary = roads[ri]
			var pts2: PackedVector2Array = road["pts"]
			var bi: int = (best_by_road[ri] as Array)[1]
			var ep2 := _elev_pair(road, bi)
			out.append({"id": road["id"], "kind": road["kind"], "dist": float((best_by_road[ri] as Array)[0]),
				"a": pts2[bi], "b": pts2[bi + 1], "elev_a": ep2[0], "elev_b": ep2[1],
				"elev_mode": String(road.get("elev_mode", "")),
				"danger": int(road.get("danger", 0)), "family": String(road.get("family", "")),
				"nickname": String(road.get("nickname", "")), "toll": int(road.get("toll", 0)),
				"surface": String(road.get("surface", "asphalt")),
				"lanes": int(road.get("lanes", 4)), "divided": bool(road.get("divided", false))})
		return out
	for road in roads:
		var pts: PackedVector2Array = road["pts"]
		var best_d := max_d
		var best_i := -1
		for i in range(pts.size() - 1):
			var d := _seg_dist(p, pts[i], pts[i + 1])
			if d < best_d:
				best_d = d
				best_i = i
		if best_i >= 0:
			var ep := _elev_pair(road, best_i)
			out.append({"id": road["id"], "kind": road["kind"], "dist": best_d,
				"a": pts[best_i], "b": pts[best_i + 1], "elev_a": ep[0], "elev_b": ep[1],
				"elev_mode": String(road.get("elev_mode", "")),
				"danger": int(road.get("danger", 0)), "family": String(road.get("family", "")),
				"nickname": String(road.get("nickname", "")), "toll": int(road.get("toll", 0)),
				"surface": String(road.get("surface", "asphalt")),
				"lanes": int(road.get("lanes", 4)), "divided": bool(road.get("divided", false))})
	return out


func town_near(pos: Vector3, r: float) -> Dictionary:
	var p := Vector2(pos.x, pos.z)
	var best: Dictionary = {}
	var best_d := r
	for t in towns:
		var d: float = (t["pos"] as Vector2).distance_to(p)
		if d < best_d:
			best_d = d
			best = t
	return best


func world_bounds() -> Rect2:
	return Rect2(offset, Vector2(w * cell_m, h * cell_m))


static func _seg_dist(p: Vector2, a: Vector2, b: Vector2) -> float:
	var ab := b - a
	var len2 := ab.length_squared()
	if len2 < 0.0001:
		return p.distance_to(a)
	var t := clampf((p - a).dot(ab) / len2, 0.0, 1.0)
	return p.distance_to(a + ab * t)


## The elev[] values at pts[i]/pts[i+1] — 0.0/0.0 when the row carries no
## elevation data (or the array is short), so a flat road never sees a phantom
## slope (RACING_DESTRUCTION_SET P1).
static func _elev_pair(road: Dictionary, i: int) -> Array:
	var elev: PackedFloat32Array = road.get("elev", PackedFloat32Array())
	var ea := float(elev[i]) if i < elev.size() else 0.0
	var eb := float(elev[i + 1]) if i + 1 < elev.size() else 0.0
	return [ea, eb]


## Height (meters) at an arc-length distance along a road's own polyline — the
## ONE way any consumer (streamer, traffic, a future GPS elevation profile)
## reads a road's slope, sharing the same pts walk arc_from_origin uses.
## Linear interpolation between authored elev[] points; 0.0 for a flat/no-elev
## row (missing or short elev[] never throws, it just reads as flat).
static func elev_at(road: Dictionary, arc_m: float) -> float:
	var pts: Array = road["pts"]
	var elev: PackedFloat32Array = road.get("elev", PackedFloat32Array())
	if elev.is_empty() or pts.size() < 2:
		return 0.0
	var acc := 0.0
	for i in range(pts.size() - 1):
		var a: Vector2 = pts[i]
		var b: Vector2 = pts[i + 1]
		var seg_len: float = maxf((b - a).length(), 0.0001)
		var ep := _elev_pair(road, i)
		if arc_m <= acc + seg_len or i == pts.size() - 2:
			var t := clampf((arc_m - acc) / seg_len, 0.0, 1.0)
			return lerpf(float(ep[0]), float(ep[1]), t)
		acc += seg_len
	return 0.0
