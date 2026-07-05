## PROTO-3D on-foot player: capsule character, camera-relative WASD, gravity.
## AIM & LOCOMOTION (docs/systems/AIM_AND_LOCOMOTION.md): feet, arms, and eyes are
## THREE separate things (TWIN-STICK, Option A "free arms, human eyes"). WASD drives
## velocity, screen-relative, never waiting on the body. The ARMS + gun snap to the
## aim (mouse) INSTANTLY, any direction — bullets fly exactly there, even behind you.
## The TORSO + EYES follow at a human turn rate, so the vision cone (carried by the
## torso) can't instantly face behind you: you can shoot back there before you can
## SEE back there — the gap the dog's rear-smell covers. Akimbo-ready (both arms aim).
class_name ProtoPlayer3D
extends CharacterBody3D

@export var walk_speed: float = 4.2
@export var run_speed: float = 7.2
@export var accel: float = 14.0
@export var dive_speed: float = 9.5
@export var dive_time: float = 0.35
@export var getup_time: float = 0.75

@export_group("Stamina")
@export var max_stamina: float = 100.0
@export var run_drain: float = 24.0      ## per second while sprinting
@export var stamina_regen: float = 18.0  ## per second while not sprinting
@export var run_threshold: float = 8.0   ## stamina needed to (re)start a sprint (no flicker)
@export var dive_cost: float = 22.0

@export_group("Aim & Look Arc")
@export var max_look_yaw_deg: float = 60.0     ## reserved (the blind spot now lives in the vision cone's own arc, not an aim clamp)
@export var body_turn_rate_deg: float = 260.0  ## how fast the torso/eyes swing to follow the gun (the rear blind-spot window)
@export var free_turn_rate_deg: float = 420.0  ## relaxed torso following the feet (quicker)
@export var head_relax_rate_deg: float = 300.0 ## gaze settling home when no aim intent
@export var stance_speed_mult: float = 0.7     ## aiming slows you
@export var backpedal_mult: float = 0.6        ## walking against your gaze, on top of stance
@export var stance_lull: float = 2.5           ## seconds after the last shot before you relax

## Named FootState (not State) — a globally-registered class's own enum used as a typed
## var trips GDScript's self-reference type check. Distinct name sidesteps it.
enum FootState { NORMAL, DIVE, GETUP }

var is_active: bool = false
var move_state: FootState = FootState.NORMAL

## The three yaws (radians; yaw 0 faces -Z). body = torso (the arc's anchor),
## aim = gaze/gun, move = feet. Sticky _aim_intent drives aim; ZERO = relaxed.
var body_yaw: float = 0.0
var aim_yaw: float = 0.0
var _move_yaw: float = 0.0
var _aim_intent: Vector3 = Vector3.ZERO
var _stance_t: float = 0.0

var stamina: float = 100.0
## Set by the Stress system (main scene): high stress = slow recovery.
var stamina_regen_mult: float = 1.0
## Set by encumbrance (main scene): overloaded pack = slow legs.
var speed_mult: float = 1.0
var _was_running: bool = false

var _visual: Node3D
var _lower: Node3D
var _upper: Node3D
var _gun: MeshInstance3D
var _state_t: float = 0.0
var _getup_dur: float = 0.75
var _dive_dir: Vector3 = Vector3.FORWARD


static func create() -> ProtoPlayer3D:
	var p := ProtoPlayer3D.new()
	p.add_to_group("player3d") # NOT "player" — the 2D autoloads type-grab that group
	# Slope handling so ramps (stairs) are walkable and you stick to them.
	p.floor_max_angle = deg_to_rad(50)
	p.floor_snap_length = 0.6
	var shape := CollisionShape3D.new()
	var cap := CapsuleShape3D.new()
	cap.radius = 0.35
	cap.height = 1.7
	shape.shape = cap
	shape.position.y = 0.85
	p.add_child(shape)

	p._visual = Node3D.new() # carries torso yaw (+ dive pitch); children carry offsets
	p.add_child(p._visual)
	# LOWER — the trunk/legs: yaws toward where the FEET are going.
	p._lower = Node3D.new()
	p._visual.add_child(p._lower)
	var body := MeshInstance3D.new()
	var bmesh := CapsuleMesh.new()
	bmesh.radius = 0.32
	bmesh.height = 1.5
	body.mesh = bmesh
	body.material_override = ProtoWorldBuilder.material(Color(0.55, 0.42, 0.28), 0.8)
	body.position.y = 0.78
	p._lower.add_child(body)
	# UPPER — head + face hint + gun: yaws to the GAZE. The decouple made visible:
	# from above, the head/gun stay trained while the capsule carries you sideways.
	p._upper = Node3D.new()
	p._visual.add_child(p._upper)
	var head := MeshInstance3D.new()
	var hmesh := SphereMesh.new()
	hmesh.radius = 0.19
	hmesh.height = 0.38
	head.mesh = hmesh
	head.material_override = ProtoWorldBuilder.material(Color(0.78, 0.6, 0.45), 0.9)
	head.position.y = 1.66
	p._upper.add_child(head)
	var nose := MeshInstance3D.new()
	var nmesh := BoxMesh.new()
	nmesh.size = Vector3(0.08, 0.08, 0.12)
	nose.mesh = nmesh
	nose.material_override = ProtoWorldBuilder.material(Color(0.7, 0.5, 0.35), 0.9)
	nose.position = Vector3(0, 1.66, -0.2)
	p._upper.add_child(nose)
	# The carried gun: shows when armed, reads from straight above.
	p._gun = MeshInstance3D.new()
	var gmesh := BoxMesh.new()
	gmesh.size = Vector3(0.07, 0.07, 0.62)
	p._gun.mesh = gmesh
	p._gun.material_override = ProtoWorldBuilder.material(Color(0.16, 0.16, 0.18), 0.4)
	p._gun.position = Vector3(0.16, 1.34, -0.42)
	p._gun.visible = false
	p._upper.add_child(p._gun)
	return p


func _physics_process(delta: float) -> void:
	if not is_on_floor():
		velocity += get_gravity() * delta
	_state_t += delta
	_stance_t = maxf(0.0, _stance_t - delta)

	match move_state:
		FootState.DIVE:
			# Committed: full lunge, no steering.
			velocity.x = _dive_dir.x * dive_speed
			velocity.z = _dive_dir.z * dive_speed
			_visual.rotation.y = body_yaw
			_visual.rotation.x = lerpf(_visual.rotation.x, -1.25, 10.0 * delta)
			if _state_t >= dive_time:
				move_state = FootState.GETUP
				_state_t = 0.0
			move_and_slide()
			return
		FootState.GETUP:
			# On the ground, getting up — vulnerable, no input.
			velocity.x = move_toward(velocity.x, 0.0, 18.0 * delta)
			velocity.z = move_toward(velocity.z, 0.0, 18.0 * delta)
			_visual.rotation.x = lerp_angle(_visual.rotation.x, 0.0, 6.0 * delta)
			if _state_t >= _getup_dur:
				move_state = FootState.NORMAL
				_visual.rotation.x = 0.0
			move_and_slide()
			return

	var move := Vector3.ZERO
	if is_active:
		var x := Input.get_axis("move_left", "move_right")
		var z := -Input.get_axis("move_down", "move_up")
		move = Vector3(x, 0, z)
		if move.length_squared() > 1.0:
			move = move.normalized()
		# SPACE = dive (commit move: burst, then a get-up delay).
		if Input.is_action_just_pressed("jump"):
			_dive_dir = move.normalized() if move.length_squared() > 0.01 else facing()
			move_state = FootState.DIVE
			_state_t = 0.0
			# The lunge commits the whole body; the gaze re-clamps to the new arc next frame.
			body_yaw = _yaw_of(_dive_dir)
			_move_yaw = body_yaw
			stamina = maxf(0.0, stamina - dive_cost)
			# Get-up SCALES with stamina: gassed = slower to your feet (1.0x..1.9x, vulnerable longer).
			_getup_dur = getup_time * lerpf(1.9, 1.0, clampf(stamina / max_stamina, 0.0, 1.0))
			return

	# Sprint costs stamina; gassed → forced walk until it recovers past the threshold (no flicker).
	# A raised gun also forbids it: combat stance is walk-speed life.
	var in_combat := in_stance()
	var wants_run := Input.is_key_pressed(KEY_SHIFT) and move.length_squared() > 0.01
	var can_run := stamina > (0.5 if _was_running else run_threshold)
	var running := is_active and wants_run and can_run and not in_combat
	_was_running = running
	if running:
		stamina = maxf(0.0, stamina - run_drain * delta)
	else:
		stamina = minf(max_stamina, stamina + stamina_regen * stamina_regen_mult * delta)

	var speed := (run_speed if running else walk_speed) * speed_mult
	if in_combat:
		speed *= stance_speed_mult
		# Backpedal falloff is CONTINUOUS on the move-vs-gaze angle (no speed pop):
		# straight back = backpedal_mult, pure strafe or forward = full stance speed.
		if move.length_squared() > 0.01:
			var against := clampf(-sight_facing().dot(move.normalized()), 0.0, 1.0)
			speed *= lerpf(1.0, backpedal_mult, against)
	var target := move * speed
	velocity.x = move_toward(velocity.x, target.x, accel * delta)
	velocity.z = move_toward(velocity.z, target.z, accel * delta)

	_update_orientation(move, delta)
	move_and_slide()


## The Look Arc (the keystone): with aim intent, the gaze snaps anywhere within
## ±max_look_yaw of the torso — instantly. Past the limit, the TORSO turns at
## body_turn_rate (a real, physical delay) while the gaze rides the arc edge.
## Relaxed, the torso follows the feet and the gaze settles home (old behavior).
func _update_orientation(move: Vector3, delta: float) -> void:
	if move.length_squared() > 0.01:
		_move_yaw = _yaw_of(move.normalized())
	if _aim_intent.length_squared() > 0.01:
		# TWIN-STICK: the arms + gun snap to the aim (mouse) INSTANTLY, any direction —
		# no arc clamp. The torso + eyes FOLLOW at a human turn rate, so your gun can
		# already point behind you while your view (the cone, carried by the torso)
		# is still coming around. You can shoot back there before you can SEE back
		# there — which is exactly the gap the dog's rear-smell covers.
		aim_yaw = _yaw_of(_aim_intent)
		body_yaw = _rotate_yaw(body_yaw, aim_yaw, deg_to_rad(body_turn_rate_deg) * delta)
	else:
		if move.length_squared() > 0.01:
			body_yaw = _rotate_yaw(body_yaw, _move_yaw, deg_to_rad(free_turn_rate_deg) * delta)
		aim_yaw = _rotate_yaw(aim_yaw, body_yaw, deg_to_rad(head_relax_rate_deg) * delta)
	body_yaw = wrapf(body_yaw, -PI, PI)
	aim_yaw = wrapf(aim_yaw, -PI, PI)

	_visual.rotation.y = body_yaw
	_upper.rotation.y = wrapf(aim_yaw - body_yaw, -PI, PI) # the top half aims — up to a full turn
	var lower_target := wrapf(_move_yaw - body_yaw, -PI, PI) if move.length_squared() > 0.01 else 0.0
	_lower.rotation.y = lerp_angle(_lower.rotation.y, lower_target, 12.0 * delta)


## Torso facing — where the body points (drop positions, camera, the arc anchor).
func facing() -> Vector3:
	return _vec_of(body_yaw)


## SIGHT facing — where your EYES point (the torso). The vision cone, the FADE,
## and "is he looking at me?" read this: it turns at a human rate, so it lags the
## gun and can't instantly face behind you (the blind spot the dog covers).
func sight_facing() -> Vector3:
	return _vec_of(body_yaw)


## AIM facing — where the GUN/arms point. Snaps to the mouse instantly, any
## direction (twin-stick). Every muzzle + the melee arc read this.
func aim_facing() -> Vector3:
	return _vec_of(aim_yaw)


## Sticky: keeps driving the gaze until cleared (main feeds it while aiming/glassing).
func set_aim_intent(dir: Vector3) -> void:
	var d := dir
	d.y = 0.0
	_aim_intent = d.normalized() if d.length_squared() > 0.0001 else Vector3.ZERO


func clear_aim_intent() -> void:
	_aim_intent = Vector3.ZERO


## Combat stance: entered by firing/throwing, exits after a lull. Slow feet,
## no sprint, slower backpedal — the plant-and-shoot vs move-and-spray choice.
func enter_stance() -> void:
	_stance_t = stance_lull


func in_stance() -> bool:
	return _stance_t > 0.0


## Point the gun at a target RIGHT NOW (the fire path) and return that vector.
## Twin-stick: the gun snaps to the mouse instantly, any direction — so the shot
## flies exactly where you clicked, even directly behind you.
func aim_now(desired: Vector3) -> Vector3:
	set_aim_intent(desired)
	if _aim_intent.length_squared() > 0.01:
		aim_yaw = _yaw_of(_aim_intent)
		_upper.rotation.y = wrapf(aim_yaw - body_yaw, -PI, PI)
	return aim_facing()


## HUD hook: true while your EYES (torso) haven't caught up to where the GUN
## points — you're firing somewhere you can't fully see yet (the reticle warms).
func aim_pinned() -> bool:
	return absf(wrapf(aim_yaw - body_yaw, -PI, PI)) > deg_to_rad(35.0)


func set_armed(on: bool) -> void:
	if _gun:
		_gun.visible = on


## Sim/debug only: point the whole body somewhere without walking there.
## Gameplay code must never call this — turning is the mechanic.
func snap_orientation(dir: Vector3) -> void:
	var d := dir
	d.y = 0.0
	if d.length_squared() < 0.0001:
		return
	body_yaw = _yaw_of(d.normalized())
	aim_yaw = body_yaw
	_move_yaw = body_yaw
	if _visual:
		_visual.rotation.y = body_yaw
	if _upper:
		_upper.rotation.y = 0.0


static func _yaw_of(v: Vector3) -> float:
	return atan2(-v.x, -v.z)


static func _vec_of(yaw: float) -> Vector3:
	return Vector3(-sin(yaw), 0.0, -cos(yaw))


static func _rotate_yaw(from: float, to: float, amount: float) -> float:
	var d := wrapf(to - from, -PI, PI)
	return from + clampf(d, -amount, amount)
