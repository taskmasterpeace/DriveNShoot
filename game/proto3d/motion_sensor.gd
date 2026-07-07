## MOTION SENSOR (gadgets goal): a deployable tripwire-without-the-wire. Plant it on an
## approach and it PINGS you — a toast + a perception reveal — whenever a threat crosses
## its radius. Never spends ammo, never sleeps; the wasteland's cheapest guard dog.
## Pick it back up with E.
class_name ProtoMotionSensor
extends Node3D

const RADIUS := 14.0
const REPING_S := 6.0       ## quiet time between pings so a circling howler isn't a siren
const SCAN_S := 0.5

var pings: int = 0          ## sim hook: how many times it has fired
var _main: Node = null
var _cd: float = 0.0
var _scan_t: float = 0.0
var _lamp: StandardMaterial3D


static func create(main: Node, at: Vector3) -> ProtoMotionSensor:
	var s := ProtoMotionSensor.new()
	s._main = main
	s.add_to_group("interactable")
	s.add_to_group("motion_sensor")
	# Tripod stub + sensor head with an amber standby lamp.
	var leg := MeshInstance3D.new()
	var lm := BoxMesh.new()
	lm.size = Vector3(0.1, 0.7, 0.1)
	leg.mesh = lm
	leg.material_override = ProtoWorldBuilder.material(Color(0.3, 0.3, 0.32), 0.6)
	leg.position.y = 0.35
	s.add_child(leg)
	var head := MeshInstance3D.new()
	var hm := BoxMesh.new()
	hm.size = Vector3(0.22, 0.16, 0.16)
	head.mesh = hm
	s._lamp = StandardMaterial3D.new()
	s._lamp.albedo_color = Color(0.96, 0.72, 0.2)
	s._lamp.emission_enabled = true
	s._lamp.emission = Color(0.96, 0.72, 0.2)
	s._lamp.emission_energy_multiplier = 0.8
	head.material_override = s._lamp
	head.position.y = 0.78
	s.add_child(head)
	s.position = at
	return s


func _physics_process(delta: float) -> void:
	_cd = maxf(0.0, _cd - delta)
	_scan_t -= delta
	if _scan_t > 0.0 or _cd > 0.0:
		return
	_scan_t = SCAN_S
	for node in get_tree().get_nodes_in_group("threat"):
		var t := node as Node3D
		if t == null or not is_instance_valid(t) or t is StaticBody3D:
			continue
		if t.global_position.distance_to(global_position) <= RADIUS:
			_trip(t)
			return


func _trip(t: Node3D) -> void:
	pings += 1
	_cd = REPING_S
	if _lamp != null:
		_lamp.emission_energy_multiplier = 3.0   # flare the lamp; settles on the next scan
	if _main != null:
		if "vision_cone" in _main and _main.vision_cone != null:
			_main.vision_cone.reveal_at(t.global_position)   # the sensor's eye becomes yours
		if "audio" in _main and _main.audio != null:
			_main.audio.play_at("sensor_ping", global_position, -2.0) # the beep comes FROM the sensor
		if _main.has_method("notify"):
			_main.notify("📡 MOTION — the sensor tripped. Something's moving out there.")


func interact_position() -> Vector3:
	return global_position


func interact_prompt(_main: Node) -> String:
	return "E — pack up the MOTION SENSOR"


func interact(main: Node) -> void:
	if "backpack" in main and main.backpack != null:
		main.backpack.add("motion_sensor", 1)
	if main.has_method("notify"):
		main.notify("📡 Sensor packed up")
	queue_free()
