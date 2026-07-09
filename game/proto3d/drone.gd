## STAGE 8, rung 1 of ROBOTICS + LIVING WORLD Phase 3 (LIVING_WORLD_DSOA §Phase 3):
## the scout drone. Two jobs, one bird:
##  · PATROL (deployed from the pack): circle the deploy point, ping threats.
##  · ROUTE SCOUT (launched from the safehouse DOCK): fly OUT along your course
##    WITHOUT your body leaving home, MARK hazards on the map (a 🛸 waypoint),
##    then fly back and dock. The remote eye of the Return-to-a-Changed-State loop.
## Pings ride the ONE perception engine (reveal bubbles — dog nose, Sam, drone).
## The battery runs down; a dead battery lands the bird as a pickup. The bird is
## a BODY (combatant group): it can be shot down and LOST — a wreck, not a refund.
class_name ProtoDrone
extends Node3D

enum DroneMode { PATROL, ROUTE_OUT, ROUTE_BACK }

const PATROL_RADIUS := 18.0
const PATROL_SPEED := 0.45 ## radians/s around the deploy point
const HOVER_H := 8.0
const SCAN_RANGE := 26.0
const BATTERY_MAX := 60.0
const FLY_SPEED := 16.0     ## route-scout cruise (m/s)
const ROUTE_RANGE := 220.0  ## how far out the signal holds

var battery: float = BATTERY_MAX
var mode: DroneMode = DroneMode.PATROL
var piloted: bool = false ## while true, ProtoDronePilot owns the bird — autonomy stands down
var parked: bool = false  ## landed by the pilot: stays DOWN (grabbable) until re-taken
var hp: float = 12.0
var marks: int = 0 ## hazards marked this flight (the report card)
var _route_target: Vector3 = Vector3.ZERO
var _dock: Node3D = null
var _main: Node = null
var _anchor: Vector3
var _ang: float = 0.0
var _scan_cd: float = 0.0
var _rotor: MeshInstance3D


static func create(main: Node, deploy_pos: Vector3) -> ProtoDrone:
	var d := ProtoDrone.new()
	d._main = main
	d._anchor = deploy_pos
	var hull := MeshInstance3D.new()
	var hm := BoxMesh.new()
	hm.size = Vector3(0.5, 0.14, 0.5)
	hull.mesh = hm
	hull.material_override = ProtoWorldBuilder.material(Color(0.2, 0.22, 0.24), 0.4)
	d.add_child(hull)
	d._rotor = MeshInstance3D.new()
	var rm := BoxMesh.new()
	rm.size = Vector3(0.8, 0.03, 0.08)
	d._rotor.mesh = rm
	d._rotor.material_override = ProtoWorldBuilder.material(Color(0.6, 0.62, 0.64), 0.3)
	d._rotor.position.y = 0.1
	d.add_child(d._rotor)
	var eye := MeshInstance3D.new()
	var em := SphereMesh.new()
	em.radius = 0.06
	em.height = 0.12
	eye.mesh = em
	eye.material_override = ProtoWorldBuilder.material(Color(0.2, 0.9, 0.4), 0.1, true)
	eye.position.y = -0.09
	d.add_child(eye)
	d.add_to_group("combatant") # a body in the world: it CAN be shot down (lost)
	# THE RETRIEVAL BUG (drone fix, 2026-07-09): the pack-up contract (interact_prompt/
	# interact) existed but the bird never JOINED the interact scan's group — a
	# pilot-parked bird sat unretrievable forever while the shutoff line promised
	# "E near the bird packs it up". The group makes the promise true.
	d.add_to_group("interactable")
	# The rotor HUM rides the bird (sound-map pass): a positional loop, so you hear the
	# drone approach/leave and can find your own scout by ear.
	if main != null and "audio" in main and main.audio != null:
		main.audio.attach_loop("drone_hum", d, -14.0)
	return d


## A ROUTE SCOUT: out to the target, marking hazards, then home to the dock.
static func launch_route(main: Node, dock: Node3D, target: Vector3) -> ProtoDrone:
	var d := create(main, dock.global_position)
	d.mode = DroneMode.ROUTE_OUT
	d._dock = dock
	var to_t := target - dock.global_position
	to_t.y = 0.0
	if to_t.length() > ROUTE_RANGE: # the signal only holds so far
		to_t = to_t.normalized() * ROUTE_RANGE
	d._route_target = dock.global_position + to_t
	d._route_target.y = 0.0
	return d


func battery_pct() -> float:
	return battery / BATTERY_MAX * 100.0


## On the ground and idle — close enough to grab (QoL: a landed bird is retrievable).
func landed() -> bool:
	return parked or (not piloted and global_position.y < 1.0)


# --- Interactable contract (QoL): E packs up a LANDED drone back into the pack. -----
func interact_position() -> Vector3:
	return global_position


func interact_prompt(_main: Node) -> String:
	return "E — 🛸 pack up the drone" if landed() else ""


func interact(main: Node) -> void:
	if not landed():
		return
	if "backpack" in main and main.backpack != null:
		main.backpack.add("drone", 1)
	_unpair() # the controller folds into the kit — redeploying hands it back
	if "audio" in main and main.audio != null:
		main.audio.play_ui("camera_click", -6.0)
	if "drone" in main and main.drone == self:
		main.drone = null
	if main.has_method("notify"):
		main.notify("🛸 Bird packed up")
	queue_free()


## THE PAIRING (drone fix, 2026-07-09): the REMOTE row lives exactly as long as its
## bird. Every way a bird leaves the sky for good calls this — strip the remote from
## the pack and fold the split eye if it was watching this bird. (The dock return
## keeps the remote — the bird's home, the controller stays on the couch arm.)
func _unpair(strip_remote: bool = true) -> void:
	if _main == null:
		return
	if strip_remote and "backpack" in _main and _main.backpack != null:
		_main.backpack.remove("drone_remote", 1)
	if "split_view" in _main and _main.split_view != null \
			and _main.split_view.active and _main.split_view._remote == self:
		_main.split_view.deactivate()


## Shot down = LOST: a wreck where it fell, salvage for whoever walks there.
func take_damage(amount: float, _attacker: Node3D = null) -> void:
	hp -= amount
	if hp > 0.0:
		return
	var wreck := ProtoChest.create("Drone wreck", {"scrap": 2}, false)
	_main.add_child(wreck)
	var ground := global_position
	ground.y = 0.1
	wreck.global_position = ground
	_unpair() # SIGNAL LOST for real — the paired remote dies with the bird
	if _main.has_method("notify"):
		_main.notify("🛸 SIGNAL LOST — the bird went down. The wreck's where it fell.")
	if "drone" in _main:
		_main.drone = null
	queue_free()


## RECALL the bird hands-off (2026-07-09 playtest "a button to automatically fly back").
## A DOCK scout flies to its dock (existing ROUTE_BACK); a PACK bird (no dock) homes to
## where the player is and sets itself down as a RECOVERABLE pickup. The caller frees the
## body first if you were piloting — here we just drop autonomy's brakes and point home.
func recall() -> void:
	piloted = false
	parked = false
	mode = DroneMode.ROUTE_BACK
	if not is_instance_valid(_dock) and _main != null and "player" in _main and _main.player != null:
		_anchor = _main.player.global_position # a pack bird flies back to YOU
	if _main != null and _main.has_method("notify"):
		_main.notify("🛸 Recalling — the bird's turning for home.")


## Set the bird down as a RECOVERABLE pickup (a {drone} box you can grab & redeploy), NOT a
## wreck — used by a dead battery and by a dockless recall. Folds the paired remote with it.
func _land_as_pickup(msg: String = "🛸 The bird set itself down — grab it to redeploy.") -> void:
	if _main == null:
		queue_free()
		return
	var pickup := ProtoChest.create("Landed drone", {"drone": 1}, false)
	_main.add_child(pickup)
	var ground := global_position
	ground.y = 0.1
	pickup.global_position = ground
	_unpair()
	if _main.has_method("notify"):
		_main.notify(msg)
	if "drone" in _main:
		_main.drone = null
	queue_free()


func _physics_process(delta: float) -> void:
	if parked:
		return # set down by the pilot — rotors still, grabbable, waiting for the stick
	if _rotor:
		_rotor.rotation.y += 22.0 * delta
	if piloted:
		return # you're flying it — the pilot owns position, altitude, battery and shutoff
	match mode:
		DroneMode.PATROL:
			# Patrol the ring over the deploy point.
			_ang += PATROL_SPEED * delta
			var target := _anchor + Vector3(cos(_ang) * PATROL_RADIUS, HOVER_H, sin(_ang) * PATROL_RADIUS)
			global_position = global_position.lerp(target, 1.0 - exp(-3.0 * delta))
		DroneMode.ROUTE_OUT:
			# Fly the route. Your body stays home — that's the whole point.
			var out := _route_target + Vector3(0, HOVER_H, 0)
			global_position = global_position.move_toward(out, FLY_SPEED * delta)
			if global_position.distance_to(out) < 1.5 or battery < BATTERY_MAX * 0.45:
				mode = DroneMode.ROUTE_BACK
				if _main.has_method("notify"):
					_main.notify("🛸 Route apex — the bird turns for home (%d mark%s)." % [marks, "" if marks == 1 else "s"])
		DroneMode.ROUTE_BACK:
			var home := (_dock.global_position if is_instance_valid(_dock) else _anchor) + Vector3(0, HOVER_H * 0.5, 0)
			global_position = global_position.move_toward(home, FLY_SPEED * delta)
			if global_position.distance_to(home) < 1.6:
				if is_instance_valid(_dock) and _dock.has_method("dock_drone"):
					_dock.dock_drone(self)
				else:
					_land_as_pickup() # recalled with no dock — set down recoverable, not a wreck
				return

	# The eye: threats under the bird ping YOUR perception — and a ROUTE scout
	# MARKS them on the map (the Journey Board's 🛸 HAZARD waypoint).
	_scan_cd -= delta
	if _scan_cd <= 0.0:
		_scan_cd = 2.5
		for node in get_tree().get_nodes_in_group("threat"):
			var t := node as Node3D
			if t == null or not is_instance_valid(t) or t is StaticBody3D:
				continue
			if t.global_position.distance_to(global_position) < SCAN_RANGE:
				if _main and "vision_cone" in _main:
					_main.vision_cone.reveal_at(t.global_position)
					_main.notify("🛸 Drone ping — movement below")
				if mode != DroneMode.PATROL and _main.has_method("mark_hazard"):
					_main.mark_hazard(t.global_position)
					marks += 1
				break

	# Battery: when it dies, the bird autolands as a pickup (nothing is lost).
	battery -= delta
	if battery <= 0.0:
		var pickup := ProtoChest.create("Landed drone", {"drone": 1}, false)
		_main.add_child(pickup)
		var ground := global_position
		ground.y = 0.1
		pickup.global_position = ground
		_unpair() # the bird's down and boxed — the remote folds with it
		if _main.has_method("notify"):
			_main.notify("🛸 Battery dead — the bird set itself down")
		if "drone" in _main:
			_main.drone = null
		queue_free()