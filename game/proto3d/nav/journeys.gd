## THE JOURNEY DIRECTOR, P1 slice (NAVIGATION.md §1/§9 — the WALK domain):
## GOAL → walk-graph legs → LOCOMOTION (the ported dog laws) → ARRIVE → verb.
## Directors say WHY; this node only moves people. NEVER A STATUE: the failure
## ladder is live (silent recover → re-plan ×8 edge cost → fail FORWARD with a
## wait, never a freeze). DRIVE/FLY tiers and records arrive with NAV-P2/P3.
class_name ProtoJourneys
extends Node

signal journey_arrived(id: String)
signal journey_failed(id: String, reason: String)

const ARRIVE_NODE_TOL := 0.9
const ARRIVE_FINAL_TOL := 2.2 ## "at the doorway" — the capsule jostles on the gap's side walls right at 1.4
const STUCK_ESCALATE := 2 ## local recoveries inside 20 s before a re-plan
const WAIT_FAIL_S := 20.0

var journeys: Array = [] ## journey dicts (§9.1 shape, WALK legs only in P1)
var total_recoveries := 0 ## ladder fires (sim-readable — the never-a-statue receipts)
var _main: Node = null
var _graphs: Dictionary = {} ## town id -> ProtoWalkGraph
var _seq := 0


static func create(main: Node) -> ProtoJourneys:
	var j := ProtoJourneys.new()
	j._main = main
	return j


## Hand-built obstacles the placement rows can't see (they retire when the
## authored core becomes placements): Meridian's safehouse + kennel yard.
const HAND_BUILT_RECTS: Dictionary = {
	"meridian": [
		[Vector2(110, -325), Vector2(5.8, 6.8), 0.0],
		[Vector2(123, -316), Vector2(4.8, 4.8), 0.0],
	],
}


func graph_for_town(town: Dictionary) -> ProtoWalkGraph:
	var tid := String(town["id"])
	if not _graphs.has(tid):
		var um: ProtoUSMap = _main.stream.usmap if (_main != null and "stream" in _main and _main.stream != null) else ProtoUSMap.get_default()
		_graphs[tid] = ProtoWalkGraph.build_for_town(um, town, HAND_BUILT_RECTS.get(tid, []))
	return _graphs[tid]


## Walk an actor (any CharacterBody3D with a walkable capsule) to a placement's
## DOOR, dwell there, done. The P1 contract: door-to-door through a real door.
func start_walk(actor: CharacterBody3D, town: Dictionary, placement_id: String, dwell_s: float = 0.0, speed: float = 1.4) -> String:
	var g := graph_for_town(town)
	if not g.doors.has(placement_id):
		return ""
	var from_node := g.nearest_visible_node(Vector2(actor.global_position.x, actor.global_position.z))
	var path: Array = g.a_star(from_node, String(g.doors[placement_id]))
	if path.is_empty():
		return ""
	_seq += 1
	var id := "jrn_%d" % _seq
	journeys.append({"id": id, "actor": actor, "town": String(town["id"]),
		"path": path, "leg_idx": 0, "state": "active", "dwell_s": dwell_s,
		"speed": speed, "stuck": {"t": 0.0}, "recover_n": 0, "recover_window": 0.0,
		"wait_t": 0.0, "target_pid": placement_id,
		"best_d": 1e9, "stall_t": 0.0, "side_bias": (1.0 if (_seq % 2 == 0) else -1.0)})
	return id


func state_of(id: String) -> Dictionary:
	for j in journeys:
		if String(j["id"]) == id:
			return j
	return {}


func _physics_process(delta: float) -> void:
	for j in journeys:
		if String(j["state"]) == "active":
			_tick_walk(j, delta)
	journeys = journeys.filter(func(j: Dictionary) -> bool: return String(j["state"]) != "done")


func _tick_walk(j: Dictionary, delta: float) -> void:
	var actor: CharacterBody3D = j["actor"]
	if actor == null or not is_instance_valid(actor):
		j["state"] = "done"
		return
	var g: ProtoWalkGraph = _graphs[String(j["town"])]
	var path: Array = j["path"]
	var idx := int(j["leg_idx"])
	if idx >= path.size():
		# ARRIVED at the door — dwell, then done (the verb handoff point)
		j["dwell_s"] = float(j["dwell_s"]) - delta
		actor.velocity.x = move_toward(actor.velocity.x, 0.0, 30.0 * delta)
		actor.velocity.z = move_toward(actor.velocity.z, 0.0, 30.0 * delta)
		if not actor.is_on_floor():
			actor.velocity.y -= 24.0 * delta
		actor.move_and_slide()
		if float(j["dwell_s"]) <= 0.0:
			j["state"] = "done"
			journey_arrived.emit(String(j["id"]))
		return
	var node_pos: Vector2 = g.nodes[path[idx]]
	var target := Vector3(node_pos.x, actor.global_position.y, node_pos.y)
	var tol := ARRIVE_FINAL_TOL if idx == path.size() - 1 else ARRIVE_NODE_TOL
	var flat := Vector2(actor.global_position.x, actor.global_position.z)
	if flat.distance_to(node_pos) <= tol:
		if idx == path.size() - 1 and _main != null and "audio" in _main and _main.audio != null:
			_main.audio.play_at("door_open", actor.global_position, -10.0) # the v0 door: threshold + the player's own audio
		j["leg_idx"] = idx + 1
		j["best_d"] = 1e9
		j["stall_t"] = 0.0
		return
	# LOCOMOTION: the ported dog laws + whiskers, gravity honest
	var dir := (target - actor.global_position)
	dir.y = 0.0
	dir = dir.normalized()
	# WALL-FOLLOW (the bug algorithm, committed): while follow_t runs, hug the
	# blocked face on the SAME side — rotate until the way ahead clears, and
	# drop back to the straight line the moment the target opens up.
	if float(j.get("follow_t", 0.0)) > 0.0:
		j["follow_t"] = float(j["follow_t"]) - delta
		var space := actor.get_world_3d().direct_space_state
		var eye := actor.global_position + Vector3(0, 0.5, 0)
		var to_target := space.intersect_ray(PhysicsRayQueryParameters3D.create(
			eye, eye + dir * 3.0, 0xFFFFFFFF, [actor.get_rid()]))
		if to_target.is_empty():
			j["follow_t"] = 0.0 # the line to the target is open — resume
		else:
			var bias := float(j["side_bias"])
			for step in [0.0, 0.6, 1.2, 1.8, 2.4]:
				var cand := dir.rotated(Vector3.UP, float(step) * bias)
				var probe := space.intersect_ray(PhysicsRayQueryParameters3D.create(
					eye, eye + cand * 1.8, 0xFFFFFFFF, [actor.get_rid()]))
				if probe.is_empty():
					dir = cand
					break
	dir = ProtoSteering.whiskers(actor, dir, float(j["side_bias"]))
	var steer_target := actor.global_position + dir * 4.0
	var yaw := ProtoSteering.walk_step(actor, steer_target, float(j["speed"]), delta)
	actor.rotation.y = lerp_angle(actor.rotation.y, yaw, 10.0 * delta)
	if not actor.is_on_floor():
		actor.velocity.y -= 24.0 * delta
	else:
		actor.velocity.y = 0.0
	# THE FAILURE LADDER — two ears: the dog's pinned-check (velocity dies) AND
	# the ORBIT check (full speed, zero progress — a walker circling a wall
	# never trips the velocity test; the dog never orbited because heel-follow
	# re-rolls its angle, so journeys re-roll on stalled PROGRESS instead)
	var d_now := flat.distance_to(node_pos)
	if d_now < float(j["best_d"]) - 0.4:
		j["best_d"] = d_now
		j["stall_t"] = 0.0
	else:
		j["stall_t"] = float(j["stall_t"]) + delta
	# one ladder at a time: while wall-following, the random sidestep stays
	# HOLSTERED — its impulses sabotage the committed line
	var stuck_fired := false
	if float(j.get("follow_t", 0.0)) <= 0.0:
		stuck_fired = ProtoSteering.stuck_tick(j["stuck"], actor, target, float(j["speed"]), delta)
	# EITHER ear engages the committed wall-follow: pinned (velocity died) OR
	# stalled (full speed, zero progress). The random jiggle can reset the
	# stall timer forever in a pocket — the pinned ear is what breaks that.
	if stuck_fired or float(j["stall_t"]) > 2.0:
		j["stall_t"] = 0.0
		# DODGE COMMITMENT (the autopilot's paid-for lesson): commit to a
		# wall-follow on the SAME side; flip sides only after two full follows
		# fail to move the needle.
		var dn := int(j.get("follow_n", 0))
		if dn >= 2:
			j["side_bias"] = -float(j["side_bias"])
			dn = 0
		j["follow_t"] = 4.0 + 2.0 * float(dn)
		j["follow_n"] = dn + 1
		j["best_d"] = 1e9
		stuck_fired = true
	elif float(j["stall_t"]) == 0.0 and float(j["best_d"]) < 1e8:
		j["follow_n"] = 0 # progress resumed — the next blockage starts fresh
	if stuck_fired:
		total_recoveries += 1
		j["recover_n"] = int(j["recover_n"]) + (1 if float(j["recover_window"]) > 0.0 else 0)
		if float(j["recover_window"]) <= 0.0:
			j["recover_n"] = 1
		j["recover_window"] = 20.0
		if int(j["recover_n"]) > STUCK_ESCALATE:
			j["best_d"] = 1e9
			_replan(j, g)
	actor.move_and_slide()


## Ladder step 2: re-route with the CURRENT edge cost ×8 (walk around the
## blockage). Step 3 fail-forward: wait at the nearest node, then give up loud.
func _replan(j: Dictionary, g: ProtoWalkGraph) -> void:
	j["recover_n"] = 0
	var actor: CharacterBody3D = j["actor"]
	var path: Array = j["path"]
	var idx := int(j["leg_idx"])
	if idx >= path.size() - 1:
		return
	var blocked_a := String(path[idx])
	# tax the edge INTO the blocked node so A* routes around it
	for e in (g.adj.get(String(path[maxi(idx - 1, 0)]), []) as Array):
		if String(e["to"]) == blocked_a:
			e["cost"] = float(e["cost"]) * 8.0
	var from_node := g.nearest_node(Vector2(actor.global_position.x, actor.global_position.z))
	var alt: Array = g.a_star(from_node, String(path[path.size() - 1]))
	if alt.is_empty():
		j["wait_t"] = float(j.get("wait_t", 0.0)) + 0.001
		if float(j["wait_t"]) > WAIT_FAIL_S:
			j["state"] = "done"
			journey_failed.emit(String(j["id"]), "no_route")
		return
	j["path"] = alt
	j["leg_idx"] = 0
