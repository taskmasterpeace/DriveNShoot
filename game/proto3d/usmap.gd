## The DEATHLANDS USA macro map — the single source of truth for the compressed
## country (60×: 4 real hours of driving = 4 in-game minutes; 150×85 cells of
## 500 m = 75×42.5 km). Generated/edited by MapForge (tools/mapforge — editor,
## REST API, and generator all read/write the SAME res://data/usmap.json), and
## consumed here by streaming, surfaces, the HUD and the world map.
class_name ProtoUSMap
extends RefCounted

const PATH := "res://data/usmap.json"

static var _instance: ProtoUSMap = null

var ok: bool = false
var map_name: String = "DEATHLANDS USA"
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
		roads.append({"id": r["id"], "kind": r.get("kind", "interstate"), "pts": pts})
	rivers = d.get("rivers", [])
	towns.clear()
	for t in d.get("towns", []):
		towns.append({"id": t["id"], "name": t["name"],
			"pos": Vector2(float(t["pos"][0]), float(t["pos"][1])),
			"kind": t.get("kind", "ville"), "landmark": t.get("landmark", ""),
			"authored": t.get("authored", false)})
	placements.clear()
	for p in d.get("placements", []):
		placements.append({"id": p.get("id", ""), "building": p.get("building", ""),
			"pos": Vector2(float(p["pos"][0]), float(p["pos"][1])), "rot": float(p.get("rot", 0.0))})
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
				best = {"id": road["id"], "kind": road["kind"], "dist": d, "a": pts[i], "b": pts[i + 1]}
	return best


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
