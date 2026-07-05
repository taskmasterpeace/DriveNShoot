## PROTO-3D car: real raycast-suspension vehicle physics (VehicleBody3D).
## No faked bicycle model — suspension, tire slip, and weight transfer are simulated.
## Forward is -Z. Built entirely from code via ProtoCar3D.create().
class_name ProtoCar3D
extends VehicleBody3D

signal speed_changed(mph: float)

@export_group("Drive Feel")
@export var max_engine_force: float = 6500.0
@export var max_brake: float = 40.0
@export var max_steer: float = 0.55          ## Radians at standstill
@export var high_speed_steer: float = 0.16   ## Radians at top speed
@export var steer_speed: float = 5.0         ## How fast the wheel turns (rad/s)
@export var top_speed: float = 34.0          ## m/s (~76 mph)
@export var reverse_top_speed: float = 11.0
@export var grip_front: float = 5.5   ## Higher = more planted (less slide). Worn/blown tires LOWER this.
@export var grip_rear: float = 5.0    ## Baseline grip; the Tires component modifies it (see LOOP2 spec).
@export var handbrake_grip_rear: float = 2.4  ## Slide grip — playtest bug: 1.1 spun the car a full 180.
@export var handbrake_steer_mult: float = 0.55 ## Steering authority while sliding (full lock = spin).
@export var handbrake_decel: float = 8.0      ## m/s² braking — a decel FORCE (not a wheel-brake, which locks the fronts & kills steering; playtest: "didn't brake unless you turned").
@export var handbrake_yaw_rate: float = 1.4   ## rad/s cap on drift rotation — the anti-180 (raw physics peaked at 6.5).
@export var handbrake_yaw_damp: float = 18.0  ## counter-torque strength that arrests the spin at the cap / to straight

@export_group("Surface")
## Roads are visual-only slabs, so surface comes from ProtoWorldBuilder.surface_at(pos).
## Each surface scales grip (dirt slides), dust, and skid-mark color. Data-driven per house rules.
const SURFACE: Dictionary = {
	"road": {"grip": 1.0, "dust_speed": 9.0, "skid": Color(0.05, 0.05, 0.06, 0.85)},
	"dirt": {"grip": 0.78, "dust_speed": 4.5, "skid": Color(0.40, 0.32, 0.22, 0.6)},
}
var current_surface: String = "road"
var surface_override: String = "" ## sims/tests force a surface without a world under the car

const SKID_MAX := 160
const SKID_STEP := 0.35 ## drop a mark every this many meters of slide
const SKID_LIFE := 12.0
var _skids: Array = []
var _skid_last: Dictionary = {} ## VehicleWheel3D -> last drop position

## When true the car reads keyboard/gamepad input itself (while is_active).
## The drive_sim test sets this false and feeds the input fields directly.
var use_player_input: bool = true
var is_active: bool = false

## Locked cars need their key found somewhere in the world.
var locked: bool = false
var key_id: String = ""
var key_display: String = "key"
var display_name: String = "car"

# --- The Living Car (LOOP2): 5-part anatomy + death spiral --------------------
enum FireState { OK, SMOKING, ON_FIRE, DESTROYED }

var components: Dictionary = {} ## id -> Damageable (engine/tires/battery/fuel_tank/chassis)
var trunk: ProtoContainer = null ## every car is storage (Container pillar)
var mount_weapon: ProtoWeapon = null ## vehicle weapon mount (same system as handhelds)
var fuel: float = 100.0
@export var fuel_drain_rate: float = 0.35 ## per second at full throttle
var fire_state: FireState = FireState.OK
var cook: float = 0.0 ## 0-100 while ON_FIRE — "it might blow, it might not"
var dead: bool = false
var salvaged: bool = false
var _smoke: CPUParticles3D = null
var _flames: CPUParticles3D = null
var _spiral_rng := RandomNumberGenerator.new()

const TIER_ENGINE_MULT: Array[float] = [1.0, 0.85, 0.5, 0.0]
const TIER_GRIP_MULT: Array[float] = [1.0, 0.9, 0.68, 0.42]

var input_throttle: float = 0.0
var input_brake: float = 0.0
var input_steer: float = 0.0  ## +1 = left
var input_handbrake: bool = false

var current_mph: float = 0.0
var forward_speed: float = 0.0

var _front_wheels: Array[VehicleWheel3D] = []
var _rear_wheels: Array[VehicleWheel3D] = []
var _prev_vel: Vector3 = Vector3.ZERO
var _prev_pos: Vector3 = Vector3.ZERO
var _impact_cd: float = 0.0
var _dust: CPUParticles3D = null ## speed dust — cheap AAA ground feel
var _flipped_t: float = 0.0 ## time spent on roof/side — auto-right after a beat


static func create(body_color: Color) -> ProtoCar3D:
	var car := ProtoCar3D.new()
	car.add_to_group("interactable")
	car.mass = 900.0
	car.center_of_mass_mode = RigidBody3D.CENTER_OF_MASS_MODE_CUSTOM
	car.center_of_mass = Vector3(0, -0.25, 0)

	# Chassis collision
	var shape := CollisionShape3D.new()
	var box := BoxShape3D.new()
	box.size = Vector3(2.0, 0.7, 4.4)
	shape.shape = box
	car.add_child(shape)

	# Body visuals: hull + cabin + windshield hint so you can read the facing.
	var hull := MeshInstance3D.new()
	var hull_mesh := BoxMesh.new()
	hull_mesh.size = Vector3(2.0, 0.55, 4.4)
	hull.mesh = hull_mesh
	hull.material_override = ProtoWorldBuilder.material(body_color, 0.55)
	hull.position.y = 0.05
	car.add_child(hull)

	var cabin := MeshInstance3D.new()
	var cabin_mesh := BoxMesh.new()
	cabin_mesh.size = Vector3(1.7, 0.5, 2.0)
	cabin.mesh = cabin_mesh
	cabin.material_override = ProtoWorldBuilder.material(body_color * 0.75, 0.5)
	cabin.position = Vector3(0, 0.55, 0.25)
	car.add_child(cabin)

	var windshield := MeshInstance3D.new()
	var ws_mesh := BoxMesh.new()
	ws_mesh.size = Vector3(1.55, 0.42, 0.12)
	windshield.mesh = ws_mesh
	windshield.material_override = ProtoWorldBuilder.material(Color(0.15, 0.2, 0.25), 0.2)
	windshield.position = Vector3(0, 0.55, -0.8)
	car.add_child(windshield)

	# Tail lights (emissive) — helps read facing from top-down.
	for tx in [-0.7, 0.7]:
		var tail := MeshInstance3D.new()
		var tmesh := BoxMesh.new()
		tmesh.size = Vector3(0.35, 0.15, 0.08)
		tail.mesh = tmesh
		tail.material_override = ProtoWorldBuilder.material(Color(0.9, 0.1, 0.08), 0.4, true)
		tail.position = Vector3(tx, 0.2, 2.2)
		car.add_child(tail)

	# Wheels: front pair steers, rear pair drives.
	# The 5-part anatomy (Damageable = the same class body parts will use).
	car.components = {
		"engine": Damageable.new("engine", "🔧", 100.0),
		"tires": Damageable.new("tires", "🛞", 100.0),
		"battery": Damageable.new("battery", "🔋", 60.0),
		"fuel_tank": Damageable.new("fuel_tank", "⛽", 80.0),
		"chassis": Damageable.new("chassis", "🛡️", 100.0),
	}
	car._spiral_rng.randomize()
	car.trunk = ProtoContainer.new("Trunk")
	car.trunk.add("bandage", 1)
	car.trunk.add("scrap", 2)

	var wheel_specs: Array = [
		[Vector3(-0.85, -0.15, -1.45), true, false],
		[Vector3(0.85, -0.15, -1.45), true, false],
		[Vector3(-0.85, -0.15, 1.45), false, true],
		[Vector3(0.85, -0.15, 1.45), false, true],
	]
	for spec in wheel_specs:
		var wheel := VehicleWheel3D.new()
		wheel.position = spec[0]
		wheel.use_as_steering = spec[1]
		wheel.use_as_traction = spec[2]
		wheel.wheel_radius = 0.38
		wheel.wheel_rest_length = 0.22
		wheel.suspension_travel = 0.25
		wheel.suspension_stiffness = 45.0
		wheel.suspension_max_force = 12000.0
		wheel.damping_compression = 0.25 * 2.0 * sqrt(45.0)
		wheel.damping_relaxation = 0.4 * 2.0 * sqrt(45.0)
		wheel.wheel_roll_influence = 0.05
		var tire := MeshInstance3D.new()
		var tmesh := CylinderMesh.new()
		tmesh.top_radius = 0.38
		tmesh.bottom_radius = 0.38
		tmesh.height = 0.3
		tire.mesh = tmesh
		tire.material_override = ProtoWorldBuilder.material(Color(0.08, 0.08, 0.08), 1.0)
		tire.rotation_degrees.z = 90.0
		wheel.add_child(tire)
		car.add_child(wheel)
		if spec[1]:
			car._front_wheels.append(wheel)
		else:
			car._rear_wheels.append(wheel)
	for w in car._front_wheels:
		w.wheel_friction_slip = car.grip_front
	for w in car._rear_wheels:
		w.wheel_friction_slip = car.grip_rear
	return car


func facing() -> Vector3:
	return -global_basis.z


# --- Surface + skid marks (2026-07-05 driving pass) --------------------------

## Which surface the car sits on. Roads are visual-only, so the world tells us.
func _sample_surface() -> String:
	return ProtoWorldBuilder.surface_at(global_position)


func surface_grip_mult() -> float:
	var s: String = surface_override if surface_override != "" else current_surface
	return SURFACE.get(s, SURFACE["road"])["grip"]


func skid_count() -> int:
	_skids = _skids.filter(func(m): return is_instance_valid(m))
	return _skids.size()


## Lay dark marks under the rear wheels while they're actually sliding — the
## drift made visible. Distance-gated so a slide draws a continuous streak, not
## a flood; pooled + faded so it never grows without bound.
func _emit_skids() -> void:
	if dead:
		return
	var world := get_parent()
	if world == null:
		return
	var col: Color = SURFACE.get(current_surface, SURFACE["road"])["skid"]
	for w in _rear_wheels:
		if not w.is_in_contact():
			_skid_last.erase(w)
			continue
		var sliding: bool = input_handbrake or w.get_skidinfo() < 0.6
		if not sliding or absf(forward_speed) < 2.0:
			continue
		var cp: Vector3 = w.get_contact_point()
		if _skid_last.has(w) and cp.distance_to(_skid_last[w]) < SKID_STEP:
			continue
		_skid_last[w] = cp
		_drop_skid(world, cp, col)


func _drop_skid(world: Node, pos: Vector3, col: Color) -> void:
	var m := MeshInstance3D.new()
	var q := BoxMesh.new()
	q.size = Vector3(0.26, 0.02, 0.55)
	m.mesh = q
	var mat := StandardMaterial3D.new()
	mat.albedo_color = col
	mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	mat.roughness = 1.0
	m.material_override = mat
	world.add_child(m)
	var vel := linear_velocity
	vel.y = 0.0
	m.global_position = pos + Vector3(0, 0.02, 0)
	m.global_rotation.y = atan2(-vel.x, -vel.z) if vel.length() > 0.5 else global_rotation.y
	_skids.append(m)
	if _skids.size() > SKID_MAX:
		var oldest = _skids.pop_front()
		if is_instance_valid(oldest):
			oldest.queue_free()
	# Linger, then fade out and free (self-managing decal).
	var tw := m.create_tween()
	tw.tween_interval(SKID_LIFE * 0.6)
	tw.tween_property(mat, "albedo_color:a", 0.0, SKID_LIFE * 0.4)
	tw.tween_callback(func() -> void:
		_skids.erase(m)
		m.queue_free())


# --- Interactable contract (on-foot) ---------------------------------------

func interact_position() -> Vector3:
	return global_position


func _at_trunk(main: Node) -> bool:
	# Standing behind the car = trunk zone (rear is local +Z).
	return to_local(main.player.global_position).z > 1.6


func interact_prompt(main: Node) -> String:
	if is_active:
		return ""
	if dead:
		return "" if salvaged else "E — Salvage the burnt %s" % display_name
	if locked and not main.has_key(key_id):
		return "HOLD E — Hotwire the %s" % display_name
	if locked:
		return "E — Unlock %s (%s)" % [display_name, key_display]
	if _at_trunk(main):
		return "E — Open trunk"
	return "E — Enter %s" % display_name


func interact(main: Node) -> void:
	if is_active:
		return
	if dead:
		if not salvaged:
			salvaged = true
			main.backpack.add("scrap", 3)
			main.notify("Salvaged scrap from the burnt %s" % display_name)
		return
	if locked:
		if main.has_key(key_id):
			locked = false
			main.notify("Unlocked the %s" % display_name)
		return
	if _at_trunk(main):
		main.open_container(trunk)
		return
	main.enter_car(self)


func take_damage(amount: float) -> void:
	if dead:
		return
	# Chassis takes the hit; hard hits can wound a random component too.
	components["chassis"].damage(amount)
	if amount > 8.0 and _spiral_rng.randf() < 0.45:
		var ids: Array = ["engine", "tires", "battery", "fuel_tank"]
		components[ids[_spiral_rng.randi() % ids.size()]].damage(amount * 0.6)


# --- The death spiral: HEALTHY -> SMOKING -> ON FIRE -> cook -> HUSK (always burnt) ---

func _update_death_spiral(delta: float) -> void:
	if dead:
		return
	var chassis: Damageable = components["chassis"]
	var breached: bool = components["fuel_tank"].tier() >= Damageable.Tier.CRITICAL
	match fire_state:
		FireState.OK:
			if chassis.ratio() < 0.4:
				fire_state = FireState.SMOKING
				_ensure_smoke().emitting = true
		FireState.SMOKING:
			if chassis.ratio() < 0.15 or (breached and chassis.ratio() < 0.3):
				fire_state = FireState.ON_FIRE
				cook = 0.0
				_ensure_flames().emitting = true
			elif chassis.ratio() >= 0.4:
				fire_state = FireState.OK
				_ensure_smoke().emitting = false
		FireState.ON_FIRE:
			# The cook meter: it MIGHT blow early — every tick rolls against it.
			cook += delta * (100.0 / (6.0 if breached else 9.5))
			if cook >= 100.0 or _spiral_rng.randf() < (cook / 100.0) * delta * 0.5:
				_explode()
			elif chassis.ratio() <= 0.0:
				_become_husk(false)
		FireState.DESTROYED:
			pass


func _ensure_smoke() -> CPUParticles3D:
	if _smoke == null:
		_smoke = CPUParticles3D.new()
		_smoke.amount = 24
		_smoke.lifetime = 1.6
		_smoke.mesh = BoxMesh.new()
		(_smoke.mesh as BoxMesh).size = Vector3(0.25, 0.25, 0.25)
		_smoke.direction = Vector3(0, 1, 0)
		_smoke.initial_velocity_min = 1.5
		_smoke.initial_velocity_max = 3.0
		_smoke.gravity = Vector3(0, 1.0, 0)
		_smoke.color = Color(0.25, 0.24, 0.23, 0.8)
		_smoke.position = Vector3(0, 0.6, -1.2)
		_smoke.emitting = false
		add_child(_smoke)
	return _smoke


func _ensure_flames() -> CPUParticles3D:
	if _flames == null:
		_flames = CPUParticles3D.new()
		_flames.amount = 40
		_flames.lifetime = 0.7
		_flames.mesh = BoxMesh.new()
		(_flames.mesh as BoxMesh).size = Vector3(0.3, 0.3, 0.3)
		_flames.direction = Vector3(0, 1, 0)
		_flames.initial_velocity_min = 2.5
		_flames.initial_velocity_max = 5.0
		_flames.color = Color(1.0, 0.45, 0.08, 0.95)
		_flames.position = Vector3(0, 0.7, -0.8)
		_flames.emitting = false
		add_child(_flames)
	return _flames


func _explode() -> void:
	# Blast: shove and hurt what's nearby, then the husk. Always ends burnt.
	for node in get_tree().get_nodes_in_group("threat"):
		var n := node as Node3D
		if n and is_instance_valid(n) and n.global_position.distance_to(global_position) < 9.0:
			n.queue_free()
	for node in get_tree().get_nodes_in_group("interactable"):
		if node is ProtoCar3D and node != self:
			var other := node as ProtoCar3D
			if other.global_position.distance_to(global_position) < 8.0:
				other.take_damage(40.0)
	apply_central_impulse(Vector3(0, mass * 4.5, 0))
	_become_husk(true)


func _become_husk(_exploded: bool) -> void:
	if dead:
		return
	dead = true
	is_active = false
	locked = false
	fire_state = FireState.DESTROYED
	cook = 0.0
	if _flames:
		_flames.emitting = false
	_ensure_smoke().emitting = true # husks smolder
	# Char every visual — no matter HOW it died, the wreck reads burnt (user law).
	var charred := ProtoWorldBuilder.material(Color(0.09, 0.085, 0.08), 1.0)
	for child in get_children():
		if child is MeshInstance3D:
			(child as MeshInstance3D).material_override = charred
		elif child is VehicleWheel3D:
			for sub in child.get_children():
				if sub is MeshInstance3D:
					(sub as MeshInstance3D).material_override = charred


## Dashboard snapshot for the HUD (the car's moodles).
func dashboard() -> Dictionary:
	return {
		"engine": components["engine"].tier(), "tires": components["tires"].tier(),
		"battery": components["battery"].tier(), "fuel_tank": components["fuel_tank"].tier(),
		"chassis": components["chassis"].tier(), "fuel": fuel,
		"on_fire": fire_state == FireState.ON_FIRE, "cook": cook,
		"smoking": fire_state == FireState.SMOKING,
	}


func _physics_process(delta: float) -> void:
	forward_speed = linear_velocity.dot(-global_basis.z)
	current_mph = absf(forward_speed) * 2.237
	speed_changed.emit(current_mph)

	_update_death_spiral(delta)

	# Flip recovery: on the roof or side with no momentum, the car rights itself
	# after a beat (playtest bug: landed inverted and spun forever).
	if global_basis.y.dot(Vector3.UP) < 0.35 and linear_velocity.length() < 4.0:
		_flipped_t += delta
		if _flipped_t > 2.2:
			_flipped_t = 0.0
			var yaw := global_rotation.y
			global_transform = Transform3D(Basis(Vector3.UP, yaw), global_position + Vector3(0, 1.6, 0))
			linear_velocity = Vector3.ZERO
			angular_velocity = Vector3.ZERO
	else:
		_flipped_t = 0.0

	# Impact damage: a hard velocity change in one tick = a crash (teleports excluded).
	_impact_cd = maxf(0.0, _impact_cd - delta)
	var moved := global_position.distance_to(_prev_pos)
	var dv := (linear_velocity - _prev_vel).length()
	if _impact_cd <= 0.0 and moved < 4.0 and dv > 9.0:
		_impact_cd = 0.5
		take_damage(clampf((dv - 9.0) * 1.5, 4.0, 45.0))
	_prev_vel = linear_velocity
	_prev_pos = global_position

	# Rolling dust: kick up wasteland behind the car at speed.
	if _dust == null:
		_dust = CPUParticles3D.new()
		_dust.amount = 28
		_dust.lifetime = 1.1
		_dust.mesh = BoxMesh.new()
		(_dust.mesh as BoxMesh).size = Vector3(0.22, 0.22, 0.22)
		_dust.direction = Vector3(0, 0.6, 1)
		_dust.spread = 25.0
		_dust.initial_velocity_min = 1.0
		_dust.initial_velocity_max = 2.5
		_dust.gravity = Vector3(0, -2.0, 0)
		_dust.color = Color(0.62, 0.52, 0.38, 0.5)
		_dust.position = Vector3(0, -0.2, 2.1)
		_dust.emitting = false
		add_child(_dust)
	# Dirt kicks up dust sooner and browner than asphalt (surface feel).
	var dust_speed: float = SURFACE.get(current_surface, SURFACE["road"])["dust_speed"]
	_dust.emitting = not dead and absf(forward_speed) > dust_speed
	_dust.color = Color(0.62, 0.52, 0.38, 0.5) if current_surface == "dirt" else Color(0.55, 0.55, 0.55, 0.32)

	if not is_active or dead:
		engine_force = 0.0
		brake = 3.0  # parking brake
		steering = move_toward(steering, 0.0, steer_speed * delta)
		return

	if use_player_input:
		input_throttle = Input.get_action_strength("move_up")
		input_brake = Input.get_action_strength("move_down")
		input_steer = Input.get_axis("move_right", "move_left")
		input_handbrake = Input.is_action_pressed("jump")

	# Steering authority falls off with speed for stability, ramps in smoothly.
	# While the handbrake is down, authority is trimmed too — full lock mid-slide
	# whipped the car 180 (first-playtest bug); a drift should be steered, not spun.
	var speed_ratio := clampf(absf(forward_speed) / top_speed, 0.0, 1.0)
	var steer_limit := lerpf(max_steer, high_speed_steer, speed_ratio)
	if input_handbrake:
		steer_limit *= handbrake_steer_mult
	steering = move_toward(steering, input_steer * steer_limit, steer_speed * delta)

	# Throttle / brake / reverse.
	# NOTE: measured empirically via drive_sim — positive engine_force pushes +Z,
	# so forward (-Z) drive needs a NEGATIVE engine force.
	# THE LIVING CAR: the engine component scales power; fuel + battery gate it;
	# tire condition scales grip (handling = baseline x condition — LOOP2 rule).
	var engine_mult: float = TIER_ENGINE_MULT[components["engine"].tier()]
	if fuel <= 0.0 or components["battery"].tier() == Damageable.Tier.BROKEN:
		engine_mult = 0.0
	# Grip = baseline × tire condition × SURFACE (dirt is looser than asphalt).
	current_surface = surface_override if surface_override != "" else _sample_surface()
	var surf_grip: float = SURFACE[current_surface]["grip"]
	var grip_mult: float = TIER_GRIP_MULT[components["tires"].tier()] * surf_grip
	for w in _front_wheels:
		w.wheel_friction_slip = grip_front * grip_mult
	var rear_base := handbrake_grip_rear if input_handbrake else grip_rear
	for w in _rear_wheels:
		w.wheel_friction_slip = rear_base * grip_mult

	if input_throttle > 0.0 and engine_mult > 0.0:
		fuel = maxf(0.0, fuel - fuel_drain_rate * input_throttle * delta)
		# A breached tank bleeds extra while running.
		if components["fuel_tank"].tier() >= Damageable.Tier.CRITICAL:
			fuel = maxf(0.0, fuel - 1.2 * delta)

	engine_force = 0.0
	brake = 0.0
	if input_throttle > 0.0 and forward_speed < top_speed and engine_mult > 0.0:
		# Taper force as speed climbs — punchy low end, natural top-speed plateau.
		engine_force = -input_throttle * max_engine_force * engine_mult * lerpf(1.0, 0.45, speed_ratio)
	if input_brake > 0.0:
		if forward_speed > 1.0:
			brake = input_brake * max_brake
		elif forward_speed > -reverse_top_speed:
			engine_force = input_brake * max_engine_force * 0.5

	# Handbrake, rebuilt (2026-07-05 driving pass). Two playtest bugs, one block:
	#  1) "doesn't brake unless you turn" — it now applies REAL braking (was 6/40).
	#  2) "turning does a full 180" — the rear-grip drop still SETS UP the slide, but
	#     the yaw rate is CAPPED and DAMPED so a drift can't run away into a spin
	#     (raw physics peaked at 6.5 rad/s → 272° in 3 s; capped it stays a drift).
	# Straight (no steer) = brake + settle yaw to zero → you stop straight.
	# Turning = a controlled, bounded drift; hold throttle too and you keep the slide.
	if input_handbrake:
		# Brake with a FORCE opposing motion, not the wheel `brake` (a strong wheel
		# brake locks the fronts and steering dies → the car slid straight, 0 yaw) and
		# not by overwriting velocity (that clobbers the wheels' own friction → no
		# slide). A decel force cooperates with the solver: it slows the car HARD while
		# the low-grip rear (above) still steps out into a real, steerable drift.
		var vh := Vector3(linear_velocity.x, 0.0, linear_velocity.z)
		if vh.length() > 1.0:
			apply_central_force(-vh.normalized() * mass * handbrake_decel)
		# Cap + settle the yaw so a drift stays a drift and never snaps into a 180.
		# A direct `angular_velocity.y =` write fights the vehicle solver (it zeroed the
		# drift), so we nudge with TORQUE: brake the spin only past the cap, and add a
		# gentle counter-torque toward straight when you're not steering.
		if absf(forward_speed) > 3.0:
			var wy := angular_velocity.y
			if absf(wy) > handbrake_yaw_rate:
				apply_torque(Vector3(0.0, -(wy - signf(wy) * handbrake_yaw_rate) * mass * handbrake_yaw_damp, 0.0))
			elif absf(input_steer) < 0.15:
				apply_torque(Vector3(0.0, -wy * mass * handbrake_yaw_damp, 0.0))

	_emit_skids()
