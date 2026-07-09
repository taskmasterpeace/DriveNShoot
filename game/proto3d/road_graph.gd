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


static func build(usmap_ref: ProtoUSMap) -> ProtoRoadGraph:
	var g := ProtoRoadGraph.new()
	g.usmap = usmap_ref
	g._build()
	return g


func _build() -> void:
	if usmap == null or not usmap.ok:
		return
	# 1) Every baked junction is a node; index its legs by road.
	for j in usmap.junctions:
		var nid := String(j["id"])
		nodes[nid] = {"pos": j["pos"], "junction": j}
		adj[nid] = []
		for l in j["legs"]:
			var rid := String(l["road"])
			if not _road_nodes.has(rid):
				_road_nodes[rid] = []
			(_road_nodes[rid] as Array).append({"node": nid, "arc_m": float(l["arc_m"])})
	# 2) Arcs: consecutive nodes along each road, cost = span / kind speed.
	#    separated_pending junctions are NODES but allow NO TRANSFER (0.4) —
	#    they still split arcs (correct: you pass under, you don't turn), and
	#    because both roads list the node, through-travel on each road works
	#    while turning costs infinity (no shared arc is ever emitted for them...
	#    transfer happens by SHARING the node id, so pending nodes get per-road
	#    CLONE ids and the barrier stays honest in the math too).
	for rid in _road_nodes:
		var lst: Array = _road_nodes[rid]
		lst.sort_custom(func(a, b) -> bool: return float(a["arc_m"]) < float(b["arc_m"]))
		var road: Dictionary = usmap.road_by_id(String(rid))
		var mps: float = float(road.get("speed_mps", KIND_SPEED.get(String(road.get("kind", "backroad")), 16.0)))
		for i in range(lst.size() - 1):
			var a: Dictionary = lst[i]
			var b: Dictionary = lst[i + 1]
			var span: float = absf(float(b["arc_m"]) - float(a["arc_m"]))
			if span < 1.0:
				continue
			var an := _travel_node(String(a["node"]), String(rid))
			var bn := _travel_node(String(b["node"]), String(rid))
			(adj[an] as Array).append({"to": bn, "road": String(rid), "len_m": span, "time_s": span / mps})
			(adj[bn] as Array).append({"to": an, "road": String(rid), "len_m": span, "time_s": span / mps})


## separated_pending nodes are per-road clones (no transfer until M2 decks them);
## every other node is shared (that IS the transfer).
func _travel_node(nid: String, rid: String) -> String:
	var j: Dictionary = (nodes.get(nid, {}) as Dictionary).get("junction", {})
	if String(j.get("grade", "flat")) == "separated_pending":
		var cid := "%s@%s" % [nid, rid]
		if not nodes.has(cid):
			nodes[cid] = {"pos": j["pos"], "junction": j}
			adj[cid] = []
		return cid
	return nid


## Nearest graph node to a world position (2D).
func nearest_node(pos: Vector2) -> String:
	var best := ""
	var bd := 1e18
	for nid in nodes:
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
