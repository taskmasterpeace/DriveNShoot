## THE ROAD GRAPH (THE_AMERICAN_ROAD M1, ruling 0.2): nodes = baked junctions,
## arcs = road spans between consecutive junctions along each road. Dijkstra on
## TIME-cost (a 16 m/s backroad must lose to the interstate). Built ONCE at fold
## from rows — routes plan for country whose chunks have never been built.
##
## CONSUMERS (0.16 — binding): the atlas/GPS ("fastest way to I-95 EXIT 9") and
## the sims, NOW; NAVIGATION.md is the second sanctioned consumer (its DRIVE
## domain); traffic/motorists/convoys/autopilot adopt this same graph at MT and
## not before. No agent code touches this file today.
class_name ProtoRoadGraph
extends RefCounted

## kind -> cruise m/s for the time cost (rows can override with "speed_mps").
const KIND_SPEED: Dictionary = {
	"interstate": 29.0, "us_route": 22.0, "state_road": 19.0,
	"backroad": 16.0, "county": 16.0, "street": 11.0, "dirt": 9.0, "exit": 12.0,
}

var usmap: ProtoUSMap = null
var nodes: Dictionary = {} ## node id -> {pos: Vector2, junction: Dictionary}
var adj: Dictionary = {}   ## node id -> Array of {to: String, road: String, len_m: float, time_s: float}
var _road_nodes: Dictionary = {} ## road id -> Array of {node: String, arc_m: float} (arc-sorted)
var _ports: Dictionary = {} ## ramp id -> shared port, serving highway and terminal arc
var _carriers: Dictionary = {} ## highways whose through-directions must stay distinct
var _active_nodes: Dictionary = {} ## edge endpoints, including incoming-only sinks
var _nonmeeting: Dictionary = {} ## junction id -> failed multi-leg meeting, computed once at build


static func build(usmap_ref: ProtoUSMap) -> ProtoRoadGraph:
	var g := ProtoRoadGraph.new()
	g.usmap = usmap_ref
	g._build()
	return g


func _build() -> void:
	if usmap == null or not usmap.ok:
		return
	for exit_row: Dictionary in usmap.exits:
		for port: Dictionary in usmap.exit_ports(exit_row):
			if int(port["side"]) == 0:
				continue # no invented carriageway for a geometrically ambiguous legacy row
			var ramp: Dictionary = port["road"]
			var rid := String(ramp["id"])
			var highway := String(exit_row["highway_id"])
			var data := port.duplicate()
			data["highway"] = highway
			data["terminal_arc"] = float(ProtoUSMap._project_road(ramp, port["pos"])["arc_m"])
			_ports[rid] = data
			_carriers[highway] = true
	# Baked shared nodes remain for ordinary flat intersections. Each ramp's
	# highway terminal is private, even when an old mouth lists both sides.
	for j in usmap.junctions:
		var nid := String(j["id"])
		nodes[nid] = {"pos": j["pos"], "junction": j}
		adj[nid] = []
		# End caps have no transfer to reject. Do not mistake their single leg
		# for a failed join or move their selectable same-road endpoint.
		if (j["legs"] as Array).size() >= 2:
			_nonmeeting[nid] = not usmap.junction_roads_meet(j)
		for l in j["legs"]:
			var rid := String(l["road"])
			if _ports.has(rid) and absf(float(l["arc_m"]) - float(_ports[rid]["terminal_arc"])) <= 2.0:
				continue # indexed once below, at the actual (unrounded) terminal
			_index(rid, nid, float(l["arc_m"]))
	for rid: String in _ports:
		var port: Dictionary = _ports[rid]
		var nid := "port@%s" % rid
		nodes[nid] = {"pos": port["pos"], "junction": {}, "port_road": rid}
		adj[nid] = []
		_index(rid, nid, float(port["terminal_arc"]))
		_index(String(port["highway"]), nid, float(port["highway_arc_m"]))
	# Point-order arcs; separated carriageways pass every limited-access node
	# independently, not just the newly managed interchange's four mouths.
	for rid in _road_nodes:
		var lst: Array = _road_nodes[rid]
		lst.sort_custom(func(a, b) -> bool: return float(a["arc_m"]) < float(b["arc_m"]))
		var road: Dictionary = usmap.road_by_id(String(rid))
		if road.is_empty() or (road["pts"] as PackedVector2Array).size() < 2:
			continue # malformed/missing road cannot create edges or be sampled
		var mps: float = maxf(0.1, float(road.get("speed_mps", KIND_SPEED.get(String(road.get("kind", "backroad")), 16.0))))
		for i in range(lst.size() - 1):
			var a: Dictionary = lst[i]
			var b: Dictionary = lst[i + 1]
			var span: float = absf(float(b["arc_m"]) - float(a["arc_m"]))
			var an := _travel_node(String(a["node"]), String(rid), float(a["arc_m"]), 1)
			var bn := _travel_node(String(b["node"]), String(rid), float(b["arc_m"]), 1)
			_edge(an, bn, String(rid), span, mps)
			if not bool(road.get("one_way", false)):
				an = _travel_node(String(a["node"]), String(rid), float(a["arc_m"]), -1)
				bn = _travel_node(String(b["node"]), String(rid), float(b["arc_m"]), -1)
				_edge(bn, an, String(rid), span, mps)
	for rid: String in _ports:
		var port: Dictionary = _ports[rid]
		var nid := "port@%s" % rid
		var highway := String(port["highway"])
		var carrier := _travel_node(nid, highway, float(port["highway_arc_m"]), int(port["side"]))
		var distance: float = (nodes[carrier]["pos"] as Vector2).distance_to(port["pos"])
		if String(port["role"]) == "off":
			_edge(carrier, nid, highway, distance, 12.0)
		else:
			_edge(nid, carrier, highway, distance, 12.0)


func _index(rid: String, nid: String, arc: float) -> void:
	if not _road_nodes.has(rid):
		_road_nodes[rid] = []
	(_road_nodes[rid] as Array).append({"node": nid, "arc_m": arc})


func _edge(from: String, to: String, rid: String, length: float, mps: float) -> void:
	if from == to:
		return
	(adj[from] as Array).append({"to": to, "road": rid, "len_m": length, "time_s": length / mps})
	_active_nodes[from] = true
	_active_nodes[to] = true


## Grade-separated and physically nonmeeting nodes are per-road clones, so
## along-road travel remains intact without inventing cross-road transfers.
## Serving highways also split travel directions at every limited-access node;
## only physically meeting flat control-gap nodes can stay shared.
func _travel_node(nid: String, rid: String, arc: float, direction: int) -> String:
	var j: Dictionary = (nodes.get(nid, {}) as Dictionary).get("junction", {})
	var separate := String(j.get("grade", "flat")) in ["separated_pending", "deck"] or bool(_nonmeeting.get(nid, false))
	var carrier := _carriers.has(rid) and not (String(j.get("control", "none")) == "gap" and not separate)
	if separate or carrier:
		var cid := "%s@%s" % [nid, rid]
		if carrier:
			cid += ":%d" % direction
		if not nodes.has(cid):
			var road := usmap.road_by_id(rid)
			var sample := _point_at(road, arc)
			var pos: Vector2 = sample["pos"]
			if carrier:
				var tangent: Vector2 = sample["dir"]
				pos += Vector2(-tangent.y, tangent.x) * ProtoUSMap.lane_offset(road, 0) * float(direction)
			nodes[cid] = {"pos": pos, "junction": j}
			adj[cid] = []
		return cid
	return nid


static func _point_at(road: Dictionary, arc: float) -> Dictionary:
	var pts: PackedVector2Array = road["pts"]
	var remaining := arc
	for i in range(pts.size() - 1):
		var delta := pts[i + 1] - pts[i]
		var length := delta.length()
		if remaining <= length or i == pts.size() - 2:
			return {"pos": pts[i].lerp(pts[i + 1], clampf(remaining / maxf(length, 0.0001), 0.0, 1.0)), "dir": delta.normalized()}
		remaining -= length
	return {"pos": Vector2.ZERO, "dir": Vector2.RIGHT}


## Nearest graph node to a world position (2D).
func nearest_node(pos: Vector2) -> String:
	var best := ""
	var bd := 1e18
	for nid in nodes:
		if not _active_nodes.has(nid):
			continue
		var d: float = (nodes[nid]["pos"] as Vector2).distance_squared_to(pos)
		if d < bd:
			bd = d
			best = String(nid)
	return best


## Dijkstra on time-cost. Returns {} when unreachable, else
## {nodes: [ids], roads: [road ids in travel order], len_m, time_s, text}.
func route(from_pos: Vector2, to_pos: Vector2) -> Dictionary:
	var src := nearest_node(from_pos)
	var dst := nearest_node(to_pos)
	if src == "" or dst == "":
		return {}
	var dist_t: Dictionary = {src: 0.0}
	var prev: Dictionary = {}
	var prev_road: Dictionary = {}
	var done: Dictionary = {}
	while true:
		var u := ""
		var ud := 1e18
		for nid in dist_t:
			if not done.has(nid) and float(dist_t[nid]) < ud:
				ud = float(dist_t[nid])
				u = String(nid)
		if u == "":
			return {} # exhausted, unreachable
		if u == dst:
			break
		done[u] = true
		for e in (adj.get(u, []) as Array):
			var alt: float = ud + float(e["time_s"])
			var to := String(e["to"])
			if alt < float(dist_t.get(to, 1e18)):
				dist_t[to] = alt
				prev[to] = u
				prev_road[to] = String(e["road"])
	# walk back
	var chain: Array = [dst]
	var roads_order: Array = []
	var len_m := 0.0
	var cur := dst
	while prev.has(cur):
		var r := String(prev_road[cur])
		if roads_order.is_empty() or String(roads_order[0]) != r:
			roads_order.push_front(r)
		cur = String(prev[cur])
		chain.push_front(cur)
	for i in range(chain.size() - 1):
		for e in (adj[chain[i]] as Array):
			if String(e["to"]) == String(chain[i + 1]):
				len_m += float(e["len_m"])
				break
	return {"nodes": chain, "roads": roads_order, "len_m": len_m,
		"time_s": float(dist_t.get(dst, 0.0)),
		"text": " → ".join(PackedStringArray(roads_order))}
