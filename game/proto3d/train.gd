## THE SEABOARD LINE — the train (SEABOARD goal R4/R5). A KINEMATIC rail-follower:
## its position is a DISTANCE along the rail polyline, so it can never derail, and its
## y rides the track bed by construction, so it can never void (GROUND_INTEGRITY by
## design — no physics body to fall). Locomotive + 2 coaches, box-built like the fleet.
## It shuttles Meridian ↔ Miami forever, DWELLING at each station long enough to board.
## R5 rides on this API: is_dwelling / current_station / board metrics / skip_to_next.
class_name ProtoTrain
extends Node3D

const SPEED := 28.0        ## m/s cruise (~100 km/h — a real seaboard runner)
const FARE_SCRIP := 6      ## the conductor's cut — small, but the ride isn't free
const DWELL_S := 22.0      ## real seconds parked at a platform (time to walk up + board)
const CAR_GAP := 9.8       ## coach spacing along the line (m)
const RAIL_TOP_Y := 0.19   ## the steel's top (world_stream rail build)

var line_id: String = ""
var line_name: String = ""
var pts: PackedVector2Array = PackedVector2Array()
var stations: Array = []       ## [{id, name, pos: Vector2, town_id, mark: float}]
var _cum: PackedFloat32Array = PackedFloat32Array() ## cumulative length per vertex
var total_len: float = 0.0

var dist: float = 0.0          ## the ONE state: distance along the line (m)
var dir_sign: float = 1.0      ## +1 toward the last point (Miami), -1 back home
var dwell: float = 0.0         ## >0 = parked at a platform
var station_idx: int = 0       ## the station we're AT (while dwelling) or last passed
var _cars: Array = []          ## the three bodies (Node3D), index 0 = locomotive


static func create(_main: Node, rail_row: Dictionary) -> ProtoTrain:
	var t := ProtoTrain.new()
	t.line_id = String(rail_row.get("id", ""))
	t.line_name = String(rail_row.get("name", "THE LINE"))
	t.pts = rail_row["pts"]
	t.add_to_group("train")
	# The distance table — the spline the train IS.
	t._cum.resize(t.pts.size())
	t._cum[0] = 0.0
	for i in range(1, t.pts.size()):
		t._cum[i] = t._cum[i - 1] + t.pts[i - 1].distance_to(t.pts[i])
	t.total_len = t._cum[t._cum.size() - 1]
	# Stations get their MARK (distance along the line) by nearest-vertex projection.
	for s in rail_row.get("stations", []):
		var sp: Vector2 = s["pos"]
		var best_d := INF
		var mark := 0.0
		for i in range(t.pts.size() - 1):
			var q := Geometry2D.get_closest_point_to_segment(sp, t.pts[i], t.pts[i + 1])
			var d := sp.distance_to(q)
			if d < best_d:
				best_d = d
				mark = t._cum[i] + t.pts[i].distance_to(q)
		t.stations.append({"id": String(s.get("id", "")), "name": String(s.get("name", "")),
			"pos": sp, "town_id": String(s.get("town_id", "")), "mark": mark})
	t.stations.sort_custom(func(a, b) -> bool: return float(a["mark"]) < float(b["mark"]))
	# The consist — box-built like the fleet: one dark-green loco, two slate coaches.
	for ci in 3:
		var car := Node3D.new()
		var body := MeshInstance3D.new()
		var bm := BoxMesh.new()
		bm.size = Vector3(2.6, 2.2, 9.0) if ci == 0 else Vector3(2.5, 2.0, 8.6)
		body.mesh = bm
		body.material_override = ProtoWorldBuilder.material(
			Color(0.16, 0.30, 0.22) if ci == 0 else Color(0.34, 0.36, 0.40), 0.8)
		body.position.y = 1.55
		car.add_child(body)
		if ci == 0:
			# the nose light — the read that says WHICH WAY it's going
			var lamp := MeshInstance3D.new()
			var lm := BoxMesh.new()
			lm.size = Vector3(0.6, 0.4, 0.2)
			lamp.mesh = lm
			lamp.material_override = ProtoWorldBuilder.material(Color(0.95, 0.9, 0.6), 0.2, true)
			lamp.position = Vector3(0, 1.7, -4.55)
			car.add_child(lamp)
			# THE CAB + roof band (visual judge round 1: "a green container") — one
			# raised cab at the rear and a dark spine flip the silhouette to LOCOMOTIVE.
			var cab := MeshInstance3D.new()
			var cm := BoxMesh.new()
			cm.size = Vector3(2.4, 0.9, 2.2)
			cab.mesh = cm
			cab.material_override = ProtoWorldBuilder.material(Color(0.12, 0.24, 0.18), 0.7)
			cab.position = Vector3(0, 2.6, 2.8)
			car.add_child(cab)
			var spine := MeshInstance3D.new()
			var sm := BoxMesh.new()
			sm.size = Vector3(1.2, 0.25, 6.2)
			spine.mesh = sm
			spine.material_override = ProtoWorldBuilder.material(Color(0.10, 0.12, 0.12), 0.8)
			spine.position = Vector3(0, 2.72, -1.2)
			car.add_child(spine)
		else:
			# the window band — a coach reads as a coach from the top-down camera
			var band := MeshInstance3D.new()
			var wm := BoxMesh.new()
			wm.size = Vector3(2.54, 0.55, 8.0)
			band.mesh = wm
			band.material_override = ProtoWorldBuilder.material(Color(0.72, 0.78, 0.80), 0.3)
			band.position.y = 1.95
			car.add_child(band)
		t.add_child(car)
		t._cars.append(car)
	# Wake at the FIRST station (Meridian Depot), doors open.
	t.station_idx = 0
	t.dist = float(t.stations[0]["mark"]) if not t.stations.is_empty() else 0.0
	t.dwell = DWELL_S
	t._pose()
	return t


func _physics_process(delta: float) -> void:
	if dwell > 0.0:
		dwell -= delta
		if dwell <= 0.0:
			_depart()
		return
	# THE CROSSING LAW: read the next platform BEFORE moving — a tick that jumps past
	# the mark must still ARRIVE there (post-move reads skipped every station: by the
	# time you ask, "next" already points one further down the line).
	var nxt := next_station_index()
	var prev_dist := dist
	dist += SPEED * delta * dir_sign
	if nxt >= 0:
		var mark := float(stations[nxt]["mark"])
		if (dir_sign > 0.0 and prev_dist < mark and dist >= mark) \
				or (dir_sign < 0.0 and prev_dist > mark and dist <= mark):
			_arrive(nxt)
	dist = clampf(dist, 0.0, total_len)
	_pose()


func _depart() -> void:
	# At a terminus the run turns around — the shuttle law.
	if station_idx == 0:
		dir_sign = 1.0
	elif station_idx == stations.size() - 1:
		dir_sign = -1.0
	dwell = 0.0


func _arrive(idx: int) -> void:
	station_idx = idx
	dist = float(stations[idx]["mark"])
	dwell = DWELL_S


## The station we're parked AT (index into stations) — or -1 while rolling.
func dwelling_station() -> int:
	return station_idx if dwell > 0.0 else -1


func is_dwelling() -> bool:
	return dwell > 0.0


## The next platform in the direction of travel (index), or -1 at the end of the run.
func next_station_index() -> int:
	if dir_sign > 0.0:
		for i in stations.size():
			if float(stations[i]["mark"]) > dist + 0.5:
				return i
		return -1
	for i in range(stations.size() - 1, -1, -1):
		if float(stations[i]["mark"]) < dist - 0.5:
			return i
	return -1


## SKIP the leg (the T verb): jump to the next platform and report the REAL seconds
## the ride would have taken — the caller pays that into the clock (60× law).
func skip_to_next_station() -> float:
	var nxt := next_station_index()
	if nxt < 0:
		# END OF THE LINE (ride_sim's return-leg catch): the timed turnaround lives in
		# _depart, but a SKIP is a departure too — the shuttle turns for home here.
		dir_sign = -dir_sign
		nxt = next_station_index()
	if nxt < 0:
		return 0.0
	var leg := absf(float(stations[nxt]["mark"]) - dist)
	_arrive(nxt)
	_pose()
	return leg / SPEED


## Where a rider SITS (coach 1's bench, world space) — the seat-anchor law.
func seat_pos() -> Vector3:
	if _cars.size() > 1:
		return (_cars[1] as Node3D).global_position + Vector3(0, 1.15, 0)
	return global_position + Vector3(0, 1.15, 0)


## Board-side platform point at the CURRENT station (world space) — where E drops you.
func platform_pos() -> Vector3:
	var idx := station_idx if dwell > 0.0 else 0
	var sp: Vector2 = stations[idx]["pos"]
	var hd := _heading_at(dist)
	var perp := Vector2(hd.y, -hd.x)
	# Step off toward the station SHELL side (the town side the placements chose).
	var off := perp * 3.2
	return Vector3(sp.x + off.x, 0.35, sp.y + off.y)


## THE STOP POST — the diegetic schedule board ON the platform (MERIDIAN_LIVE law:
## prompts live in the world, not menus). E while the train dwells here = board it;
## E otherwise = read the line like a timetable. One per station, built by main.
class TrainStop:
	extends StaticBody3D

	var main: Node = null
	var train: ProtoTrain = null
	var station_i: int = 0

	static func create(m: Node, t: ProtoTrain, idx: int) -> TrainStop:
		var s := TrainStop.new()
		s.main = m
		s.train = t
		s.station_i = idx
		s.add_to_group("interactable")
		var post := MeshInstance3D.new()
		var pm := BoxMesh.new()
		pm.size = Vector3(0.16, 2.4, 0.16)
		post.mesh = pm
		post.position.y = 1.2
		post.material_override = ProtoWorldBuilder.material(Color(0.30, 0.28, 0.26), 0.7)
		s.add_child(post)
		var board := MeshInstance3D.new()
		var bm := BoxMesh.new()
		bm.size = Vector3(1.5, 0.9, 0.08)
		board.mesh = bm
		board.position.y = 2.1
		board.material_override = ProtoWorldBuilder.material(Color(0.13, 0.20, 0.16), 0.6)
		s.add_child(board)
		var glyph := Label3D.new()
		glyph.text = "🚉"
		glyph.font_size = 64
		glyph.pixel_size = 0.006
		glyph.billboard = BaseMaterial3D.BILLBOARD_ENABLED
		glyph.position.y = 2.1
		s.add_child(glyph)
		var shape := CollisionShape3D.new()
		var bs := BoxShape3D.new()
		bs.size = Vector3(1.5, 2.6, 0.5)
		shape.shape = bs
		shape.position.y = 1.3
		s.add_child(shape)
		return s

	func interact_position() -> Vector3:
		return global_position

	func interact_prompt(_m: Node) -> String:
		if train == null or not is_instance_valid(train):
			return ""
		if train.dwelling_station() == station_i:
			return "E — 🚉 board %s (%d scrip)" % [train.line_name, ProtoTrain.FARE_SCRIP]
		return "E — 🚉 %s timetable" % train.line_name

	func interact(m: Node) -> void:
		if train == null or not is_instance_valid(train):
			return
		if train.dwelling_station() == station_i:
			if m.has_method("board_train"):
				m.board_train(train)
			return
		# The timetable read — where the train IS on the line, diegetically.
		var here: String = String(train.stations[station_i]["name"])
		var nxt := train.next_station_index()
		var toward: String = String(train.stations[nxt]["name"]) if nxt >= 0 else "the turnaround"
		if m.has_method("notify"):
			m.notify("🚉 %s — the train is out on the line, running toward %s. It calls at %s." %
				[train.line_name, toward, here])


func _point_at(d: float) -> Vector2:
	d = clampf(d, 0.0, total_len)
	for i in range(1, _cum.size()):
		if d <= _cum[i]:
			var seg_len := _cum[i] - _cum[i - 1]
			var t := 0.0 if seg_len <= 0.0 else (d - _cum[i - 1]) / seg_len
			return pts[i - 1].lerp(pts[i], t)
	return pts[pts.size() - 1]


func _heading_at(d: float) -> Vector2:
	d = clampf(d, 0.0, total_len - 0.1)
	for i in range(1, _cum.size()):
		if d < _cum[i]:
			return (pts[i] - pts[i - 1]).normalized()
	return (pts[pts.size() - 1] - pts[pts.size() - 2]).normalized()


func _ready() -> void:
	_pose() # global transforms need the tree — create() staged, the tree poses


func _pose() -> void:
	if not is_inside_tree():
		return # create() calls before add_child — _ready() finishes the job
	# The ROOT rides the locomotive's point — cam_rig.target = train just works, and
	# distance checks read the engine, not the origin. Children pose GLOBALLY below,
	# so moving the root never disturbs them.
	var p0 := _point_at(dist)
	global_position = Vector3(p0.x, RAIL_TOP_Y + 0.36, p0.y)
	# Each car rides the spline at its own distance — never off the steel.
	for ci in _cars.size():
		var cd := clampf(dist - float(ci) * CAR_GAP * dir_sign, 0.0, total_len)
		var p := _point_at(cd)
		var hd := _heading_at(cd)
		var car := _cars[ci] as Node3D
		car.global_position = Vector3(p.x, RAIL_TOP_Y + 0.36, p.y)
		# Nose down the line: local -Z faces travel when yaw = atan2(-hd.x·s, -hd.y·s).
		var f := hd * dir_sign
		car.global_rotation = Vector3(0, atan2(-f.x, -f.y), 0)
