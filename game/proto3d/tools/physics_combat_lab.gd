## Standalone, save-free comparison space for character physics, grip/aim,
## combat, throwing, cameras, and later vehicle deformation.
class_name ProtoPhysicsCombatLab
extends Node3D

const INPUT_SCRIPT := preload("res://proto3d/tools/physics_lab/lab_input.gd")
const COMMAND_SCRIPT := preload("res://proto3d/tools/physics_lab/lab_command.gd")
const ADAPTER_SCRIPT := preload("res://proto3d/tools/physics_lab/lab_body_adapter.gd")
const PHYSICAL_SCRIPT := preload("res://proto3d/tools/physics_lab/lab_physical_body.gd")
const HUD_SCRIPT := preload("res://proto3d/tools/physics_lab/lab_hud.gd")
const THROWABLE_SCRIPT := preload("res://proto3d/throwable.gd")
const ROUND_SCRIPT := preload("res://proto3d/tools/physics_lab/lab_round.gd")
const OPPONENT_SCRIPT := preload("res://proto3d/tools/physics_lab/lab_opponent.gd")
const DIAGNOSTICS_SCRIPT := preload("res://proto3d/tools/physics_lab/lab_diagnostics.gd")
const REPLAY_SCRIPT := preload("res://proto3d/tools/physics_lab/lab_replay.gd")

var save_isolated: bool = true
var lab_mode: bool = true
var active_mode: String = "hybrid"
var stations: Dictionary = {}
var current_station: String = "BODY LANE"
var station_spawn: Transform3D = Transform3D(Basis.IDENTITY, Vector3(0, 0.05, 0))
var opponent_spawn: Transform3D = Transform3D(Basis.IDENTITY, Vector3(0, 0.05, -5))
var adapter: Node = null
var player: Node3D = null
var character: ProtoCharacter = ProtoCharacter.new()
var hud: CanvasLayer = null
var camera: Camera3D = null
var input_source: RefCounted = null
var current_scenario: String = "free_play"
var opponent_behavior: String = "PASSIVE"
var lab_round: RefCounted = null
var opponent: Node3D = null
var diagnostics: Node3D = null
var replay: RefCounted = null
var mirror_bodies: Dictionary = {}
var mirror_results: Dictionary = {}
var gaze_origin: Vector3 = Vector3(26, 0.05, 0)
var gaze_targets: Dictionary = {}
var active_gaze_target: Node3D = null
var gaze_wall: Node3D = null
var gaze_door: Node3D = null
var gaze_target_distance: int = 20
var gaze_night: bool = false
var gaze_dust: bool = false
var gaze_headlights: bool = false
var gaze_binoculars: bool = false
var gaze_zoomed: bool = false
var gaze_door_open: bool = false
var _prior_time_scale: float = 1.0
var _throw_hold: float = 0.0
var _last_command: RefCounted = null
const OPPONENT_BEHAVIORS: Array[String] = ["passive", "return_fire", "hunter", "duel"]
const GAZE_DISTANCES: Array[int] = [5, 10, 20, 30, 50, 75, 100, 150, 240]
var _environment: Environment = null
var _sun: DirectionalLight3D = null
var _gaze_headlight: SpotLight3D = null
var _gaze_source: String = "turn"
var _look_age: float = 0.0
var _prior_aim: Vector3 = Vector3.FORWARD
var _mirror_root: Node3D = null
var _mirror_trace: Array[RefCounted] = []
var _mirror_cursor: int = -1
var _last_dive_state: String = "NORMAL"


func _ready() -> void:
	_prior_time_scale = Engine.time_scale
	ProtoInputMap.ensure()
	_build_world()
	input_source = INPUT_SCRIPT.new()
	hud = HUD_SCRIPT.new()
	add_child(hud)
	hud.setup()
	switch_mode("hybrid")
	_build_sparring()
	diagnostics = DIAGNOSTICS_SCRIPT.new()
	add_child(diagnostics)
	replay = REPLAY_SCRIPT.new()
	reset_station()


func _build_world() -> void:
	var world_env := WorldEnvironment.new()
	var env := Environment.new()
	env.background_mode = Environment.BG_COLOR
	env.background_color = Color("#181817")
	env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	env.ambient_light_color = Color("#c8ad82")
	env.ambient_light_energy = 0.72
	world_env.environment = env
	_environment = env
	add_child(world_env)
	var sun := DirectionalLight3D.new()
	sun.rotation_degrees = Vector3(-52, -28, 0)
	sun.light_color = Color("#ffe0a8")
	sun.light_energy = 1.25
	sun.shadow_enabled = true
	_sun = sun
	add_child(sun)

	# Long enough to measure a full sprint, dive recovery, and charged throws
	# without a physics body reaching the edge during one comparison pass.
	ProtoWorldBuilder.box_body(self, Vector3(132, 0.4, 520), Vector3(52, -0.2, 0),
		Color("#282622"))
	_build_navigation_floor()
	_build_gaze_station()
	var names: Array[String] = ["BODY LANE", "GRIP & GAZE RANGE", "DIVE & THROW LANE",
		"KILLHOUSE", "VEHICLE DAMAGE BAY"]
	for i in names.size():
		var x: float = float(i) * 26.0
		var pad := ProtoWorldBuilder.box_visual(self, Vector3(22, 0.06, 32),
			Vector3(x, 0.03, 0), Color("#35312b") if i % 2 == 0 else Color("#302f2a"))
		pad.name = names[i].replace(" ", "_").replace("&", "AND")
		var marker := Node3D.new()
		marker.name = names[i]
		marker.position = Vector3(x, 0, 0)
		add_child(marker)
		stations[names[i]] = marker
		var sign := Label3D.new()
		sign.text = "%02d  %s" % [i + 1, names[i]]
		sign.font_size = 72
		sign.pixel_size = 0.012
		sign.modulate = Color("#e8a33a")
		sign.position = Vector3(x, 0.08, -14.5)
		sign.rotation_degrees.x = -90
		add_child(sign)
	# Killhouse cover and a recognizable vehicle-bay shell.
	for pos in [Vector3(73, 1.5, -6), Vector3(81, 1.5, 2), Vector3(75, 1.5, 8)]:
		ProtoWorldBuilder.box_body(self, Vector3(0.5, 3.0, 8.0), pos, Color("#4b4032"))
	ProtoWorldBuilder.box_body(self, Vector3(22, 0.4, 0.5), Vector3(104, 2.8, -12), Color("#59452f"))
	for x in [94.0, 114.0]:
		ProtoWorldBuilder.box_body(self, Vector3(0.5, 5.6, 24), Vector3(x, 2.8, 0), Color("#463c31"))

	camera = Camera3D.new()
	camera.position = Vector3(12, 22, 18)
	camera.fov = 58.0
	camera.current = true
	add_child(camera)
	camera.look_at(Vector3(7, 0, 0), Vector3.UP)


func _build_gaze_station() -> void:
	for distance in GAZE_DISTANCES:
		var target := StaticBody3D.new()
		target.name = "GazeTarget_%03dm" % distance
		# Calibration plates are observed targets, never mutual occluders. The
		# authored wall and door below are the controlled LOS variables.
		target.collision_layer = 0
		target.position = gaze_origin + Vector3(0, 0.95, -float(distance))
		target.add_to_group("lab_gaze_target")
		target.set_meta("distance_m", distance)
		var collision := CollisionShape3D.new()
		var shape := BoxShape3D.new()
		shape.size = Vector3(0.75, 1.8, 0.22)
		collision.shape = shape
		target.add_child(collision)
		var mesh_node := MeshInstance3D.new()
		var mesh := BoxMesh.new()
		mesh.size = shape.size
		mesh_node.mesh = mesh
		mesh_node.material_override = ProtoWorldBuilder.material(
			Color("#c58a32") if distance <= 100 else Color("#3f968b"), 0.86)
		target.add_child(mesh_node)
		var label := Label3D.new()
		label.text = "%d m" % distance
		label.font_size = 48
		label.pixel_size = 0.01
		label.billboard = BaseMaterial3D.BILLBOARD_ENABLED
		label.position.y = 1.35
		target.add_child(label)
		add_child(target)
		gaze_targets[distance] = target
	gaze_wall = Node3D.new()
	gaze_wall.name = "GazeOcclusionWall"
	gaze_wall.add_to_group("lab_gaze_wall")
	add_child(gaze_wall)
	ProtoWorldBuilder.box_body(gaze_wall, Vector3(4.0, 3.0, 0.4),
		Vector3(gaze_origin.x - 3.1, 1.5, -12), Color("#4a4034"))
	ProtoWorldBuilder.box_body(gaze_wall, Vector3(4.0, 3.0, 0.4),
		Vector3(gaze_origin.x + 3.1, 1.5, -12), Color("#4a4034"))
	gaze_door = ProtoWorldBuilder.box_body(self, Vector3(2.2, 2.8, 0.32),
		Vector3(gaze_origin.x, 1.4, -12), Color("#765538"))
	gaze_door.name = "GazeDoor"
	gaze_door.add_to_group("lab_gaze_door")
	_gaze_headlight = SpotLight3D.new()
	_gaze_headlight.name = "GazeHeadlight"
	_gaze_headlight.light_color = Color("#ffe2a5")
	_gaze_headlight.light_energy = 5.0
	_gaze_headlight.spot_range = 42.0
	_gaze_headlight.spot_angle = 42.0
	_gaze_headlight.visible = false
	add_child(_gaze_headlight)
	set_target_distance(gaze_target_distance)


func _build_navigation_floor() -> void:
	var region := NavigationRegion3D.new()
	region.name = "LabNavigation"
	var nav := NavigationMesh.new()
	nav.vertices = PackedVector3Array([
		Vector3(-12, 0.05, -250), Vector3(116, 0.05, -250),
		Vector3(116, 0.05, 250), Vector3(-12, 0.05, 250)])
	nav.add_polygon(PackedInt32Array([0, 1, 2, 3]))
	region.navigation_mesh = nav
	add_child(region)


func _build_sparring() -> void:
	lab_round = ROUND_SCRIPT.new()
	lab_round.setup(["player", "opponent"], 100.0, 2)
	lab_round.reset_requested.connect(reset_fighters)
	opponent = OPPONENT_SCRIPT.new()
	opponent.name = "NonlethalSparringPartner"
	add_child(opponent)
	opponent.setup(lab_round, player, "passive", self)
	opponent.reset_at(opponent_spawn)
	opponent_behavior = "PASSIVE"


func switch_mode(id: String) -> bool:
	if id not in ["hybrid", "active_ragdoll", "full_physics"]:
		return false
	var at: Transform3D = station_spawn
	var weapon_id: String = "pistol"
	var prior_condition: Dictionary = {"id": "fresh", "speed_mult": 1.0, "stamina": 100.0}
	if adapter != null:
		at = adapter.anchor_transform()
		weapon_id = String(adapter.weapon.id)
		prior_condition = adapter.condition.duplicate(true)
		adapter.queue_free()
	adapter = ADAPTER_SCRIPT.new() if id == "hybrid" else PHYSICAL_SCRIPT.new()
	add_child(adapter)
	if id == "hybrid":
		adapter.setup({})
	else:
		adapter.setup(id)
	active_mode = id
	player = adapter.combat_body()
	adapter.set_weapon(weapon_id)
	adapter.set_condition(prior_condition)
	adapter.reset_at(at)
	_connect_player_damage()
	if opponent != null:
		opponent.set_target(player)
	return true


func _connect_player_damage() -> void:
	if adapter == null:
		return
	if active_mode == "hybrid":
		adapter.player.damaged.connect(_on_player_damaged)
	else:
		adapter.damaged.connect(_on_player_damaged)


func _on_player_damaged(amount: float, _attacker: Node3D = null) -> void:
	if lab_round != null:
		lab_round.hit("player", amount, {"attacker": "opponent", "kind": "bullet"})


func set_opponent_behavior(id: String) -> bool:
	if opponent == null or not opponent.set_behavior(id):
		return false
	opponent_behavior = id.to_upper()
	return true


func set_target_distance(distance: int) -> bool:
	if not gaze_targets.has(distance):
		return false
	gaze_target_distance = distance
	active_gaze_target = gaze_targets[distance]
	return true


func cycle_target_distance(step: int = 1) -> void:
	var index: int = GAZE_DISTANCES.find(gaze_target_distance)
	set_target_distance(GAZE_DISTANCES[posmod(index + step, GAZE_DISTANCES.size())])


func set_gaze_door(open: bool) -> void:
	gaze_door_open = open
	if gaze_door != null:
		gaze_door.global_position.x = gaze_origin.x + (3.6 if open else 0.0)


func toggle_xray() -> void:
	if diagnostics != null:
		diagnostics.set_xray(not diagnostics.updates_enabled(), adapter)


func toggle_day_night() -> void:
	gaze_night = not gaze_night
	_environment.background_color = Color("#080c12") if gaze_night else Color("#181817")
	_environment.ambient_light_energy = 0.18 if gaze_night else 0.72
	_sun.light_energy = 0.16 if gaze_night else 1.25


func toggle_dust() -> void:
	gaze_dust = not gaze_dust
	_environment.fog_enabled = gaze_dust
	_environment.fog_light_color = Color("#a77445")
	_environment.fog_density = 0.035 if gaze_dust else 0.0


func toggle_headlights() -> void:
	gaze_headlights = not gaze_headlights
	_gaze_headlight.visible = gaze_headlights


func toggle_binoculars() -> void:
	gaze_binoculars = not gaze_binoculars


func toggle_camera_zoom() -> void:
	gaze_zoomed = not gaze_zoomed
	camera.fov = 38.0 if gaze_zoomed else 58.0


func _cycle_opponent_behavior() -> void:
	var current_id: String = opponent_behavior.to_lower()
	var index: int = OPPONENT_BEHAVIORS.find(current_id)
	set_opponent_behavior(OPPONENT_BEHAVIORS[(index + 1) % OPPONENT_BEHAVIORS.size()])
	if lab_round != null:
		lab_round.reset_match()


func start_scenario(id: String) -> void:
	current_scenario = id
	reset_station()


func reset_station() -> void:
	if adapter == null:
		return
	if lab_round != null:
		lab_round.reset_match()
	reset_fighters()
	character.hp = 100.0
	character.dead = false
	for part in character.body.values():
		part.hp = part.max_hp
	adapter.weapon.mag = int(adapter.weapon.info()["mag_size"])
	_throw_hold = 0.0


func reset_fighters() -> void:
	if adapter != null:
		adapter.reset_at(station_spawn)
	if opponent != null:
		opponent.reset_at(opponent_spawn)


func feed_for_test(source: Variant) -> void:
	input_source.feed_for_test(source)


func _physics_process(delta: float) -> void:
	if adapter == null or player == null:
		return
	if lab_round != null:
		lab_round.tick(delta)
	_update_mirror(delta)
	var command: RefCounted = input_source.sample(camera, player.global_position, delta)
	if lab_round != null and lab_round.commands_frozen():
		var frozen: RefCounted = COMMAND_SCRIPT.new()
		frozen.set("aim_world", command.get("aim_world"))
		command = frozen
	_update_gaze_source(command, delta)
	_last_command = command
	adapter.apply_command(command, delta)
	adapter.weapon.tick(delta, self)
	var fired: bool = false
	if bool(command.get("fire_pressed")) or (bool(command.get("fire_held")) and adapter.weapon.is_automatic()):
		fired = _fire_weapon(command)
	if bool(command.get("throw_pressed")):
		_throw_hold = 0.0
	if bool(command.get("throw_held")):
		_throw_hold += delta
	if bool(command.get("throw_released")):
		_release_throw(command)
	var live_metrics: Dictionary = adapter.metrics()
	if replay != null and not replay.frozen:
		replay.record_command(command)
		replay.record_snapshot(_capture_replay_snapshot())
		if fired:
			replay.mark("fire", "%s FIRED" % String(adapter.weapon.id).to_upper())
		if bool(command.get("dive_pressed")):
			replay.mark("dive", "DIVE LAUNCH")
		var dive_state: String = String(live_metrics.get("dive_state", "NORMAL"))
		if dive_state != _last_dive_state and dive_state in ["contact", "CONTACT"]:
			replay.mark("contact", "DIVE CONTACT")
		_last_dive_state = dive_state
	_update_station()
	var metrics: Dictionary = live_metrics
	hud.refresh(active_mode, current_station, adapter.weapon, metrics,
		String(adapter.condition.get("id", "fresh")).to_upper(), _round_readout())
	if diagnostics != null:
		diagnostics.update_xray(adapter)
		if active_gaze_target != null:
			var vision: Dictionary = {"source": _gaze_source, "look_age": _look_age,
				"range": 240.0 if gaze_binoculars else 100.0,
				"half_angle_deg": 55.0, "fade_member": true,
				"transparency": 0.0}
			var diagnostic: Dictionary = diagnostics.snapshot(adapter,
				active_gaze_target, camera, vision)
			hud.set_tools(_diagnostic_readout(diagnostic))
	var desired: Vector3 = player.global_position + Vector3(10, 20, 17)
	camera.global_position = camera.global_position.lerp(desired, clampf(delta * 4.0, 0.0, 1.0))
	camera.look_at(player.global_position + Vector3(3, 0, 0), Vector3.UP)
	if _gaze_headlight != null:
		_gaze_headlight.global_position = player.global_position + Vector3(0, 1.3, 0)
		_gaze_headlight.look_at(active_gaze_target.global_position if active_gaze_target != null \
			else player.global_position + Vector3.FORWARD * 20.0, Vector3.UP)


func _update_gaze_source(command: RefCounted, delta: float) -> void:
	var aim: Vector3 = command.get("aim_world")
	var change: float = _prior_aim.angle_to(aim)
	var pad_aim: Vector2 = Input.get_vector("drivn_aim_left", "drivn_aim_right",
		"drivn_aim_up", "drivn_aim_down")
	if change > deg_to_rad(1.0):
		_gaze_source = "right_stick" if pad_aim.length() > 0.25 else "mouse"
		_look_age = 0.0
	else:
		_look_age += delta
		_gaze_source = "returning" if _look_age > 0.55 else "turn"
	_prior_aim = aim


func _diagnostic_readout(facts: Dictionary) -> String:
	var replay_status: String = "FROZEN" if replay != null and replay.frozen else \
		"REC %.1fs" % (float(replay.frame_count()) / 60.0 if replay != null else 0.0)
	return "TOOLS  X-RAY %s · BLACK BOX %s · %dm %s · DOOR %s · %s/%s · F/G/W %.0f°/%.0f°/%.0f° · LOS %s · %s" % [
		"ON" if diagnostics.updates_enabled() else "OFF", replay_status,
		gaze_target_distance, "BINOC" if gaze_binoculars else "NORMAL",
		"OPEN" if gaze_door_open else "CLOSED",
		"NIGHT" if gaze_night else "DAY", "DUST" if gaze_dust else "CLEAR",
		float(facts.get("forward_yaw_deg", 0.0)), float(facts.get("head_yaw_deg", 0.0)),
		float(facts.get("weapon_yaw_deg", 0.0)), "CLEAR" if bool(facts.get("los", false)) else "BLOCKED",
		String(facts.get("source", "turn")).to_upper()]


func _round_readout() -> String:
	if lab_round == null:
		return opponent_behavior
	var opponent_row: Dictionary = opponent.row if opponent != null else {}
	var base: String = "%s P%d-%dO  %s  %.2fs  ±%.1f°  A%.2f" % [opponent_behavior,
		lab_round.rounds("player"), lab_round.rounds("opponent"),
		String(opponent_row.get("weapon_id", "none")).to_upper(),
		float(opponent_row.get("reaction_s", 0.0)),
		float(opponent_row.get("accuracy_deg", 0.0)),
		float(opponent_row.get("aggression", 0.0))]
	if lab_round.phase in ["round_end", "match_end"]:
		var card: Dictionary = lab_round.last_card
		return "%s  %s: %s" % [base, String(card.get("reason", "ROUND")),
			String(card.get("winner", "")).to_upper()]
	return base


func _capture_replay_snapshot() -> Dictionary:
	var transforms: Dictionary = {}
	var velocities: Dictionary = {}
	if "parts" in adapter:
		for id in (adapter.parts as Dictionary):
			var part := (adapter.parts as Dictionary)[id] as RigidBody3D
			transforms[id] = part.global_transform
			velocities[id] = {"linear": part.linear_velocity, "angular": part.angular_velocity}
	else:
		transforms["root"] = player.global_transform
		velocities["root"] = adapter.body_velocity()
	return {"mode": active_mode, "body_transforms": transforms,
		"velocities": velocities, "weapon": String(adapter.weapon.id),
		"ammo": adapter.weapon.mag, "condition": adapter.condition.duplicate(true),
		"round": lab_round.snapshot() if lab_round != null else {},
		"opponent": opponent.metrics() if opponent != null else {},
		"rng_seed": 0, "station": current_station}


func freeze_replay() -> void:
	if replay != null:
		replay.freeze()


func toggle_replay_freeze() -> void:
	if replay == null:
		return
	if replay.frozen:
		replay.unfreeze()
	else:
		replay.freeze()


func restore_replay_offset(frames_back: int) -> bool:
	if replay == null or replay.frame_count() == 0:
		return false
	var frame: int = maxi(replay.first_frame(), replay.last_frame() - maxi(0, frames_back))
	var state: Dictionary = replay.seek(frame)
	if state.is_empty():
		return false
	_restore_replay_snapshot(state)
	return true


func _restore_replay_snapshot(state: Dictionary) -> void:
	var mode: String = String(state.get("mode", active_mode))
	if mode != active_mode:
		switch_mode(mode)
	adapter.set_weapon(String(state.get("weapon", "pistol")))
	adapter.set_condition(state.get("condition", {"id": "fresh"}))
	var transforms: Dictionary = state.get("body_transforms", {})
	var velocities: Dictionary = state.get("velocities", {})
	if "parts" in adapter:
		for id in transforms:
			if (adapter.parts as Dictionary).has(id):
				var part := (adapter.parts as Dictionary)[id] as RigidBody3D
				part.global_transform = transforms[id]
				var motion: Dictionary = velocities.get(id, {})
				part.linear_velocity = motion.get("linear", Vector3.ZERO)
				part.angular_velocity = motion.get("angular", Vector3.ZERO)
	elif transforms.has("root"):
		adapter.reset_at(transforms["root"])
		player.velocity = velocities.get("root", Vector3.ZERO)
	# reset_at() intentionally refills a station reset; replay ammo is restored
	# afterward because the Black Box snapshot is authoritative.
	adapter.weapon.mag = int(state.get("ammo", adapter.weapon.mag))
	if lab_round != null and lab_round.has_method("restore_snapshot"):
		lab_round.restore_snapshot(state.get("round", {}))
	if opponent != null:
		var opponent_state: Dictionary = state.get("opponent", {})
		if opponent_state.has("position"):
			opponent.reset_at(Transform3D(Basis.IDENTITY, opponent_state["position"]))
		if opponent_state.has("behavior"):
			set_opponent_behavior(String(opponent_state["behavior"]))


func start_mirror_run() -> bool:
	if replay == null or replay.frame_count() == 0:
		return false
	clear_mirror_run()
	_mirror_root = Node3D.new()
	_mirror_root.name = "MirrorRun"
	add_child(_mirror_root)
	var modes: Array[String] = ["hybrid", "active_ragdoll", "full_physics"]
	for i in modes.size():
		var mode: String = modes[i]
		var body_adapter: Node = ADAPTER_SCRIPT.new() if mode == "hybrid" else PHYSICAL_SCRIPT.new()
		_mirror_root.add_child(body_adapter)
		if mode == "hybrid":
			body_adapter.setup({})
		else:
			body_adapter.setup(mode)
		body_adapter.set_weapon(String(adapter.weapon.id))
		body_adapter.set_condition(adapter.condition)
		body_adapter.reset_at(Transform3D(Basis.IDENTITY,
			Vector3(float(i) * 5.0, 0.05, 22.0)))
		body_adapter.add_to_group("lab_mirror_body")
		body_adapter.combat_body().remove_from_group("combatant")
		mirror_bodies[mode] = body_adapter
	_mirror_trace = replay.command_frames()
	_mirror_cursor = 0
	mirror_results.clear()
	return true


func _update_mirror(delta: float) -> void:
	if _mirror_cursor < 0 or _mirror_cursor >= _mirror_trace.size():
		return
	var command: RefCounted = _mirror_trace[_mirror_cursor]
	for mode in mirror_bodies:
		var body_adapter: Node = mirror_bodies[mode]
		body_adapter.apply_command(command.duplicate_frame(), delta)
		body_adapter.weapon.tick(delta, self)
		if bool(command.get("fire_pressed")) and body_adapter.weapon.can_fire():
			body_adapter.weapon.mag -= 1
			body_adapter.weapon._cd = float(body_adapter.weapon.info()["cooldown"])
			body_adapter.apply_recoil(command.get("aim_world"),
				body_adapter.weapon.info().get("recoil", {}), character.level("strength"))
	_mirror_cursor += 1
	if _mirror_cursor >= _mirror_trace.size():
		_finish_mirror_run()


func _finish_mirror_run() -> void:
	for mode in mirror_bodies:
		var body_adapter: Node = mirror_bodies[mode]
		var facts: Dictionary = body_adapter.metrics().duplicate(true)
		facts["finish_position"] = body_adapter.combat_body().global_position
		facts["ammo"] = body_adapter.weapon.mag
		mirror_results[mode] = facts
	_mirror_cursor = -1


func clear_mirror_run() -> void:
	if _mirror_root != null and is_instance_valid(_mirror_root):
		_mirror_root.queue_free()
	_mirror_root = null
	mirror_bodies.clear()
	_mirror_trace.clear()
	_mirror_cursor = -1


func _fire_weapon(command: RefCounted) -> bool:
	if adapter.weapon.mag <= 0:
		return false
	var direction: Vector3 = command.get("aim_world")
	if adapter.weapon.fire(self, adapter.muzzle_world(), direction):
		adapter.apply_recoil(direction, adapter.weapon.info().get("recoil", {}),
			character.level("strength"))
		return true
	return false


func _release_throw(command: RefCounted) -> void:
	var row: Dictionary = THROWABLE_SCRIPT.row("grenade")
	var charge: float = THROWABLE_SCRIPT.charge_for(_throw_hold, row)
	var inherited: Vector3 = adapter.body_velocity()
	inherited.y = 0.0
	var direction: Vector3 = command.get("aim_world")
	var velocity: Vector3 = THROWABLE_SCRIPT.launch_velocity(direction, charge,
		character.level("strength"), float(row["mass"]), inherited, row)
	var projectile: Node3D = THROWABLE_SCRIPT.create_projectile(row, velocity)
	add_child(projectile)
	projectile.global_position = player.global_position + Vector3(0, 1.4, 0) + direction * 0.6
	_throw_hold = 0.0


func _update_station() -> void:
	var nearest: String = current_station
	var distance: float = INF
	for station_name in stations:
		var marker := stations[station_name] as Node3D
		var candidate: float = marker.global_position.distance_to(player.global_position)
		if candidate < distance:
			distance = candidate
			nearest = String(station_name)
	current_station = nearest


func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventKey and event.pressed and not event.echo:
		match (event as InputEventKey).keycode:
			KEY_F1: switch_mode("hybrid")
			KEY_F2: switch_mode("active_ragdoll")
			KEY_F3: switch_mode("full_physics")
			KEY_F4: _cycle_opponent_behavior()
			KEY_F5: toggle_xray()
			KEY_F6: toggle_day_night()
			KEY_F7: toggle_dust()
			KEY_F8: toggle_headlights()
			KEY_F9: toggle_binoculars()
			KEY_F10: toggle_camera_zoom()
			KEY_F11: toggle_replay_freeze()
			KEY_F12: start_mirror_run()
			KEY_O: set_gaze_door(not gaze_door_open)
			KEY_COMMA: restore_replay_offset(120)
			KEY_BRACKETLEFT: cycle_target_distance(-1)
			KEY_BRACKETRIGHT: cycle_target_distance(1)
			KEY_BACKSPACE: reset_station()
	elif event is InputEventJoypadButton and event.pressed \
			and (event as InputEventJoypadButton).button_index == JOY_BUTTON_DPAD_RIGHT:
		_cycle_opponent_behavior()


func emit_noise(_at: Vector3, _radius: float, _kind: String = "") -> void:
	pass


func grant_xp(_id: String, _amount: float) -> void:
	pass


func on_explosion(_at: Vector3, _damage: float, _blast: float) -> void:
	pass


func _exit_tree() -> void:
	Engine.time_scale = _prior_time_scale
