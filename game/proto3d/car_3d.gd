## PROTO-3D vehicle: real raycast-suspension physics (VehicleBody3D).
## A vehicle is a ROW in VEHICLES (docs/systems/VEHICLES.md) — adding one = adding
## data, never new code. Same 5-part anatomy, death spiral, trunk, surfaces and
## skid marks for every class, from the Rat Bike to the Longhaul's trailer.
## Forward is -Z. Built entirely from code via ProtoCar3D.create(vclass, color).
class_name ProtoCar3D
extends VehicleBody3D

signal speed_changed(mph: float)
## A bike has no cab: a hard crash THROWS the rider (main handles the tumble).
signal rider_thrown(dv: float)

## The Fleet — five wildly different classes + the towed trailer (VEHICLES.md §1).
## wheels rows: [x, z, steer, traction, visible, radius]
## NOTE: a `static var` (not `const`) so the DATA SPINE (DrivnData, MASTER_PLAN
## Goal 1) can overlay tunable stats from data/vehicles.json and MATERIALIZE new
## vehicles from an archetype at load — new rigs are pure data, no code here.
static var VEHICLES: Dictionary = {
	"scavenger": {"name": "Scavenger", "mass": 900.0, "engine": 6500.0, "top": 34.0, "rev": 11.0,
		"steer": [0.55, 0.16, 5.0], "tires": {"grip_f": 5.5, "grip_r": 5.0, "dirt_mult": 0.78, "name": "street"},
		"chassis": Vector3(2.0, 0.7, 4.4), "hull": Vector3(2.0, 0.55, 4.4), "cabin": Vector3(1.7, 0.5, 2.0), "cabin_pos": Vector3(0, 0.55, 0.25),
		"wheels": [[-0.85, -1.45, true, false, true, 0.38], [0.85, -1.45, true, false, true, 0.38],
			[-0.85, 1.45, false, true, true, 0.38], [0.85, 1.45, false, true, true, 0.38]],
		"trunk_max_w": 40.0, "dog_seats": 2, "wound_mult": 1.0, "tailpipe": Vector3(-0.65, 0.22, 2.15), "com_y": -0.25},
	"motorcycle": {"name": "Rat Bike", "mass": 260.0, "engine": 3400.0, "top": 38.0, "rev": 8.0,
		"steer": [0.62, 0.2, 6.5], "tires": {"grip_f": 5.2, "grip_r": 4.6, "dirt_mult": 0.82, "name": "dual-sport"},
		"chassis": Vector3(0.55, 0.6, 2.2), "hull": Vector3(0.34, 0.42, 1.9), "cabin": Vector3(0.3, 0.28, 0.7), "cabin_pos": Vector3(0, 0.62, 0.35),
		# Physics rides 4 narrow-track wheels (self-standing trick); only the centered pair renders.
		"wheels": [[-0.11, -0.8, true, false, false, 0.34], [0.11, -0.8, true, false, true, 0.34],
			[-0.11, 0.8, false, true, false, 0.34], [0.11, 0.8, false, true, true, 0.34]],
		"trunk_max_w": 10.0, "dog_seats": 0, "wound_mult": 2.5, "rider_exposed": true, "two_wheel": true, "tailpipe": Vector3(0.16, 0.28, 0.95), "com_y": -0.4},
	"buggy": {"name": "Dustrunner", "mass": 620.0, "engine": 5200.0, "top": 31.0, "rev": 10.0,
		"steer": [0.6, 0.2, 6.0], "tires": {"grip_f": 5.0, "grip_r": 4.6, "dirt_mult": 0.95, "name": "knobby"},
		"chassis": Vector3(1.7, 0.6, 3.0), "hull": Vector3(1.6, 0.35, 2.9), "cabin": Vector3(1.2, 0.45, 1.2), "cabin_pos": Vector3(0, 0.5, 0.1),
		"wheels": [[-0.8, -1.1, true, false, true, 0.42], [0.8, -1.1, true, false, true, 0.42],
			[-0.8, 1.1, false, true, true, 0.42], [0.8, 1.1, false, true, true, 0.42]],
		"trunk_max_w": 22.0, "dog_seats": 1, "wound_mult": 1.4, "tailpipe": Vector3(-0.5, 0.32, 1.4), "com_y": -0.3},
	"pickup": {"name": "Rustler", "mass": 1250.0, "engine": 8200.0, "top": 30.0, "rev": 10.0,
		"steer": [0.55, 0.15, 4.8], "tires": {"grip_f": 5.4, "grip_r": 5.0, "dirt_mult": 0.90, "name": "all-terrain"},
		"chassis": Vector3(2.1, 1.0, 4.8), "hull": Vector3(2.05, 0.8, 4.7), "cabin": Vector3(1.9, 0.75, 1.6), "cabin_pos": Vector3(0, 0.95, -1.0),
		"wheels": [[-0.88, -1.6, true, false, true, 0.44], [0.88, -1.6, true, false, true, 0.44],
			[-0.88, 1.6, false, true, true, 0.44], [0.88, 1.6, false, true, true, 0.44]],
		"trunk_max_w": 60.0, "dog_seats": 2, "wound_mult": 0.9, "tailpipe": Vector3(-0.7, 0.26, 2.35), "com_y": -0.4},
	"van": {"name": "Boxer", "mass": 1700.0, "engine": 7200.0, "top": 27.0, "rev": 9.0,
		"steer": [0.5, 0.13, 4.0], "tires": {"grip_f": 5.6, "grip_r": 5.2, "dirt_mult": 0.68, "name": "highway"},
		"chassis": Vector3(2.2, 1.5, 5.2), "hull": Vector3(2.2, 1.35, 5.2), "cabin": Vector3(2.0, 0.5, 1.4), "cabin_pos": Vector3(0, 1.05, -1.7),
		"wheels": [[-0.9, -1.9, true, false, true, 0.4], [0.9, -1.9, true, false, true, 0.4],
			[-0.9, 1.9, false, true, true, 0.4], [0.9, 1.9, false, true, true, 0.4]],
		"trunk_max_w": 120.0, "dog_seats": 4, "wound_mult": 0.8, "tailpipe": Vector3(-0.78, 0.24, 2.55), "com_y": -0.45},
	"semi": {"name": "Longhaul", "mass": 3800.0, "engine": 12000.0, "top": 25.0, "rev": 6.0,
		"steer": [0.45, 0.1, 3.0], "tires": {"grip_f": 6.2, "grip_r": 5.8, "dirt_mult": 0.7, "name": "rig"},
		"chassis": Vector3(2.4, 1.9, 6.4), "hull": Vector3(2.35, 1.0, 6.2), "cabin": Vector3(2.3, 1.3, 2.2), "cabin_pos": Vector3(0, 1.55, -1.9),
		# ONE drive axle (Godot applies engine_force per traction wheel — 4 traction
		# wheels secretly doubled the rig's power and broke the accel ladder).
		"wheels": [[-0.95, -2.4, true, false, true, 0.45], [0.95, -2.4, true, false, true, 0.45],
			[-0.95, 1.6, false, true, true, 0.45], [0.95, 1.6, false, true, true, 0.45],
			[-0.95, 2.55, false, false, true, 0.45], [0.95, 2.55, false, false, true, 0.45]],
		"trunk_max_w": 45.0, "dog_seats": 2, "wound_mult": 0.4, "tailpipe": Vector3(1.05, 2.6, -1.2), "com_y": -0.55, "hitch_z": 3.1},
	"trailer": {"name": "trailer", "mass": 2200.0, "engine": 0.0, "top": 0.0, "rev": 0.0,
		"steer": [0.0, 0.0, 1.0], "tires": {"grip_f": 6.0, "grip_r": 6.0, "dirt_mult": 0.7, "name": "rig"},
		"chassis": Vector3(2.4, 2.2, 8.0), "hull": Vector3(2.35, 2.0, 7.9), "cabin": Vector3.ZERO, "cabin_pos": Vector3.ZERO,
		"wheels": [[-0.95, 2.2, false, false, true, 0.45], [0.95, 2.2, false, false, true, 0.45],
			[-0.95, 3.1, false, false, true, 0.45], [0.95, 3.1, false, false, true, 0.45]],
		"trunk_max_w": 400.0, "dog_seats": 0, "wound_mult": 0.0, "tailpipe": Vector3.ZERO, "com_y": -0.7,
		"free_rolling": true, "hitch_front_z": -3.95},
}

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

@export_group("Two-Wheel Balance")
## The invisible RIDER (or kickstand) that holds a two_wheel row upright — playtest
## bug: the Rat Bike tipped over the moment you sat on it and nothing righted it.
## PD gains: kp = spring toward the target lean, kd = damping on the roll rate.
@export var upright_kp: float = 95.0
@export var upright_kd: float = 24.0
@export var upright_parked_mult: float = 2.6 ## kickstand: parked/slow = this much stiffer
@export var max_lean: float = 0.17           ## rad a ridden bike lays into a corner

@export_group("Surface")
## Roads are visual-only slabs, so surface comes from ProtoWorldBuilder.surface_at(pos).
## Dust + skid color per surface; GRIP off-road comes from the TIRES (dirt_mult —
## knobby buggy 0.95 vs highway van 0.68: the variation lever, VEHICLES.md §2).
const SURFACE: Dictionary = {
	"road": {"dust_speed": 9.0, "skid": Color(0.05, 0.05, 0.06, 0.85)},
	"dirt": {"dust_speed": 4.5, "skid": Color(0.40, 0.32, 0.22, 0.6)},
	"water": {"dust_speed": 2.0, "skid": Color(0.25, 0.38, 0.42, 0.5)},
}
var current_surface: String = "road"
var surface_override: String = "" ## sims/tests force a surface without a world under the car

const SKID_MAX := 160
const SKID_STEP := 0.35 ## drop a mark every this many meters of slide
const SKID_LIFE := 12.0
var _skids: Array = []
var _skid_last: Dictionary = {} ## VehicleWheel3D -> last drop position
var _skid_snd_cd: float = 0.0   ## screech cooldown — one cry per slide, not a siren

## DRIVABLE DAMAGE (goal: the wound is in your HANDS, not just on the dash).
var _misfire_t: float = 0.0
var _misfire_cd: float = 3.0
var misfiring: bool = false   ## sim/HUD hook
var steer_slop: float = 0.0   ## sim hook — chassis wander amplitude

## When true the car reads keyboard/gamepad input itself (while is_active).
## The drive_sim test sets this false and feeds the input fields directly.
var use_player_input: bool = true
var is_active: bool = false

## ⭐ THE DRIVING SKILL made physical (set by main on enter + level-up): control
## scales steering authority + drift settle and TIGHTENS the spin cap; top nudges
## the ceiling. 1.0 = unskilled; the sim-checked feel targets are the floor.
var driver_control: float = 1.0
var driver_top: float = 1.0

## Which VEHICLES row this is.
var vclass: String = "scavenger"
var spec: Dictionary = {}

## Locked cars need their key found somewhere in the world.
var locked: bool = false
var key_id: String = ""
var key_display: String = "key"
var display_name: String = "car"

## Trailer coupling (semi + trailer only).
var hitched_to: ProtoCar3D = null ## set on the TRAILER
var _hitch_joint: Generic6DOFJoint3D = null

## Headlights — auto at dark (main drives this off the day/night clock).
var headlights_on: bool = false
var _headlights: Array = []


func set_headlights(on: bool) -> void:
	if spec.get("cabin", Vector3.ZERO) == Vector3.ZERO or dead:
		on = false
	if on == headlights_on and not (_headlights.is_empty() and on):
		return
	headlights_on = on
	if _headlights.is_empty() and on:
		var xs: Array = [0.0] if vclass == "motorcycle" else [-spec["chassis"].x * 0.33, spec["chassis"].x * 0.33]
		for lx in xs:
			var lamp := SpotLight3D.new()
			lamp.position = Vector3(lx, 0.55 + maxf(0.0, spec["chassis"].y - 0.7) * 0.5, -spec["chassis"].z / 2.0 + 0.1)
			# Flat, long throw (playtest: "we need to see 2-3x further down the street") —
			# a shallow tilt + soft attenuation carries the beam instead of dumping it
			# into the tarmac two car-lengths out.
			lamp.rotation_degrees.x = -4.0
			lamp.spot_range = 65.0
			lamp.spot_angle = 30.0
			lamp.spot_attenuation = 0.7
			lamp.light_energy = 4.0
			lamp.light_color = Color(1.0, 0.94, 0.75)
			lamp.shadow_enabled = false
			add_child(lamp)
			_headlights.append(lamp)
			var glow := MeshInstance3D.new()
			var gm := BoxMesh.new()
			gm.size = Vector3(0.22, 0.1, 0.06)
			glow.mesh = gm
			glow.material_override = ProtoWorldBuilder.material(Color(1.0, 0.95, 0.7), 0.2, true)
			glow.position = lamp.position
			add_child(glow)
			_headlights.append(glow)
	for l in _headlights:
		if is_instance_valid(l):
			(l as Node3D).visible = on

# --- The Living Car (LOOP2): 5-part anatomy + death spiral --------------------
enum FireState { OK, SMOKING, ON_FIRE, DESTROYED }

var components: Dictionary = {} ## id -> Damageable (engine/tires/battery/fuel_tank/chassis)
var trunk: ProtoContainer = null ## every car is storage (Container pillar)
var mount_weapon: ProtoWeapon = null ## vehicle weapon mount (system kept; no default gun — VEHICLES.md §6)
var fuel: float = 100.0
@export var fuel_drain_rate: float = 0.35 ## per second at full throttle
var fire_state: FireState = FireState.OK
var cook: float = 0.0 ## 0-100 while ON_FIRE — "it might blow, it might not"
var dead: bool = false
var salvaged: bool = false
var _smoke: CPUParticles3D = null
var _smoke_bucket: int = -1
var _flames: CPUParticles3D = null
var _spiral_rng := RandomNumberGenerator.new()

const TIER_ENGINE_MULT: Array[float] = [1.0, 0.85, 0.5, 0.0]
const TIER_GRIP_MULT: Array[float] = [1.0, 0.9, 0.68, 0.42]
## Worn tires DRAG everywhere (rolling resistance of shredded rubber).
const TIER_TIRE_DRAG: Array[float] = [1.0, 0.95, 0.8, 0.55]
## Tires LOOK their tier from above: black → browned → gray → shredded rust.
const TIER_TIRE_COLOR: Array[Color] = [Color(0.08, 0.08, 0.08), Color(0.22, 0.18, 0.13),
	Color(0.42, 0.4, 0.38), Color(0.5, 0.28, 0.18)]

var is_struggling: bool = false ## sim/HUD hook: bogged off-road or limping on bad tires
var _tire_meshes: Array = []
var _tire_look_tier: int = -1
var _hull_mesh: MeshInstance3D = null
var _shimmy_t: float = 0.0

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


## NOTE: DrivnData.ensure() (the data-spine overlay) is primed once at bootstrap —
## proto3d._ready() and the sims call it — NOT here, so car_3d carries no dependency
## on DrivnData (a parse cycle would break DrivnVehicle's static methods).
static func create(vclass_in: String, body_color: Color) -> ProtoCar3D:
	var car := ProtoCar3D.new()
	var s: Dictionary = VEHICLES[vclass_in]
	car.vclass = vclass_in
	car.spec = s
	car.display_name = s["name"]
	car.add_to_group("interactable")
	car.mass = s["mass"]
	car.center_of_mass_mode = RigidBody3D.CENTER_OF_MASS_MODE_CUSTOM
	car.center_of_mass = Vector3(0, s["com_y"], 0)
	# Drive feel from the row
	car.max_engine_force = s["engine"]
	car.top_speed = s["top"]
	car.reverse_top_speed = s["rev"]
	car.max_steer = s["steer"][0]
	car.high_speed_steer = s["steer"][1]
	car.steer_speed = s["steer"][2]
	car.grip_front = s["tires"]["grip_f"]
	car.grip_rear = s["tires"]["grip_r"]

	# Chassis collision
	var shape := CollisionShape3D.new()
	var box := BoxShape3D.new()
	box.size = s["chassis"]
	shape.shape = box
	shape.position.y = maxf(0.0, (s["chassis"].y - 0.7) * 0.5) # tall classes sit their box higher
	car.add_child(shape)

	# Body visuals: hull + cabin + windshield hint so you can read the facing.
	var hull := MeshInstance3D.new()
	var hull_mesh := BoxMesh.new()
	hull_mesh.size = s["hull"]
	hull.mesh = hull_mesh
	hull.material_override = ProtoWorldBuilder.material(body_color, 0.55)
	hull.position.y = 0.05 + maxf(0.0, (s["hull"].y - 0.55) * 0.5)
	car.add_child(hull)
	car._hull_mesh = hull

	if s["cabin"] != Vector3.ZERO:
		var cabin := MeshInstance3D.new()
		var cabin_mesh := BoxMesh.new()
		cabin_mesh.size = s["cabin"]
		cabin.mesh = cabin_mesh
		cabin.material_override = ProtoWorldBuilder.material(body_color * 0.75, 0.5)
		cabin.position = s["cabin_pos"]
		car.add_child(cabin)
		var windshield := MeshInstance3D.new()
		var ws_mesh := BoxMesh.new()
		ws_mesh.size = Vector3(s["cabin"].x * 0.9, s["cabin"].y * 0.85, 0.12)
		windshield.mesh = ws_mesh
		windshield.material_override = ProtoWorldBuilder.material(Color(0.15, 0.2, 0.25), 0.2)
		windshield.position = s["cabin_pos"] + Vector3(0, 0, -s["cabin"].z / 2.0 - 0.05)
		car.add_child(windshield)

	# Tail lights (emissive) — helps read facing from top-down.
	if s["cabin"] != Vector3.ZERO:
		for tx in [-s["chassis"].x * 0.35, s["chassis"].x * 0.35]:
			var tail := MeshInstance3D.new()
			var tmesh := BoxMesh.new()
			tmesh.size = Vector3(0.35, 0.15, 0.08)
			tail.mesh = tmesh
			tail.material_override = ProtoWorldBuilder.material(Color(0.9, 0.1, 0.08), 0.4, true)
			tail.position = Vector3(tx, 0.2, s["chassis"].z / 2.0)
			car.add_child(tail)

	# The 5-part anatomy (Damageable = the same class body parts use).
	car.components = {
		"engine": Damageable.new("engine", "🔧", 100.0),
		"tires": Damageable.new("tires", "🛞", 100.0),
		"battery": Damageable.new("battery", "🔋", 60.0),
		"fuel_tank": Damageable.new("fuel_tank", "⛽", 80.0),
		"chassis": Damageable.new("chassis", "🛡️", 100.0),
	}
	car._spiral_rng.randomize()
	# THE TRUNK THING (VEHICLES.md §3): capacity is the class identity —
	# saddlebag 10 kg, van 120, trailer 400. transfer_to enforces it.
	car.trunk = ProtoContainer.new("%s cargo" % s["name"], s["trunk_max_w"])
	if vclass_in == "scavenger":
		car.trunk.add("bandage", 1)
		car.trunk.add("scrap", 2)

	# Wheels from the row: [x, z, steer, traction, visible, radius]
	for w in s["wheels"]:
		var wheel := VehicleWheel3D.new()
		wheel.position = Vector3(w[0], -0.15, w[1])
		wheel.use_as_steering = w[2]
		wheel.use_as_traction = w[3]
		wheel.wheel_radius = w[5]
		wheel.wheel_rest_length = 0.22
		wheel.suspension_travel = 0.25
		wheel.suspension_stiffness = 45.0
		wheel.suspension_max_force = 12000.0 * maxf(1.0, s["mass"] / 900.0)
		wheel.damping_compression = 0.25 * 2.0 * sqrt(45.0)
		wheel.damping_relaxation = 0.4 * 2.0 * sqrt(45.0)
		wheel.wheel_roll_influence = 0.05
		if w[4]: # visible — bikes render only the centered pair of their stability wheels
			var tire := MeshInstance3D.new()
			var tmesh := CylinderMesh.new()
			tmesh.top_radius = w[5]
			tmesh.bottom_radius = w[5]
			tmesh.height = 0.3 if absf(w[0]) > 0.3 else 0.22
			tire.mesh = tmesh
			tire.material_override = ProtoWorldBuilder.material(Color(0.08, 0.08, 0.08), 1.0)
			tire.rotation_degrees.z = 90.0
			if absf(w[0]) < 0.3:
				tire.position.x = -w[0] # center the visual on the bike's spine
			wheel.add_child(tire)
			car._tire_meshes.append(tire)
		car.add_child(wheel)
		if w[2]:
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


# --- Trailer coupling (VEHICLES.md §4) ----------------------------------------

func hitch_world() -> Vector3:
	if spec.has("hitch_z"):
		return to_global(Vector3(0, 0.5, spec["hitch_z"]))
	if spec.has("hitch_front_z"):
		return to_global(Vector3(0, 0.5, spec["hitch_front_z"]))
	return global_position


## Couple a trailer to a tractor with a yaw-free joint: linear locked, yaw ±80°,
## pitch/roll a few soft degrees — it articulates like a real rig.
static func couple(tractor: ProtoCar3D, trailer: ProtoCar3D) -> void:
	if trailer.hitched_to != null:
		return
	var j := Generic6DOFJoint3D.new()
	tractor.get_parent().add_child(j)
	j.global_position = tractor.hitch_world()
	j.node_a = tractor.get_path()
	j.node_b = trailer.get_path()
	for axis in ["x", "y", "z"]:
		j.set("angular_limit_%s/enabled" % axis, true)
	j.set("angular_limit_y/upper_angle", deg_to_rad(80.0))
	j.set("angular_limit_y/lower_angle", deg_to_rad(-80.0))
	for axis in ["x", "z"]:
		j.set("angular_limit_%s/upper_angle" % axis, deg_to_rad(6.0))
		j.set("angular_limit_%s/lower_angle" % axis, deg_to_rad(-6.0))
	trailer.hitched_to = tractor
	trailer._hitch_joint = j


func uncouple() -> void:
	if _hitch_joint and is_instance_valid(_hitch_joint):
		_hitch_joint.queue_free()
	_hitch_joint = null
	hitched_to = null


# --- Interactable contract (on-foot) ---------------------------------------

func interact_position() -> Vector3:
	return global_position


func _at_trunk(main: Node) -> bool:
	# Standing behind the vehicle = trunk zone (rear is local +Z).
	return to_local(main.player.global_position).z > spec["chassis"].z * 0.32


func interact_prompt(main: Node) -> String:
	if is_active:
		return ""
	if dead:
		return "" if salvaged else "E — Salvage the burnt %s" % display_name
	if vclass == "trailer":
		# The trailer is cargo, not a cab: front = hitch business, rear = the tank.
		if to_local(main.player.global_position).z < -2.4:
			if hitched_to != null:
				return "E — Drop the trailer"
			var rig := _nearest_hitch_rig()
			return "E — Hitch to the %s" % rig.display_name if rig else "(back a rig's hitch up to couple)"
		return "E — Open trailer (%d kg tank)" % int(trunk.max_weight)
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
			var bonus: int = main.character.salvage_bonus() if "character" in main else 0
			main.backpack.add("scrap", 3 + bonus) # Mechanics strips a wreck cleaner
			main.notify("Salvaged scrap from the burnt %s%s" % [display_name, " (+%d skill)" % bonus if bonus > 0 else ""])
			if main.has_method("grant_xp"):
				main.grant_xp("mechanics", 4.0)
		return
	if vclass == "trailer":
		if to_local(main.player.global_position).z < -2.4:
			if hitched_to != null:
				var rig_name := hitched_to.display_name
				uncouple()
				main.notify("Dropped the trailer off the %s" % rig_name)
			else:
				var rig := _nearest_hitch_rig()
				if rig:
					ProtoCar3D.couple(rig, self)
					main.notify("Coupled the trailer to the %s" % rig.display_name)
				else:
					main.notify("No rig's hitch in reach — back the %s up to it" % VEHICLES["semi"]["name"])
		else:
			main.open_container(trunk)
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


func _nearest_hitch_rig() -> ProtoCar3D:
	var my_hitch := hitch_world()
	for node in get_tree().get_nodes_in_group("interactable"):
		if node is ProtoCar3D and node != self and (node as ProtoCar3D).spec.has("hitch_z"):
			var rig := node as ProtoCar3D
			if not rig.dead and rig.hitch_world().distance_to(my_hitch) < 2.6:
				return rig
	return null


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
	# FUEL LEAK (drivable damage): a breached tank BLEEDS — the gauge falls while
	# you argue with the map. Patch it or watch the range die.
	if breached and fuel > 0.0:
		fuel = maxf(0.0, fuel - 0.5 * delta)
	match fire_state:
		FireState.OK:
			if chassis.ratio() < 0.4:
				fire_state = FireState.SMOKING
		FireState.SMOKING:
			if chassis.ratio() < 0.15 or (breached and chassis.ratio() < 0.3):
				fire_state = FireState.ON_FIRE
				cook = 0.0
				_ensure_flames().emitting = true
			elif chassis.ratio() >= 0.4:
				fire_state = FireState.OK
		FireState.ON_FIRE:
			# The cook meter: it MIGHT blow early — every tick rolls against it.
			cook += delta * (100.0 / (6.0 if breached else 9.5))
			if cook >= 100.0 or _spiral_rng.randf() < (cook / 100.0) * delta * 0.5:
				_explode()
			elif chassis.ratio() <= 0.0:
				_become_husk(false)
		FireState.DESTROYED:
			pass


## DAMAGE YOU CAN SEE (playtest law): exhaust smoke IS the health bar — it starts
## at chassis 70%, thickens and darkens as damage grows, and pours from the
## TAILPIPE (per-class position), not the hood. Fire still burns at the engine.
func _update_damage_smoke() -> void:
	if spec.get("tailpipe", Vector3.ZERO) == Vector3.ZERO:
		return
	var sm := _ensure_smoke()
	if dead:
		return # husk smolder is handled by _become_husk
	var ratio: float = components["chassis"].ratio()
	var sev := clampf(1.0 - ratio / 0.7, 0.0, 1.0)
	sm.emitting = sev > 0.0
	if not sm.emitting:
		_smoke_bucket = -1
		return
	# Quantize severity — changing CPUParticles amount restarts emission, so only
	# touch it when the bucket actually moves.
	var bucket := clampi(int(sev * 4.0), 0, 3)
	if bucket != _smoke_bucket:
		_smoke_bucket = bucket
		sm.amount = [10, 20, 32, 44][bucket]
	sm.color = Color(0.30, 0.29, 0.28, 0.7).lerp(Color(0.07, 0.07, 0.07, 0.92), sev)


func _ensure_smoke() -> CPUParticles3D:
	if _smoke == null:
		_smoke = CPUParticles3D.new()
		_smoke.amount = 10
		_smoke.lifetime = 1.6
		_smoke.mesh = BoxMesh.new()
		(_smoke.mesh as BoxMesh).size = Vector3(0.22, 0.22, 0.22)
		_smoke.direction = Vector3(0, 1, 0)
		_smoke.initial_velocity_min = 1.5
		_smoke.initial_velocity_max = 3.0
		_smoke.gravity = Vector3(0, 1.0, 0)
		_smoke.color = Color(0.25, 0.24, 0.23, 0.8)
		_smoke.position = spec.get("tailpipe", Vector3(0, 0.6, 1.2))
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


## Dashboard snapshot for the HUD (the car's moodles) — tiers AND ratios (the
## bars), plus what the ground is doing to you right now.
func dashboard() -> Dictionary:
	return {
		"engine": components["engine"].tier(), "tires": components["tires"].tier(),
		"battery": components["battery"].tier(), "fuel_tank": components["fuel_tank"].tier(),
		"chassis": components["chassis"].tier(), "fuel": fuel,
		"ratios": {"engine": components["engine"].ratio(), "tires": components["tires"].ratio(),
			"battery": components["battery"].ratio(), "fuel_tank": components["fuel_tank"].ratio(),
			"chassis": components["chassis"].ratio()},
		"on_fire": fire_state == FireState.ON_FIRE, "cook": cook,
		"smoking": fire_state == FireState.SMOKING,
		"surface": current_surface, "struggling": is_struggling,
		"tire_name": spec["tires"]["name"], "drive_factor": offroad_factor(),
		"name": display_name, "load": trunk.total_weight(), "load_max": trunk.max_weight,
	}


func _physics_process(delta: float) -> void:
	forward_speed = linear_velocity.dot(-global_basis.z)
	current_mph = absf(forward_speed) * 2.237
	speed_changed.emit(current_mph)

	_update_death_spiral(delta)
	_update_damage_smoke()

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

	# TWO-WHEEL BALANCE: bikes get the rider's balance / a kickstand, whether
	# ridden or parked. Torque only (iron rule: a direct angular_velocity write
	# fights the wheel solver). Airborne bikes tumble free — drama stays.
	if spec.get("two_wheel", false):
		_apply_upright()

	# Impact damage: a hard velocity change in one tick = a crash (teleports excluded).
	_impact_cd = maxf(0.0, _impact_cd - delta)
	var moved := global_position.distance_to(_prev_pos)
	var dv := (linear_velocity - _prev_vel).length()
	if _impact_cd <= 0.0 and moved < 4.0 and dv > 9.0:
		_impact_cd = 0.5
		take_damage(clampf((dv - 9.0) * 1.5, 4.0, 45.0))
		# No cab, no mercy: a hard hit on an exposed ride THROWS the rider.
		if spec.get("rider_exposed", false) and is_active and dv > 8.0:
			rider_thrown.emit(dv)
	_prev_vel = linear_velocity
	_prev_pos = global_position

	# Rolling dust: kick up wasteland behind the vehicle at speed.
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
		_dust.position = Vector3(0, -0.2, spec["chassis"].z / 2.0)
		_dust.emitting = false
		add_child(_dust)
	# Dirt kicks up dust sooner and browner than asphalt (surface feel). BOGGED
	# vehicles churn double the dust in fat mud clumps — you SEE the struggle.
	var dust_speed: float = SURFACE.get(current_surface, SURFACE["road"])["dust_speed"]
	_dust.emitting = not dead and absf(forward_speed) > (2.5 if is_struggling else dust_speed)
	_dust.amount = 56 if is_struggling else 28
	if is_struggling:
		_dust.color = Color(0.45, 0.34, 0.2, 0.75)
	else:
		_dust.color = Color(0.62, 0.52, 0.38, 0.5) if current_surface == "dirt" else Color(0.55, 0.55, 0.55, 0.32)

	_update_wear_visuals(delta)

	if not is_active or dead:
		engine_force = 0.0
		# A towed trailer must ROLL; everything else gets a parking brake.
		brake = 0.4 if spec.get("free_rolling", false) else 3.0
		steering = move_toward(steering, 0.0, steer_speed * delta)
		# Surface still matters while towed (trailer wheels follow the tractor).
		if spec.get("free_rolling", false):
			current_surface = surface_override if surface_override != "" else _sample_surface()
		return

	if use_player_input:
		input_throttle = Input.get_action_strength("move_up")
		input_brake = Input.get_action_strength("move_down")
		input_steer = Input.get_axis("move_right", "move_left")
		input_handbrake = Input.is_action_pressed("jump")

	# SURFACE × TIRES decide how this thing actually DRIVES (VEHICLES.md §2):
	# off-road bogs you down through the tire's dirt worth, and shredded rubber
	# drags everywhere. eff_top is the speed the drivetrain can really deliver.
	current_surface = surface_override if surface_override != "" else _sample_surface()
	var drive_factor := offroad_factor()
	var eff_top: float = maxf(top_speed * drive_factor * driver_top, 4.0)
	is_struggling = input_throttle > 0.3 and drive_factor < 0.82 and not dead

	# Steering authority falls off with speed for stability, ramps in smoothly.
	# While the handbrake is down, authority is trimmed too — full lock mid-slide
	# whipped the car 180 (first-playtest bug); a drift should be steered, not spun.
	var speed_ratio := clampf(absf(forward_speed) / eff_top, 0.0, 1.0)
	var steer_limit := lerpf(max_steer, high_speed_steer, speed_ratio)
	if input_handbrake:
		steer_limit *= handbrake_steer_mult
	steering = move_toward(steering, input_steer * steer_limit, steer_speed * driver_control * delta)
	# CHASSIS SLOP (drivable damage): a bent frame won't track true — at speed the
	# wheel WANDERS and you correct constantly. Worn = a shimmy; critical = a fight.
	steer_slop = 0.0
	var ch_tier: int = components["chassis"].tier()
	if ch_tier >= Damageable.Tier.CRITICAL:
		steer_slop = 0.10
	elif ch_tier == Damageable.Tier.WORN:
		steer_slop = 0.03
	if steer_slop > 0.0 and absf(forward_speed) > 4.0:
		steering += sin(Time.get_ticks_msec() * 0.0023) * steer_slop * clampf(absf(forward_speed) / top_speed, 0.3, 1.0)

	# Throttle / brake / reverse.
	# NOTE: measured empirically via drive_sim — positive engine_force pushes +Z,
	# so forward (-Z) drive needs a NEGATIVE engine force.
	# THE LIVING CAR: the engine component scales power; fuel + battery gate it;
	# tire condition scales grip (handling = baseline x condition — LOOP2 rule).
	var engine_mult: float = TIER_ENGINE_MULT[components["engine"].tier()]
	if fuel <= 0.0 or components["battery"].tier() == Damageable.Tier.BROKEN:
		engine_mult = 0.0
	# MISFIRE (drivable damage): a critical engine CUTS OUT in coughs — power dies
	# for a breath, the exhaust pops, you lurch. The repair loop sells the cure.
	if components["engine"].tier() >= Damageable.Tier.CRITICAL and not dead:
		_misfire_cd -= delta
		if _misfire_cd <= 0.0:
			_misfire_cd = _spiral_rng.randf_range(1.8, 4.2)
			_misfire_t = 0.45
			var mm := get_tree().current_scene
			if mm != null and "audio" in mm and mm.audio:
				mm.audio.play_at("metal_debris", global_position, -8.0, 1.5)
	_misfire_t = maxf(0.0, _misfire_t - delta)
	misfiring = _misfire_t > 0.0
	if misfiring:
		engine_mult *= 0.12
	# BATTERY FLICKER (drivable damage): a dying battery can't hold the beams —
	# night driving on a bad battery is driving by strobe.
	if headlights_on and components["battery"].tier() >= Damageable.Tier.CRITICAL:
		for hl in _headlights:
			if hl is SpotLight3D:
				(hl as SpotLight3D).light_energy = 4.0 * (0.2 + 0.8 * float(_spiral_rng.randf() > 0.25))
	# Grip = baseline × tire condition × SURFACE-through-the-TIRES: off-road worth
	# is the tire's dirt_mult (knobby 0.95 … highway 0.68 — VEHICLES.md §2);
	# water halves it again (surface_grip_mult).
	var surf_grip: float = surface_grip_mult()
	var grip_mult: float = TIER_GRIP_MULT[components["tires"].tier()] * surf_grip
	for w in _front_wheels:
		w.wheel_friction_slip = grip_front * grip_mult * ProtoWeather.grip_now # rain kills grip (weather law)
	var rear_base := handbrake_grip_rear if input_handbrake else grip_rear
	for w in _rear_wheels:
		w.wheel_friction_slip = rear_base * grip_mult * ProtoWeather.grip_now

	if input_throttle > 0.0 and engine_mult > 0.0:
		fuel = maxf(0.0, fuel - fuel_drain_rate * input_throttle * delta)
		# A breached tank bleeds extra while running.
		if components["fuel_tank"].tier() >= Damageable.Tier.CRITICAL:
			fuel = maxf(0.0, fuel - 1.2 * delta)

	engine_force = 0.0
	brake = 0.0
	if input_throttle > 0.0 and forward_speed < eff_top and engine_mult > 0.0:
		# Taper force as speed climbs — punchy low end, natural top-speed plateau.
		# Off-road/worn-tire drag lowers BOTH the ceiling and the punch.
		engine_force = -input_throttle * max_engine_force * engine_mult * drive_factor * lerpf(1.0, 0.45, speed_ratio)
	if input_brake > 0.0:
		if forward_speed > 1.0:
			brake = input_brake * max_brake
		elif forward_speed > -reverse_top_speed:
			engine_force = input_brake * max_engine_force * 0.5

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
			# A skilled driver's drift is TIGHTER: the cap shrinks and the settle
			# torque grows with driver_control — less spin, exactly the skill's pitch.
			var yaw_cap := handbrake_yaw_rate / driver_control
			var yaw_damp := handbrake_yaw_damp * driver_control
			var wy := angular_velocity.y
			if absf(wy) > yaw_cap:
				apply_torque(Vector3(0.0, -(wy - signf(wy) * yaw_cap) * mass * yaw_damp, 0.0))
			elif absf(input_steer) < 0.15:
				apply_torque(Vector3(0.0, -wy * mass * yaw_damp, 0.0))

	_emit_skids()


## Hold a two-wheeler up: PD torque about the forward (roll) axis. Lean is the
## RIGHT axis's rise above horizontal (asin of x·UP — positive = leaning LEFT);
## rotating +θ about forward LOWERS the right axis, so the control acceleration
## about forward is kp*(lean - target) - kd*roll_rate. Ridden at speed the bike
## lays INTO the corner (target follows steer); parked it stands dead upright.
func _apply_upright() -> void:
	var grounded := false
	for w in _front_wheels + _rear_wheels:
		if w.is_in_contact():
			grounded = true
			break
	if not grounded:
		return
	var fwd := -global_basis.z
	fwd.y = 0.0
	if fwd.length_squared() < 0.01:
		return
	fwd = fwd.normalized()
	var lean := asin(clampf(global_basis.x.dot(Vector3.UP), -1.0, 1.0))
	var roll_rate := angular_velocity.dot(fwd)
	var target := 0.0
	if is_active and not dead:
		var speed_ratio := clampf(absf(forward_speed) / maxf(top_speed, 1.0), 0.0, 1.0)
		target = clampf(input_steer * max_lean * speed_ratio, -max_lean, max_lean)
	var kp := upright_kp
	var kd := upright_kd
	if absf(forward_speed) < 2.0:
		kp *= upright_parked_mult
		kd *= upright_parked_mult
	# Authority must beat the worst toppling moment: ~5g of tire grip at the COM
	# height (~5.9 kN·m on the Rat Bike). Cap 70 rad/s² × mass × 0.35 clears it.
	var accel := clampf(kp * (lean - target) - kd * roll_rate, -70.0, 70.0)
	apply_torque(fwd * accel * mass * 0.35)


# --- Surface + skid marks (2026-07-05 driving pass) --------------------------

## Which surface the vehicle sits on. Roads are visual-only, so the world tells us.
func _sample_surface() -> String:
	return ProtoWorldBuilder.surface_at(global_position)


func surface_grip_mult() -> float:
	var s_name: String = surface_override if surface_override != "" else current_surface
	if s_name == "road":
		return 1.0
	if s_name == "water":
		return float(spec["tires"]["dirt_mult"]) * 0.5 # slick — lakes/rivers are not roads
	return float(spec["tires"]["dirt_mult"])


## How much of this vehicle's drivetrain actually reaches the ground RIGHT NOW:
## surface-through-the-tires × tire condition. 1.0 = full song; low = bogged/limping.
func offroad_factor() -> float:
	var s_name: String = surface_override if surface_override != "" else current_surface
	var surf: float = 1.0 if s_name == "road" else clampf(float(spec["tires"]["dirt_mult"]), 0.5, 1.0)
	if s_name == "water":
		surf *= 0.34 # fording a river BOGS you — cross at the bridges
	return surf * TIER_TIRE_DRAG[components["tires"].tier()]


## Wear you can SEE from straight above: tires recolor by condition tier, and at
## CRITICAL the whole body develops a shimmy — the car itself says "I'm hurt."
func _update_wear_visuals(delta: float) -> void:
	var tier: int = components["tires"].tier()
	if tier != _tire_look_tier:
		_tire_look_tier = tier
		var mat := ProtoWorldBuilder.material(TIER_TIRE_COLOR[tier], 1.0)
		for t in _tire_meshes:
			if is_instance_valid(t):
				(t as MeshInstance3D).material_override = mat
	if _hull_mesh == null or dead:
		return
	if tier >= Damageable.Tier.CRITICAL and absf(forward_speed) > 2.0:
		_shimmy_t += delta * (14.0 if tier == Damageable.Tier.CRITICAL else 22.0)
		_hull_mesh.rotation.z = sin(_shimmy_t) * 0.022
	elif _hull_mesh.rotation.z != 0.0:
		_hull_mesh.rotation.z = 0.0


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
		# The slide SPEAKS on asphalt (rubber screech, cooldown-gated); dirt hisses
		# by not screeching at all — the surface is information.
		_skid_snd_cd = maxf(0.0, _skid_snd_cd - get_physics_process_delta_time())
		if _skid_snd_cd <= 0.0 and current_surface == "road" and absf(forward_speed) > 6.0:
			_skid_snd_cd = 1.3
			var m := get_tree().current_scene
			if m != null and "audio" in m and m.audio:
				m.audio.play_at("skid", global_position, -7.0)
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
