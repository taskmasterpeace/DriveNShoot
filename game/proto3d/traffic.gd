## THE TRAFFIC SYSTEM (docs/design/ROAD_TRAFFIC_OVERHAUL.md §3.4): the world
## drives itself, cheaply. Agents are PATH FOLLOWERS on the road polylines —
## right-hand lane law off the same geometry rows the streamer paints, simple
## car-following (never through a leader), and EXITS as the only doors off the
## highway (take the ramp, despawn at the location; merge on at a ramp mouth).
## The one law that makes it REAL: touch an agent — bumper or bullet — and it
## PROMOTES in place to a full ProtoCar3D (matched velocity, forwarded damage,
## stealable, 5-part damageable). Ambient flow costs a transform write per
## agent per frame; physics only ever exists where the player is looking at it.
##
## Every knob is a TRAFFIC row (code floor) folded additively from
## data/traffic.json — the motions.json law, third door F10's reload.
class_name ProtoTraffic
extends Node3D

const CAR_LEN: float = 4.4
const ACCEL: float = 7.0          ## m/s² toward the desired speed
const EXIT_TRIGGER_M: float = 34.0 ## how close to an exit anchor the take-roll happens
const HONK_COOLDOWN_S: float = 4.0

static var TRAFFIC: Dictionary = {
	"budget": 12.0,          # ambient agents alive at once (0 = empty roads)
	"spawn_r_min": 260.0,    # the band: materialize this far out...
	"spawn_r_max": 420.0,
	"despawn_r": 550.0,      # ...and dissolve past this
	"headway_s": 1.6,        # following distance in seconds of travel
	"min_gap_m": 8.0,        # the hard floor — never closer than this
	"turn_chance": 0.35,     # odds an ambient car turns off at a node it reaches
	"speed_lanes_2": 16.0,   # cruise by road class (m/s)
	"speed_lanes_4": 21.0,
	"speed_lanes_6": 26.0,
	"speed_jitter": 0.15,    # per-agent spread (±15% — some drivers are like that)
	"exit_take_chance": 0.35, # how alive the exits feel
	"merge_chance": 0.3,     # share of spawns that enter AT a ramp mouth
	"promote_cap": 5.0,      # max simultaneous promoted physics cars
	"maintain_s": 1.2,       # seconds between spawn/cull passes
	"honk_brake_mps2": 6.0,  # a brake harder than this earns you a horn
	"vanish_r_min": 240.0,   # NEVER dissolve inside this of the player — arrivals PARK instead
	"trip_chance": 1.0,      # share of ambient spawns given a DESTINATION exit ahead (owner: every car is going somewhere)
	"convoy_chance": 0.18,   # share of ambient spawns that are CONVOYS (balance 2026-07-08: 0.25 read as a parade)
}
static var _folded: bool = false


static func ensure_rows() -> void:
	if _folded:
		return
	_folded = true
	fold_file(TRAFFIC)


## The additive fold (fold_motion_file's law, flat): data overrides stock number
## by number, unknown knobs welcome — a new dial in traffic.json needs no code.
static func fold_file(into: Dictionary, path: String = "res://data/traffic.json") -> void:
	if not FileAccess.file_exists(path):
		return
	var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string(path))
	if not (parsed is Dictionary):
		return
	var rows: Dictionary = (parsed as Dictionary).get("traffic", {})
	for k in rows:
		var v: Variant = rows[k]
		if v is float or v is int:
			into[String(k)] = float(v)


var main: Node = null
var usmap: ProtoUSMap = null
var rng := RandomNumberGenerator.new()
var _lanes: ProtoLaneGraph = null ## THE LANE GRAPH — built lazily on first transfer
var agents: Array = []
var _promoted: Array = []
var _maintain_t: float = 0.0
var _honk_t: float = 0.0
var _arc_cache: Dictionary = {} ## road_id -> PackedFloat32Array of cumulative seg lengths


## ONE ambient car: an AnimatableBody3D shell the road moves. take_damage is the
## promotion door (hitscan/blast find it via has_method, same as everything).
class TrafficAgent extends AnimatableBody3D:
	var traffic: ProtoTraffic = null
	var road_id: String = ""
	var seg_i: int = 0
	var s_ab: float = 0.0      ## distance along the segment, measured a->b ALWAYS
	var dir: int = 1           ## +1 travels a->b, -1 travels b->a
	var lane: int = 0
	var speed: float = 0.0
	var cruise: float = 20.0
	var tint: Color = Color(0.5, 0.5, 0.5)
	var _exit_rolled: String = "" ## last exit id already decided on (roll once each)
	## THE TRIP (owner: "vehicles trying to go somewhere"): the exit this car is
	## HEADED FOR. It leaves the highway there — dice never enter into it. "" =
	## through-traffic riding to the region's far end (also a destination).
	var dest_exit_id: String = ""
	var arrived: bool = false ## reached its destination but can't resolve yet (promote cap, in view)
	## CONVOYS (BANDIT_CONVOY_ECOSYSTEM.md §3.1 v1): a shared id makes 2-3 agents
	## ONE STORY — same destination, tight column, and touching any member makes
	## the whole convoy real. cargo names the loot the trucks actually haul.
	var convoy_id: String = ""
	var cargo: String = ""

	func take_damage(amount: float) -> void:
		if traffic != null:
			traffic.promote(self, amount)


static func create(main_in: Node, usmap_in: ProtoUSMap) -> ProtoTraffic:
	ensure_rows()
	var t := ProtoTraffic.new()
	t.main = main_in
	t.usmap = usmap_in
	t.rng.randomize()
	return t


func _physics_process(delta: float) -> void:
	_tick(delta)


## The whole system is a function of accumulated delta (the ProtoStrikePlayer
## determinism pattern) — sims drive this directly with a manual clock.
func _tick(delta: float) -> void:
	if usmap == null or not usmap.ok:
		return
	_honk_t = maxf(0.0, _honk_t - delta)
	_maintain_t -= delta
	if _maintain_t <= 0.0:
		_maintain_t = float(TRAFFIC["maintain_s"])
		_maintain()
	_promoted = _promoted.filter(func(c): return is_instance_valid(c) and not c.dead)
	agents = agents.filter(func(a): return is_instance_valid(a))
	# Bucket by (road, dir, lane) for the following law.
	var buckets: Dictionary = {}
	for a in agents:
		var ag := a as TrafficAgent
		var bk := "%s|%d|%d" % [ag.road_id, ag.dir, ag.lane]
		if not buckets.has(bk):
			buckets[bk] = []
		(buckets[bk] as Array).append(ag)
	for bk in buckets:
		var group: Array = buckets[bk]
		group.sort_custom(func(x, y): return _travel_arc(x) < _travel_arc(y))
		for i in group.size():
			var ag: TrafficAgent = group[i]
			var leader: TrafficAgent = group[i + 1] if i + 1 < group.size() else null
			_advance(ag, delta, leader)


## Cumulative a->b arc to the agent's position, flipped so it always GROWS in
## the travel direction — the sortable "how far down the road am I".
func _travel_arc(ag: TrafficAgent) -> float:
	var road := _road(ag.road_id)
	if road.is_empty():
		return 0.0
	var cum := _cum(road)
	var arc_ab: float = cum[ag.seg_i] + ag.s_ab
	return arc_ab if ag.dir > 0 else (cum[cum.size() - 1] - arc_ab)


func _advance(ag: TrafficAgent, delta: float, leader: TrafficAgent) -> void:
	var road := _road(ag.road_id)
	if road.is_empty():
		despawn_agent(ag)
		return
	var pts: PackedVector2Array = road["pts"]
	# --- the following law: leader agent, or the PLAYER's car projected in-lane
	var desired := ag.cruise
	var lead_arc := 1e18
	var lead_speed := 0.0
	if leader != null:
		lead_arc = _travel_arc(leader)
		lead_speed = leader.speed
	var pcar: Node3D = _car_ahead(ag)
	if pcar != null:
		var parc := _car_travel_arc(ag, pcar)
		if parc < lead_arc and parc > _travel_arc(ag):
			lead_arc = parc
			var vel: Vector3 = pcar.linear_velocity if "linear_velocity" in pcar else Vector3.ZERO
			lead_speed = maxf(0.0, Vector2(vel.x, vel.z).length())
	var blocked := false
	if lead_arc < 1e17:
		var gap := lead_arc - _travel_arc(ag) - CAR_LEN
		var min_gap := float(TRAFFIC["min_gap_m"])
		if gap < min_gap:
			desired = 0.0
			blocked = true
		else:
			# THE STOPPING-DISTANCE LAW. A bare time headway is a LIE at highway speed: 1.6 s
			# at 24 m/s starts the brake at 38 m, but shedding 24 m/s at ACCEL 7 m/s^2 needs
			# v^2/2a = 41 m — the agent could not stop in the distance it began stopping in, so
			# it coasted into the back of a parked rig. Target instead the fastest speed it can
			# STILL stop from: v = sqrt(2a * slack) + the leader's own speed. That decays
			# smoothly to the leader's pace at min_gap, where the old
			# `lead_speed * (gap/follow_dist)` collapsed to a 0.5 m/s crawl the moment a PARKED
			# leader came into range — braking 95 m early and stranding every trip.
			var v_stop := sqrt(2.0 * ACCEL * (gap - min_gap)) + lead_speed
			# Headway is comfort RELATIVE TO THE LEADER, never an absolute speed cap: as
			# `gap / headway_s` it forced 1.6 s of absolute spacing (41 m at cruise), which
			# tore convoy columns apart and stranded arrivals that never closed on their
			# destination. Closing speed is what a headway actually governs.
			var comfort := lead_speed + (gap - min_gap) / float(TRAFFIC["headway_s"])
			var cap := minf(v_stop, comfort)
			if cap < desired:
				desired = cap
				blocked = true
	var was := ag.speed
	ag.speed = move_toward(ag.speed, desired, ACCEL * delta)
	# a hard brake near the player earns a HORN (the world has opinions)
	if was - ag.speed > float(TRAFFIC["honk_brake_mps2"]) * delta and _honk_t <= 0.0 \
			and pcar != null and main != null and "audio" in main and main.audio != null:
		_honk_t = HONK_COOLDOWN_S
		main.audio.play_at("horn", ag.global_position, -4.0)
	# --- exits: the only doors off the highway (roll once per exit approach)
	_maybe_take_exit(ag, road)
	_maybe_turn(ag, blocked)
	if not is_instance_valid(ag):
		return
	# --- advance along the polyline (s_ab is a->b; dir signs the step)
	ag.s_ab += ag.speed * delta * float(ag.dir)
	while true:
		var a2: Vector2 = pts[ag.seg_i]
		var b2: Vector2 = pts[ag.seg_i + 1]
		var seg_len := a2.distance_to(b2)
		if ag.s_ab > seg_len and ag.dir > 0:
			if ag.seg_i + 1 >= pts.size() - 1:
				if _maybe_transfer(ag):
					return # took a connector onto the next road — kept driving
				_arrive(ag) # nowhere to go from here: it got where it was going
				return
			ag.s_ab -= seg_len
			ag.seg_i += 1
		elif ag.s_ab < 0.0 and ag.dir < 0:
			if ag.seg_i <= 0:
				if _maybe_transfer(ag):
					return
				_arrive(ag)
				return
			ag.seg_i -= 1
			ag.s_ab += pts[ag.seg_i].distance_to(pts[ag.seg_i + 1])
		else:
			break
	# HAND-BUILT LAND IS A DESTINATION, NOT A ROAD (the dirt-driving bug): a ramp
	# whose polyline runs into the authored compound ends AT its edge — the agent
	# arrives there, it never drives through the safehouse on dirt.
	if String(road["kind"]) == "exit":
		var nxt := _centerline_point(ag, road)
		if ProtoWorldStream.AUTHORED.grow(8.0).has_point(nxt):
			_arrive(ag)
			return
	_place(ag, road)


## World placement: centerline point + the geometry law's lane offset on the
## RIGHT of travel; yaw faces travel. The paint and the traffic can't disagree —
## they read the same row.
func _place(ag: TrafficAgent, road: Dictionary) -> void:
	var pts: PackedVector2Array = road["pts"]
	var a2: Vector2 = pts[ag.seg_i]
	var b2: Vector2 = pts[ag.seg_i + 1]
	var d := (b2 - a2).normalized()
	var heading := d * float(ag.dir)
	var right := Vector2(-heading.y, heading.x)
	var lat := right * ProtoUSMap.lane_offset(road, ag.lane)
	var p := a2 + d * ag.s_ab + lat
	var y := ProtoWorldBuilder.ground_y(p.x, p.y) + 0.62
	ag.global_position = Vector3(p.x, y, p.y)
	ag.rotation.y = atan2(-heading.x, -heading.y) # -Z forward, same as every rig here


## The agent's centerline point (2D) — where its lane math anchors this frame.
func _centerline_point(ag: TrafficAgent, road: Dictionary) -> Vector2:
	var pts: PackedVector2Array = road["pts"]
	var a2: Vector2 = pts[ag.seg_i]
	var d := (pts[ag.seg_i + 1] - a2).normalized()
	return a2 + d * ag.s_ab


## ANY real car sitting on this agent's road-side within range is a blocker —
## the player's, a parked promotion, a wreck (owner bug: an agent ghosted through
## a PARKED rig; the old check only ever looked at the active car). Nearest ahead
## wins; the caller projects it as the lane leader.
func _car_ahead(ag: TrafficAgent) -> Node3D:
	if main == null or not ("cars" in main):
		return null
	var road := _road(ag.road_id)
	var pts: PackedVector2Array = road["pts"]
	var a2: Vector2 = pts[ag.seg_i]
	var b2: Vector2 = pts[ag.seg_i + 1]
	var d := (b2 - a2).normalized()
	var half_w := float(ProtoUSMap.road_geometry(road)["width"]) * 0.5 + 2.0
	var my_side := 1.0 if ag.dir > 0 else -1.0 # dir +1 rides right of a->b = positive lat
	var my_arc := _travel_arc(ag)
	var best: Node3D = null
	var best_arc := 1e18
	for c in main.cars:
		if not (c is Node3D) or not is_instance_valid(c):
			continue
		var car := c as Node3D
		if car.global_position.distance_to(ag.global_position) > 90.0:
			continue
		var cp := Vector2(car.global_position.x, car.global_position.z)
		if ProtoUSMap._seg_dist(cp, a2, b2) > half_w:
			continue
		var lat := (cp - a2).dot(Vector2(-d.y, d.x)) # + = RIGHT of a->b (the one convention)
		if signf(lat) != signf(my_side) and absf(lat) >= 1.5:
			continue
		var carc := _car_travel_arc(ag, car)
		if carc > my_arc and carc < best_arc:
			best_arc = carc
			best = car
	return best


## The car's position as a travel-arc on this agent's road (phantom leader math).
func _car_travel_arc(ag: TrafficAgent, car: Node3D) -> float:
	var road := _road(ag.road_id)
	var pts: PackedVector2Array = road["pts"]
	var cum := _cum(road)
	var a2: Vector2 = pts[ag.seg_i]
	var b2: Vector2 = pts[ag.seg_i + 1]
	var d := (b2 - a2).normalized()
	var s := clampf((Vector2(car.global_position.x, car.global_position.z) - a2).dot(d), 0.0, a2.distance_to(b2))
	var arc_ab: float = cum[ag.seg_i] + s
	return arc_ab if ag.dir > 0 else (cum[cum.size() - 1] - arc_ab)


## EXITS ARE THE CONNECTIONS: near an exit anchor on this road, roll ONCE; on a
## take, transfer to the ramp polyline (right-side departures only) and ride it
## to the location — arrive at its end (the normal end-of-road law). A TRIP
## agent doesn't roll dice: it leaves at ITS destination exit, and only there.
func _maybe_take_exit(ag: TrafficAgent, road: Dictionary) -> void:
	for e in usmap.exits:
		if String(e["highway_id"]) != ag.road_id or String(e["id"]) == ag._exit_rolled:
			continue
		var epos: Vector2 = e["pos"]
		if Vector2(ag.global_position.x, ag.global_position.z).distance_to(epos) > EXIT_TRIGGER_M:
			continue
		ag._exit_rolled = String(e["id"]) # rolled — never re-rolled on the same pass
		if ag.dest_exit_id != "" and String(e["id"]) != ag.dest_exit_id:
			continue # not MY exit — a car with somewhere to be doesn't wander off
		var ramp := _ramp_for(e, ag.dir)
		if ramp.is_empty():
			continue
		# the ramp must depart the agent's travel side (never dart across the median)
		var rpts: PackedVector2Array = ramp["pts"]
		var mouth_i := 0 if rpts[0].distance_to(epos) <= rpts[rpts.size() - 1].distance_to(epos) else rpts.size() - 1
		var away := (rpts[1] - rpts[0]).normalized() if mouth_i == 0 else (rpts[rpts.size() - 2] - rpts[rpts.size() - 1]).normalized()
		var pts: PackedVector2Array = road["pts"]
		var d := (pts[ag.seg_i + 1] - pts[ag.seg_i]).normalized() * float(ag.dir)
		if away.dot(Vector2(-d.y, d.x)) < 0.1: # the ramp must depart the RIGHT of travel
			continue
		if ag.dest_exit_id == "" and rng.randf() > float(TRAFFIC["exit_take_chance"]):
			continue # destination-less drifters still roll the old dice
		ag.road_id = String(ramp["id"])
		ag.lane = 0
		ag.cruise = minf(ag.cruise, float(TRAFFIC["speed_lanes_2"]))
		if mouth_i == 0:
			ag.dir = 1
			ag.seg_i = 0
			ag.s_ab = 0.0
		else:
			ag.dir = -1
			ag.seg_i = rpts.size() - 2
			ag.s_ab = rpts[ag.seg_i].distance_to(rpts[ag.seg_i + 1])
		return


## Pick the exit's DEPARTURE ramp for a given travel direction. Since the 0.18b
## mirrors, an exit owns ramps for BOTH directions (`side` = the pts-order sense
## a ramp serves) — the old first-in-road-order pick could hand an agent the
## opposite carriageway's ramp and the side check would then skip the exit.
## Law: a mouth-anchored ramp whose side matches wins; a side-less legacy ramp
## is acceptable for either direction; ON-ramps (mouth downstream) never depart.
func _ramp_for(e: Dictionary, want_dir: int = 0) -> Dictionary:
	var ramp_ids: Array = e.get("ramp_ids", [])
	var epos: Vector2 = e["pos"]
	var legacy: Dictionary = {}
	for rid in ramp_ids:
		var road: Dictionary = usmap.road_by_id(String(rid))
		if road.is_empty() or String(road.get("kind", "exit")) != "exit":
			continue
		var pts: PackedVector2Array = road["pts"]
		if pts[0].distance_to(epos) >= 30.0 and pts[pts.size() - 1].distance_to(epos) >= 30.0:
			continue # rejoins downstream — an ON-ramp, never a departure
		var side := int(road.get("side", 0))
		if want_dir != 0 and side == want_dir:
			return road # the ramp serving MY travel direction
		if legacy.is_empty() and side == 0:
			legacy = road # side-less legacy ramp serves either direction
	if not legacy.is_empty():
		return legacy
	# fallback: any exit-kind road whose endpoint sits on this exit's anchor
	for road in usmap.roads:
		if String(road["kind"]) != "exit":
			continue
		var pts2: PackedVector2Array = road["pts"]
		if pts2[0].distance_to(epos) < 30.0 or pts2[pts2.size() - 1].distance_to(epos) < 30.0:
			return road
	return {}


# --- Spawning / despawning -----------------------------------------------------

## Keep the ambient population at budget inside the band around the player.
func _maintain() -> void:
	var anchor := _anchor()
	for a in agents.duplicate():
		if not is_instance_valid(a):
			agents.erase(a)
		elif (a as Node3D).global_position.distance_to(anchor) > float(TRAFFIC["despawn_r"]):
			despawn_agent(a)
	var budget := int(TRAFFIC["budget"])
	if agents.size() >= budget:
		return
	# One spawn attempt per pass — fills over a few seconds, never a wall of cars.
	# THE WHOLE NETWORK, not just the highway. Ambient flow used to be INTERSTATE ONLY,
	# because a polyline follower that reaches a short street's end just vanishes — so
	# every town we built stood empty of cars. Now that agents TRANSFER through junctions
	# (see _maybe_transfer), a car put on a street keeps driving, so streets and county
	# roads carry traffic too. Ramps and dirt stay trip-only: you reach those on purpose.
	var candidates: Array = []
	for c0 in usmap.roads_near(anchor, float(TRAFFIC["spawn_r_max"]) + 150.0):
		if ["interstate", "county", "street"].has(String(c0["kind"])):
			candidates.append(c0)
	if candidates.is_empty():
		return
	# weight by lanes AND class, so the interstate still carries most of the flow
	# instead of a town's 570 street rows drowning it out.
	var weights := 0.0
	for c in candidates:
		weights += float(int(c["lanes"])) * _kind_weight(String(c["kind"]))
	var roll := rng.randf() * weights
	var pick: Dictionary = candidates[0]
	for c in candidates:
		roll -= float(int(c["lanes"])) * _kind_weight(String(c["kind"]))
		if roll <= 0.0:
			pick = c
			break
	var road := _road(String(pick["id"]))
	var spot := _spawn_spot(road, anchor)
	if spot.is_empty():
		return
	var per_side := int(ProtoUSMap.road_geometry(road)["per_side"])
	var ag := spawn_agent(String(road["id"]), int(spot["seg"]), float(spot["s_ab"]),
		rng.randi_range(0, per_side - 1), 1 if rng.randf() < 0.5 else -1)
	# THE TRIP (owner: every car is trying to GO somewhere): pick an exit AHEAD in
	# its travel direction as the destination. None ahead = through-traffic bound
	# for the region's far end — also a destination, not a wanderer.
	if ag != null and rng.randf() < float(TRAFFIC["trip_chance"]):
		var tag := ag as TrafficAgent
		var my_arc := _travel_arc(tag)
		var picks: Array = []
		for e in usmap.exits:
			if String(e["highway_id"]) != tag.road_id:
				continue
			var ea := _arc_of(road, e["pos"])
			var earc: float = float(ea["arc"]) if tag.dir > 0 else (float(_cum(road)[_cum(road).size() - 1]) - float(ea["arc"]))
			if earc > my_arc + 60.0:
				picks.append(String(e["id"]))
		if not picks.is_empty():
			tag.dest_exit_id = picks[rng.randi() % picks.size()]
	# A CONVOY (§3.1 v1): grow the spawn into a 2-3 truck column hauling cargo.
	if ag != null and rng.randf() < float(TRAFFIC["convoy_chance"]):
		var lead := ag as TrafficAgent
		var cargo: String = ["produce", "diesel", "scrap"][rng.randi() % 3]
		spawn_convoy_behind(lead, rng.randi_range(1, 2), cargo)


## A point on the road inside the spawn ring: project the anchor, walk ±arc.
## With merge_chance, prefer an exit mouth in range — traffic ENTERS at the
## connections too, not just leaves.
func _spawn_spot(road: Dictionary, anchor: Vector3) -> Dictionary:
	var pts: PackedVector2Array = road["pts"]
	var cum := _cum(road)
	var total: float = cum[cum.size() - 1]
	if rng.randf() < float(TRAFFIC["merge_chance"]):
		for e in usmap.exits:
			if String(e["highway_id"]) != String(road["id"]):
				continue
			var ed := (e["pos"] as Vector2).distance_to(Vector2(anchor.x, anchor.z))
			if ed > float(TRAFFIC["spawn_r_min"]) and ed < float(TRAFFIC["spawn_r_max"]):
				var m := _arc_of(road, e["pos"])
				return {"seg": m["seg"], "s_ab": m["s_ab"]}
	var proj := _arc_of(road, Vector2(anchor.x, anchor.z))
	var arc: float = float(proj["arc"]) + (1.0 if rng.randf() < 0.5 else -1.0) \
		* rng.randf_range(float(TRAFFIC["spawn_r_min"]), float(TRAFFIC["spawn_r_max"]))
	if arc < 0.0 or arc > total:
		return {}
	for i in range(pts.size() - 1):
		var seg_len := pts[i].distance_to(pts[i + 1])
		if arc <= cum[i] + seg_len:
			return {"seg": i, "s_ab": arc - cum[i]}
	return {}


func _arc_of(road: Dictionary, p: Vector2) -> Dictionary:
	var pts: PackedVector2Array = road["pts"]
	var cum := _cum(road)
	var best_d := 1e18
	var best := {"seg": 0, "s_ab": 0.0, "arc": 0.0}
	for i in range(pts.size() - 1):
		var ab := pts[i + 1] - pts[i]
		var len2 := ab.length_squared()
		var t := clampf((p - pts[i]).dot(ab) / maxf(len2, 0.0001), 0.0, 1.0)
		var q := pts[i] + ab * t
		var d := p.distance_to(q)
		if d < best_d:
			best_d = d
			var s := t * sqrt(len2)
			best = {"seg": i, "s_ab": s, "arc": cum[i] + s}
	return best


## PUBLIC (sims, tools, future events): put one agent on a road, exactly here.
func spawn_agent(road_id: String, seg_i: int, s_ab: float, lane: int, dir: int) -> Node3D:
	var road := _road(road_id)
	if road.is_empty():
		return null
	var ag := TrafficAgent.new()
	# The path OWNS the body: sync_to_physics (default true) blocks direct
	# global_position writes — off, so the agent is a movable static collider.
	ag.sync_to_physics = false
	ag.traffic = self
	ag.road_id = road_id
	ag.seg_i = clampi(seg_i, 0, (road["pts"] as PackedVector2Array).size() - 2)
	ag.s_ab = s_ab
	ag.lane = clampi(lane, 0, int(ProtoUSMap.road_geometry(road)["per_side"]) - 1)
	ag.dir = 1 if dir >= 0 else -1
	# CRUISE BY ROAD CLASS. Keying speed off LANE COUNT meant a 2-lane dirt backroad
	# and a 2-lane interstate cruised identically; the lane graph carries a real
	# per-class limit, so use it.
	var base_speed: float = float(ProtoLaneGraph.KIND_SPEED.get(String(road.get("kind", "street")), 16.0))
	ag.cruise = base_speed * (1.0 + rng.randf_range(-1.0, 1.0) * float(TRAFFIC["speed_jitter"]))
	ag.speed = ag.cruise
	ag.tint = Color(0.30 + rng.randf() * 0.35, 0.30 + rng.randf() * 0.35, 0.32 + rng.randf() * 0.35)
	var shape := CollisionShape3D.new()
	var box := BoxShape3D.new()
	box.size = Vector3(1.9, 1.2, CAR_LEN)
	shape.shape = box
	shape.position.y = 0.0
	ag.add_child(shape)
	var body := MeshInstance3D.new()
	var bm := BoxMesh.new()
	bm.size = Vector3(1.9, 0.9, CAR_LEN)
	body.mesh = bm
	body.material_override = ProtoWorldBuilder.material(ag.tint, 0.85)
	body.position.y = -0.1
	ag.add_child(body)
	var cab := MeshInstance3D.new()
	var cm := BoxMesh.new()
	cm.size = Vector3(1.7, 0.55, 2.0)
	cab.mesh = cm
	cab.material_override = ProtoWorldBuilder.material(ag.tint.darkened(0.25), 0.85)
	cab.position = Vector3(0, 0.55, 0.2)
	ag.add_child(cab)
	# the BUMPER DOOR: a real car entering this ring promotes the agent to physics.
	# DEFERRED (call_deferred, below): promote() add_child's a VehicleBody3D, which is
	# illegal inside body_entered — that fires during the physics query flush ("Can't
	# change this state while flushing queries" → the 2026-07-09 crash on getting hit by
	# a traffic car). Deferring drains it after the flush; promote() re-guards the agent.
	var area := Area3D.new()
	var ash := CollisionShape3D.new()
	var abox := BoxShape3D.new()
	abox.size = Vector3(2.6, 1.6, CAR_LEN + 1.6)
	ash.shape = abox
	area.add_child(ash)
	area.body_entered.connect(func(b: Node3D) -> void:
		if b is ProtoCar3D and not (b as ProtoCar3D).dead:
			promote.call_deferred(ag, 0.0))
	ag.add_child(area)
	add_child(ag)
	agents.append(ag)
	_place(ag, road)
	return ag


func despawn_agent(ag: Node3D) -> void:
	agents.erase(ag)
	if is_instance_valid(ag):
		ag.queue_free()


## THE ARRIVAL LAW (owner P0: cars "disappearing out of nowhere"): a car that
## reaches its destination IN VIEW becomes a real PARKED car right there — it
## pulled over at the end of its trip. Off-view, it dissolves like it always
## did. If the promote cap is full, it stalls in place (a stopped car) and the
## distance cull collects it once the player moves on.
## The lane graph, built once on first use (the same lazy pattern the GPS uses).
func _lane_graph() -> ProtoLaneGraph:
	if _lanes == null and usmap != null and usmap.ok:
		_lanes = ProtoLaneGraph.build(usmap)
	return _lanes



## Re-seat an agent onto a connector's target lane. Shared by the end-of-road TRANSFER
## and the mid-road TURN.
func _take_connector(ag: TrafficAgent, pick: Dictionary) -> bool:
	var lg := _lane_graph()
	var to_id := String(pick["to"])
	if lg == null or not lg.lanes.has(to_id):
		return false
	var trow: Dictionary = lg.lanes[to_id]
	var nroad := String(trow["road_id"])
	var nr := _road(nroad)
	if nr.is_empty():
		return false
	var npts: PackedVector2Array = nr["pts"]
	if npts.size() < 2:
		return false
	var jp: Vector2 = pick.get("jpos", Vector2.ZERO)
	var bi := 0
	var bd := 1e18
	for i in range(npts.size() - 1):
		var d := ProtoUSMap._seg_dist(jp, npts[i], npts[i + 1])
		if d < bd:
			bd = d
			bi = i
	var a0: Vector2 = npts[bi]
	var b0: Vector2 = npts[bi + 1]
	var segv := b0 - a0
	var t := 0.0
	if segv.length_squared() > 0.001:
		t = clampf((jp - a0).dot(segv) / segv.length_squared(), 0.0, 1.0)
	ag.road_id = nroad
	ag.seg_i = bi
	ag.s_ab = t * a0.distance_to(b0)
	ag.dir = int(trow["dir"])
	ag.lane = int(trow["lane"])
	ag._exit_rolled = ""
	ag.cruise = minf(maxf(ag.cruise, 6.0), float(trow["speed_mps"]))
	ag.speed = minf(ag.speed, maxf(float(pick.get("v_turn", 8.0)), 4.0))
	return true


const TURN_TRIGGER := 26.0 ## how close to a node counts as "at the intersection"

## THE TURN. _maybe_transfer only fires where a polyline ENDS, but a town grid crosses in
## the MIDDLE of its streets — so without this a car drives straight through every
## intersection in every city and can never turn off. Each tick, look for a non-straight
## connector out of this lane at a node we are arriving at, and sometimes take it.
func _maybe_turn(ag: TrafficAgent, blocked: bool = false) -> void:
	# NEVER TURN WHILE STOPPING. The follow law measures its gap ALONG THE CURRENT ROAD;
	# re-seating onto a connector mid-brake hands the agent a road the blocker isn't on,
	# so the car it was stopping for stops existing and it drives straight through the
	# rig. A discretionary turn waits until the lane ahead is clear.
	if blocked:
		return
	if ag.dest_exit_id != "":
		return # on a trip: it is going somewhere specific, do not wander
	var lg := _lane_graph()
	if lg == null:
		return
	var conns: Array = lg.exits_from(ProtoLaneGraph.lane_id(ag.road_id, ag.dir, ag.lane))
	if conns.is_empty():
		return
	var here := Vector2(ag.global_position.x, ag.global_position.z)
	for c in conns:
		if String(c["turn"]) == "straight":
			continue # going straight needs no transfer — the road already continues
		var jp: Vector2 = c.get("jpos", Vector2.ZERO)
		if jp.distance_to(here) > TURN_TRIGGER or String(c["id"]) == ag._exit_rolled:
			continue
		ag._exit_rolled = String(c["id"]) # decide once per node, never re-roll
		if rng.randf() < float(TRAFFIC.get("turn_chance", 0.35)):
			_take_connector(ag, c)
		return


const TRANSFER_R := 110.0 ## how near a junction counts as "reached its end"

## THE TRANSFER (AMERICAN_ROAD MT, "traffic returns"). A road ending used to mean the
## agent VANISHED — `_arrive()` despawned or parked it, because a polyline follower has
## nowhere else to go. Now we ask the LANE GRAPH: take a connector and keep driving onto
## the next road. This is the one change that turns ambient traffic from per-polyline
## path-followers into something that uses the NETWORK — cars TURN at junctions.
func _maybe_transfer(ag: TrafficAgent) -> bool:
	var lg := _lane_graph()
	if lg == null:
		return false
	var conns: Array = lg.exits_from(ProtoLaneGraph.lane_id(ag.road_id, ag.dir, ag.lane))
	if conns.is_empty():
		return false
	# a lane spans its whole road, so it carries connectors for EVERY junction along it —
	# keep only the ones at the end we actually reached.
	var here := Vector2(ag.global_position.x, ag.global_position.z)
	var opts: Array = []
	for c in conns:
		if (c.get("jpos", Vector2.ZERO) as Vector2).distance_to(here) <= TRANSFER_R:
			opts.append(c)
	if opts.is_empty():
		return false
	# straight is the common case in real flow; turns are the minority
	var pick: Dictionary = opts[0]
	var best_w := -1.0
	for c2 in opts:
		var w: float = (3.0 if String(c2["turn"]) == "straight" else 1.0) * (0.5 + rng.randf())
		if w > best_w:
			best_w = w
			pick = c2
	return _take_connector(ag, pick)


func _arrive(ag: TrafficAgent) -> void:
	var near_player := ag.global_position.distance_to(_anchor()) < float(TRAFFIC["vanish_r_min"])
	if not near_player:
		despawn_agent(ag)
		return
	if _promoted.size() >= int(TRAFFIC["promote_cap"]) or main == null:
		ag.arrived = true
		ag.speed = 0.0
		ag.cruise = 0.0
		return
	promote(ag, 0.0, true)


## THE PROMOTION LAW: the touched agent becomes a REAL car in place — matched
## velocity, forwarded damage, a short autopilot route that continues its lane
## then pulls over. parked=true (an ARRIVAL): it stops right here, engine off —
## the trip is over. At cap: in view the agent stalls (a stopped car the cull
## collects later), off-view it dissolves — never a physics storm, never a
## visible vanish.
func promote(ag: Node3D, dmg: float = 0.0, parked: bool = false, chain: bool = true) -> void:
	if not is_instance_valid(ag) or not agents.has(ag):
		return
	if _promoted.size() >= int(TRAFFIC["promote_cap"]) or main == null:
		var tag0 := ag as TrafficAgent
		if is_instance_valid(ag) and ag.global_position.distance_to(_anchor()) < float(TRAFFIC["vanish_r_min"]):
			tag0.arrived = true
			tag0.speed = 0.0
			tag0.cruise = 0.0
		else:
			despawn_agent(ag)
		return
	var tag := ag as TrafficAgent
	var road := _road(tag.road_id)
	var car := ProtoCar3D.create("van" if tag.convoy_id != "" else ["scavenger", "pickup", "van"][rng.randi() % 3], tag.tint)
	main.add_child(car)
	car.global_position = ag.global_position + Vector3(0, 0.35, 0)
	car.rotation.y = ag.rotation.y
	var heading := -car.global_basis.z
	car.linear_velocity = heading * (0.0 if parked else tag.speed)
	if "cars" in main:
		main.cars.append(car)
	if dmg > 0.0:
		car.take_damage(dmg)
	_promoted.append(car)
	# a TOUCHED car keeps driving its lane a beat, then pulls over — a person,
	# not a statue. A PARKED arrival just sits: it got where it was going.
	if not parked and not road.is_empty() and not car.dead:
		var pilot := ProtoAutopilot.attach(car)
		pilot.aggression = 0.7
		pilot.arrive_dist = 7.0
		var pts: PackedVector2Array = road["pts"]
		var route: Array = []
		var d := (pts[tag.seg_i + 1] - pts[tag.seg_i]).normalized() * float(tag.dir)
		var right := Vector2(-d.y, d.x)
		var lat := right * ProtoUSMap.lane_offset(road, tag.lane)
		var here := Vector2(ag.global_position.x, ag.global_position.z)
		route.append(Vector3(here.x + d.x * 40.0 + lat.x, 0, here.y + d.y * 40.0 + lat.y))
		# PULL OVER ONTO THE SHOULDER, not off the road. width*0.5 + 4 put a car 17.6 m
		# from the centreline of 27.2 m I-95 — past the outer lane and clean off the
		# slab. Park just outside the OUTERMOST lane instead, which stays on pavement
		# for every profile from a 5.6 m dirt track to a 6-lane divided interstate.
		var rg: Dictionary = ProtoUSMap.road_geometry(road)
		var shoulder: float = ProtoUSMap.lane_offset(road, int(rg["per_side"]) - 1) + 2.2
		var off := right * minf(shoulder, float(rg["width"]) * 0.5 - 0.6)
		route.append(Vector3(here.x + d.x * 80.0 + off.x, 0, here.y + d.y * 80.0 + off.y))
		pilot.set_route(route)
	# THE CARGO (§3.1): a convoy truck hauls its row in the trunk — rob the road.
	if tag.cargo != "" and car.trunk != null:
		match tag.cargo:
			"produce":
				car.trunk.add("meat", 4)
			"diesel":
				car.trunk.add("jerry_can", 2)
			"scrap":
				car.trunk.add("scrap", 5)
	# A CONVOY IS ONE STORY: touching any member makes the near neighbors real too.
	var cid := tag.convoy_id
	var origin := ag.global_position
	despawn_agent(ag)
	if chain and cid != "":
		for other in agents.duplicate():
			var ot := other as TrafficAgent
			if ot.convoy_id == cid and is_instance_valid(other) and other.global_position.distance_to(origin) < 90.0:
				promote(other, 0.0, parked, false)


# --- Sim/tool accessors ----------------------------------------------------------

func set_agent_speed(ag: Node3D, v: float) -> void:
	(ag as TrafficAgent).cruise = v
	(ag as TrafficAgent).speed = v


func agent_speed(ag: Node3D) -> float:
	return (ag as TrafficAgent).speed


func agent_road(ag: Node3D) -> String:
	return (ag as TrafficAgent).road_id


## Give an agent a DESTINATION exit (sims, convoys, events): it leaves there.
func set_agent_trip(ag: Node3D, exit_id: String) -> void:
	(ag as TrafficAgent).dest_exit_id = exit_id


## CONVOYS v1 (BANDIT_CONVOY_ECOSYSTEM.md §3.1): grow a lead agent into a
## column — followers spawn tight behind on the same lane, share the lead's
## destination and cargo, and the following law keeps the column together.
## Returns the whole convoy (lead first). The bandit director's future prey.
func spawn_convoy_behind(lead: TrafficAgent, followers: int, cargo: String) -> Array:
	var out: Array = [lead]
	lead.convoy_id = "convoy_%d" % lead.get_instance_id()
	lead.cargo = cargo
	_size_as_truck(lead)
	for k in followers:
		var f := spawn_agent(lead.road_id, lead.seg_i, lead.s_ab - (k + 1) * 16.0 * float(lead.dir), lead.lane, lead.dir)
		if f == null:
			continue
		var ft := f as TrafficAgent
		ft.convoy_id = lead.convoy_id
		ft.cargo = cargo
		ft.dest_exit_id = lead.dest_exit_id
		ft.cruise = lead.cruise # a column holds ONE speed
		ft.speed = lead.speed
		_size_as_truck(ft)
		out.append(ft)
	return out


## A convoy vehicle reads as a HAULER: longer, taller, boxier than a sedan.
func _size_as_truck(ag: TrafficAgent) -> void:
	for c in ag.get_children():
		if c is MeshInstance3D and (c as MeshInstance3D).mesh is BoxMesh:
			var bm := (c as MeshInstance3D).mesh as BoxMesh
			if bm.size.z > 3.0: # the body box
				bm.size = Vector3(2.3, 1.3, 6.6)
				(c as MeshInstance3D).position.y = 0.15
		elif c is CollisionShape3D and (c as CollisionShape3D).shape is BoxShape3D:
			((c as CollisionShape3D).shape as BoxShape3D).size = Vector3(2.3, 1.5, 6.6)


# --- Internals -------------------------------------------------------------------

## Spawn weight by class — the interstate still carries most ambient flow even though
## a town contributes hundreds of street rows.
func _kind_weight(kind: String) -> float:
	match kind:
		"interstate": return 3.0
		"county": return 1.5
		_: return 0.8


func _anchor() -> Vector3:
	if main != null and "active_car" in main and main.active_car != null and is_instance_valid(main.active_car):
		return main.active_car.global_position
	if main != null and "player" in main and main.player != null:
		return main.player.global_position
	return global_position


func _road(id: String) -> Dictionary:
	for r in usmap.roads:
		if String(r["id"]) == id:
			return r
	return {}


func _cum(road: Dictionary) -> PackedFloat32Array:
	var id := String(road["id"])
	if _arc_cache.has(id):
		return _arc_cache[id]
	var pts: PackedVector2Array = road["pts"]
	var cum := PackedFloat32Array()
	cum.resize(pts.size())
	cum[0] = 0.0
	for i in range(1, pts.size()):
		cum[i] = cum[i - 1] + pts[i - 1].distance_to(pts[i])
	_arc_cache[id] = cum
	return cum
