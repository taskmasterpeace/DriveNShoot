## DEPLOYABLES, rung 1 (P5 pillar — "mines / oil"): a proximity MINE you drop and
## leave. It ARMS after a beat (so you don't blow yourself up planting it), then the
## first enemy (combatant ∪ threat, never you) inside its trigger ring sets it off
## through the ONE BLAST LAW (main.on_explosion — full damage + knockback + knockdown).
## Built on systems already shipped: the item read-back drops it, on_explosion detonates it.
class_name ProtoMine
extends Node3D

var _main: Node = null
var damage: float = 55.0
var blast: float = 5.0
var trigger_radius: float = 2.6
var _arm_t: float = 1.0 ## dead for a beat after you plant it
var _blink_t: float = 0.0


static func create(main: Node) -> ProtoMine:
	var m := ProtoMine.new()
	m._main = main
	# A squat disc that sits in the dirt — a red eye you learn to read.
	var body := MeshInstance3D.new()
	var cyl := CylinderMesh.new()
	cyl.top_radius = 0.22
	cyl.bottom_radius = 0.26
	cyl.height = 0.12
	body.mesh = cyl
	body.material_override = ProtoWorldBuilder.material(Color(0.18, 0.16, 0.14), 0.6, false)
	body.position.y = 0.06
	m.add_child(body)
	var eye := MeshInstance3D.new()
	var sm := SphereMesh.new()
	sm.radius = 0.06
	sm.height = 0.12
	eye.mesh = sm
	eye.material_override = ProtoWorldBuilder.material(Color(0.9, 0.2, 0.12), 1.0, true)
	eye.position.y = 0.14
	eye.name = "eye"
	m.add_child(eye)
	return m


func _physics_process(delta: float) -> void:
	if _arm_t > 0.0:
		_arm_t -= delta
		return # arming — inert (planting-safe)
	# A slow red blink says "armed."
	_blink_t += delta
	var eye := get_node_or_null("eye")
	if eye is MeshInstance3D and eye.material_override is StandardMaterial3D:
		(eye.material_override as StandardMaterial3D).emission_energy_multiplier = 1.5 + 1.5 * absf(sin(_blink_t * 3.0))
	# Trip on the first enemy in the ring (the player never sets off his own mine).
	var seen: Array = get_tree().get_nodes_in_group("combatant").duplicate()
	for th in get_tree().get_nodes_in_group("threat"):
		if not seen.has(th):
			seen.append(th)
	for node in seen:
		var t := node as Node3D
		if t == null or not is_instance_valid(t) or t == _main.player:
			continue
		if t.global_position.distance_to(global_position) <= trigger_radius:
			if _main.has_method("on_explosion"):
				_main.on_explosion(global_position, damage, blast)
			queue_free()
			return
