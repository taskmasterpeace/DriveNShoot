## THE LANE GRAPH (THE_ROAD_KIT_AND_LANE_GRAPH.md §3.3-3.4) — the AI foundation the
## road kit carries. Roads give us ribbons; this gives agents something to DRIVE:
## lanes with identity, neighbours that know whether they're legally reachable, and
## JUNCTION CONNECTORS with real geometry plus baked conflict masks.
##
## THE LAW: lane centrelines are DERIVED, never stored — evaluated from the road
## polyline + ProtoUSMap.lane_offset(), so the painted road and the driven road can
## never disagree (the same reason road_geometry() is the one geometry law).
##
## THE ARCHITECTURE (SUMO's, and the reason it scales): expensive conflict analysis
## ONCE at build, a bit lookup FOREVER at runtime. `foes` says whose path crosses
## mine; `response` says whom I must YIELD to. An agent entering a junction checks
## `response & occupied_foes` — one mask AND — instead of reasoning about geometry.
##
## Built once at fold and held globally: the whole map is ~2k lane rows, far cheaper
## than the junction graph already running. No streaming needed; only AGENTS need LOD.
class_name ProtoLaneGraph
extends RefCounted

## Road-class priority for right-of-way. Higher yields to nobody lower.
const KIND_PRIORITY: Dictionary = {
	"interstate": 5, "us_route": 4, "state_road": 3,
	"exit": 3, "county": 2, "street": 1, "dirt": 0,
}
## Cruise speed by road class (m/s) — the per-class limit that does not exist today.
const KIND_SPEED: Dictionary = {
	"interstate": 29.0, "us_route": 22.0, "state_road": 19.0,
	"county": 16.0, "street": 11.0, "dirt": 9.0, "exit": 12.0,
}
const TURN_LAT_ACCEL := 5.5   ## v_turn = sqrt(radius * this) — SUMO's junction turn-speed law
const STITCH_TOL := 0.25      ## connector endpoints round to this to form node keys
const CONNECTOR_PTS := 5      ## a connector is a real polyline — never a teleport

var usmap: ProtoUSMap = null
var lanes: Dictionary = {}       ## lane_id -> lane row
var connectors: Array = []       ## connector rows (ordered; index == bit position in the masks)
var stats: Dictionary = {}

var _road_lanes: Dictionary = {} ## road_id -> { dir -> [lane_id, ...] } (index 0 = innermost)
var _conn_index: Dictionary = {} ## connector id -> index into `connectors` (never linear-scan)


static func build(um: ProtoUSMap) -> ProtoLaneGraph:
	var g := ProtoLaneGraph.new()
	g.usmap = um
	g._build()
	return g


## lane id: "<road>:<+1|-1>:<index>" — index 0 is the INNERMOST lane (nearest the centreline).
static func lane_id(road_id: String, dir: int, lane: int) -> String:
	return "%s:%d:%d" % [road_id, dir, lane]


func _build() -> void:
	if usmap == null or not usmap.ok:
		return
	_build_lanes()
	_build_connectors()
	_build_conflicts()
	stats = {
		"lanes": lanes.size(), "connectors": connectors.size(),
		"roads": usmap.roads.size(), "junctions": usmap.junctions.size(),
	}


# ---- 1) LANE ROWS + ADJACENCY -----------------------------------------------
func _build_lanes() -> void:
	for r in usmap.roads:
		var rid := String(r["id"])
		var kind := String(r.get("kind", "street"))
		var g: Dictionary = ProtoUSMap.road_geometry(r)
		var per_side := int(g["per_side"])
		var divided := bool(g["divided"])
		var speed: float = float(KIND_SPEED.get(kind, 12.0))
		_road_lanes[rid] = {}
		for dir in [1, -1]:
			var ids: Array = []
			for i in range(per_side):
				var lid := lane_id(rid, dir, i)
				lanes[lid] = {
					"id": lid, "road_id": rid, "dir": dir, "lane": i,
					"kind": kind, "speed_mps": speed,
					"successors": [], "predecessors": [],
					"left_id": "", "right_id": "", "left_ok": false, "right_ok": false,
					"is_junction": false, "turn": "",
				}
				ids.append(lid)
			_road_lanes[rid][dir] = ids
		# adjacency INSIDE a direction: index-1 is left (inboard), index+1 is right.
		for dir2 in [1, -1]:
			var ids2: Array = _road_lanes[rid][dir2]
			for i2 in range(ids2.size()):
				var row: Dictionary = lanes[ids2[i2]]
				if i2 > 0:
					row["left_id"] = String(ids2[i2 - 1])
					row["left_ok"] = true    # same direction, same road — a real lane change
				if i2 + 1 < ids2.size():
					row["right_id"] = String(ids2[i2 + 1])
					row["right_ok"] = true
			# THE ONCOMING RULE (Lanelet2's Left vs AdjacentLeft — the single most
			# dangerous conflation in a lane model): on an UNDIVIDED road the inboard
			# neighbour of the innermost lane is the OPPOSING carriageway. It is
			# adjacent, and it is NOT reachable. On a divided road there is a median,
			# so there is no neighbour at all.
			if not divided and ids2.size() > 0:
				var inner: Dictionary = lanes[ids2[0]]
				var opp: Array = _road_lanes[rid][-dir2]
				if opp.size() > 0:
					inner["left_id"] = String(opp[0])
					inner["left_ok"] = false


# ---- 2) JUNCTION CONNECTORS --------------------------------------------------
func _build_connectors() -> void:
	for j in usmap.junctions:
		# A walled crossing is NOT traversable: emit nothing. (Matches road_graph's
		# per-road clone nodes — you pass under, you never turn.)
		if String(j.get("grade", "flat")) != "flat":
			continue
		var legs: Array = j["legs"]
		if legs.size() < 2:
			continue    # end_cap: no through movement to connect
		var jpos: Vector2 = j["pos"]
		# THE JUNCTION BOX — ONE radius for the whole node, taken from the WIDEST leg.
		# A mouth must sit back far enough to clear the road it CROSSES, not its own:
		# using each road's own half-width on I-80 (27.2 m) x I-5 (16.4 m) bunched every
		# connector into a cramped tangle in the middle instead of spanning the node.
		var box_r := 8.0
		for l in legs:
			var lr: Dictionary = usmap.road_by_id(String((l as Dictionary)["road"]))
			if not lr.is_empty():
				box_r = maxf(box_r, float((ProtoUSMap.road_geometry(lr))["width"]) * 0.5)
		box_r += 3.0
		# a == b IS allowed and REQUIRED: a 4-way crossing is stored as ONE row with two
		# legs (the two roads), so the THROUGH movement is road->itself. Skipping it
		# would mean no car can drive straight through a junction — and with no
		# straights, no turn would ever have anything to conflict with.
		for a in range(legs.size()):
			for b in range(legs.size()):
				_connect_leg_pair(j, jpos, String((legs[a] as Dictionary)["road"]),
					String((legs[b] as Dictionary)["road"]), box_r)


func _connect_leg_pair(j: Dictionary, jpos: Vector2, road_in: String, road_out: String, box_r: float) -> void:
	var ri: Dictionary = usmap.road_by_id(road_in)
	var ro: Dictionary = usmap.road_by_id(road_out)
	if ri.is_empty() or ro.is_empty():
		return
	var gi: Dictionary = ProtoUSMap.road_geometry(ri)
	var per_in := int(gi["per_side"])
	var go: Dictionary = ProtoUSMap.road_geometry(ro)
	var per_out := int(go["per_side"])
	for dir_in in [1, -1]:
		var h_in := _heading_at(ri, jpos, dir_in)     # travel direction ARRIVING at the node
		if h_in == Vector2.ZERO:
			continue
		# there must be road BEHIND the node to arrive from (a road that starts here
		# has no inbound approach in this direction)
		if not _has_road(ri, jpos, -dir_in, box_r):
			continue
		for dir_out in [1, -1]:
			var h_out := _heading_at(ro, jpos, dir_out)  # travel direction LEAVING the node
			if h_out == Vector2.ZERO:
				continue
			# ...and road AHEAD to leave onto (a road that ENDS here offers no exit —
			# this is what keeps a tee from inventing a through movement)
			if not _has_road(ro, jpos, dir_out, box_r):
				continue
			# a connector must not double back on itself (that is a U-turn, not a turn)
			if h_in.dot(h_out) < -0.85:
				continue
			var turn := _turn_of(h_in, h_out)
			for li in range(per_in):
				for lo in range(per_out):
					if not _turn_allowed(turn, li, per_in):
						continue
					_emit_connector(j, jpos, ri, ro, dir_in, li, dir_out, lo, h_in, h_out, turn, box_r)


## THE TURN RULE — re3's shipped law, zero authoring required: the innermost lane may
## turn left, the outermost may turn right, and a road with fewer than 3 lanes per side
## may always go straight.
func _turn_allowed(turn: String, lane: int, per_side: int) -> bool:
	match turn:
		"left":
			return lane == 0
		"right":
			return lane == per_side - 1
		_:
			return per_side < 3 or (lane > 0 and lane < per_side - 1) or per_side <= 2


func _emit_connector(j: Dictionary, jpos: Vector2, ri: Dictionary, ro: Dictionary,
		dir_in: int, lane_in: int, dir_out: int, lane_out: int,
		h_in: Vector2, h_out: Vector2, turn: String, box_r: float) -> void:
	var id_in := lane_id(String(ri["id"]), dir_in, lane_in)
	var id_out := lane_id(String(ro["id"]), dir_out, lane_out)
	if not lanes.has(id_in) or not lanes.has(id_out):
		return
	# lane mouths: the junction point pushed out along each road, offset to the lane.
	var off_in: float = ProtoUSMap.lane_offset(ri, lane_in)
	var off_out: float = ProtoUSMap.lane_offset(ro, lane_out)
	var p_in := jpos - h_in * box_r + Vector2(-h_in.y, h_in.x) * off_in
	var p_out := jpos + h_out * box_r + Vector2(-h_out.y, h_out.x) * off_out
	if p_in.distance_to(p_out) < 0.5:
		return    # degenerate — never emit a zero-length connector
	# geometry: quadratic blend whose control point is where the two LANE CENTRELINES
	# meet (re3's CalcCurvePoint idea). Using the node centre instead would bow even a
	# straight-through movement toward the middle, so through lanes would hug their own
	# side and never cross anything — which is exactly how the conflict analysis came
	# back empty. A straight movement has parallel rays, so it falls back to a midpoint
	# and comes out as a real straight line at its lane offset.
	var pts := PackedVector2Array()
	if turn == "straight":
		# a through movement is a straight line at its lane offset — subdividing it buys
		# nothing and costs the conflict pass 4x the segment tests (this is most of the
		# build time, because straights are the commonest connector).
		pts.append(p_in)
		pts.append(p_out)
	else:
		var ctrl := _ray_meet(p_in, h_in, p_out, h_out)
		for s in range(CONNECTOR_PTS):
			var u := float(s) / float(CONNECTOR_PTS - 1)
			var iv := 1.0 - u
			pts.append(p_in * (iv * iv) + ctrl * (2.0 * iv * u) + p_out * (u * u))
	var chord := p_in.distance_to(p_out)
	var radius: float = maxf(6.0, chord * 0.5)
	var sp_in: float = float((lanes[id_in] as Dictionary)["speed_mps"])
	var sp_out: float = float((lanes[id_out] as Dictionary)["speed_mps"])
	var v_turn: float = minf(sp_in, sp_out)
	if turn != "straight":
		v_turn = clampf(sqrt(radius * TURN_LAT_ACCEL), 3.0, v_turn)
	# cached AABB — the broad phase for conflict analysis (skip pairs that can't touch).
	# GROW IT: a straight-through connector is an axis-aligned line, so its box has ZERO
	# thickness, and Rect2.intersects() rejects degenerate boxes — which silently threw
	# away every conflict pair before the geometry test ever ran.
	var aabb := Rect2(pts[0], Vector2.ZERO)
	for pv in pts:
		aabb = aabb.expand(pv)
	aabb = aabb.grow(0.5)
	var cid := "C%d" % connectors.size()
	var row := {
		"id": cid, "junction": String(j.get("id", "")), "is_junction": true,
		"from": id_in, "to": id_out, "turn": turn, "pts": pts, "aabb": aabb,
		"v_turn": v_turn, "control": String(j.get("control", "none")),
		"kind_in": String(ri.get("kind", "street")),
		# GOTCHA (paid for): these MUST be plain Arrays, not PackedInt32Array. Packed
		# arrays are VALUE types in GDScript — `(row["foes"] as PackedInt32Array).append(x)`
		# appends to a throwaway copy and the stored array never changes, so every
		# conflict was computed correctly and then silently discarded.
		"foes": [], "response": [],
	}
	_conn_index[cid] = connectors.size()
	connectors.append(row)
	(lanes[id_in]["successors"] as Array).append(cid)
	(lanes[id_out]["predecessors"] as Array).append(cid)


# ---- 3) CONFLICT MASKS (the bake-time analysis that makes runtime a bit lookup) ---
func _build_conflicts() -> void:
	# group by junction — connectors can only conflict inside the same node
	var by_j: Dictionary = {}
	for i in range(connectors.size()):
		var jid := String((connectors[i] as Dictionary)["junction"])
		if not by_j.has(jid):
			by_j[jid] = []
		(by_j[jid] as Array).append(i)
	for jid in by_j:
		var idx: Array = by_j[jid]
		for a in range(idx.size()):
			for b in range(a + 1, idx.size()):
				var ia: int = idx[a]
				var ib: int = idx[b]
				var ca: Dictionary = connectors[ia]
				var cb: Dictionary = connectors[ib]
				# same approach lane never conflicts with itself
				if String(ca["from"]) == String(cb["from"]):
					continue
				# broad phase first — most pairs at a node never come near each other
				if not (ca["aabb"] as Rect2).intersects(cb["aabb"] as Rect2):
					continue
				if not _paths_cross(ca["pts"], cb["pts"]):
					continue
				(ca["foes"] as Array).append(ib)
				(cb["foes"] as Array).append(ia)
				# RESPONSE is asymmetric and a strict subset of foes: exactly one of the
				# pair yields. A mutual yield is a guaranteed deadlock, so we never set
				# both — priority, then turn class, then a deterministic tiebreak.
				var yielder := _who_yields(ca, cb, ia, ib)
				if yielder == ia:
					(ca["response"] as Array).append(ib)
				else:
					(cb["response"] as Array).append(ia)


## Returns the connector index that must YIELD. Road class first (an interstate never
## yields to a dirt track), then turn class (a left turn yields to straight/right),
## then a deterministic index tiebreak so the result is stable across bakes.
func _who_yields(ca: Dictionary, cb: Dictionary, ia: int, ib: int) -> int:
	var pa: int = int(KIND_PRIORITY.get(String(ca["kind_in"]), 1))
	var pb: int = int(KIND_PRIORITY.get(String(cb["kind_in"]), 1))
	if pa != pb:
		return ia if pa < pb else ib
	var ta := String(ca["turn"])
	var tb := String(cb["turn"])
	if ta != tb:
		if ta == "left":
			return ia
		if tb == "left":
			return ib
		return ia if ta == "straight" and tb == "right" else ib
	return maxi(ia, ib)


func _paths_cross(pa: PackedVector2Array, pb: PackedVector2Array) -> bool:
	for i in range(pa.size() - 1):
		for k in range(pb.size() - 1):
			if _seg_hit(pa[i], pa[i + 1], pb[k], pb[k + 1]):
				return true
	return false


func _seg_hit(a1: Vector2, a2: Vector2, b1: Vector2, b2: Vector2) -> bool:
	var d1 := a2 - a1
	var d2 := b2 - b1
	var den := d1.x * d2.y - d1.y * d2.x
	if absf(den) < 1e-9:
		return false
	var dp := b1 - a1
	var t := (dp.x * d2.y - dp.y * d2.x) / den
	var u := (dp.x * d1.y - dp.y * d1.x) / den
	# strict interior crossing: shared mouths must not count as a conflict
	return t > 0.02 and t < 0.98 and u > 0.02 and u < 0.98


# ---- helpers ------------------------------------------------------------------
## Travel heading of `road` in direction `dir` at the point nearest `p`.
func _heading_at(road: Dictionary, p: Vector2, dir: int) -> Vector2:
	var pts: PackedVector2Array = road["pts"]
	var best := 1e18
	var h := Vector2.ZERO
	for i in range(pts.size() - 1):
		var d := ProtoUSMap._seg_dist(p, pts[i], pts[i + 1])
		if d < best:
			best = d
			var seg := pts[i + 1] - pts[i]
			if seg.length() > 0.001:
				h = seg.normalized() * float(dir)
	return h


## Where the outgoing lane's centreline (run backwards) meets the incoming lane's
## centreline (run forwards). Parallel rays (a straight-through movement) have no
## meeting point, so we fall back to the midpoint — which yields a straight line.
func _ray_meet(p_in: Vector2, h_in: Vector2, p_out: Vector2, h_out: Vector2) -> Vector2:
	var den := h_in.x * h_out.y - h_in.y * h_out.x
	if absf(den) < 1e-4:
		return (p_in + p_out) * 0.5
	var d := p_out - p_in
	var t := (d.x * h_out.y - d.y * h_out.x) / den
	# keep the corner sane: never let a near-parallel pair fling the control point away
	var chord := p_in.distance_to(p_out)
	t = clampf(t, 0.0, chord * 1.5)
	return p_in + h_in * t


## Does `road` continue past `p` in travel direction `dir`? A road that TERMINATES at the
## node offers no exit that way (and no approach from the other side) — this is what stops
## a tee from inventing a through movement onto a road that isn't there.
func _has_road(road: Dictionary, p: Vector2, dir: int, box_r: float) -> bool:
	var pts: PackedVector2Array = road["pts"]
	if pts.size() < 2:
		return false
	var term: Vector2 = pts[pts.size() - 1] if dir > 0 else pts[0]
	return p.distance_to(term) > box_r + 2.0


func _turn_of(h_in: Vector2, h_out: Vector2) -> String:
	var cross := h_in.x * h_out.y - h_in.y * h_out.x
	var dot := h_in.dot(h_out)
	if dot > 0.80:
		return "straight"
	# top-down, +Y is "down": a positive cross product turns RIGHT of travel
	return "right" if cross > 0.0 else "left"


# ---- QUERY API (what the agent loop calls) ------------------------------------
## Every connector leaving this lane.
func exits_from(lid: String) -> Array:
	if not lanes.has(lid):
		return []
	var out: Array = []
	for cid in (lanes[lid] as Dictionary)["successors"]:
		out.append(_connector_by_id(String(cid)))
	return out


## The lane a connector delivers you onto.
func lane_after(connector_id: String) -> String:
	var c := _connector_by_id(connector_id)
	return String(c.get("to", "")) if not c.is_empty() else ""


## May I move sideways from `lid`? Honors the oncoming rule.
func lane_change_target(lid: String, to_left: bool) -> String:
	if not lanes.has(lid):
		return ""
	var row: Dictionary = lanes[lid]
	var ok: bool = bool(row["left_ok"]) if to_left else bool(row["right_ok"])
	return String(row["left_id"] if to_left else row["right_id"]) if ok else ""


func _connector_by_id(cid: String) -> Dictionary:
	if not _conn_index.has(cid):
		return {}
	return connectors[int(_conn_index[cid])]
