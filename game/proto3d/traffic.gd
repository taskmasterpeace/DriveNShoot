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
const EXIT_TRIGGER_M: float = 34.0 ## how close to the selected ramp port the take-roll happens
const HONK_COOLDOWN_S: float = 4.0

static var TRAFFIC: Dictionary = {
	"budget": 12.0,          # ambient agents alive at once (0 = empty roads)
	"spawn_r_min": 260.0,    # the band: materialize this far out...
	"spawn_r_max": 420.0,
	"despawn_r": 550.0,      # ...and dissolve past this
	"headway_s": 1.6,        # following distance in seconds of travel
	"min_gap_m": 8.0,        # the hard floor — never closer than this
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
	"pull_over_approach_m": 80.0,
	"pull_over_station_1_m": 55.0,
	"pull_over_station_2_m": 40.0,
	"pull_over_station_3_m": 25.0,
	"pull_over_offset_1_m": 5.0,
	"pull_over_offset_2_m": 8.0,
	"pull_over_offset_3_m": 11.0,
	"pull_over_retry_s": 2.0,
	"pull_over_speed_mps": 5.0,
	"pull_over_max_grade": 0.06,
	"pull_over_max_curb_drop_m": 0.10,
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
var agents: Array = []
var _promoted: Array = []
var _maintain_t: float = 0.0
var _honk_t: float = 0.0
var _arc_cache: Dictionary = {} ## road_id -> PackedFloat32Array of cumulative seg lengths
## Shared opt-in diagnostics: fixed-size aggregates, no per-query output.
var parking_profile_enabled: bool = OS.get_environment("DRIVN_PROFILE_PARKING")=="1"
var parking_profile: Dictionary = {"searches":0,"selected":0,"candidates":0,"corridor_builds":0,"members":0,"total_us":0,"max_us":0}


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
	var _connection: Dictionary = {} # bounded lane-to-lane motion, never a snap
	var _parking: Dictionary = {} # validated target + final road-aligned yaw
	var _parking_departure: Dictionary = {} # frozen initial outward arc window; retries never enlarge it
	var _parking_retry: float = 0.0
	var _parking_curb_used: bool = false # trip state: retries/previews cannot replenish it

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
			var leader: TrafficAgent = null
			for ahead: int in range(i+1,group.size()):
				var candidate: TrafficAgent = group[ahead]
				if _managed_parked_clear(candidate):
					continue # its real body is outside every road, not a lane leader
				leader = candidate
				break
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
	var managed := _managed_exit(road)
	if not managed.is_empty() and ag.dest_exit_id == "":
		ag.dest_exit_id = String(managed["id"])
	if not managed.is_empty() and ag.arrived:
		_finish_managed_arrival(ag)
		return
	var connecting := not ag._connection.is_empty()
	var parking := not connecting and not managed.is_empty() and _final_approach(ag,road,managed)
	if parking:
		_prepare_parking(ag,road,delta)
	# --- the following law: leader agent, or the PLAYER's car projected in-lane
	var desired := ag.cruise
	if parking:
		desired = minf(desired,float(TRAFFIC["pull_over_speed_mps"])) if not ag._parking.is_empty() else 0.0
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
	if lead_arc < 1e17:
		var gap := lead_arc - _travel_arc(ag) - CAR_LEN
		var follow_dist := float(TRAFFIC["headway_s"]) * maxf(ag.speed, 1.0)
		if gap < float(TRAFFIC["min_gap_m"]):
			desired = 0.0
		elif gap < follow_dist:
			desired = minf(desired, lead_speed * clampf(gap / follow_dist, 0.0, 1.0) + 0.5)
	var was := ag.speed
	ag.speed = move_toward(ag.speed, desired, ACCEL * delta)
	# a hard brake near the player earns a HORN (the world has opinions)
	if was - ag.speed > float(TRAFFIC["honk_brake_mps2"]) * delta and _honk_t <= 0.0 \
			and pcar != null and main != null and "audio" in main and main.audio != null:
		_honk_t = HONK_COOLDOWN_S
		main.audio.play_at("horn", ag.global_position, -4.0)
	if connecting:
		_step_connection(ag,delta)
		return
	if parking and ag.speed<=float(TRAFFIC["pull_over_speed_mps"])+0.001 and (not ag._parking.is_empty() or ag.speed<=0.001):
		_step_parking(ag,road,delta)
		return
	# --- exits: the only doors off the highway (roll once per exit approach)
	_maybe_take_exit(ag, road, true)
	if not is_instance_valid(ag):
		return
	# A managed exit begins as physical lane-to-ramp motion while the highway
	# still owns the actor. That keeps source-lane following effective until the
	# ramp entry is actually reached, and this return spends only this tick's
	# speed * delta budget on the handoff.
	if not ag._connection.is_empty():
		_step_connection(ag,delta)
		return
	if ag.road_id != String(road["id"]):
		road = _road(ag.road_id)
		pts = road["pts"] # advance/place on the ramp this frame, not the old highway
		managed = _managed_exit(road) # road ownership changed; never retain the source selection
	# --- advance along the polyline (s_ab is a->b; dir signs the step)
	ag.s_ab += ag.speed * delta * float(ag.dir)
	while true:
		var a2: Vector2 = pts[ag.seg_i]
		var b2: Vector2 = pts[ag.seg_i + 1]
		var seg_len := a2.distance_to(b2)
		if ag.s_ab > seg_len and ag.dir > 0:
			if ag.seg_i + 1 >= pts.size() - 1:
				if not managed.is_empty():
					_connect_managed(ag,road,managed,delta)
					return
				_arrive(ag) # the road ended under it — it got where it was going
				return
			ag.s_ab -= seg_len
			ag.seg_i += 1
		elif ag.s_ab < 0.0 and ag.dir < 0:
			if ag.seg_i <= 0:
				if not managed.is_empty():
					_connect_managed(ag,road,managed,delta)
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
	if not managed.is_empty():
		var target := _lane_position(road,ag.seg_i,ag.s_ab,ag.dir,ag.lane)
		# Lane offsets at a sharp polyline vertex need a physical transition too.
		ag._connection = {"road":ag.road_id,"seg":ag.seg_i,"s":ag.s_ab,"dir":ag.dir,"target":target}
		_step_connection(ag,delta)
	else:
		_place(ag, road)


## World placement: centerline point + the geometry law's lane offset on the
## RIGHT of travel; yaw faces travel. The paint and the traffic can't disagree —
## they read the same row.
func _place(ag: TrafficAgent, road: Dictionary) -> void:
	ag.global_position = _lane_position(road,ag.seg_i,ag.s_ab,ag.dir,ag.lane)
	var pts: PackedVector2Array = road["pts"]
	var heading := (pts[ag.seg_i+1]-pts[ag.seg_i]).normalized()*float(ag.dir)
	ag.rotation.y = atan2(-heading.x,-heading.y)


func _lane_position(road: Dictionary, segment: int, station: float, direction: int, lane: int) -> Vector3:
	var pts: PackedVector2Array = road["pts"]
	var a2: Vector2 = pts[segment]
	var b2: Vector2 = pts[segment + 1]
	var d := (b2 - a2).normalized()
	var heading := d * float(direction)
	var right := Vector2(-heading.y, heading.x)
	var lat := right * ProtoUSMap.lane_offset(road, lane)
	var p := a2 + d * station + lat
	var y := ProtoWorldBuilder.ground_y(p.x, p.y) + 0.62
	if not _managed_exit(road).is_empty() and String(road.get("elev_mode",""))=="structure":
		y = ProtoUSMap.elev_at(road,float(_cum(road)[segment])+station)+0.09+0.62
	return Vector3(p.x,y,p.y)


## Managed rows are an owned trip, not a general town-routing graph. Only
## declared connectors whose endpoints actually meet may advance that trip.
func _managed_exit(road: Dictionary) -> Dictionary:
	var owner := String(road.get("interchange_id",""))
	if owner=="":
		return {}
	for exit_row: Dictionary in usmap.exits:
		if String(exit_row["id"])!=owner or String((exit_row.get("interchange",{}) as Dictionary).get("layout",""))!="diamond_v2":
			continue
		if String(road.get("ramp_role",""))=="off" or (exit_row.get("connector_ids",[]) as Array).has(String(road["id"])):
			return exit_row
	return {}


func _connect_managed(ag: TrafficAgent, road: Dictionary, exit_row: Dictionary, delta: float) -> void:
	var points: PackedVector2Array = road["pts"]
	var endpoint: Vector2 = points[-1] if ag.dir>0 else points[0]
	var destination: Vector2 = exit_row["dest"]
	var best_distance := endpoint.distance_to(destination)
	var next: Dictionary = {}
	for id: String in exit_row.get("connector_ids",[]):
		if id==ag.road_id:
			continue
		var candidate := _road(id)
		if candidate.is_empty() or String(candidate.get("interchange_id",""))!=String(exit_row["id"]):
			continue
		var pts: PackedVector2Array = candidate["pts"]
		for direction: int in [1,-1]:
			if direction<0 and bool(candidate.get("one_way",false)):
				continue
			var start: Vector2 = pts[0] if direction>0 else pts[-1]
			var finish: Vector2 = pts[-1] if direction>0 else pts[0]
			if endpoint.distance_to(start)>0.25 or finish.distance_to(destination)>=best_distance-0.01:
				continue
			var segment := 0 if direction>0 else pts.size()-2
			var station := 0.0 if direction>0 else pts[segment].distance_to(pts[segment+1])
			best_distance = finish.distance_to(destination)
			next = {"road":id,"seg":segment,"s":station,"dir":direction,"target":_lane_position(candidate,segment,station,direction,0)}
	if next.is_empty():
		# Invalid/disconnected managed data is not permission to invent a street
		# or declare arrival. Leave the actor visible and its trip unresolved.
		ag.speed = 0.0
		ag.s_ab = clampf(ag.s_ab,0.0,points[ag.seg_i].distance_to(points[ag.seg_i+1]))
		return
	ag._connection = next
	_step_connection(ag,delta)


func _step_connection(ag: TrafficAgent, delta: float) -> void:
	var target: Vector3 = ag._connection["target"]
	var before := ag.global_position
	ag.global_position = before.move_toward(target,ag.speed*delta)
	var motion := ag.global_position-before
	if Vector2(motion.x,motion.z).length_squared()>0.000001:
		ag.rotation.y = atan2(-motion.x,-motion.z)
	# A managed entry remains source-owned so its lane leader can still stop it.
	# Keep that source travel arc synchronized across every physical entry leg.
	if bool(ag._connection.get("track_source_arc",false)):
		var source := _road(ag.road_id)
		if not source.is_empty():
			var source_projection := _arc_of(source,Vector2(ag.global_position.x,ag.global_position.z))
			ag.seg_i = int(source_projection["seg"])
			ag.s_ab = float(source_projection["s_ab"])
	if ag.global_position.distance_to(target)>0.005:
		return
	var waypoints: Array = ag._connection.get("entry_waypoints",[])
	if not waypoints.is_empty():
		ag._connection["target"] = waypoints.pop_front()
		ag._connection["entry_waypoints"] = waypoints
		return # changing entry legs never spends a second distance budget this tick
	ag.road_id = String(ag._connection["road"])
	ag.seg_i = int(ag._connection["seg"])
	ag.s_ab = float(ag._connection["s"])
	ag.dir = int(ag._connection["dir"])
	ag.lane = 0
	ag._connection.clear()


func _final_approach(ag: TrafficAgent, road: Dictionary, exit_row: Dictionary) -> bool:
	var points: PackedVector2Array = road["pts"]
	var end: Vector2 = points[-1] if ag.dir>0 else points[0]
	return end.distance_to(exit_row["dest"])<0.25 and float(_cum(road)[-1])-_travel_arc(ag)<=float(TRAFFIC["pull_over_approach_m"])


func _parking_size(ag: TrafficAgent) -> Vector3:
	var size := Vector3(1.9,1.2,CAR_LEN)
	for child: Node in ag.get_children():
		if child is CollisionShape3D and child.shape is BoxShape3D:
			var actual: Vector3 = child.shape.size
			size = Vector3(maxf(size.x,actual.x),maxf(size.y,actual.y),maxf(size.z,actual.z))
	for id: String in ["scavenger","pickup","van"]:
		var actual: Vector3 = ProtoCar3D.VEHICLES[id]["chassis"]
		size = Vector3(maxf(size.x,actual.x),maxf(size.y,actual.y),maxf(size.z,actual.z))
	return size+Vector3(1,0,1)


func _prepare_parking(ag: TrafficAgent, road: Dictionary, delta: float) -> void:
	if main==null or not ("stream" in main) or main.stream==null:
		return
	if not ag._parking.is_empty():
		return
	# Freeze the real departure pose only after ordinary approach braking.
	if ag.speed>float(TRAFFIC["pull_over_speed_mps"]):
		return
	ag._parking_retry = maxf(0.0,ag._parking_retry-delta)
	if ag._parking_retry>0:
		return
	ag._parking_retry = float(TRAFFIC["pull_over_retry_s"])
	var profile_start := Time.get_ticks_usec() if parking_profile_enabled else 0
	var profile_candidates := 0
	var profile_builds := 0
	var profile_members := 0
	var cumulative := _cum(road)
	var points: PackedVector2Array = road["pts"]
	var total: float = cumulative[-1]
	var size := _parking_size(ag)
	for station_index: int in range(1,4):
		var upstream := float(TRAFFIC["pull_over_station_%d_m" % station_index])
		var arc := total-upstream if ag.dir>0 else upstream
		if arc<0 or arc>total:
			continue
		var segment := 0
		while segment+1<cumulative.size()-1 and cumulative[segment+1]<arc:
			segment += 1
		var heading := (points[segment+1]-points[segment]).normalized()*float(ag.dir)
		var yaw := atan2(-heading.x,-heading.y)
		var right := Vector2(-heading.y,heading.x)
		var lane := _lane_position(road,segment,arc-cumulative[segment],ag.dir,ag.lane)
		var center := Vector2(lane.x,lane.z)-right*ProtoUSMap.lane_offset(road,ag.lane)
		for offset_index: int in range(1,4):
			profile_candidates += 1
			var offset := float(ProtoUSMap.road_geometry(road)["width"])*0.5+float(TRAFFIC["pull_over_offset_%d_m" % offset_index])
			var p := center+right*offset
			var guess := Vector3(p.x,lane.y,p.y)
			var key := "%d,%d" % [floori(p.x/128.0),floori(p.y/128.0)]
			var plot_exclusions: Array = main.stream._ruin_exclusions(guess,key)
			var plot := _parking_sample(ag,guess,yaw,size,plot_exclusions)
			if plot.is_empty():
				continue
			var target: Vector3 = plot["position"]
			var departure := ag._parking_departure
			if departure.is_empty():
				profile_builds += 1
				departure = _departure_corridor(ag,road,target,size)
				if parking_profile_enabled and not departure.is_empty():
					profile_members += (departure["cuts"] as Dictionary).size()
			if departure.is_empty():
				continue
			# Freeze before the first entry query: an occupied plot/entry retry
			# cannot grow the exception by projecting from a later actor pose.
			ag._parking_departure = departure
			var entry_exclusions: Array = main.stream._ruin_exclusions(guess,key,"",departure)
			if not _parking_entry_clear(ag,ag.global_position,target,size,entry_exclusions,departure):
				continue
			ag._parking = {"target":target,"yaw":yaw,"size":size,"plot_exclusions":plot_exclusions,"entry_exclusions":entry_exclusions,"started":false}
			_record_parking_profile(profile_start,profile_candidates,profile_builds,profile_members,true)
			return
	_record_parking_profile(profile_start,profile_candidates,profile_builds,profile_members,false)


func _record_parking_profile(start: int, candidates: int, builds: int, members: int, selected: bool) -> void:
	if not parking_profile_enabled:
		return
	var elapsed := Time.get_ticks_usec()-start
	parking_profile["searches"] += 1
	parking_profile["selected"] += int(selected)
	parking_profile["candidates"] += candidates
	parking_profile["corridor_builds"] += builds
	parking_profile["members"] += members
	parking_profile["total_us"] += elapsed
	parking_profile["max_us"] = maxi(int(parking_profile["max_us"]),elapsed)


## Excise only the initial outward hull sweep, expressed in the road's arc
## coordinates. Adjacent tessellation is allowed, not a later bend/return.
## The same immutable cuts survive retries and the actor's later projection.
func _departure_corridor(ag: TrafficAgent, road: Dictionary, target: Vector3, size: Vector3) -> Dictionary:
	var points: PackedVector2Array = road["pts"]
	var cumulative := _cum(road)
	var start := Vector2(ag.global_position.x,ag.global_position.z)
	var motion := Vector2(target.x,target.z)-start
	var forward := (points[ag.seg_i+1]-points[ag.seg_i]).normalized()*float(ag.dir)
	var right := Vector2(-forward.y,forward.x)
	var outward := motion.dot(right)
	if not start.is_finite() or not motion.is_finite() or outward<=0.0:
		return {}
	var yaw := atan2(-motion.x,-motion.y)
	# Match the existing overlapping full-envelope queries, including their
	# exact half-interval extension, rather than creating a new safety margin.
	var interval := motion.length()/float(maxi(1,ceili(motion.length()/2.0)))
	var along_half := maxf(_departure_extent(size,ag.rotation.y,forward),_departure_extent(size+Vector3(0,0,interval),yaw,forward))
	var outward_half := maxf(_departure_extent(size,ag.rotation.y,right),_departure_extent(size+Vector3(0,0,interval),yaw,right))
	var lateral := (start-_centerline_point(ag,road)).dot(right)
	var crossing := (float(ProtoUSMap.road_geometry(road)["width"])*0.5+outward_half-lateral)/outward
	if crossing<=0.0 or crossing>1.0:
		return {}
	var along_exit := motion.dot(forward)*crossing*float(ag.dir)
	var arc: float = cumulative[ag.seg_i]+ag.s_ab
	var low := arc+minf(0.0,along_exit)-along_half
	var high := arc+maxf(0.0,along_exit)+along_half
	var cuts: Dictionary = {}
	var rights: Array[Vector2] = []
	# Contiguous walks stop at the first nonlocal/opposing shoulder. The 3m
	# range is the existing reservation's endpoint cap, not new pavement.
	for walk: int in [-1,1]:
		var index := ag.seg_i if walk<0 else ag.seg_i+1
		while index>=0 and index<points.size()-1:
			var length := points[index].distance_to(points[index+1])
			if cumulative[index]-3.0>=high or cumulative[index+1]+3.0<=low:
				break
			var direction := (points[index+1]-points[index]).normalized()*float(ag.dir)
			var edge_right := Vector2(-direction.y,direction.x)
			if length<=0.0 or direction.dot(forward)<=0.0 or (start-points[index]).dot(edge_right)<0.0 or motion.dot(edge_right)<=0.0:
				break
			cuts[index] = Vector2(low-cumulative[index],high-cumulative[index])
			rights.append(edge_right)
			index += walk
	if not cuts.has(ag.seg_i):
		return {}
	return {"road_id":ag.road_id,"start":start,"rights":rights,"cuts":cuts}


func _departure_extent(size: Vector3, yaw: float, axis: Vector2) -> float:
	var basis := Basis(Vector3.UP,yaw)
	return absf(Vector2(basis.x.x,basis.x.z).dot(axis))*size.x*0.5+absf(Vector2(basis.z.x,basis.z.z).dot(axis))*size.z*0.5


func _departure_outward(start: Vector3, finish: Vector3, departure: Dictionary) -> bool:
	if departure.is_empty():
		return true # direct floor/curb controls have no road reservation exception
	var origin: Vector2 = departure["start"]
	var current := Vector2(start.x,start.z)
	var motion := Vector2(finish.x-start.x,finish.z-start.z)
	for right: Vector2 in departure["rights"]:
		if (current-origin).dot(right)<-0.00001 or motion.dot(right)<-0.00001:
			return false
	return true


## The footprint and the complete entry corridor require actual loaded floors.
## Only the subject RID is excluded from supporting-floor rays; the body query
## retains every collider and distinguishes the subject by exact identity.
func _parking_sample(ag: TrafficAgent, guess: Vector3, yaw: float, size: Vector3, exclusions: Array) -> Dictionary:
	if not ProtoWorldStream._ruin_footprint_clear(guess,size,yaw,exclusions):
		return {}
	var basis := Basis(Vector3.UP,yaw)
	var floor_y := 0.0
	var center_support: Dictionary = {}
	var grade := float(TRAFFIC["pull_over_max_grade"])
	var offsets: Array[Vector3] = [Vector3.ZERO,Vector3(-size.x/2,0,-size.z/2),Vector3(size.x/2,0,-size.z/2),Vector3(size.x/2,0,size.z/2),Vector3(-size.x/2,0,size.z/2)]
	for local: Vector3 in offsets:
		var point := guess+basis*local
		var hit := _parking_floor(ag,point)
		if hit.is_empty():
			return {}
		var height: float = hit["position"].y
		if local==Vector3.ZERO:
			floor_y = height
			center_support = hit
		elif absf(height-floor_y)>local.length()*grade+0.02:
			return {}
	var shape := BoxShape3D.new()
	shape.size = Vector3(size.x,maxf(2.2,size.y),size.z)
	var query := PhysicsShapeQueryParameters3D.new()
	query.shape = shape
	query.transform = Transform3D(basis,Vector3(guess.x,floor_y+0.25+shape.size.y/2,guess.z))
	query.collision_mask = 1
	for hit: Dictionary in get_world_3d().direct_space_state.intersect_shape(query,64):
		if hit["collider"]!=ag:
			return {}
	return {"position":Vector3(guess.x,floor_y+0.62,guess.z),"support":center_support}


func _parking_floor(ag: TrafficAgent, guess: Vector3) -> Dictionary:
	var ray := PhysicsRayQueryParameters3D.create(guess+Vector3.UP,guess-Vector3.UP*2,1)
	ray.exclude = [ag.get_rid()]
	var hit: Dictionary = get_world_3d().direct_space_state.intersect_ray(ray)
	if hit.is_empty() or (hit["normal"] as Vector3).y<cos(atan(float(TRAFFIC["pull_over_max_grade"]))):
		return {}
	return hit


## Return -1 for an unsafe transition, otherwise the number of curb boundaries.
## A coarse interval's average grade can conceal a step. Refine only changes
## of physical support or departures from the measured supporting planes;
## ordinary continuous <=6% slopes retain the original grade law.
func _parking_floor_transition(ag: TrafficAgent, before: Dictionary, after: Dictionary, depth: int = 0) -> int:
	var a: Vector3 = before["position"]
	var b: Vector3 = after["position"]
	var delta := b-a
	var horizontal := Vector2(delta.x,delta.z).length()
	var grade := float(TRAFFIC["pull_over_max_grade"])
	var ordinary := absf(delta.y)<=horizontal*grade+0.02
	var na: Vector3 = before["normal"]
	var nb: Vector3 = after["normal"]
	var rise_a := -(na.x*delta.x+na.z*delta.z)/na.y
	var rise_b := -(nb.x*delta.x+nb.z*delta.z)/nb.y
	var same_plane := absf(delta.y-rise_a)<=0.02 and absf(delta.y-rise_b)<=0.02
	if ordinary and same_plane and before["collider"]==after["collider"]:
		return 0
	if horizontal>0.04 and depth<10:
		var middle := _parking_floor(ag,(a+b)*0.5+Vector3.UP*0.62)
		if middle.is_empty():
			return -1
		var first := _parking_floor_transition(ag,before,middle,depth+1)
		if first<0:
			return -1
		var second := _parking_floor_transition(ag,middle,after,depth+1)
		return -1 if second<0 or first+second>1 else first+second
	if ordinary:
		return 0
	# The ray endpoints identify the real serving hull's edge: the first is
	# supported by that pavement and the second by lower non-road shoulder.
	# Rightward/outboard geometry rules out its terminal cap or an inward step.
	var serving := before["collider"] as Node
	var shoulder := after["collider"] as Node
	if not is_instance_valid(serving) or not is_instance_valid(shoulder):
		return -1
	if String(serving.get_meta("road_deck",""))!=ag.road_id or String(shoulder.get_meta("road_deck",""))!="":
		return -1
	if delta.y>=0.0 or -delta.y>float(TRAFFIC["pull_over_max_curb_drop_m"]):
		return -1
	var road := _road(ag.road_id)
	var points: PackedVector2Array = road["pts"]
	var projection := _arc_of(road,Vector2(a.x,a.z))
	var segment := int(projection["seg"])
	var direction := (points[segment+1]-points[segment]).normalized()
	var right := Vector2(-direction.y,direction.x)*float(ag.dir)
	var center := points[segment]+direction*float(projection["s_ab"])
	var half_width := float(ProtoUSMap.road_geometry(road)["width"])*0.5
	if (Vector2(a.x,a.z)-center).dot(right)<half_width-horizontal-0.02 or Vector2(delta.x,delta.z).dot(right)<=0.0:
		return -1
	return 1


func _parking_entry_clear(ag: TrafficAgent, start: Vector3, finish: Vector3, size: Vector3, exclusions: Array, departure: Dictionary = {}) -> bool:
	return not _parking_entry_path(ag,start,finish,size,exclusions,departure).is_empty()


## Validation is read-only. Only a successfully committed motion step spends
## the single curb allowance; full-path previews and failed retries never do.
func _parking_entry_path(ag: TrafficAgent, start: Vector3, finish: Vector3, size: Vector3, exclusions: Array, departure: Dictionary = {}) -> Dictionary:
	if not _departure_outward(start,finish,departure):
		return {}
	var delta := finish-start
	var length := Vector2(delta.x,delta.z).length()
	var yaw := atan2(-delta.x,-delta.z)
	var count := maxi(1,ceili(length/2.0))
	var sweep_size := size+Vector3(0,0,length/float(count))
	# Grade is a relation between supporting floors, not the chassis's residual
	# ride height while its bounded motion follows a pavement/shoulder change.
	# Validate the complete starting footprint too; never skip an unsafe step.
	var start_support := _parking_sample(ag,start,yaw,size,exclusions)
	if start_support.is_empty():
		return {}
	var previous: Dictionary = start_support["support"]
	var curbs := 0
	for step: int in range(1,count+2):
		# Include the true endpoint so a committed step cannot cross a boundary
		# beyond its last midpoint without recording consumption.
		var point := finish if step>count else start.lerp(finish,(float(step)-0.5)/float(count))
		var sample := _parking_sample(ag,point,yaw,sweep_size,exclusions)
		if sample.is_empty():
			return {}
		var boundary := _parking_floor_transition(ag,previous,sample["support"])
		if boundary<0:
			return {}
		curbs += boundary
		if curbs+int(ag._parking_curb_used)>1:
			return {}
		previous = sample["support"]
	return {"curb":curbs>0}


func _step_parking(ag: TrafficAgent, road: Dictionary, delta: float) -> void:
	if ag._parking.is_empty():
		# No safe site: decelerate without consuming the remaining road into the
		# destination junction. Search stays bounded and retries on its own clock.
		return
	var target: Vector3 = ag._parking["target"]
	var size: Vector3 = ag._parking["size"]
	var yaw := float(ag._parking["yaw"])
	if not bool(ag._parking["started"]):
		# The actor may have coasted while braking to its pull-over speed. Check
		# the complete entry again from its actual departure pose, not the old one.
		if not _parking_entry_clear(ag,ag.global_position,target,size,ag._parking["entry_exclusions"],ag._parking_departure):
			ag._parking.clear()
			ag.speed = 0.0
			ag._parking_retry = float(TRAFFIC["pull_over_retry_s"])
			return
		ag._parking["started"] = true
	var next := ag.global_position.move_toward(target,ag.speed*delta)
	var heading := target-ag.global_position
	var travel_yaw := atan2(-heading.x,-heading.z) if Vector2(heading.x,heading.z).length_squared()>0.000001 else yaw
	var support := _parking_sample(ag,next,travel_yaw,size,ag._parking["entry_exclusions"])
	var plot := _parking_sample(ag,target,yaw,size,ag._parking["plot_exclusions"])
	if not support.is_empty():
		next = ag.global_position.move_toward(support["position"],ag.speed*delta)
	var entry: Dictionary = {}
	if not support.is_empty() and not plot.is_empty():
		entry = _parking_entry_path(ag,ag.global_position,next,size,ag._parking["entry_exclusions"],ag._parking_departure)
	if entry.is_empty():
		ag._parking.clear()
		ag.speed = 0.0
		ag._parking_retry = float(TRAFFIC["pull_over_retry_s"])
		return
	var motion := next-ag.global_position
	if Vector2(motion.x,motion.z).length_squared()>0.000001:
		ag.rotation.y = atan2(-motion.x,-motion.z)
	if bool(entry["curb"]):
		ag._parking_curb_used = true
	ag.global_position = next
	var projection := _arc_of(road,Vector2(next.x,next.z))
	ag.seg_i = int(projection["seg"])
	ag.s_ab = float(projection["s_ab"])
	if next.distance_to(target)<=0.005:
		ag.rotation.y = yaw
		ag.arrived = true
		ag.speed = 0.0
		ag.cruise = 0.0
		_finish_managed_arrival(ag)


## Arrival flags alone cannot exempt a body: the actual current full footprint
## must still be a supported, clear managed plot outside the road reservations.
func _managed_parked_clear(ag: TrafficAgent) -> bool:
	if not ag.arrived or ag._parking.is_empty() or _managed_exit(_road(ag.road_id)).is_empty():
		return false
	return not _parking_sample(ag,ag.global_position,ag.rotation.y,_parking_size(ag),ag._parking["plot_exclusions"]).is_empty()


func _finish_managed_arrival(ag: TrafficAgent) -> void:
	if not _managed_parked_clear(ag):
		return
	if ag.global_position.distance_to(_anchor())>=float(TRAFFIC["vanish_r_min"]):
		despawn_agent(ag)
	elif _promoted.size()<int(TRAFFIC["promote_cap"]) and main!=null:
		# Arrival is individual: convoy followers still need their own validated
		# plots. Touch promotion keeps its existing chain and cargo behavior.
		promote(ag,0.0,true,false)


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
		if not is_instance_valid(c) or not (c is Node3D):
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


## EXITS ARE THE CONNECTIONS: near the serving off-ramp port, roll ONCE; on a
## take, transfer to the ramp polyline (right-side departures only) and ride it
## to the location — arrive at its end (the normal end-of-road law). A TRIP
## agent doesn't roll dice: it leaves at ITS destination exit, and only there.
func _maybe_take_exit(ag: TrafficAgent, road: Dictionary, defer_managed_handoff: bool = false) -> void:
	for e in usmap.exits:
		if String(e["highway_id"]) != ag.road_id or String(e["id"]) == ag._exit_rolled:
			continue
		var port := _port_for(e, ag.dir)
		if port.is_empty():
			continue
		var mouth: Vector2 = port["pos"]
		if Vector2(ag.global_position.x, ag.global_position.z).distance_to(mouth) > EXIT_TRIGGER_M:
			continue
		ag._exit_rolled = String(e["id"]) # rolled — never re-rolled on the same pass
		if ag.dest_exit_id != "" and String(e["id"]) != ag.dest_exit_id:
			continue # not MY exit — a car with somewhere to be doesn't wander off
		var ramp: Dictionary = port["road"]
		# the ramp must depart the agent's travel side (never dart across the median)
		var rpts: PackedVector2Array = ramp["pts"]
		var mouth_i := 0 if rpts[0].distance_to(mouth) <= rpts[rpts.size() - 1].distance_to(mouth) else rpts.size() - 1
		if bool(ramp.get("one_way", false)) and mouth_i != 0:
			continue
		var away := (rpts[1] - rpts[0]).normalized() if mouth_i == 0 else (rpts[rpts.size() - 2] - rpts[rpts.size() - 1]).normalized()
		var pts: PackedVector2Array = road["pts"]
		var d := (pts[ag.seg_i + 1] - pts[ag.seg_i]).normalized() * float(ag.dir)
		if String(ramp.get("ramp_role", "")) == "" and away.dot(Vector2(-d.y, d.x)) < 0.1:
			continue
		if ag.dest_exit_id == "" and rng.randf() > float(TRAFFIC["exit_take_chance"]):
			continue # destination-less drifters still roll the old dice
		var next_segment := 0
		var next_station := 0.0
		var next_direction := 1
		if mouth_i == 0:
			next_direction = 1
			next_segment = 0
			next_station = 0.0
		else:
			next_direction = -1
			next_segment = rpts.size() - 2
			next_station = rpts[next_segment].distance_to(rpts[next_segment + 1])
		ag.cruise = minf(ag.cruise, float(TRAFFIC["speed_lanes_2"]))
		if defer_managed_handoff and not _managed_exit(ramp).is_empty():
			var cumulative := _cum(road)
			var current_arc: float = cumulative[ag.seg_i]+ag.s_ab
			var mouth_arc := float(port["highway_arc_m"])
			# A late actor has missed this physical door; never send it backward up
			# the highway to manufacture a take after the ramp mouth has passed.
			if (mouth_arc-current_arc)*float(ag.dir)<-0.02:
				return
			var entrance_arc := clampf(mouth_arc-15.0*float(ag.dir),0.0,float(cumulative[-1]))
			var entrance_segment := 0
			while entrance_segment+1<cumulative.size()-1 and cumulative[entrance_segment+1]<entrance_arc:
				entrance_segment += 1
			var entrance_station: float = entrance_arc-cumulative[entrance_segment]
			var outer_lane := int(ProtoUSMap.road_geometry(road)["per_side"])-1
			var entry_targets: Array[Vector3] = []
			# Actors already inside the renderer's 15m transfer entrance go straight
			# to its mouth; the first waypoint must never reverse highway progress.
			if (entrance_arc-current_arc)*float(ag.dir)>0.02:
				entry_targets.append(_lane_position(road,entrance_segment,entrance_station,ag.dir,outer_lane))
			var ramp_target := _lane_position(ramp,next_segment,next_station,next_direction,0)
			var mouth_center := Vector3(mouth.x,ramp_target.y,mouth.y)
			if ag.global_position.distance_to(mouth_center)>0.005:
				entry_targets.append(mouth_center)
			entry_targets.append(ramp_target)
			var first_target: Vector3 = entry_targets.pop_front()
			ag._connection = {"road":String(ramp["id"]),"seg":next_segment,"s":next_station,
				"dir":next_direction,"target":first_target,"entry_waypoints":entry_targets,
				"track_source_arc":true}
			return
		ag.road_id = String(ramp["id"])
		ag.lane = 0
		ag.dir = next_direction
		ag.seg_i = next_segment
		ag.s_ab = next_station
		return


## Pick the exit's DEPARTURE ramp for a given travel direction. Since the 0.18b
## mirrors, an exit owns ramps for BOTH directions (`side` = the pts-order sense
## a ramp serves) — the old first-in-road-order pick could hand an agent the
## opposite carriageway's ramp and the side check would then skip the exit.
## Explicit role/side ports win even when displaced from the sign. Legacy
## inference is contained by ProtoUSMap; ON-ramps never depart.
func _ramp_for(e: Dictionary, want_dir: int = 0) -> Dictionary:
	return _port_for(e, want_dir).get("road", {})


func _port_for(e: Dictionary, want_dir: int = 0) -> Dictionary:
	var legacy: Dictionary = {}
	for port: Dictionary in usmap.exit_ports(e, "off"):
		var side := int(port["side"])
		if want_dir == 0 or side == want_dir:
			return port
		if side == 0 and legacy.is_empty():
			legacy = port
	if not legacy.is_empty():
		return legacy
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
	# INTERSTATES ONLY (owner P0: "traffic only drives on the highway") — ambient
	# flow never materializes on a ramp or spur; ramps are reached by TRIPS.
	var candidates: Array = []
	for c0 in usmap.roads_near(anchor, float(TRAFFIC["spawn_r_max"]) + 150.0):
		if String(c0["kind"]) == "interstate":
			candidates.append(c0)
	if candidates.is_empty():
		return
	var weights := 0.0
	for c in candidates:
		weights += float(int(c["lanes"]))
	var roll := rng.randf() * weights
	var pick: Dictionary = candidates[0]
	for c in candidates:
		roll -= float(int(c["lanes"]))
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
		var requested_followers := rng.randi_range(1,2)
		var available_followers := maxi(0,budget-agents.size())
		spawn_convoy_behind(lead,mini(requested_followers,available_followers),cargo)


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
	var base_speed := float(TRAFFIC["speed_lanes_%d" % int(road["lanes"])]) if TRAFFIC.has("speed_lanes_%d" % int(road["lanes"])) else float(TRAFFIC["speed_lanes_4"])
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
		if not tag0.arrived and not _managed_exit(_road(tag0.road_id)).is_empty():
			# A failed bumper/damage promotion is not arrival. Keep the managed
			# body/trip/cruise and any in-progress validated pull-over intact.
			return
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
		var off := right * (float(ProtoUSMap.road_geometry(road)["width"]) * 0.5 + 4.0)
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
