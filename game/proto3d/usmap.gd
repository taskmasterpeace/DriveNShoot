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
		roads.append({"id": r["id"], "kind": kind, "pts": pts,
			"danger": int(r.get("danger", 1 if kind == "interstate" else 0)),
			"family": String(r.get("family", "")), "nickname": String(r.get("nickname", "")),
			"toll": int(r.get("toll", 0)),
			"side": int(r.get("side", 0)), # exit ramps: +1 along the highway's pts order, -1 against (0.18b)
			"surface": String(r.get("surface", "asphalt")), # 0.17: asphalt|concrete|gravel|dirt
			"leads_to": (r.get("leads_to", {}) as Dictionary).duplicate(), # dirt spurs: the payload law (0.19)
			"lanes": lanes, "divided": bool(r.get("divided", lanes >= 6))})
	rivers = d.get("rivers", [])
	towns.clear()
	for t in d.get("towns", []):
		towns.append({"id": t["id"], "name": t["name"],
			"pos": Vector2(float(t["pos"][0]), float(t["pos"][1])),
			"kind": t.get("kind", "holdout"), "landmark": t.get("landmark", ""),
			"authored": t.get("authored", false)})
	placements.clear()
	for p in d.get("placements", []):
		placements.append({"id": p.get("id", ""), "building": p.get("building", ""),
			"pos": Vector2(float(p["pos"][0]), float(p["pos"][1])), "rot": float(p.get("rot", 0.0))})
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
			"pos": Vector2(float(j["pos"][0]), float(j["pos"][1])), "legs": legs})
	ok = w > 0 and h > 0 and grid.size() == h
	return ok


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
	for road in roads:
		var pts: PackedVector2Array = road["pts"]
		for i in range(pts.size() - 1):
			var d := _seg_dist(p, pts[i], pts[i + 1])
			if d < best_d:
				best_d = d
				best = {"id": road["id"], "kind": road["kind"], "dist": d, "a": pts[i], "b": pts[i + 1],
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
			out.append({"id": road["id"], "kind": road["kind"], "dist": best_d,
				"a": pts[best_i], "b": pts[best_i + 1],
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
