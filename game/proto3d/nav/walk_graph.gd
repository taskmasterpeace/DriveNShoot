## THE WALK GRAPH v0 (NAVIGATION.md §3/§9.2 — rows, not mesh): a town's walkable
## bones derived at fold time from rows that already exist — a RING (the street
## stand-in), a DOOR + CURB spoke per doored placement, one PLAZA hub. Street
## kits upgrade the DATA later (same schema); NavigationServer stays the named
## escape hatch only if nav_walk_sim ever fails a downtown grid.
## Graph shape: {nodes: {id: Vector2}, adj: {id: [{to, cost}]}} — A* in µs.
class_name ProtoWalkGraph
extends RefCounted

const RING_SPACING := 60.0
const SIDEWALK_OFF := 3.0
const WALK_MPS := 1.4

var nodes: Dictionary = {} ## id -> Vector2
var adj: Dictionary = {}   ## id -> Array[{to: String, cost: float}]
var doors: Dictionary = {} ## placement_id -> door node id
var warnings: Array = []
var _rects: Array = [] ## [center: Vector2, half: Vector2, rot: float] — building footprints (edge LOS law)


## v0 lesson (sim-paid): an edge is a PROMISE — it must not cross a building.
## Pure row math: segment vs every known footprint OBB (inflated 0.8 m for the
## walker's shoulders). Whiskers handle furniture; the GRAPH handles walls.
func seg_clear(a: Vector2, b: Vector2) -> bool:
	for r in _rects:
		var c: Vector2 = r[0]
		var half: Vector2 = r[1]
		var rot: float = r[2]
		# into the rect's local frame (rotate by -rot; local +Z axis = (sin,cos))
		var la := (a - c).rotated(-rot)
		var lb := (b - c).rotated(-rot)
		# slab test: segment vs AABB [-half, +half]
		var t0 := 0.0
		var t1 := 1.0
		var d := lb - la
		var hit := true
		for axis in 2:
			var lo := -(half.x if axis == 0 else half.y)
			var hi := (half.x if axis == 0 else half.y)
			var p := la.x if axis == 0 else la.y
			var dd := d.x if axis == 0 else d.y
			if absf(dd) < 0.0001:
				if p < lo or p > hi:
					hit = false
					break
			else:
				var ta := (lo - p) / dd
				var tb := (hi - p) / dd
				if ta > tb:
					var tmp := ta
					ta = tb
					tb = tmp
				t0 = maxf(t0, ta)
				t1 = minf(t1, tb)
				if t0 > t1:
					hit = false
					break
		if hit:
			return false
	return true


static func build_for_town(um: ProtoUSMap, town: Dictionary, extra_rects: Array = []) -> ProtoWalkGraph:
	var g := ProtoWalkGraph.new()
	g._rects = extra_rects.duplicate()
	g._build(um, town)
	return g


func _edge(a: String, b: String) -> void:
	var cost := (nodes[a] as Vector2).distance_to(nodes[b] as Vector2) / WALK_MPS
	if not adj.has(a):
		adj[a] = []
	if not adj.has(b):
		adj[b] = []
	(adj[a] as Array).append({"to": b, "cost": cost})
	(adj[b] as Array).append({"to": a, "cost": cost})


func _build(um: ProtoUSMap, town: Dictionary) -> void:
	var c: Vector2 = town["pos"]
	DrivnData.ensure_structures()
	# the town's doored placements (catalog rows with entrances — §3's source)
	var pl: Array = []
	var spread := 60.0
	for p in um.placements:
		var d: float = (p["pos"] as Vector2).distance_to(c)
		if d > 400.0:
			continue
		var row: DrivnStructure = DrivnData.structures.get(String(p["building"]))
		if row == null:
			continue
		# EVERY known footprint blocks edges (the derby bowl is a wall too)
		_rects.append([p["pos"] as Vector2, Vector2(row.footprint_m.x * 0.5 + 0.8, row.footprint_m.y * 0.5 + 0.8),
			float(p.get("rot", 0.0))])
		if not row.enterable or row.entrances.is_empty():
			continue
		pl.append(p)
		spread = maxf(spread, d + 20.0)
	# 1) THE RING — OUTSIDE the doored cluster (a ring through the derby bowl is
	# a path through a wall; v0's promise is clear bones, whiskers do the rest)
	var r_ring := spread * 1.15
	var n_ring := clampi(int(ceil(TAU * r_ring / RING_SPACING)), 8, 28)
	for i in range(n_ring):
		var ang := TAU * float(i) / float(n_ring)
		nodes["ring%d" % i] = c + Vector2(cos(ang), sin(ang)) * r_ring
	for i in range(n_ring):
		var a_id := "ring%d" % i
		var b_id := "ring%d" % ((i + 1) % n_ring)
		if seg_clear(nodes[a_id] as Vector2, nodes[b_id] as Vector2):
			_edge(a_id, b_id)
	# 2) (v0 lesson, sim-paid: NO physical hub at the town center — Meridian's
	# center IS the safehouse, and a waypoint inside a building pins walkers
	# against its wall forever. The ring is a connected cycle; doors reach
	# everything through it. A plaza node returns with street kits, on a
	# verified-open slab.)
	# 3) DOOR + CURB spokes: the door sits at the FRONT face (local +Z, the
	#    builder's real gap), rotated by the placement's rot
	for p in pl:
		var pid := String(p["id"])
		var row: DrivnStructure = DrivnData.structures.get(String(p["building"]))
		var rot := float(p.get("rot", 0.0))
		var half_d: float = row.footprint_m.y * 0.5
		var face := Vector2(sin(rot), cos(rot)) # local +Z in world, matches the shell's yaw
		var door_pos: Vector2 = (p["pos"] as Vector2) + face * (half_d + 1.2)
		var did := "door_%s" % pid
		nodes[did] = door_pos
		doors[pid] = did
		# curb: 8 m OUT THE DOOR along its own face — geometrically guaranteed
		# clear of the building it serves; the ring link rides from there
		var cid := "curb_%s" % pid
		nodes[cid] = door_pos + face * 8.0
		_edge(did, cid) # door→curb is clear by construction (out its own face)
		# curb→ring: the NEAREST ring node with a CLEAR line (the LOS law)
		var ring_by_d: Array = []
		for i in range(n_ring):
			ring_by_d.append([(nodes["ring%d" % i] as Vector2).distance_squared_to(nodes[cid] as Vector2), "ring%d" % i])
		ring_by_d.sort_custom(func(x, y) -> bool: return float(x[0]) < float(y[0]))
		for rd in ring_by_d:
			if seg_clear(nodes[cid] as Vector2, nodes[String(rd[1])] as Vector2):
				_edge(cid, String(rd[1]))
				break
	# 4) THE CURB WEB (v0 lesson, sim-paid): curbs link to their 3 nearest
	# sibling curbs so in-town walks hop street-to-street instead of detouring
	# around the perimeter ring — curbs sit in the OPEN (8 m off their door),
	# so curb-to-curb lines are street lines; whiskers handle the furniture.
	var curb_ids: Array = []
	for pid in doors:
		curb_ids.append("curb_%s" % pid)
	for cid_a in curb_ids:
		var dists: Array = []
		for cid_b in curb_ids:
			if cid_b == cid_a:
				continue
			dists.append([(nodes[cid_a] as Vector2).distance_to(nodes[cid_b] as Vector2), cid_b])
		dists.sort_custom(func(x, y) -> bool: return float(x[0]) < float(y[0]))
		var added := 0
		for kd in dists:
			if added >= 3:
				break
			var cid_b := String(kd[1])
			var dup := false
			for e in (adj.get(cid_a, []) as Array):
				if String(e["to"]) == cid_b:
					dup = true
			if dup:
				added += 1
				continue
			# THE LOS LAW: a curb link that crosses a building is a lie — skip
			# to the next-nearest until three honest links stand
			if seg_clear(nodes[cid_a] as Vector2, nodes[cid_b] as Vector2):
				_edge(String(cid_a), cid_b)
				added += 1

	# 5) island audit: every door must reach the ring (fold-time WARN + spoke)
	for pid in doors:
		if a_star(String(doors[pid]), "ring0").is_empty():
			warnings.append("island door %s — long-spoked" % pid)
			_edge(String(doors[pid]), "ring0")


func nearest_node(pos: Vector2) -> String:
	var best := ""
	var bd := 1e18
	for id in nodes:
		var d: float = (nodes[id] as Vector2).distance_squared_to(pos)
		if d < bd:
			bd = d
			best = String(id)
	return best


## The entry hop obeys the LOS law too — the nearest node YOU CAN ACTUALLY
## WALK TO in a straight line (falls back to plain nearest if boxed in).
func nearest_visible_node(pos: Vector2) -> String:
	var by_d: Array = []
	for id in nodes:
		by_d.append([(nodes[id] as Vector2).distance_squared_to(pos), id])
	by_d.sort_custom(func(x, y) -> bool: return float(x[0]) < float(y[0]))
	for kd in by_d:
		if seg_clear(pos, nodes[String(kd[1])] as Vector2):
			return String(kd[1])
	return nearest_node(pos)


## A* (straight-line/walk-speed heuristic). Returns node ids, [] if unreachable.
func a_star(from_id: String, to_id: String) -> Array:
	if not nodes.has(from_id) or not nodes.has(to_id):
		return []
	var open: Dictionary = {from_id: 0.0}
	var g_cost: Dictionary = {from_id: 0.0}
	var prev: Dictionary = {}
	var closed: Dictionary = {}
	while not open.is_empty():
		var cur := ""
		var cf := 1e18
		for id in open:
			if float(open[id]) < cf:
				cf = float(open[id])
				cur = String(id)
		if cur == to_id:
			var path: Array = [cur]
			while prev.has(cur):
				cur = String(prev[cur])
				path.push_front(cur)
			return path
		open.erase(cur)
		closed[cur] = true
		for e in (adj.get(cur, []) as Array):
			var to := String(e["to"])
			if closed.has(to):
				continue
			var ng: float = float(g_cost[cur]) + float(e["cost"])
			if ng < float(g_cost.get(to, 1e18)):
				g_cost[to] = ng
				prev[to] = cur
				open[to] = ng + (nodes[to] as Vector2).distance_to(nodes[to_id] as Vector2) / WALK_MPS
	return []
