## THE GATOR (MAP_POLISH_PLAN §3.3, Alligator Alley's soul): a STATIONARY
## ambush hazard on the shared quadruped rig — low, long, olive-black, invisible
## against the swamp water until it MOVES. It never wanders: it waits at its
## spawn, and either a close pass (lunge radius) or a LINGERER (stopped at the
## fuel pump too long inside the detection ring) earns the lunge — one fast,
## flat launch off the quadruped's own leap pose, a bite through take_damage
## (the one damage law), then a slow 4-second crawl home: the counterplay
## window. Gun it past, or shoot it while it's grounded and slow.
class_name ProtoGator
extends CharacterBody3D

const LUNGE_R: float = 6.0        ## close pass = instant trigger
const DETECT_R: float = 14.0      ## lingering inside this...
const LINGER_S: float = 2.0       ## ...for this long also triggers (fair to fast pass-bys)
const LUNGE_TIME: float = 0.4     ## flat and FAST — headlights don't save you
const RECOVER_S: float = 4.0      ## the crawl home (the player's window)
const BITE_R: float = 2.0
const BITE_DMG: float = 26.0

enum GState { AMBUSH, LUNGE, RECOVER }

var state: GState = GState.AMBUSH
var dead: bool = false
var body: Damageable = Damageable.new("body", "🐊", 40.0)
var _quad: ProtoQuadruped = null
var _home: Vector3 = Vector3.ZERO
var _linger: Dictionary = {} ## instance_id -> seconds inside DETECT_R
var _lunge_t: float = 0.0
var _recover_t: float = 0.0
var _lunge_dir: Vector3 = Vector3.ZERO
var _bit: bool = false


static func create() -> ProtoGator:
	var g := ProtoGator.new()
	g.add_to_group("threat")
	g.add_to_group("combatant")
	# §3.3's rig row: bigger than a dog, tail IS the body, no ears, swamp-black —
	# a stationary gator visually hides until it moves. That's the whole fear.
	g._quad = ProtoQuadruped.create({
		"scale": 1.4, "tail": 0.9, "snout": true, "ears": false,
		"color": Color(0.18, 0.22, 0.15),
	})
	g._quad.scale.y = 0.62 # flattened — a log with legs, not a hound
	g.add_child(g._quad)
	var shape := CollisionShape3D.new()
	var cap := CapsuleShape3D.new()
	cap.radius = 0.5
	cap.height = 2.2
	shape.shape = cap
	shape.rotation.x = PI * 0.5 # long axis along the body
	shape.position.y = 0.4
	g.add_child(shape)
	return g


func _ready() -> void:
	_home = global_position


func take_damage(amount: float) -> void:
	if dead:
		return
	body.damage(amount)
	if _quad:
		_quad.flinch()
	if body.hp <= 0.0:
		dead = true
		add_to_group("corpse_pending") # the corpse pass can pick it up later
		set_physics_process(false)
		if _quad:
			_quad.rotation.z = PI * 0.9 # belly up
	elif state == GState.AMBUSH:
		# Shot from range while waiting: it lunges at the shooter's direction if
		# close, otherwise slides home — a gator, not a chaser.
		_recover_t = RECOVER_S
		state = GState.RECOVER


func _physics_process(delta: float) -> void:
	if dead:
		return
	match state:
		GState.AMBUSH:
			velocity = Vector3.ZERO
			_quad.animate(delta, 0.0, 0.0) # dead-still, tail barely moving
			var target := _pick_target(delta)
			if target != null:
				_lunge_dir = (target.global_position - global_position)
				_lunge_dir.y = 0.0
				_lunge_dir = _lunge_dir.normalized()
				rotation.y = atan2(-_lunge_dir.x, -_lunge_dir.z)
				state = GState.LUNGE
				_lunge_t = LUNGE_TIME
				_bit = false
		GState.LUNGE:
			_lunge_t -= delta
			_quad.air_target = 1.0 # the leap pose, driven fast and flat
			_quad.animate(delta, 8.0, 1.0)
			velocity = _lunge_dir * (LUNGE_R * 2.0 / LUNGE_TIME)
			move_and_slide()
			if not _bit:
				_try_bite()
			if _lunge_t <= 0.0:
				_quad.air_target = 0.0
				state = GState.RECOVER
				_recover_t = RECOVER_S
		GState.RECOVER:
			_recover_t -= delta
			var back := _home - global_position
			back.y = 0.0
			if back.length() > 0.6:
				velocity = back.normalized() * 1.2 # slow, grounded — shoot it now
				rotation.y = atan2(-back.x, -back.z)
				_quad.animate(delta, 1.2, 0.6)
				move_and_slide()
			else:
				velocity = Vector3.ZERO
				_quad.animate(delta, 0.0, 0.0)
			if _recover_t <= 0.0:
				state = GState.AMBUSH
				_linger.clear()


## Close pass (LUNGE_R) fires instantly; a LINGERER inside DETECT_R earns it
## after LINGER_S — someone stopped at Cottonmouth's pump, not a fast drive-by.
## Actor-agnostic (any combatant body): an NPC convoy losing a driver to a
## gator is a desired emergent story, not an edge case (plan §5).
func _pick_target(delta: float) -> Node3D:
	var seen: Dictionary = {}
	for n in get_tree().get_nodes_in_group("combatant"):
		if not (n is Node3D) or n == self or not is_instance_valid(n):
			continue
		var nd := n as Node3D
		if "dead" in nd and nd.dead:
			continue
		var d := nd.global_position.distance_to(global_position)
		if d <= LUNGE_R:
			return nd
		if d <= DETECT_R:
			var iid := nd.get_instance_id()
			seen[iid] = true
			_linger[iid] = float(_linger.get(iid, 0.0)) + delta
			if float(_linger[iid]) >= LINGER_S:
				return nd
	for iid in _linger.keys():
		if not seen.has(iid):
			_linger.erase(iid)
	return null


func _try_bite() -> void:
	for n in get_tree().get_nodes_in_group("combatant"):
		if not (n is Node3D) or n == self or not is_instance_valid(n):
			continue
		if (n as Node3D).global_position.distance_to(global_position) <= BITE_R and n.has_method("take_damage"):
			_bit = true
			n.take_damage(BITE_DMG)
			return
