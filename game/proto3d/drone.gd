## STAGE 8, rung 1 of ROBOTICS (PROGRESSION Hotwire→Drone ladder): the scout
## drone. Deploy it from the pack and it patrols a circle over the deploy point,
## PINGING threats it sees into YOUR perception (reveal bubbles — same channel
## as the dog's nose and Sam's callouts: one perception engine, many sensors).
## The battery runs ~60s, then the bird lands as a pickup. SecondaryView's
## 🛸 DRONE mode looks straight down from it.
class_name ProtoDrone
extends Node3D

const PATROL_RADIUS := 18.0
const PATROL_SPEED := 0.45 ## radians/s around the deploy point
const HOVER_H := 8.0
const SCAN_RANGE := 26.0
const BATTERY_MAX := 60.0

var battery: float = BATTERY_MAX
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
	return d


func battery_pct() -> float:
	return battery / BATTERY_MAX * 100.0


func _physics_process(delta: float) -> void:
	# Patrol the ring over the deploy point.
	_ang += PATROL_SPEED * delta
	var target := _anchor + Vector3(cos(_ang) * PATROL_RADIUS, HOVER_H, sin(_ang) * PATROL_RADIUS)
	global_position = global_position.lerp(target, 1.0 - exp(-3.0 * delta))
	if _rotor:
		_rotor.rotation.y += 22.0 * delta

	# The eye: threats under the bird ping YOUR perception.
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
				break

	# Battery: when it dies, the bird autolands as a pickup (nothing is lost).
	battery -= delta
	if battery <= 0.0:
		var pickup := ProtoChest.create("Landed drone", {"drone": 1}, false)
		_main.add_child(pickup)
		var ground := global_position
		ground.y = 0.1
		pickup.global_position = ground
		if _main.has_method("notify"):
			_main.notify("🛸 Battery dead — the bird set itself down")
		if "drone" in _main:
			_main.drone = null
		queue_free()