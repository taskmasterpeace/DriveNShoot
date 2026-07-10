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
	"scavenger": {"name": "Scavenger", "aero_drag": 0.30, "mass": 900.0, "engine": 6500.0, "top": 34.0, "rev": 11.0,
		"steer": [0.55, 0.16, 5.0], "tires": {"grip_f": 5.5, "grip_r": 5.0, "dirt_mult": 0.78, "name": "street"},
		"chassis": Vector3(2.0, 0.7, 4.4), "hull": Vector3(2.0, 0.55, 4.4), "cabin": Vector3(1.7, 0.5, 2.0), "cabin_pos": Vector3(0, 0.55, 0.25),
		"wheels": [[-0.85, -1.45, true, false, true, 0.38], [0.85, -1.45, true, false, true, 0.38],
			[-0.85, 1.45, false, true, true, 0.38], [0.85, 1.45, false, true, true, 0.38]],
		"trunk_max_w": 40.0, "dog_seats": 2, "wound_mult": 1.0, "tailpipe": Vector3(-0.72, 0.24, 2.32), "com_y": -0.25},
	"motorcycle": {"name": "Rat Bike", "aero_drag": 0.15, "mass": 260.0, "engine": 3400.0, "top": 38.0, "rev": 8.0,
		"steer": [0.62, 0.2, 6.5], "tires": {"grip_f": 5.2, "grip_r": 4.6, "dirt_mult": 0.82, "name": "dual-sport"},
		"chassis": Vector3(0.55, 0.6, 2.2), "hull": Vector3(0.34, 0.42, 1.9), "cabin": Vector3(0.3, 0.28, 0.7), "cabin_pos": Vector3(0, 0.62, 0.35),
		# Physics rides 4 narrow-track wheels (self-standing trick); only the centered pair renders.
		"wheels": [[-0.11, -0.8, true, false, false, 0.34], [0.11, -0.8, true, false, true, 0.34],
			[-0.11, 0.8, false, true, false, 0.34], [0.11, 0.8, false, true, true, 0.34]],
		"trunk_max_w": 10.0, "dog_seats": 0, "wound_mult": 2.5, "rider_exposed": true, "two_wheel": true, "tailpipe": Vector3(0.20, 0.30, 1.12), "com_y": -0.4},
	"buggy": {"name": "Dustrunner", "aero_drag": 0.30, "mass": 620.0, "engine": 5200.0, "top": 31.0, "rev": 10.0,
		"steer": [0.6, 0.2, 6.0], "tires": {"grip_f": 5.0, "grip_r": 4.6, "dirt_mult": 0.95, "name": "knobby"},
		"chassis": Vector3(1.7, 0.6, 3.0), "hull": Vector3(1.6, 0.35, 2.9), "cabin": Vector3(1.2, 0.45, 1.2), "cabin_pos": Vector3(0, 0.5, 0.1),
		"wheels": [[-0.8, -1.1, true, false, true, 0.42], [0.8, -1.1, true, false, true, 0.42],
			[-0.8, 1.1, false, true, true, 0.42], [0.8, 1.1, false, true, true, 0.42]],
		"trunk_max_w": 22.0, "dog_seats": 1, "wound_mult": 1.4, "tailpipe": Vector3(-0.62, 0.34, 1.62), "com_y": -0.3},
	"pickup": {"name": "Rustler", "aero_drag": 0.40, "mass": 1250.0, "engine": 8200.0, "top": 30.0, "rev": 10.0,
		"steer": [0.55, 0.15, 4.8], "tires": {"grip_f": 5.4, "grip_r": 5.0, "dirt_mult": 0.90, "name": "all-terrain"},
		"chassis": Vector3(2.1, 1.0, 4.8), "hull": Vector3(2.05, 0.8, 4.7), "cabin": Vector3(1.9, 0.75, 1.6), "cabin_pos": Vector3(0, 0.95, -1.0),
		"wheels": [[-0.88, -1.6, true, false, true, 0.44], [0.88, -1.6, true, false, true, 0.44],
			[-0.88, 1.6, false, true, true, 0.44], [0.88, 1.6, false, true, true, 0.44]],
		"trunk_max_w": 60.0, "dog_seats": 2, "wound_mult": 0.9, "tailpipe": Vector3(-0.82, 0.28, 2.52), "com_y": -0.4},
	"van": {"name": "Boxer", "aero_drag": 0.50, "mass": 1700.0, "engine": 7200.0, "top": 27.0, "rev": 9.0,
		"steer": [0.5, 0.13, 4.0], "tires": {"grip_f": 5.6, "grip_r": 5.2, "dirt_mult": 0.68, "name": "highway"},
		"chassis": Vector3(2.2, 1.5, 5.2), "hull": Vector3(2.2, 1.35, 5.2), "cabin": Vector3(2.0, 0.5, 1.4), "cabin_pos": Vector3(0, 1.05, -1.7),
		"wheels": [[-0.9, -1.9, true, false, true, 0.4], [0.9, -1.9, true, false, true, 0.4],
			[-0.9, 1.9, false, true, true, 0.4], [0.9, 1.9, false, true, true, 0.4]],
		"trunk_max_w": 120.0, "dog_seats": 4, "wound_mult": 0.8, "tailpipe": Vector3(-0.86, 0.26, 2.72), "com_y": -0.45},
	"semi": {"name": "Longhaul", "aero_drag": 1.00, "mass": 3800.0, "engine": 12000.0, "top": 25.0, "rev": 6.0,
		"steer": [0.45, 0.1, 3.0], "tires": {"grip_f": 6.2, "grip_r": 5.8, "dirt_mult": 0.7, "name": "rig"},
		"chassis": Vector3(2.4, 1.9, 6.4), "hull": Vector3(2.35, 1.0, 6.2), "cabin": Vector3(2.3, 1.3, 2.2), "cabin_pos": Vector3(0, 1.55, -1.9),
		# ONE drive axle (Godot applies engine_force per traction wheel — 4 traction
		# wheels secretly doubled the rig's power and broke the accel ladder).
		"wheels": [[-0.95, -2.4, true, false, true, 0.45], [0.95, -2.4, true, false, true, 0.45],
			[-0.95, 1.6, false, true, true, 0.45], [0.95, 1.6, false, true, true, 0.45],
			[-0.95, 2.55, false, false, true, 0.45], [0.95, 2.55, false, false, true, 0.45]],
		"trunk_max_w": 45.0, "dog_seats": 2, "wound_mult": 0.4, "tailpipe": Vector3(1.05, 2.6, -1.2), "exhaust_dir": Vector3(0, 1, 0), "com_y": -0.55, "hitch_z": 3.1},
	# THE HUMVEE (gadgets goal): the military's ride — heavy, armored, planted, and it
	# carries its OWN DRONE BAY on the rear deck (a mounted ProtoDroneDock: launch a route
	# scout from the truck, quarter-day recharge law and all). The military AI that drives
	# these in anger is deliberately NOT built yet (owner: "we're not ready") — the rig is.
	"humvee": {"name": "Humvee", "aero_drag": 0.55, "mass": 2600.0, "engine": 9800.0, "top": 29.0, "rev": 9.0,
		"steer": [0.5, 0.14, 4.4], "tires": {"grip_f": 5.8, "grip_r": 5.4, "dirt_mult": 0.92, "name": "run-flat"},
		"chassis": Vector3(2.3, 1.1, 4.9), "hull": Vector3(2.25, 0.9, 4.8), "cabin": Vector3(2.0, 0.6, 2.2), "cabin_pos": Vector3(0, 1.05, -0.3),
		"wheels": [[-0.95, -1.6, true, false, true, 0.46], [0.95, -1.6, true, false, true, 0.46],
			[-0.95, 1.6, false, true, true, 0.46], [0.95, 1.6, false, true, true, 0.46]],
		"trunk_max_w": 70.0, "dog_seats": 2, "wound_mult": 0.6, "tailpipe": Vector3(-0.88, 0.30, 2.57), "com_y": -0.45,
		"armor": {"front": 55.0}, "drone_bay": true},
	"trailer": {"name": "trailer", "aero_drag": 0.60, "mass": 2200.0, "engine": 0.0, "top": 0.0, "rev": 0.0,
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
@export var steer_speed: float = 5.0         ## How fast the wheel turns TOWARD input (rad/s)
## TWO-RATE STEERING (owner ask 2026-07-07): "the wheel should snap back straight
## faster than it winds up" — centering uses this instead of steer_speed whenever
## input_steer is ~neutral. Defaults 1.6x steer_speed (row-tunable via a row's
## `steer_return_mult`, folded in create() — a raw override wins if a row sets it).
@export var steer_return_speed: float = 8.0
@export var top_speed: float = 34.0          ## m/s (~76 mph)
@export var reverse_top_speed: float = 11.0
@export var grip_front: float = 5.5   ## Higher = more planted (less slide). Worn/blown tires LOWER this.
@export var grip_rear: float = 5.0    ## Baseline grip; the Tires component modifies it (see LOOP2 spec).
@export var handbrake_grip_rear: float = 2.4  ## Slide grip — playtest bug: 1.1 spun the car a full 180.
@export var handbrake_steer_mult: float = 0.55 ## Steering authority while sliding (full lock = spin).
@export var handbrake_decel: float = 20.0     ## m/s² braking — a decel FORCE (not a wheel-brake, which locks the fronts & kills steering). 8→14 (2026-07-09 "hit space, it doesn't stop") → 20 (2026-07-10 "feels like it just decelerates"): a hard ~2g emergency bite; the low rear grip still gives the steerable drift.
@export var handbrake_yaw_rate: float = 1.4   ## rad/s cap on drift rotation — the anti-180 (raw physics peaked at 6.5).
@export var handbrake_yaw_damp: float = 18.0  ## counter-torque strength that arrests the spin at the cap / to straight

## BURNOUT (owner ask 2026-07-07): stand on the gas from a standstill and the
## drive wheels light up instead of hooking up. Row-tunable (a row can drop
## `burnout_slip` lower for a peaky muscle-car feel, or raise `burnout_speed_max`
## for a longer light-up on a heavy rig).
@export var burnout_slip: float = 0.55      ## rear grip multiplier while burning out (1.0 = no effect)
@export var burnout_speed_max: float = 6.0  ## m/s — burnout clears once forward speed passes this

## AERODYNAMIC DRAG (learned from Ander2211/Vehicle-Controller, MIT — its process_drag()).
## A resistive force ∝ speed², opposing horizontal motion. Where the engine-force taper
## only caps the PUSH near top speed, drag also bites when you COAST — lift off at speed
## and the car slows on its own, and a boxy rig (van/semi) feels draggier than a bike.
## Row-tunable (vehicles.json → spec["aero_drag"]); 0.0 = OFF (old behavior exactly, so
## it's purely additive — an un-set row drives identically to before). Units: N per (m/s)².
@export var aero_drag: float = 0.0

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

## LIGHTS (owner ask 2026-07-07): "it's too dark out there" — a car-anchored NIGHT
## HALO for spill light, plus BRAKE-GLOW / REVERSE-WHITE states on the tail boxes.
## Engine defaults here; a row's `lights` sub-dict (vehicles.json → DrivnVehicle.extra
## → spec["lights"]) OVERLAYS these key-by-key (deep merge — a row supplying only
## `halo.range` must not blank out `brake`/`reverse`).
const LIGHTS_DEFAULT: Dictionary = {
	"halo": {"range": 9.0, "energy": 1.2, "color": Color(1.0, 0.82, 0.55)},
	"brake": {"energy_mult": 3.0, "glow_energy": 0.9},
	"reverse": {"energy": 0.7},
}
## Base tail-light color (the glow's OFF/idle state — `brake.energy_mult` multiplies
## the emission energy up from here when the pedal or handbrake is down).
const TAIL_COLOR := Color(0.9, 0.1, 0.08)
const REVERSE_COLOR := Color(0.92, 0.92, 0.88)

## WINDOWS (owner ask 2026-07-07): tinted glass, consistent across the fleet —
## dark cool grey-blue, a little metallic so it catches light like real safety
## glass. A row may override with `window_tint: [r, g, b]` (open schema, folds
## through DrivnVehicle.extra same as `lights`); two_wheel rigs (no cabin glass
## worth reading at this scale) skip windows entirely.
const WINDOW_TINT_DEFAULT := Color(0.10, 0.14, 0.19)
const WINDOW_METALLIC := 0.35
const WINDOW_ROUGH := 0.15


## Deep-merge a row's partial `lights` override onto the engine defaults so a JSON
## row can tune ONE sub-key (e.g. just halo.range) without dropping its siblings.
static func _merged_lights(row_lights: Dictionary) -> Dictionary:
	var out: Dictionary = LIGHTS_DEFAULT.duplicate(true)
	for group in row_lights:
		if not (group in out):
			out[group] = {}
		var dst: Dictionary = out[group]
		var src: Variant = row_lights[group]
		if src is Dictionary:
			for k in (src as Dictionary):
				dst[k] = (src as Dictionary)[k]
		out[group] = dst
	return out

## Window glass is never runtime-mutated (unlike the tail, which brake-glow
## brightens live), so it's safe — and cheap — to share ONE material per tint
## across every car wearing it, same law as ProtoWorldBuilder's own _mat_cache.
static var _window_mat_cache: Dictionary = {}


static func _window_material(tint: Color) -> StandardMaterial3D:
	var key := tint.to_html()
	if _window_mat_cache.has(key):
		return _window_mat_cache[key]
	var mat := StandardMaterial3D.new()
	mat.albedo_color = tint
	mat.roughness = WINDOW_ROUGH
	mat.metallic = WINDOW_METALLIC
	_window_mat_cache[key] = mat
	return mat


static func _style_color(c: Color, mult: float, add: float = 0.0) -> Color:
	return Color(
		clampf(c.r * mult + add, 0.0, 1.0),
		clampf(c.g * mult + add, 0.0, 1.0),
		clampf(c.b * mult + add, 0.0, 1.0),
		c.a)


static func _style_block(parent: Node, name: String, pos: Vector3, size: Vector3, mat: Material, rot: Vector3 = Vector3.ZERO) -> MeshInstance3D:
	var m := MeshInstance3D.new()
	m.name = name
	var b := BoxMesh.new()
	b.size = Vector3(maxf(0.03, size.x), maxf(0.03, size.y), maxf(0.03, size.z))
	m.mesh = b
	m.position = pos
	m.rotation = rot
	m.material_override = mat
	parent.add_child(m)
	return m


static func _vehicle_visual_target_size_from_spec(s: Dictionary) -> Vector3:
	var chassis: Vector3 = s["chassis"]
	var half_x := chassis.x * 0.5
	var half_z := chassis.z * 0.5
	var wheels: Array = s.get("wheels", [])
	for wheel in wheels:
		var w: Array = wheel
		var visible := true if w.size() < 5 else bool(w[4])
		if not visible:
			continue
		var wx := absf(float(w[0]))
		var wz := absf(float(w[1]))
		var radius := float(w[5]) if w.size() > 5 else 0.35
		half_x = maxf(half_x, wx + radius)
		half_z = maxf(half_z, wz + radius)
	return Vector3(half_x * 2.0, chassis.y, half_z * 2.0)


static func _add_style_frame(root: Node, s: Dictionary, target: Vector3, frame_mat: Material) -> void:
	var rail_x := maxf(0.24, target.x * 0.26)
	var y := maxf(0.10, target.y * 0.12)
	var rail_len := maxf(0.7, target.z * 0.78)
	_style_block(root, "frame_l", Vector3(-rail_x, y, 0), Vector3(0.12, 0.14, rail_len), frame_mat)
	_style_block(root, "frame_r", Vector3(rail_x, y, 0), Vector3(0.12, 0.14, rail_len), frame_mat)
	for z in [-target.z * 0.30, 0.0, target.z * 0.30]:
		_style_block(root, "cross_%.1f" % z, Vector3(0, y + 0.02, z), Vector3(maxf(0.45, target.x * 0.68), 0.12, 0.12), frame_mat)


static func _add_style_bumpers(root: Node, target: Vector3, frame_mat: Material, y: float) -> void:
	_style_block(root, "front_bumper", Vector3(0, y, -target.z * 0.5 + 0.08), Vector3(target.x, 0.18, 0.16), frame_mat)
	_style_block(root, "rear_bumper", Vector3(0, y, target.z * 0.5 - 0.08), Vector3(target.x * 0.92, 0.16, 0.14), frame_mat)


static func _add_style_fenders(root: Node, s: Dictionary, target: Vector3, panel_mat: Material) -> void:
	var wheels: Array = s.get("wheels", [])
	for i in range(wheels.size()):
		var w: Array = wheels[i]
		var visible := true if w.size() < 5 else bool(w[4])
		if not visible:
			continue
		var wx := float(w[0])
		if absf(wx) < 0.3:
			continue
		var radius := float(w[5]) if w.size() > 5 else 0.35
		var side := signf(wx)
		var size := Vector3(0.20, maxf(0.14, radius * 0.48), maxf(0.36, radius * 1.22))
		var pos := Vector3(side * (target.x * 0.5 - size.x * 0.5), maxf(0.28, radius * 0.78), float(w[1]))
		_style_block(root, "fender_%d" % i, pos, size, panel_mat)


static func _add_style_headlights(root: Node, target: Vector3, light_mat: Material, y: float, single: bool = false) -> void:
	if single:
		_style_block(root, "headlight", Vector3(0, y, -target.z * 0.5 + 0.04), Vector3(0.18, 0.15, 0.06), light_mat)
		return
	for sx in [-1.0, 1.0]:
		_style_block(root, "headlight_%s" % ("l" if sx < 0.0 else "r"),
			Vector3(sx * target.x * 0.24, y, -target.z * 0.5 + 0.04), Vector3(0.18, 0.15, 0.06), light_mat)


static func _build_modular_vehicle_style(car: ProtoCar3D, vclass_in: String, s: Dictionary, body_color: Color) -> void:
	var root := Node3D.new()
	root.name = "ModularVehicleStyle"
	car.add_child(root)

	var target := _vehicle_visual_target_size_from_spec(s)
	var family := String(s.get("family", ""))
	var body_mat := ProtoWorldBuilder.material(_style_color(body_color, 1.0), 0.72)
	var panel_mat := ProtoWorldBuilder.material(_style_color(body_color, 0.72, 0.02), 0.78)
	var dark_body_mat := ProtoWorldBuilder.material(_style_color(body_color, 0.48), 0.82)
	var frame_mat := ProtoWorldBuilder.material(Color(0.14, 0.14, 0.13), 0.88)
	var trim_mat := ProtoWorldBuilder.material(Color(0.08, 0.08, 0.075), 0.92)
	var metal_mat := ProtoWorldBuilder.material(Color(0.24, 0.24, 0.22), 0.82)
	var crate_mat := ProtoWorldBuilder.material(Color(0.33, 0.22, 0.12), 0.88)
	var light_mat := ProtoWorldBuilder.material(Color(0.95, 0.86, 0.58), 0.4)

	if bool(s.get("two_wheel", false)) or vclass_in == "motorcycle":
		_build_motorcycle_style(car, root, s, target, body_mat, panel_mat, frame_mat, trim_mat, metal_mat, light_mat)
	elif vclass_in == "buggy":
		_build_buggy_style(car, root, s, target, body_mat, panel_mat, frame_mat, trim_mat, metal_mat, light_mat)
	elif vclass_in == "trailer":
		_build_trailer_style(car, root, s, target, body_mat, panel_mat, frame_mat, metal_mat)
	elif vclass_in == "semi":
		_build_semi_style(car, root, s, target, body_mat, panel_mat, frame_mat, trim_mat, metal_mat, light_mat)
	elif vclass_in == "pickup" or vclass_in == "pickup_truck" or family == "truck":
		_build_pickup_style(car, root, vclass_in, s, target, body_mat, panel_mat, dark_body_mat, frame_mat, trim_mat, metal_mat, crate_mat, light_mat)
	elif vclass_in == "rv" or bool(s.get("camper", false)):
		_build_van_style(car, root, true, s, target, body_mat, panel_mat, frame_mat, trim_mat, metal_mat, light_mat)
	elif vclass_in == "suv" or vclass_in == "humvee" or family == "suv":
		_build_suv_style(car, root, s, target, body_mat, panel_mat, frame_mat, trim_mat, metal_mat, light_mat)
	elif vclass_in == "van" or family == "van":
		_build_van_style(car, root, false, s, target, body_mat, panel_mat, frame_mat, trim_mat, metal_mat, light_mat)
	else:
		_build_scavenger_style(car, root, s, target, body_mat, panel_mat, dark_body_mat, frame_mat, trim_mat, metal_mat, light_mat)


static func _build_motorcycle_style(car: ProtoCar3D, root: Node, _s: Dictionary, target: Vector3, body_mat: Material, panel_mat: Material, frame_mat: Material, trim_mat: Material, metal_mat: Material, light_mat: Material) -> void:
	car._hull_mesh = _style_block(root, "spine", Vector3(0, 0.42, 0), Vector3(maxf(0.10, target.x * 0.16), 0.14, target.z * 0.70), frame_mat)
	_style_block(root, "tank", Vector3(0, 0.62, -target.z * 0.16), Vector3(target.x * 0.50, 0.24, target.z * 0.28), body_mat)
	_style_block(root, "seat", Vector3(0, 0.64, target.z * 0.16), Vector3(target.x * 0.46, 0.14, target.z * 0.30), trim_mat)
	_style_block(root, "front_fender", Vector3(0, 0.46, -target.z * 0.5 + 0.09), Vector3(target.x * 0.36, 0.10, 0.18), panel_mat)
	_style_block(root, "rear_fender", Vector3(0, 0.48, target.z * 0.5 - 0.10), Vector3(target.x * 0.42, 0.10, 0.20), panel_mat)
	_style_block(root, "fork_l", Vector3(-target.x * 0.13, 0.54, -target.z * 0.36), Vector3(0.06, 0.48, 0.08), metal_mat)
	_style_block(root, "fork_r", Vector3(target.x * 0.13, 0.54, -target.z * 0.36), Vector3(0.06, 0.48, 0.08), metal_mat)
	_style_block(root, "handlebar", Vector3(0, 0.88, -target.z * 0.34), Vector3(target.x, 0.06, 0.08), metal_mat)
	_style_block(root, "rear_rack", Vector3(0, 0.66, target.z * 0.36), Vector3(target.x * 0.54, 0.08, target.z * 0.18), frame_mat)
	_style_block(root, "exhaust", Vector3(target.x * 0.32, 0.35, target.z * 0.16), Vector3(0.08, 0.08, target.z * 0.46), metal_mat)
	_add_style_headlights(root, target, light_mat, 0.66, true)


static func _build_buggy_style(car: ProtoCar3D, root: Node, s: Dictionary, target: Vector3, body_mat: Material, panel_mat: Material, frame_mat: Material, trim_mat: Material, metal_mat: Material, light_mat: Material) -> void:
	_add_style_frame(root, s, target, frame_mat)
	_add_style_bumpers(root, target, frame_mat, 0.34)
	_add_style_fenders(root, s, target, panel_mat)
	car._hull_mesh = _style_block(root, "nose", Vector3(0, 0.45, -target.z * 0.23), Vector3(target.x * 0.68, 0.28, target.z * 0.34), body_mat)
	_style_block(root, "cockpit_floor", Vector3(0, 0.34, target.z * 0.07), Vector3(target.x * 0.54, 0.16, target.z * 0.30), metal_mat)
	_style_block(root, "seat", Vector3(0, 0.62, target.z * 0.07), Vector3(target.x * 0.28, 0.34, target.z * 0.20), trim_mat)
	_style_block(root, "dash", Vector3(0, 0.66, -target.z * 0.10), Vector3(target.x * 0.44, 0.18, 0.14), trim_mat)
	_style_block(root, "side_l", Vector3(-target.x * 0.31, 0.48, target.z * 0.06), Vector3(0.12, 0.30, target.z * 0.38), panel_mat)
	_style_block(root, "side_r", Vector3(target.x * 0.31, 0.48, target.z * 0.06), Vector3(0.12, 0.30, target.z * 0.38), panel_mat)
	_style_block(root, "rear_engine", Vector3(0, 0.50, target.z * 0.34), Vector3(target.x * 0.50, 0.30, target.z * 0.23), trim_mat)
	_style_block(root, "engine_vent", Vector3(0, 0.70, target.z * 0.35), Vector3(target.x * 0.34, 0.08, target.z * 0.17), metal_mat)
	for sx in [-1.0, 1.0]:
		_style_block(root, "roll_post_f_%s" % sx, Vector3(sx * target.x * 0.26, 0.86, -target.z * 0.12), Vector3(0.10, 0.76, 0.10), frame_mat)
		_style_block(root, "roll_post_r_%s" % sx, Vector3(sx * target.x * 0.24, 0.86, target.z * 0.24), Vector3(0.10, 0.76, 0.10), frame_mat)
	_style_block(root, "roll_front", Vector3(0, 1.24, -target.z * 0.12), Vector3(target.x * 0.58, 0.10, 0.10), frame_mat)
	_style_block(root, "roll_rear", Vector3(0, 1.24, target.z * 0.24), Vector3(target.x * 0.52, 0.10, 0.10), frame_mat)
	_style_block(root, "roof_bar_l", Vector3(-target.x * 0.25, 1.28, target.z * 0.06), Vector3(0.08, 0.08, target.z * 0.44), frame_mat)
	_style_block(root, "roof_bar_r", Vector3(target.x * 0.25, 1.28, target.z * 0.06), Vector3(0.08, 0.08, target.z * 0.44), frame_mat)
	_add_style_headlights(root, target, light_mat, 0.54)


static func _build_pickup_style(car: ProtoCar3D, root: Node, vclass_in: String, s: Dictionary, target: Vector3, body_mat: Material, panel_mat: Material, dark_body_mat: Material, frame_mat: Material, trim_mat: Material, metal_mat: Material, crate_mat: Material, light_mat: Material) -> void:
	var cabin: Vector3 = s["cabin"]
	var cabin_pos: Vector3 = s["cabin_pos"]
	_add_style_frame(root, s, target, frame_mat)
	_add_style_bumpers(root, target, frame_mat, 0.36)
	_add_style_fenders(root, s, target, panel_mat)
	car._hull_mesh = _style_block(root, "hood", Vector3(0, 0.56, -target.z * 0.33), Vector3(target.x * 0.74, 0.26, target.z * 0.26), body_mat)
	_style_block(root, "cab_shell", cabin_pos + Vector3(0, -0.02, 0), Vector3(cabin.x * 0.88, cabin.y * 0.95, cabin.z * 0.88), body_mat)
	_style_block(root, "grille", Vector3(0, 0.56, -target.z * 0.5 + 0.10), Vector3(target.x * 0.54, 0.26, 0.08), trim_mat)
	_style_block(root, "bed_floor", Vector3(0, 0.48, target.z * 0.24), Vector3(target.x * 0.76, 0.16, target.z * 0.36), dark_body_mat)
	_style_block(root, "bed_l", Vector3(-target.x * 0.38, 0.70, target.z * 0.24), Vector3(0.12, 0.40, target.z * 0.38), panel_mat)
	_style_block(root, "bed_r", Vector3(target.x * 0.38, 0.70, target.z * 0.24), Vector3(0.12, 0.40, target.z * 0.38), panel_mat)
	_style_block(root, "tailgate", Vector3(0, 0.70, target.z * 0.44), Vector3(target.x * 0.78, 0.36, 0.12), panel_mat)
	_style_block(root, "mirror_l", Vector3(-target.x * 0.42, cabin_pos.y, cabin_pos.z - cabin.z * 0.20), Vector3(0.10, 0.14, 0.12), trim_mat)
	_style_block(root, "mirror_r", Vector3(target.x * 0.42, cabin_pos.y, cabin_pos.z - cabin.z * 0.20), Vector3(0.10, 0.14, 0.12), trim_mat)
	_style_block(root, "seat_l", cabin_pos + Vector3(-cabin.x * 0.18, -cabin.y * 0.24, 0.02), Vector3(0.24, 0.28, 0.22), trim_mat)
	_style_block(root, "seat_r", cabin_pos + Vector3(cabin.x * 0.18, -cabin.y * 0.24, 0.02), Vector3(0.24, 0.28, 0.22), trim_mat)
	_style_block(root, "roll_front", Vector3(0, cabin_pos.y + cabin.y * 0.64, cabin_pos.z - cabin.z * 0.20), Vector3(target.x * 0.56, 0.10, 0.10), metal_mat)
	_style_block(root, "roll_rear", Vector3(0, cabin_pos.y + cabin.y * 0.62, cabin_pos.z + cabin.z * 0.28), Vector3(target.x * 0.54, 0.10, 0.10), metal_mat)
	for sx in [-1.0, 1.0]:
		_style_block(root, "roll_side_%s" % sx, Vector3(sx * target.x * 0.28, cabin_pos.y + cabin.y * 0.46, cabin_pos.z + cabin.z * 0.04), Vector3(0.10, 0.10, cabin.z * 0.62), metal_mat)
	if vclass_in == "pickup_truck":
		_style_block(root, "brush_l", Vector3(-target.x * 0.32, 0.58, -target.z * 0.5 + 0.02), Vector3(0.10, 0.40, 0.08), frame_mat)
		_style_block(root, "brush_r", Vector3(target.x * 0.32, 0.58, -target.z * 0.5 + 0.02), Vector3(0.10, 0.40, 0.08), frame_mat)
		_style_block(root, "brush_mid", Vector3(0, 0.74, -target.z * 0.5 + 0.01), Vector3(target.x * 0.62, 0.10, 0.08), frame_mat)
		_style_block(root, "bed_crate_l", Vector3(-target.x * 0.14, 0.92, target.z * 0.25), Vector3(0.34, 0.32, 0.42), crate_mat)
		_style_block(root, "bed_crate_r", Vector3(target.x * 0.14, 0.92, target.z * 0.32), Vector3(0.34, 0.32, 0.42), crate_mat)
		_style_block(root, "roof_lights", Vector3(0, cabin_pos.y + cabin.y * 0.78, cabin_pos.z - cabin.z * 0.16), Vector3(target.x * 0.42, 0.10, 0.10), metal_mat)
		_style_block(root, "mount_stub", Vector3(0, 1.02, target.z * 0.24), Vector3(0.18, 0.28, 0.18), metal_mat)
	_add_style_headlights(root, target, light_mat, 0.60)


static func _build_van_style(car: ProtoCar3D, root: Node, camper: bool, s: Dictionary, target: Vector3, body_mat: Material, panel_mat: Material, frame_mat: Material, trim_mat: Material, metal_mat: Material, light_mat: Material) -> void:
	_add_style_frame(root, s, target, frame_mat)
	_add_style_bumpers(root, target, frame_mat, 0.42)
	_add_style_fenders(root, s, target, panel_mat)
	var chassis: Vector3 = s["chassis"]
	car._hull_mesh = _style_block(root, "cargo_body", Vector3(0, chassis.y * 0.48, target.z * 0.06), Vector3(target.x * 0.78, maxf(0.80, chassis.y * 0.76), target.z * 0.62), body_mat)
	_style_block(root, "nose", Vector3(0, 0.60, -target.z * 0.40), Vector3(target.x * 0.72, 0.42, target.z * 0.22), panel_mat)
	_style_block(root, "front_face", Vector3(0, 0.86, -target.z * 0.28), Vector3(target.x * 0.68, 0.54, 0.12), body_mat)
	_style_block(root, "rear_doors", Vector3(0, chassis.y * 0.50, target.z * 0.44), Vector3(target.x * 0.70, maxf(0.66, chassis.y * 0.58), 0.10), panel_mat)
	_style_block(root, "door_split", Vector3(0, chassis.y * 0.50, target.z * 0.445), Vector3(0.05, maxf(0.62, chassis.y * 0.55), 0.12), trim_mat)
	_style_block(root, "side_rail_l", Vector3(-target.x * 0.40, chassis.y * 0.58, target.z * 0.07), Vector3(0.08, 0.10, target.z * 0.52), metal_mat)
	_style_block(root, "side_rail_r", Vector3(target.x * 0.40, chassis.y * 0.58, target.z * 0.07), Vector3(0.08, 0.10, target.z * 0.52), metal_mat)
	_style_block(root, "roof_rack", Vector3(0, chassis.y + 0.20, target.z * 0.04), Vector3(target.x * 0.56, 0.10, target.z * 0.42), metal_mat)
	if camper:
		var camper_mat := ProtoWorldBuilder.material(Color(0.38, 0.45, 0.48), 0.80)
		_style_block(root, "camper_top", Vector3(0, chassis.y + 0.32, target.z * 0.10), Vector3(target.x * 0.76, 0.30, target.z * 0.56), camper_mat)
		_style_block(root, "awning", Vector3(-target.x * 0.46, chassis.y + 0.18, target.z * 0.04), Vector3(0.10, 0.10, target.z * 0.42), trim_mat)
		_style_block(root, "roof_vent", Vector3(target.x * 0.18, chassis.y + 0.54, -target.z * 0.05), Vector3(0.30, 0.10, 0.30), trim_mat)
		_style_block(root, "side_window_block_l", Vector3(-target.x * 0.41, chassis.y * 0.70, target.z * 0.16), Vector3(0.06, 0.28, target.z * 0.20), trim_mat)
		_style_block(root, "side_window_block_r", Vector3(target.x * 0.41, chassis.y * 0.70, target.z * 0.16), Vector3(0.06, 0.28, target.z * 0.20), trim_mat)
	_add_style_headlights(root, target, light_mat, 0.62)


static func _build_suv_style(car: ProtoCar3D, root: Node, s: Dictionary, target: Vector3, body_mat: Material, panel_mat: Material, frame_mat: Material, trim_mat: Material, metal_mat: Material, light_mat: Material) -> void:
	_add_style_frame(root, s, target, frame_mat)
	_add_style_bumpers(root, target, frame_mat, 0.42)
	_add_style_fenders(root, s, target, panel_mat)
	var cabin: Vector3 = s["cabin"]
	var cabin_pos: Vector3 = s["cabin_pos"]
	car._hull_mesh = _style_block(root, "body_tub", Vector3(0, 0.62, target.z * 0.08), Vector3(target.x * 0.76, 0.54, target.z * 0.56), body_mat)
	_style_block(root, "hood", Vector3(0, 0.72, -target.z * 0.32), Vector3(target.x * 0.72, 0.28, target.z * 0.24), panel_mat)
	_style_block(root, "cabin", cabin_pos + Vector3(0, 0.02, -cabin.z * 0.10), Vector3(cabin.x * 0.88, cabin.y * 0.96, cabin.z * 0.66), body_mat)
	_style_block(root, "rear_cabin", Vector3(0, cabin_pos.y - 0.02, target.z * 0.22), Vector3(cabin.x * 0.86, cabin.y * 0.82, target.z * 0.22), body_mat)
	_style_block(root, "front_armor", Vector3(0, 0.58, -target.z * 0.5 + 0.10), Vector3(target.x * 0.70, 0.26, 0.08), trim_mat)
	_style_block(root, "roof_rack", Vector3(0, cabin_pos.y + cabin.y * 0.68, target.z * 0.08), Vector3(target.x * 0.54, 0.10, target.z * 0.34), metal_mat)
	_style_block(root, "side_step_l", Vector3(-target.x * 0.38, 0.36, target.z * 0.03), Vector3(0.10, 0.10, target.z * 0.52), metal_mat)
	_style_block(root, "side_step_r", Vector3(target.x * 0.38, 0.36, target.z * 0.03), Vector3(0.10, 0.10, target.z * 0.52), metal_mat)
	if bool(s.get("drone_bay", false)):
		_style_block(root, "drone_bay_plate", Vector3(0, cabin_pos.y + cabin.y * 0.78, target.z * 0.20), Vector3(target.x * 0.34, 0.12, target.z * 0.14), trim_mat)
	_add_style_headlights(root, target, light_mat, 0.62)


static func _build_semi_style(car: ProtoCar3D, root: Node, s: Dictionary, target: Vector3, body_mat: Material, panel_mat: Material, frame_mat: Material, trim_mat: Material, metal_mat: Material, light_mat: Material) -> void:
	_add_style_frame(root, s, target, frame_mat)
	_add_style_bumpers(root, target, frame_mat, 0.52)
	_add_style_fenders(root, s, target, panel_mat)
	var cabin: Vector3 = s["cabin"]
	var cabin_pos: Vector3 = s["cabin_pos"]
	car._hull_mesh = _style_block(root, "long_hood", Vector3(0, 0.72, -target.z * 0.32), Vector3(target.x * 0.68, 0.42, target.z * 0.26), body_mat)
	_style_block(root, "cab", cabin_pos + Vector3(0, -0.06, 0), Vector3(cabin.x * 0.86, cabin.y * 0.92, cabin.z * 0.86), body_mat)
	_style_block(root, "sleeper_back", Vector3(0, cabin_pos.y - 0.12, cabin_pos.z + cabin.z * 0.34), Vector3(cabin.x * 0.78, cabin.y * 0.68, cabin.z * 0.28), panel_mat)
	_style_block(root, "grille", Vector3(0, 0.78, -target.z * 0.5 + 0.10), Vector3(target.x * 0.58, 0.42, 0.08), trim_mat)
	_style_block(root, "fifth_wheel", Vector3(0, 0.56, target.z * 0.18), Vector3(target.x * 0.42, 0.16, target.z * 0.17), metal_mat)
	_style_block(root, "deck_plate", Vector3(0, 0.42, target.z * 0.30), Vector3(target.x * 0.58, 0.12, target.z * 0.28), frame_mat)
	_style_block(root, "fuel_l", Vector3(-target.x * 0.34, 0.54, -target.z * 0.03), Vector3(0.20, 0.28, target.z * 0.22), metal_mat)
	_style_block(root, "fuel_r", Vector3(target.x * 0.34, 0.54, -target.z * 0.03), Vector3(0.20, 0.28, target.z * 0.22), metal_mat)
	_style_block(root, "stack_l", Vector3(-target.x * 0.38, cabin_pos.y + cabin.y * 0.30, cabin_pos.z + cabin.z * 0.18), Vector3(0.12, cabin.y * 0.95, 0.12), metal_mat)
	_style_block(root, "stack_r", Vector3(target.x * 0.38, cabin_pos.y + cabin.y * 0.30, cabin_pos.z + cabin.z * 0.18), Vector3(0.12, cabin.y * 0.95, 0.12), metal_mat)
	_add_style_headlights(root, target, light_mat, 0.74)


static func _build_trailer_style(car: ProtoCar3D, root: Node, s: Dictionary, target: Vector3, body_mat: Material, panel_mat: Material, frame_mat: Material, metal_mat: Material) -> void:
	_add_style_frame(root, s, target, frame_mat)
	_add_style_bumpers(root, target, frame_mat, 0.44)
	_add_style_fenders(root, s, target, panel_mat)
	var chassis: Vector3 = s["chassis"]
	car._hull_mesh = _style_block(root, "cargo_box", Vector3(0, chassis.y * 0.50, target.z * 0.08), Vector3(target.x * 0.76, chassis.y * 0.78, target.z * 0.78), body_mat)
	_style_block(root, "front_panel", Vector3(0, chassis.y * 0.50, -target.z * 0.36), Vector3(target.x * 0.78, chassis.y * 0.76, 0.10), metal_mat)
	_style_block(root, "rear_doors", Vector3(0, chassis.y * 0.50, target.z * 0.48), Vector3(target.x * 0.78, chassis.y * 0.72, 0.12), panel_mat)
	_style_block(root, "hitch_tongue", Vector3(0, 0.34, -target.z * 0.45), Vector3(target.x * 0.18, 0.12, target.z * 0.24), frame_mat)
	_style_block(root, "landing_l", Vector3(-target.x * 0.20, 0.50, -target.z * 0.25), Vector3(0.10, 0.72, 0.10), frame_mat)
	_style_block(root, "landing_r", Vector3(target.x * 0.20, 0.50, -target.z * 0.25), Vector3(0.10, 0.72, 0.10), frame_mat)
	for z in [-target.z * 0.18, target.z * 0.08, target.z * 0.34]:
		_style_block(root, "side_rib_l_%.1f" % z, Vector3(-target.x * 0.41, chassis.y * 0.55, z), Vector3(0.08, chassis.y * 0.70, 0.08), metal_mat)
		_style_block(root, "side_rib_r_%.1f" % z, Vector3(target.x * 0.41, chassis.y * 0.55, z), Vector3(0.08, chassis.y * 0.70, 0.08), metal_mat)
	_style_block(root, "roof_rail_l", Vector3(-target.x * 0.34, chassis.y * 0.94, target.z * 0.08), Vector3(0.08, 0.08, target.z * 0.70), metal_mat)
	_style_block(root, "roof_rail_r", Vector3(target.x * 0.34, chassis.y * 0.94, target.z * 0.08), Vector3(0.08, 0.08, target.z * 0.70), metal_mat)


static func _build_scavenger_style(car: ProtoCar3D, root: Node, s: Dictionary, target: Vector3, body_mat: Material, panel_mat: Material, dark_body_mat: Material, frame_mat: Material, trim_mat: Material, metal_mat: Material, light_mat: Material) -> void:
	var cabin: Vector3 = s["cabin"]
	var cabin_pos: Vector3 = s["cabin_pos"]
	_add_style_frame(root, s, target, frame_mat)
	_add_style_bumpers(root, target, frame_mat, 0.34)
	_add_style_fenders(root, s, target, panel_mat)
	car._hull_mesh = _style_block(root, "hull_panels", Vector3(0, 0.48, 0.06), Vector3(target.x * 0.72, 0.34, target.z * 0.54), body_mat)
	_style_block(root, "hood", Vector3(0, 0.62, -target.z * 0.28), Vector3(target.x * 0.68, 0.24, target.z * 0.25), panel_mat)
	_style_block(root, "cabin", cabin_pos, Vector3(cabin.x * 0.86, cabin.y * 0.96, cabin.z * 0.78), body_mat)
	_style_block(root, "trunk", Vector3(0, 0.62, target.z * 0.30), Vector3(target.x * 0.62, 0.24, target.z * 0.22), dark_body_mat)
	_style_block(root, "roof_load", cabin_pos + Vector3(0, cabin.y * 0.70, 0), Vector3(cabin.x * 0.44, 0.14, cabin.z * 0.36), metal_mat)
	_style_block(root, "side_plate_l", Vector3(-target.x * 0.38, 0.50, 0.02), Vector3(0.08, 0.30, target.z * 0.42), trim_mat)
	_style_block(root, "side_plate_r", Vector3(target.x * 0.38, 0.50, 0.02), Vector3(0.08, 0.30, target.z * 0.42), trim_mat)
	_style_block(root, "front_plate", Vector3(0, 0.50, -target.z * 0.5 + 0.12), Vector3(target.x * 0.64, 0.24, 0.08), metal_mat)
	_add_style_headlights(root, target, light_mat, 0.56)

const SKID_MAX := 160
const SKID_STEP := 0.35 ## drop a mark every this many meters of slide
const SKID_LIFE := 12.0
var _skids: Array = []
var _skid_last: Dictionary = {} ## VehicleWheel3D -> last drop position
## SKID LOOP (owner ask 2026-07-07): replaces the old 1.3s-cooldown one-shot with
## a CONTINUOUS tyre-screech player — starts the instant any wheel slips, stops
## the instant grip returns, no retriggering gap. Lazily attached (most cars in
## a sim never slide) via ProtoAudio.attach_loop, reusing the banked tire_scream
## stream (audio.gd's file-scan already discovers it; LOOPED marks it looping).
var _skid_player: AudioStreamPlayer3D = null
var is_skidding: bool = false ## sim/HUD hook — true exactly while the loop plays

## DRIVABLE DAMAGE (goal: the wound is in your HANDS, not just on the dash).
var _misfire_t: float = 0.0
var _misfire_cd: float = 3.0
var misfiring: bool = false   ## sim/HUD hook
var steer_slop: float = 0.0   ## sim hook — chassis wander amplitude
var _misfire_warned: bool = false

## BURNOUT (owner ask 2026-07-07): full throttle from a near-standstill lights
## the drive wheels up instead of hooking up — a skid-loop moment + a little
## yaw wiggle, same drivable-damage-you-FEEL philosophy as misfire/steer_slop.
var is_burnout: bool = false   ## sim/HUD hook

## TIRE PUNCTURE — the 6th damage part (owner ask 2026-07-07): per-wheel flags,
## sized to _front_wheels + _rear_wheels once create() builds them. A flat wheel
## renders SMALLER (radius x0.75), drags on that corner's grip, and the whole
## rig loses top speed while any wheel is flat — round-trips via snapshot_damage.
const PUNCTURE_RADIUS_MULT := 0.75
const PUNCTURE_GRIP_MULT := 0.35
const PUNCTURE_TOP_SPEED_MULT := 0.72 ## applied ONCE regardless of how many wheels are flat
var _punctured: Array = []       ## bool, index-aligned with _all_wheels()
var _wheel_base_radius: Array = [] ## float, the row's un-punctured radius per wheel (for restore)

## When true the car reads keyboard/gamepad input itself (while is_active).
## The drive_sim test sets this false and feeds the input fields directly.
var use_player_input: bool = true
var is_active: bool = false

## ROADKILL (goal: any character can be hit by a vehicle). A moving car mauls characters
## it drives into — scaled by speed, flinging the corpse in your direction. A player car
## never runs over its own driver; an AI car CAN run over the player.
const ROADKILL_MIN_SPEED := 5.0   ## m/s — below this it's a bump, not a maiming
var _roadkill_cd: Dictionary = {} ## victim -> cooldown, so one pass = one hit

## ⭐ THE DRIVING SKILL made physical (set by main on enter + level-up): control
## scales steering authority + drift settle and TIGHTENS the spin cap; top nudges
## the ceiling. 1.0 = unskilled; the sim-checked feel targets are the floor.
var driver_control: float = 1.0
var driver_top: float = 1.0

## Which VEHICLES row this is.
var vclass: String = "scavenger"
var armor: float = 30.0 ## 0-100; blunts incoming combat damage (was inert metadata — now real)
var spec: Dictionary = {}

## Locked cars need their key found somewhere in the world.
var locked: bool = false
var key_id: String = ""
var key_display: String = "key"
## THE IGNITION (goal: engine start/stop): the engine is a STATE now, not a given.
## Cars built by code default engine_on=true (sims/AI unchanged); PLAYER entry turns the
## key — first throttle CRANKS (engine_start beat), a CRITICAL battery just clicks, and
## no key means hot-wiring at the wheel first (main drives that). Exit kills the engine.
signal engine_started
var engine_on: bool = true
var ignition: String = "key"   ## "key" | "hotwire" | "none" — set by main on player entry
var window_broken: bool = false ## the smash-entry scar (cosmetic flag, honest history)
var _crank_t: float = 0.0
var _click_cd: float = 0.0
var display_name: String = "car"

## Trailer coupling (semi + trailer only).
var hitched_to: ProtoCar3D = null ## set on the TRAILER
var _hitch_joint: Generic6DOFJoint3D = null

## Headlights — auto at dark (main drives this off the day/night clock).
var headlights_on: bool = false
var _headlights: Array = []

## NIGHT HALO (owner ask 2026-07-07): "just outside the cone it's pitch black" —
## one soft OmniLight3D anchored to the body, ON exactly when headlights are on.
## Spill light, not a second sun: modest range/energy from the row, no shadow (perf).
var _halo: OmniLight3D = null

## TAIL / BRAKE / REVERSE (owner ask 2026-07-07): each tail box gets its OWN
## duplicated material (NEVER the shared _mat_cache one — mutating that would
## brighten every car on the map wearing the same body color) so brake-glow is
## per-instance. Reverse adds a white glow box PLUS a real backward SpotLight3D
## that only lights up while actually reversing (+Z is backward in this engine).
var _tail_mats: Array = []      ## StandardMaterial3D, one per tail box, duplicated
var _reverse_glows: Array = []  ## MeshInstance3D, one per tail box (white box)
var _reverse_light: SpotLight3D = null
var _brake_light: OmniLight3D = null ## lazily built — most cars never brake in a sim
var _was_reversing: bool = false ## sim/dashboard hook


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
	if _halo == null and on:
		var halo_row: Dictionary = (spec.get("lights", LIGHTS_DEFAULT) as Dictionary).get("halo", LIGHTS_DEFAULT["halo"])
		_halo = OmniLight3D.new()
		_halo.position = Vector3(0, 0.6 + maxf(0.0, spec.get("chassis", Vector3.ZERO).y - 0.7) * 0.5, 0)
		_halo.omni_range = float(halo_row.get("range", 9.0))
		_halo.light_energy = float(halo_row.get("energy", 1.2))
		_halo.light_color = halo_row.get("color", Color(1.0, 0.82, 0.55))
		_halo.shadow_enabled = false
		add_child(_halo)
	for l in _headlights:
		if is_instance_valid(l):
			(l as Node3D).visible = on
	if _halo != null and is_instance_valid(_halo):
		_halo.visible = on

# --- The Living Car (LOOP2): 5-part anatomy + death spiral --------------------
enum FireState { OK, SMOKING, ON_FIRE, DESTROYED }

var components: Dictionary = {} ## id -> Damageable (engine/tires/battery/fuel_tank/chassis)
var trunk: ProtoContainer = null ## every car is storage (Container pillar)
var mount_weapon: ProtoWeapon = null ## vehicle weapon mount (system kept; no default gun — VEHICLES.md §6)
var ai_driver: Node = null ## a MOTORIST at the wheel (the player can ride shotgun — E)
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
## PUNCTURE index space: creation-order, ONE entry per row wheel — puncture_tire(idx)
## addresses THIS list (not _front_wheels/_rear_wheels, which split by steering and
## aren't index-aligned with the row). _tire_mesh_by_wheel is null where w[4]=false
## (a bike's invisible stability wheel has nothing to visually shrink).
var _all_wheels: Array[VehicleWheel3D] = []
var _tire_mesh_by_wheel: Array = []
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
	# GROUND_INTEGRITY rule 3a: at 38 m/s a body steps 0.63 m per physics tick —
	# more than the old 0.5 m floor was thick. CCD on every rig, always.
	car.continuous_cd = true
	# Drive feel from the row
	car.max_engine_force = s["engine"]
	car.armor = float((s.get("armor", {}) as Dictionary).get("front", 30.0)) # the row's front armor, now felt
	# LIGHTS: fold once onto the shared class spec (idempotent — same law as the rest
	# of this dict) so a row's partial override survives deep-merged against defaults.
	s["lights"] = _merged_lights(s.get("lights", {}) as Dictionary)
	car.top_speed = s["top"]
	car.reverse_top_speed = s["rev"]
	car.max_steer = s["steer"][0]
	car.high_speed_steer = s["steer"][1]
	car.steer_speed = s["steer"][2]
	car.grip_front = s["tires"]["grip_f"]
	car.grip_rear = s["tires"]["grip_r"]
	car.aero_drag = float(s.get("aero_drag", 0.0)) # 0 unless the row opts in (see @export)
	# DRONE BAY (gadgets goal): a row with drone_bay mounts a REAL ProtoDroneDock on the
	# rear deck — same launch/route/recover/quarter-day-charge as the safehouse pad. The
	# dock adopts `main` on first interact (it's built before main exists).
	if bool(s.get("drone_bay", false)):
		var bay := ProtoDroneDock.create(null)
		bay.position = Vector3(0, s["chassis"].y + 0.15, s["chassis"].z * 0.28)
		bay.scale = Vector3(0.8, 0.8, 0.8)
		car.add_child(bay)

	# Chassis collision
	var shape := CollisionShape3D.new()
	var box := BoxShape3D.new()
	box.size = s["chassis"]
	shape.shape = box
	shape.position.y = maxf(0.0, (s["chassis"].y - 0.7) * 0.5) # tall classes sit their box higher
	car.add_child(shape)

	# Body visuals: modular low-poly parts in the camera-lab style. Physics stays
	# entirely row-driven by the chassis/wheel data above and below.
	_build_modular_vehicle_style(car, vclass_in, s, body_color)

	# THE PIPE IS REAL (playtest 2026-07-10): damage smoke needs a visible tailpipe
	# to pour from — a stubby exhaust tip at the row's `tailpipe` point. Skipped for
	# two_wheel rigs (their style block already welds a muffler); a vertical
	# `exhaust_dir` row (the semi's stack) gets a column instead of a tip.
	var pipe_at: Vector3 = s.get("tailpipe", Vector3.ZERO)
	if pipe_at != Vector3.ZERO and not bool(s.get("two_wheel", false)):
		var pipe := MeshInstance3D.new()
		var pipe_mesh := BoxMesh.new()
		var pipe_dir: Vector3 = s.get("exhaust_dir", Vector3(0, 0.18, 1.0))
		if absf(pipe_dir.y) > 0.7: # a stack: the column runs down from the tip
			pipe_mesh.size = Vector3(0.12, 0.9, 0.12)
			pipe.position = pipe_at - Vector3(0, 0.42, 0)
		else: # a bumper tip: pokes out past the tail
			pipe_mesh.size = Vector3(0.09, 0.09, 0.34)
			pipe.position = pipe_at - Vector3(0, 0, 0.13)
		pipe.mesh = pipe_mesh
		pipe.name = "exhaust_tip"
		pipe.material_override = ProtoWorldBuilder.material(Color(0.16, 0.16, 0.17), 0.35)
		car.add_child(pipe)

	if s["cabin"] != Vector3.ZERO:
		# WINDOWS (owner ask 2026-07-07): a two_wheel rig has no cabin glass worth
		# reading top-down (it's a fairing, not a windshield) — data-driven skip,
		# same flag the balance/upright code already reads off the row.
		if not s.get("two_wheel", false):
			var tint_raw: Variant = s.get("window_tint", null)
			var tint: Color = Color(tint_raw[0], tint_raw[1], tint_raw[2]) if tint_raw is Array and (tint_raw as Array).size() >= 3 else WINDOW_TINT_DEFAULT
			var glass := _window_material(tint)
			# FRONT (-Z, facing() direction — verified against the headlight/steering
			# convention, not assumed): the windshield the driver actually looks through.
			var windshield := MeshInstance3D.new()
			var ws_mesh := BoxMesh.new()
			ws_mesh.size = Vector3(s["cabin"].x * 0.9, s["cabin"].y * 0.85, 0.12)
			windshield.mesh = ws_mesh
			windshield.material_override = glass
			windshield.position = s["cabin_pos"] + Vector3(0, 0, -s["cabin"].z / 2.0 - 0.05)
			car.add_child(windshield)
			# REAR glass — the back window, opposite face.
			var rear_glass := MeshInstance3D.new()
			var rg_mesh := BoxMesh.new()
			rg_mesh.size = Vector3(s["cabin"].x * 0.85, s["cabin"].y * 0.75, 0.1)
			rear_glass.mesh = rg_mesh
			rear_glass.material_override = glass
			rear_glass.position = s["cabin_pos"] + Vector3(0, 0, s["cabin"].z / 2.0 + 0.05)
			car.add_child(rear_glass)
			# SIDE windows — thin flat panes on the cabin's left/right faces, top-down
			# readable (a sliver, not a full door-height sheet).
			for sx in [-1.0, 1.0]:
				var side := MeshInstance3D.new()
				var sd_mesh := BoxMesh.new()
				sd_mesh.size = Vector3(0.08, s["cabin"].y * 0.6, s["cabin"].z * 0.7)
				side.mesh = sd_mesh
				side.material_override = glass
				side.position = s["cabin_pos"] + Vector3(sx * (s["cabin"].x / 2.0 + 0.04), 0, 0)
				car.add_child(side)

	# Tail lights (emissive) — helps read facing from top-down. Each box gets its
	# OWN duplicated material (never the shared _mat_cache — brake-glow brightens
	# THIS car only) plus a reverse-white glow box, both driven live in _physics_process.
	if s["cabin"] != Vector3.ZERO:
		for tx in [-s["chassis"].x * 0.35, s["chassis"].x * 0.35]:
			var tail := MeshInstance3D.new()
			var tmesh := BoxMesh.new()
			tmesh.size = Vector3(0.35, 0.15, 0.08)
			tail.mesh = tmesh
			var tail_mat := StandardMaterial3D.new()
			tail_mat.albedo_color = TAIL_COLOR
			tail_mat.roughness = 0.4
			tail_mat.emission_enabled = true
			tail_mat.emission = TAIL_COLOR
			tail_mat.emission_energy_multiplier = 1.4 # idle glow, same base the old shared mat used
			tail.material_override = tail_mat
			tail.position = Vector3(tx, 0.2, s["chassis"].z / 2.0)
			car.add_child(tail)
			car._tail_mats.append(tail_mat)

			var rev := MeshInstance3D.new()
			var rmesh := BoxMesh.new()
			rmesh.size = Vector3(0.16, 0.1, 0.06)
			rev.mesh = rmesh
			var rev_mat := StandardMaterial3D.new()
			rev_mat.albedo_color = REVERSE_COLOR
			rev_mat.roughness = 0.3
			rev_mat.emission_enabled = true
			rev_mat.emission = REVERSE_COLOR
			rev_mat.emission_energy_multiplier = 0.0 # OFF until actually reversing
			rev.material_override = rev_mat
			rev.position = Vector3(tx, 0.2, s["chassis"].z / 2.0 + 0.05)
			car.add_child(rev)
			car._reverse_glows.append(rev)

		# REVERSE-B (owner ask, decided): a real backward-facing SpotLight3D that
		# lights the ground behind the car — built here (not lazily like the halo)
		# because reversing can happen in broad daylight, not just after dark.
		# +Z IS BACKWARD in this engine (positive engine_force pushes +Z; facing()
		# is -Z), so the light sits on the rear face and points further +Z.
		var rev_row: Dictionary = (s.get("lights", LIGHTS_DEFAULT) as Dictionary).get("reverse", LIGHTS_DEFAULT["reverse"])
		var rlamp := SpotLight3D.new()
		rlamp.position = Vector3(0, 0.35, s["chassis"].z / 2.0 + 0.1)
		rlamp.rotation_degrees.y = 180.0 # spot's default -Z aim, flipped to point +Z (backward)
		rlamp.spot_range = float(rev_row.get("range", 8.0))
		rlamp.spot_angle = 40.0
		rlamp.spot_attenuation = 1.0
		rlamp.light_energy = 0.0 # OFF until actually reversing — _physics_process reads
		rlamp.light_color = REVERSE_COLOR # the row's `reverse.energy` live each frame
		rlamp.shadow_enabled = false
		car.add_child(rlamp)
		car._reverse_light = rlamp

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
		var tire_mesh_for_this_wheel: MeshInstance3D = null
		if w[4]: # visible — bikes render only the centered pair of their stability wheels
			var tire := MeshInstance3D.new()
			var tmesh := CylinderMesh.new()
			tmesh.top_radius = w[5]
			tmesh.bottom_radius = w[5]
			tmesh.height = 0.3 if absf(w[0]) > 0.3 else 0.22
			tmesh.radial_segments = 8
			tire.mesh = tmesh
			tire.material_override = ProtoWorldBuilder.material(Color(0.08, 0.08, 0.08), 1.0)
			tire.rotation_degrees.z = 90.0
			if absf(w[0]) < 0.3:
				tire.position.x = -w[0] # center the visual on the bike's spine
			wheel.add_child(tire)
			car._tire_meshes.append(tire)
			tire_mesh_for_this_wheel = tire
		car.add_child(wheel)
		if w[2]:
			car._front_wheels.append(wheel)
		else:
			car._rear_wheels.append(wheel)
		# PUNCTURE bookkeeping — creation-order, one slot per row wheel.
		car._all_wheels.append(wheel)
		car._tire_mesh_by_wheel.append(tire_mesh_for_this_wheel)
		car._punctured.append(false)
		car._wheel_base_radius.append(float(w[5]))
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
		# THE ENTRY LADDER (goal): quiet with a pick, loud with a fist.
		if "backpack" in main and main.backpack.count("lockpick") > 0:
			return "HOLD E — 🔓 pick the lock (quiet)"
		return "HOLD E — 🥊 smash the glass (LOUD)"
	if locked:
		return "E — Unlock %s (%s)" % [display_name, key_display]
	if _at_trunk(main):
		return "E — Open trunk"
	return "E — Enter %s" % display_name


func interact(main: Node) -> void:
	if is_active:
		# Somebody's DRIVING: flag them down and ride shotgun (hold E = the wheel).
		if ai_driver != null and main.has_method("enter_passenger"):
			main.enter_passenger(self)
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
	# ARMOR is real now: it blunts the hit (armor 100 → ~28% gets through, floor 0.25).
	var got: float = amount * clampf(1.0 - armor / 140.0, 0.25, 1.0)
	# Chassis takes the hit; hard hits can wound a random component too.
	components["chassis"].damage(got)
	if got > 8.0 and _spiral_rng.randf() < 0.45:
		var ids: Array = ["engine", "tires", "battery", "fuel_tank"]
		components[ids[_spiral_rng.randi() % ids.size()]].damage(got * 0.6)


# --- TIRE PUNCTURE: the 6th damage part (owner ask 2026-07-07) ---------------

## Flat a specific wheel by ROW index (0-based, matching the vehicle row's
## `wheels` array — the same index space _all_wheels was built in). Shrinks the
## wheel's rendered + physical radius, drags that corner's grip, and the whole
## rig eats a top-speed penalty (see _physics_process) while ANY wheel is flat.
func puncture_tire(idx: int) -> void:
	if idx < 0 or idx >= _all_wheels.size() or bool(_punctured[idx]):
		return
	_punctured[idx] = true
	var wheel: VehicleWheel3D = _all_wheels[idx]
	if is_instance_valid(wheel):
		wheel.wheel_radius = _wheel_base_radius[idx] * PUNCTURE_RADIUS_MULT
	var mesh: MeshInstance3D = _tire_mesh_by_wheel[idx]
	if mesh != null and is_instance_valid(mesh):
		mesh.scale = Vector3.ONE * PUNCTURE_RADIUS_MULT


## Repair a flat (the mechanics loop's future hook — snapshot/restore already
## proves the round trip; this is the inverse of puncture_tire for symmetry).
func repair_puncture(idx: int) -> void:
	if idx < 0 or idx >= _all_wheels.size() or not bool(_punctured[idx]):
		return
	_punctured[idx] = false
	var wheel: VehicleWheel3D = _all_wheels[idx]
	if is_instance_valid(wheel):
		wheel.wheel_radius = _wheel_base_radius[idx]
	var mesh: MeshInstance3D = _tire_mesh_by_wheel[idx]
	if mesh != null and is_instance_valid(mesh):
		mesh.scale = Vector3.ONE


func any_punctured() -> bool:
	for p in _punctured:
		if bool(p):
			return true
	return false


# --- Damage snapshot/restore (round-trip proof — no per-car save exists yet; -----
# this is the self-contained hook the future save-integration work can call into).

## All 6 damage parts + fuel + fire state as a plain, JSON/var_to_str-safe dict.
func snapshot_damage() -> Dictionary:
	var comp_hp := {}
	for cid in components:
		comp_hp[cid] = (components[cid] as Damageable).hp
	return {
		"components": comp_hp,
		"punctured": _punctured.duplicate(),
		"fuel": fuel,
		"fire_state": fire_state,
		"cook": cook,
	}


## Inverse of snapshot_damage — round-trips hp/punctures/fuel/fire exactly.
func restore_damage(d: Dictionary) -> void:
	var comp_hp: Dictionary = d.get("components", {})
	for cid in comp_hp:
		if components.has(cid):
			(components[cid] as Damageable).hp = float(comp_hp[cid])
	var punct: Array = d.get("punctured", [])
	for i in range(mini(punct.size(), _all_wheels.size())):
		if bool(punct[i]) and not bool(_punctured[i]):
			puncture_tire(i)
		elif not bool(punct[i]) and bool(_punctured[i]):
			repair_puncture(i)
	fuel = float(d.get("fuel", fuel))
	fire_state = int(d.get("fire_state", fire_state)) as FireState
	cook = float(d.get("cook", cook))


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
		(_smoke.mesh as BoxMesh).size = Vector3(0.18, 0.18, 0.18)
		# OUT THE PIPE (playtest 2026-07-10 "smoke comes out of the middle"): puffs
		# leave along the PIPE AXIS — rearward past the bumper for most rigs, straight
		# up for a stack (row `exhaust_dir`, semi) — then buoyancy lifts them. The old
		# emitter fired (0,1,0) from inside the trunk, so every plume read center-of-car.
		var pipe_dir: Vector3 = spec.get("exhaust_dir", Vector3(0, 0.18, 1.0))
		_smoke.direction = pipe_dir.normalized()
		_smoke.spread = 11.0
		_smoke.initial_velocity_min = 2.0
		_smoke.initial_velocity_max = 3.4
		_smoke.gravity = Vector3(0, 0.8, 0)
		_smoke.color = Color(0.25, 0.24, 0.23, 0.8)
		_smoke.position = spec.get("tailpipe", Vector3(0, 0.6, 0.0))
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


## Maul characters the car drives into (goal: no more untouchable pedestrians). Damage
## scales with speed; a kill is FLUNG in the car's direction (hit_launch → ProtoCorpse) and
## the car feels the thud. A player's car never hits its own driver; an AI car can hit you.
func _roadkill(delta: float) -> void:
	for k in _roadkill_cd.keys():
		_roadkill_cd[k] -= delta
		if not is_instance_valid(k) or float(_roadkill_cd[k]) <= 0.0:
			_roadkill_cd.erase(k)
	var speed := linear_velocity.length()
	if speed < ROADKILL_MIN_SPEED:
		return
	var reach: float = spec["chassis"].z * 0.5 + 0.9
	var seen: Dictionary = {}
	for group in ["threat", "combatant", "npc", "motorist"]:
		for node in get_tree().get_nodes_in_group(group):
			var n := node as Node3D
			if n == null or not is_instance_valid(n) or seen.has(n):
				continue
			seen[n] = true
			if n == self or n == ai_driver or _roadkill_cd.has(n):
				continue
			if use_player_input and n is ProtoPlayer3D:
				continue                                  # your own ride won't run you over
			if n is ProtoCar3D or not n.has_method("take_damage"):
				continue
			var to: Vector3 = n.global_position - global_position
			to.y = 0.0
			if to.length() > reach:
				continue
			if "hit_launch" in n:                          # a corpse gets flung the way you're going
				n.set("hit_launch", linear_velocity * 0.55 + Vector3(0, 3.2, 0))
			n.take_damage(clampf((speed - ROADKILL_MIN_SPEED) * 5.0, 10.0, 90.0))
			_roadkill_cd[n] = 0.8
			apply_central_impulse(-linear_velocity.normalized() * mass * 0.12)  # the felt thud


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
	# WRECK MODE: a husk smolders from the burnt hull's heart, wide and upward —
	# not out the tailpipe (and a trailer husk, tailpipe ZERO, smolders too).
	var smolder := _ensure_smoke()
	var hull_v: Vector3 = spec["chassis"]
	smolder.position = Vector3(0, maxf(0.5, hull_v.y * 0.6), 0)
	smolder.direction = Vector3(0, 1, 0)
	smolder.spread = 26.0
	smolder.gravity = Vector3(0, 1.1, 0)
	smolder.amount = 26
	smolder.emitting = true # husks smolder
	# Char every visual — no matter HOW it died, the wreck reads burnt (user law).
	var charred := ProtoWorldBuilder.material(Color(0.09, 0.085, 0.08), 1.0)
	_char_visuals(self, charred)


func _char_visuals(node: Node, mat: Material) -> void:
	for child in node.get_children():
		if child is MeshInstance3D:
			(child as MeshInstance3D).material_override = mat
		_char_visuals(child, mat)


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
		"vclass": vclass,
		"rev": clampf(absf(forward_speed) / maxf(top_speed, 1.0), 0.0, 1.0) * 8.0,
		"gps": bool(spec.get("gps", false)),
	}


## The game MAIN this car reports to (notify toasts, audio). In a live run that's
## current_scene. Under a sim harness current_scene is the SIM node, and the old
## fallback assumed get_parent() IS main — false for CONTAINER-parented cars
## (TestGrounds' pool cars register into main.cars but hang under TestGrounds),
## which silently ate the misfire warning, the skid loop, and the battery click
## in harnesses (visibility_sim's red check). Walk ancestors for the first node
## that speaks notify() — ProtoMain is the only one that does.
func _main_node() -> Node:
	if not is_inside_tree():
		return null
	var m := get_tree().current_scene
	if m != null and m.has_method("notify"):
		return m
	var walk := get_parent()
	while walk != null and not walk.has_method("notify"):
		walk = walk.get_parent()
	return walk


func _physics_process(delta: float) -> void:
	forward_speed = linear_velocity.dot(-global_basis.z)
	current_mph = absf(forward_speed) * 2.237
	speed_changed.emit(current_mph)

	_update_death_spiral(delta)
	_update_damage_smoke()
	if not dead and (is_active or ai_driver != null):
		_roadkill(delta)

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
		# TWO-RATE STEERING: parked/idle always CENTERS (target is always 0), so
		# it always takes the faster return rate.
		steering = move_toward(steering, 0.0, steer_return_speed * delta)
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
	# TIRE PUNCTURE: any flat wheel taxes the top speed ONCE (not stacked per flat —
	# you're limping either way), same lever the row already uses for drive_factor.
	var punct_top_mult := PUNCTURE_TOP_SPEED_MULT if any_punctured() else 1.0
	var eff_top: float = maxf(top_speed * drive_factor * driver_top * punct_top_mult, 4.0)
	is_struggling = input_throttle > 0.3 and drive_factor < 0.82 and not dead

	# Steering authority falls off with speed for stability, ramps in smoothly.
	# While the handbrake is down, authority is trimmed too — full lock mid-slide
	# whipped the car 180 (first-playtest bug); a drift should be steered, not spun.
	var speed_ratio := clampf(absf(forward_speed) / eff_top, 0.0, 1.0)
	var steer_limit := lerpf(max_steer, high_speed_steer, speed_ratio)
	if input_handbrake:
		steer_limit *= handbrake_steer_mult
	# TWO-RATE STEERING (owner ask 2026-07-07): centering back toward straight is
	# FASTER than winding the wheel up — the target's magnitude shrinking (toward
	# 0) vs growing/holding is the tell, so a direction-reversal through center
	# also gets the snappy rate, not just a literal release-to-neutral.
	var steer_target := input_steer * steer_limit
	var rate := steer_return_speed if absf(steer_target) < absf(steering) else steer_speed
	steering = move_toward(steering, steer_target, rate * driver_control * delta)
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
			# sims wrap main in a harness AND cars can live under staging
			# containers (TestGrounds adopted the spawn car — the silent-
			# misfire regression): _main_node climbs until something can speak.
			var mm := _main_node()
			if mm != null and "audio" in mm and mm.audio:
				mm.audio.play_at("metal_debris", global_position, -8.0, 1.5)
			# Surface the CAUSE once — a mystery stutter reads as a bug, a named
			# one reads as a repair job (car_parts fix it).
			if not _misfire_warned and mm != null and mm.has_method("notify"):
				_misfire_warned = true
				mm.notify("🔧 %s's ENGINE is coughing — salvaged car parts will fix it" % display_name)
	_misfire_t = maxf(0.0, _misfire_t - delta)
	misfiring = _misfire_t > 0.0
	if misfiring:
		engine_mult *= 0.12
	# BATTERY FLICKER (drivable damage): a dying battery can't hold the beams —
	# night driving on a bad battery is driving by strobe. The HALO is spill off the
	# same beams, so it strobes on the same roll — one flicker, not two out of phase.
	if headlights_on and components["battery"].tier() >= Damageable.Tier.CRITICAL:
		var strobe := 0.2 + 0.8 * float(_spiral_rng.randf() > 0.25)
		for hl in _headlights:
			if hl is SpotLight3D:
				(hl as SpotLight3D).light_energy = 4.0 * strobe
		if _halo != null and is_instance_valid(_halo):
			var halo_row: Dictionary = (spec.get("lights", LIGHTS_DEFAULT) as Dictionary).get("halo", LIGHTS_DEFAULT["halo"])
			_halo.light_energy = float(halo_row.get("energy", 1.2)) * strobe
	# BURNOUT (owner ask 2026-07-07): full throttle from near a standstill lights
	# the drive wheels up — a temporary grip drop on the rear (traction) wheels
	# plus the skid loop (see _emit_skids) and a little yaw wiggle so it READS as
	# a burnout, not just a sluggish launch. Clears once speed climbs past the row's
	# burnout_speed_max — a real launch, not a permanent debuff.
	is_burnout = input_throttle > 0.95 and absf(forward_speed) < burnout_speed_max and not dead
	if is_burnout:
		# Torque-only wiggle (same iron rule as the drift settle above — a direct
		# angular_velocity write fights the wheel solver): a small sine-driven yaw
		# nudge that reads as "fighting for traction," never enough to spin out.
		apply_torque(Vector3(0, sin(Time.get_ticks_msec() * 0.02) * mass * 2.2, 0))

	# Grip = baseline × tire condition × SURFACE-through-the-TIRES: off-road worth
	# is the tire's dirt_mult (knobby 0.95 … highway 0.68 — VEHICLES.md §2);
	# water halves it again (surface_grip_mult).
	var surf_grip: float = surface_grip_mult()
	var grip_mult: float = TIER_GRIP_MULT[components["tires"].tier()] * surf_grip
	for w in _front_wheels:
		# TIRE PUNCTURE: a flat corner drags regardless of which axle it's on.
		var f_idx := _all_wheels.find(w)
		var f_punct_mult := PUNCTURE_GRIP_MULT if (f_idx >= 0 and bool(_punctured[f_idx])) else 1.0
		w.wheel_friction_slip = grip_front * grip_mult * ProtoWeather.grip_now * f_punct_mult # rain kills grip (weather law)
	var rear_base := handbrake_grip_rear if input_handbrake else grip_rear
	if is_burnout:
		rear_base *= burnout_slip
	for w in _rear_wheels:
		var r_idx := _all_wheels.find(w)
		var r_punct_mult := PUNCTURE_GRIP_MULT if (r_idx >= 0 and bool(_punctured[r_idx])) else 1.0
		w.wheel_friction_slip = rear_base * grip_mult * ProtoWeather.grip_now * r_punct_mult

	if input_throttle > 0.0 and engine_mult > 0.0:
		fuel = maxf(0.0, fuel - fuel_drain_rate * input_throttle * delta)
		# A breached tank bleeds extra while running.
		if components["fuel_tank"].tier() >= Damageable.Tier.CRITICAL:
			fuel = maxf(0.0, fuel - 1.2 * delta)

	engine_force = 0.0
	brake = 0.0
	# THE IGNITION: a dead engine pushes nothing. Wanting to move CRANKS it — half a
	# second with a live battery, a dry CLICK with a critical one. No key? main runs the
	# hot-wire at the wheel before ignition reads anything but "none".
	if not engine_on:
		_click_cd = maxf(0.0, _click_cd - delta)
		if is_active and ignition != "none" and (input_throttle > 0.0 or input_brake > 0.0):
			if components["battery"].tier() >= Damageable.Tier.CRITICAL:
				_crank_t = 0.0
				if _click_cd <= 0.0:
					_click_cd = 1.2
					var m := _main_node()
					if m != null:
						m.notify("🔋 click. Dead battery — it needs CAR PARTS.")
			else:
				_crank_t += delta
				if _crank_t >= 0.5:
					_crank_t = 0.0
					engine_on = true
					engine_started.emit()
		else:
			_crank_t = 0.0
	if engine_on and input_throttle > 0.0 and forward_speed < eff_top and engine_mult > 0.0:
		# Taper force as speed climbs — punchy low end, natural top-speed plateau.
		# Off-road/worn-tire drag lowers BOTH the ceiling and the punch.
		engine_force = -input_throttle * max_engine_force * engine_mult * drive_factor * lerpf(1.0, 0.45, speed_ratio)
	if engine_on and input_brake > 0.0:
		if forward_speed > 1.0:
			brake = input_brake * max_brake
		elif forward_speed > -reverse_top_speed:
			engine_force = input_brake * max_engine_force * 0.5
	elif not engine_on and input_brake > 0.0 and forward_speed > 1.0:
		brake = input_brake * max_brake # brakes don't need a motor

	# AERODYNAMIC DRAG — a v² force opposing horizontal motion (Ander2211 ref, MIT).
	# Additive: no-op when aero_drag == 0. Applied every frame incl. coasting.
	if aero_drag > 0.0:
		apply_central_force(aero_force(linear_velocity))

	if input_handbrake:
		# THE E-BRAKE CANCELS THE GAS. Without this, held throttle re-sets engine_force
		# (~7 m/s² of push) just above and nearly cancels the decel below — net ≈1 m/s²,
		# the 2026-07-09 playtest "hit space, it doesn't stop". Yanking the brake
		# overrides the motor for as long as it's held.
		engine_force = 0.0
		# Brake with a FORCE opposing motion, not the wheel `brake` (a strong wheel
		# brake locks the fronts and steering dies → the car slid straight, 0 yaw) and
		# not by overwriting velocity (that clobbers the wheels' own friction → no
		# slide). A decel force cooperates with the solver: it slows the car HARD while
		# the low-grip rear (above) still steps out into a real, steerable drift.
		var vh := Vector3(linear_velocity.x, 0.0, linear_velocity.z)
		if vh.length() > 1.0:
			apply_central_force(-vh.normalized() * mass * handbrake_decel)
		else:
			# THE FULL STOP (2026-07-10 playtest "the handbrake doesn't stop, it decelerates"):
			# the force gate above leaves a ~1 m/s (2 mph) CREEP forever. Below the gate the
			# drift is over — settle the last crawl to an actual halt. (A direct write is safe
			# here: sub-1 m/s, the friction solver isn't shaping a slide anymore.)
			linear_velocity.x = move_toward(linear_velocity.x, 0.0, 6.0 * delta)
			linear_velocity.z = move_toward(linear_velocity.z, 0.0, 6.0 * delta)
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

	_update_tail_lights()
	_emit_skids()


## The aerodynamic drag force for a given velocity: magnitude aero_drag·|v_h|²,
## directed against horizontal motion (Y ignored — gravity/suspension own that).
## Pulled out as a pure function so a headless sim can assert the formula exactly
## without spinning up the physics world. Below a dead-zone speed it's zero (no
## jitter forces on a near-parked car).
func aero_force(vel: Vector3) -> Vector3:
	var vh := Vector3(vel.x, 0.0, vel.z)
	var sp := vh.length()
	if aero_drag <= 0.0 or sp < 0.5:
		return Vector3.ZERO
	return -vh.normalized() * aero_drag * sp * sp


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


## The tire class (MUD_AND_MONSTERS T1): a row field when the rig declares one,
## else derived from the shipped knobby-vs-highway law.
func tire_class() -> String:
	return String(spec.get("tire_class", "knobby" if float(spec["tires"]["dirt_mult"]) >= 0.75 else "street"))


## The wetness class under this rig — MUD only where it actually rained
## (WEATHER's W-WET wrote the cell's water_rot; the desert never muds).
func wetness_here() -> String:
	var s_name: String = surface_override if surface_override != "" else current_surface
	if not is_inside_tree():
		return "dry"
	var m: Node = get_tree().current_scene
	if m == null or not ("population" in m):
		m = get_parent()
	var rot := 0.25
	var rain := 0.0
	if m != null and "population" in m and m.population != null:
		rot = float(m.population.cell_at(global_position).get("water_rot", 0.25))
	if m != null and "weather" in m and m.weather != null and m.weather is ProtoWeather:
		rain = (m.weather as ProtoWeather).intensity_at(global_position, "rain")
	return ProtoTraction.wetness(s_name, rot, rain)


func surface_grip_mult() -> float:
	var s_name: String = surface_override if surface_override != "" else current_surface
	if s_name == "road":
		return 1.0 # asphalt's rain tax is WEATHER's grip_now — never double-taxed
	if s_name == "water":
		return float(spec["tires"]["dirt_mult"]) * 0.5 # slick — lakes/rivers are not roads
	# THE TRACTION MATRIX (MUD_AND_MONSTERS T1): everything off the asphalt
	# prices by surface × wetness × tire class — mud fishtails street tires
	# and barely slows BIG wheels (the reason to build the monster truck).
	return float(ProtoTraction.traction(s_name, wetness_here(), tire_class())["grip"])


## How much of this vehicle's drivetrain actually reaches the ground RIGHT NOW:
## surface-through-the-tires × tire condition. 1.0 = full song; low = bogged/limping.
## THE SLOW-NEVER-STUCK LAW: the matrix speed floor is 0.25 — mud is a crawl,
## never a stop (owner ruling; the stuck state stays OUT).
func offroad_factor() -> float:
	var s_name: String = surface_override if surface_override != "" else current_surface
	var surf := 1.0
	if s_name == "water":
		surf = clampf(float(spec["tires"]["dirt_mult"]), 0.5, 1.0) * 0.34 # fording BOGS you — cross at the bridges
	elif s_name != "road":
		surf = float(ProtoTraction.traction(s_name, wetness_here(), tire_class())["speed"])
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


## BRAKE GLOW + REVERSE (owner ask 2026-07-07): tail emission jumps on the pedal
## or handbrake (each tail box's OWN duplicated material — never the shared
## _mat_cache one), and the white reverse box + backward SpotLight3D come on
## ONLY while actually reversing (moving backward, not just holding the input
## at a standstill — a stalled reverse-throttle shouldn't light the ground up).
func _update_tail_lights() -> void:
	if dead or _tail_mats.is_empty():
		return
	var light_row: Dictionary = spec.get("lights", LIGHTS_DEFAULT) as Dictionary
	var brake_row: Dictionary = light_row.get("brake", LIGHTS_DEFAULT["brake"])
	var braking := input_brake > 0.0 or input_handbrake
	var glow_energy: float = float(brake_row.get("glow_energy", 0.9))
	var target_mult: float = float(brake_row.get("energy_mult", 3.0)) if braking else 1.0
	for m in _tail_mats:
		if m is StandardMaterial3D:
			(m as StandardMaterial3D).emission_energy_multiplier = 1.4 * target_mult
	# A soft red pulse rides along with the glow — subtle, not a strobe.
	if braking and _brake_light == null:
		_brake_light = OmniLight3D.new()
		_brake_light.position = Vector3(0, 0.2, spec.get("chassis", Vector3.ZERO).z / 2.0 + 0.1)
		_brake_light.omni_range = 3.0
		_brake_light.light_color = TAIL_COLOR
		_brake_light.shadow_enabled = false
		add_child(_brake_light)
	if _brake_light != null and is_instance_valid(_brake_light):
		_brake_light.visible = braking
		if braking:
			_brake_light.light_energy = glow_energy * (0.85 + 0.15 * sin(Time.get_ticks_msec() * 0.012))

	# REVERSING = actually moving backward (+Z), not just holding the pedal at a
	# standstill — a stalled reverse-throttle attempt shouldn't light the ground.
	var reversing := is_active and forward_speed < -0.3
	_was_reversing = reversing
	var reverse_row: Dictionary = light_row.get("reverse", LIGHTS_DEFAULT["reverse"])
	var rev_energy: float = float(reverse_row.get("energy", 0.7)) if reversing else 0.0
	for g in _reverse_glows:
		if g is MeshInstance3D and is_instance_valid(g):
			var gm := (g as MeshInstance3D).material_override
			if gm is StandardMaterial3D:
				(gm as StandardMaterial3D).emission_energy_multiplier = rev_energy * 2.0
	if _reverse_light != null and is_instance_valid(_reverse_light):
		_reverse_light.light_energy = rev_energy


## Lay dark marks under the rear wheels while they're actually sliding — the
## drift made visible. Distance-gated so a slide draws a continuous streak, not
## a flood; pooled + faded so it never grows without bound.
func _emit_skids() -> void:
	if dead:
		return
	_update_skid_loop()
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


## THE SKID LOOP (owner ask 2026-07-07): a CAR-LEVEL condition (any wheel
## slipping, or an active handbrake drift) computed ONCE per tick — not per-wheel
## like the decal drop above — drives ONE continuous screech player. Starts the
## instant grip breaks, stops the instant it returns; no cooldown gap to retrigger.
func _update_skid_loop() -> void:
	var any_slip := false
	for w in _all_wheels:
		if is_instance_valid(w) and w.is_in_contact() and w.get_skidinfo() < 0.85:
			any_slip = true
			break
	var drifting := input_handbrake and absf(forward_speed) > 2.0
	is_skidding = (any_slip and absf(forward_speed) > 3.0) or drifting or is_burnout
	if is_skidding and _skid_player == null:
		var m := _main_node()
		if m != null and "audio" in m and m.audio:
			_skid_player = (m.audio as ProtoAudio).attach_loop("tire_scream", self, -9.0)
	if _skid_player != null and is_instance_valid(_skid_player):
		if is_skidding and not _skid_player.playing:
			_skid_player.play()
		elif not is_skidding and _skid_player.playing:
			_skid_player.stop()


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
