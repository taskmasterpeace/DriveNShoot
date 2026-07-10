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
const CALIBRATION_SCRIPT := preload("res://proto3d/tools/physics_lab/lab_calibration.gd")
const SURFACE_SCRIPT := preload("res://proto3d/tools/physics_lab/lab_surface.gd")
const CAMERA_WALL_SCRIPT := preload("res://proto3d/tools/physics_lab/lab_camera_wall.gd")
const SCENARIO_SCRIPT := preload("res://proto3d/tools/physics_lab/lab_scenario.gd")
const CHAOS_SCRIPT := preload("res://proto3d/tools/physics_lab/lab_chaos.gd")
const VERDICT_SCRIPT := preload("res://proto3d/tools/physics_lab/lab_verdict.gd")
const IMPACT_BAY_SCRIPT := preload("res://proto3d/tools/physics_lab/lab_impact_bay.gd")
const WEAPON_WHEEL_SCRIPT := preload("res://proto3d/weapon_wheel.gd")

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
var scenario_opponents: Array[Node3D] = []
var spectacle_fighters: Array[Node3D] = []
var scenario_vehicles: Array[ProtoCar3D] = []
var scenario_player_spawn: Transform3D = station_spawn
var scenario_win_condition: Dictionary = {}
var diagnostics: Node3D = null
var replay: RefCounted = null
var mirror_bodies: Dictionary = {}
var mirror_results: Dictionary = {}
var calibration: RefCounted = null
var surface_tool: RefCounted = null
var camera_wall: Node = null
var scenario_tool: RefCounted = null
var chaos: RefCounted = null
var verdict: RefCounted = null
var impact_bay: Node3D = null
var weapon_wheel: CanvasLayer = null
var radial_selection: String = "pistol"
var shot_spread_deg: float = -1.0 # Tests/AI may override; negative keeps authored player spread.
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
var _scenario_camera_preset: String = "on_foot_3d"
var _scenario_index: int = 0
var _transport_index: int = 0
var _chaos_load: float = 0.0
var _clear_verdict_armed: bool = false
var _chaos_clock_ms: float = 0.0
var _network_command: RefCounted = null
var _radial_down: bool = false
var _scenario_progress: int = 0
var _scenario_complete: bool = false
var _scenario_elapsed: float = 0.0
var _scenario_vehicle_hp: float = 0.0


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
	calibration = CALIBRATION_SCRIPT.new()
	input_source.set_calibration(calibration)
	hud.calibration_changed.connect(apply_calibration_settings)
	hud.calibration_sample_requested.connect(begin_controller_calibration)
	hud.calibration_save_requested.connect(_save_calibration_preset)
	hud.calibration_load_requested.connect(_load_calibration_preset)
	hud.set_calibration_values(calibration.preset())
	surface_tool = SURFACE_SCRIPT.new()
	surface_tool.build_panels(self, Vector3(10, 0.05, 11))
	camera_wall = CAMERA_WALL_SCRIPT.new()
	add_child(camera_wall)
	camera_wall.setup(player)
	scenario_tool = SCENARIO_SCRIPT.new()
	scenario_tool.build_cards(self, Vector3(70, 0.05, 16))
	chaos = CHAOS_SCRIPT.new()
	chaos.configure_transport("local", 1)
	impact_bay = IMPACT_BAY_SCRIPT.new()
	add_child(impact_bay)
	impact_bay.setup(self, Vector3(104, 0.05, 0))
	verdict = VERDICT_SCRIPT.new()
	hud.verdict_submitted.connect(_on_verdict_submitted)
	hud.verdict_clear_requested.connect(_on_verdict_clear_requested)
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
	# Keep both side crash rails low: the fixed oblique camera otherwise lets a
	# tall near/far rail occlude one of the two side-by-side comparison rigs.
	ProtoWorldBuilder.box_body(self, Vector3(0.5, 1.2, 24), Vector3(94, 0.6, 0), Color("#463c31"))
	ProtoWorldBuilder.box_body(self, Vector3(0.5, 1.2, 24), Vector3(114, 0.6, 0), Color("#59452f"))

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
	var prior_surface: Dictionary = {"id": "asphalt", "stop_decel": 14.0,
		"dive_slide_mult": 1.0, "accel_mult": 1.0, "body_friction": 0.04}
	if adapter != null:
		at = adapter.anchor_transform()
		weapon_id = String(adapter.weapon.id)
		prior_condition = adapter.condition.duplicate(true)
		prior_surface = adapter.surface.duplicate(true)
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
	radial_selection = weapon_id
	adapter.set_condition(prior_condition)
	adapter.set_surface(prior_surface)
	adapter.reset_at(at)
	_connect_player_damage()
	if opponent != null:
		opponent.set_target(player)
	for extra in scenario_opponents:
		if is_instance_valid(extra):
			extra.set_target(player)
	if camera_wall != null:
		camera_wall.set_subject(player)
	return true


func _connect_player_damage() -> void:
	if adapter == null:
		return
	if active_mode == "hybrid":
		adapter.player.damaged.connect(_on_player_damaged)
	else:
		adapter.damaged.connect(_on_player_damaged)


func cycle_body_mode(step: int = 1) -> void:
	var modes: Array[String] = ["hybrid", "active_ragdoll", "full_physics"]
	var index: int = modes.find(active_mode)
	switch_mode(modes[posmod(index + step, modes.size())])


func _on_player_damaged(amount: float, _attacker: Node3D = null) -> void:
	if lab_round != null:
		lab_round.hit("player", amount, {"attacker": "opponent", "kind": "bullet"})


func set_opponent_behavior(id: String) -> bool:
	if opponent == null or not opponent.set_behavior(id):
		return false
	opponent.set_enabled(true)
	opponent_behavior = id.to_upper()
	return true


func set_surface(id: String) -> bool:
	return surface_tool != null and surface_tool.select(id, adapter)


func cycle_surface(step: int = 1) -> void:
	if surface_tool == null:
		return
	var ids: Array[String] = surface_tool.ids()
	var index: int = ids.find(String(surface_tool.active_id))
	set_surface(ids[posmod(index + step, ids.size())])


func set_condition_preset(id: String) -> bool:
	if surface_tool == null or not surface_tool.apply_condition(id, adapter):
		return false
	var packet: Dictionary = surface_tool.condition(id)
	for skill_id in ["strength", "marksmanship", "martial_arts", "driving"]:
		(character.skills[skill_id] as Dictionary)["level"] = int(packet.get(skill_id, 0))
	if opponent != null:
		opponent.body.speed_mult = float(packet.get("speed_mult", 1.0))
		opponent.body.stamina = clampf(float(packet.get("stamina", 100.0)), 0.0,
			opponent.body.max_stamina)
		for skill_id in ["strength", "marksmanship", "martial_arts", "driving"]:
			(opponent.character.skills[skill_id] as Dictionary)["level"] = int(packet.get(skill_id, 0))
	return true


func cycle_condition(step: int = 1) -> void:
	if surface_tool == null:
		return
	var ids: Array[String] = surface_tool.condition_ids()
	var index: int = ids.find(String(surface_tool.active_condition))
	set_condition_preset(ids[posmod(index + step, ids.size())])


func toggle_camera_wall() -> void:
	if camera_wall != null:
		camera_wall.set_visible(not bool(camera_wall.facts()["visible"]))


func begin_controller_calibration() -> void:
	if calibration != null:
		calibration.begin_drift_sample(5.0)
		hud.set_calibration_status("SAMPLING: RELEASE BOTH STICKS FOR FIVE SECONDS")


func toggle_controller_calibration() -> void:
	if hud != null:
		hud.toggle_calibration(calibration.preset() if calibration != null else {})


func apply_calibration_settings(settings: Dictionary) -> void:
	if calibration == null:
		return
	var limits: Dictionary = {"deadzone":Vector2(0.0, 0.5),
		"response_exponent":Vector2(0.2, 3.0), "aim_sensitivity":Vector2(0.2, 2.5),
		"trigger_threshold":Vector2(0.0, 0.8), "rumble":Vector2(0.0, 1.0),
		"hold_threshold":Vector2(0.08, 0.5)}
	for id in limits:
		if settings.has(id):
			var limit: Vector2 = limits[id]
			calibration.set(id, clampf(float(settings[id]), limit.x, limit.y))
	if weapon_wheel != null:
		weapon_wheel.hold_threshold = calibration.hold_threshold
	preview_calibration_rumble()
	hud.set_calibration_values(calibration.preset())
	hud.set_calibration_status("APPLIED TO LIVE LAB PAD INPUT + RUMBLE PREVIEW · CAMPAIGN UNCHANGED")


func preview_calibration_rumble() -> bool:
	var pads: Array[int] = Input.get_connected_joypads()
	if calibration == null or pads.is_empty():
		return false
	for pad_id in pads:
		Input.start_joy_vibration(pad_id, float(calibration.rumble) * 0.45,
			float(calibration.rumble), 0.18)
	return true


func _save_calibration_preset(preset_name: String) -> void:
	var saved: bool = calibration != null and calibration.save_preset(preset_name)
	hud.set_calibration_status("SAVED '%s'" % preset_name if saved \
		else "SAVE FAILED — ENTER A PRESET NAME")


func _load_calibration_preset(preset_name: String) -> void:
	var loaded: bool = calibration != null and calibration.load_preset(preset_name)
	if loaded:
		apply_calibration_settings(calibration.preset())
	hud.set_calibration_status("LOADED '%s'" % preset_name if loaded \
		else "PRESET '%s' NOT FOUND" % preset_name)


func cycle_transport(step: int = 1) -> void:
	if chaos == null:
		return
	var ids: Array[String] = ["local", "good_coop", "bad_wifi", "hostile_jitter"]
	_transport_index = posmod(_transport_index + step, ids.size())
	chaos.configure_transport(ids[_transport_index], 1000 + _transport_index)
	_network_command = null


func cycle_chaos_load() -> void:
	if chaos == null:
		return
	_chaos_load = 0.0 if _chaos_load >= 1.0 else _chaos_load + 0.25
	chaos.set_load(self, _chaos_load)


func save_current_verdict(ratings: Dictionary, note: String = "") -> Dictionary:
	if verdict == null:
		return {"ok": false, "error": "Verdict Book unavailable"}
	var facts: Dictionary = adapter.metrics().duplicate(true)
	if diagnostics != null and active_gaze_target != null:
		facts.merge(diagnostics.snapshot(adapter, active_gaze_target, camera,
			{"source": _gaze_source, "look_age": _look_age}), true)
	return verdict.save({"ratings": ratings.duplicate(true), "note": note,
		"mode": active_mode, "weapon": String(adapter.weapon.id),
		"surface": String(adapter.surface.get("id", "asphalt")),
		"camera": _scenario_camera_preset,
		"condition": String(adapter.condition.get("id", "fresh")),
		"scenario": current_scenario, "metrics": facts,
		"replay_id": "frame_%d" % (replay.last_frame() if replay != null else -1)})


func _on_verdict_submitted(ratings: Dictionary, note: String) -> void:
	var result: Dictionary = save_current_verdict(ratings, note)
	hud.set_verdict_status("SAVED %s" % String(result.get("id", "")) if bool(result.get("ok", false)) \
		else "SAVE FAILED: %s" % String(result.get("error", "unknown")))
	_clear_verdict_armed = false


func _on_verdict_clear_requested() -> void:
	if not _clear_verdict_armed:
		_clear_verdict_armed = true
		hud.set_verdict_status("PRESS CLEAR ALL AGAIN TO CONFIRM")
		return
	var cleared: bool = verdict != null and verdict.clear_all(true)
	hud.set_verdict_status("ALL VERDICTS CLEARED" if cleared else "CLEAR FAILED")
	_clear_verdict_armed = false


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


func start_scenario(id: String, seed: int = -1) -> Dictionary:
	if scenario_tool == null:
		return {}
	var state: Dictionary = scenario_tool.start(id, seed)
	if state.is_empty():
		return {}
	current_scenario = id
	_scenario_index = scenario_tool.ids().find(id)
	_clear_scenario_opponents()
	_clear_scenario_vehicles()
	reset_station()
	var modes: Array = state.get("body_modes", ["hybrid"])
	switch_mode(String(modes[0]))
	set_surface(String(state.get("surface", "asphalt")))
	set_condition_preset(String(state.get("condition", "fresh")))
	var loadouts: Dictionary = state.get("loadouts", {})
	adapter.set_weapon(String(loadouts.get("player", "pistol")))
	radial_selection = String(adapter.weapon.id)
	var spawns: Dictionary = state.get("spawn_transforms", {})
	scenario_player_spawn = Transform3D(Basis.IDENTITY,
		_array_position(spawns.get("player", [0, 0.05, 0])))
	adapter.reset_at(scenario_player_spawn)
	var opponents: Array = state.get("opponents", [])
	if opponent != null:
		opponent.set_enabled(not opponents.is_empty())
	if not opponents.is_empty():
		set_opponent_behavior(String(opponents[0]))
	var opponent_spawns: Array = spawns.get("opponents", [])
	if opponent != null and not opponent_spawns.is_empty():
		var primary_spawn := Transform3D(Basis.IDENTITY, _array_position(opponent_spawns[0]))
		opponent.set_meta("scenario_spawn", primary_spawn)
		opponent.reset_at(primary_spawn)
	var opponent_loadouts: Array = loadouts.get("opponents", [])
	if opponent != null and not opponent_loadouts.is_empty():
		opponent.set_weapon(String(opponent_loadouts[0]))
	for i in range(1, opponents.size()):
		var extra: Node3D = OPPONENT_SCRIPT.new()
		extra.name = "ScenarioOpponent_%d" % (i + 1)
		add_child(extra)
		extra.setup(lab_round, player, String(opponents[i]), self)
		var extra_spawn := Transform3D(Basis.IDENTITY,
			_array_position(opponent_spawns[i] if i < opponent_spawns.size() else [3, 0.05, -6]))
		extra.set_meta("scenario_spawn", extra_spawn)
		extra.reset_at(extra_spawn)
		if i < opponent_loadouts.size():
			extra.set_weapon(String(opponent_loadouts[i]))
		scenario_opponents.append(extra)
	_spawn_scenario_vehicles(spawns.get("vehicles", []), loadouts)
	scenario_win_condition = (state.get("win_condition", {}) as Dictionary).duplicate(true)
	_scenario_progress = 0
	_scenario_complete = false
	_scenario_elapsed = 0.0
	_scenario_vehicle_hp = _scenario_vehicle_health()
	if String(scenario_win_condition.get("type", "")) == "rounds" and lab_round != null:
		lab_round.rounds_to_win = maxi(1, int(scenario_win_condition.get("value", 2)))
	var weather: Dictionary = state.get("weather", {})
	_set_environment_state(String(weather.get("time", "day")) == "night",
		String(weather.get("atmosphere", "clear")) == "dust",
		bool(weather.get("headlights", false)))
	_scenario_camera_preset = String(state.get("camera_preset", "on_foot_3d"))
	chaos.configure_transport(String(state.get("transport", "local")), int(state["seed"]))
	_network_command = null
	return state.duplicate(true)


func scenario_state() -> Dictionary:
	return {"scenario": current_scenario, "mode": active_mode,
		"position": adapter.anchor_transform().origin, "weapon": String(adapter.weapon.id),
		"surface": String(adapter.surface.get("id", "")),
		"condition": String(adapter.condition.get("id", "")),
		"opponent": opponent_behavior.to_lower(),
		"opponent_count": (1 if opponent != null and opponent.enabled else 0) + scenario_opponents.size(),
		"vehicles": scenario_vehicles.map(func(car: ProtoCar3D) -> String:
			return String(car.get_meta("lab_vehicle_id", car.vclass))),
		"win_condition": scenario_win_condition.duplicate(true),
		"objective": scenario_objective(),
		"night": gaze_night, "dust": gaze_dust,
		"headlights": gaze_headlights, "camera": _scenario_camera_preset,
		"transport": String(chaos.preset_id), "seed": int(scenario_tool.current.get("seed", 0)),
		"opening_events": scenario_tool.current.get("opening_events", []).duplicate(true)}


func cycle_scenario(step: int = 1) -> void:
	var ids: Array[String] = scenario_tool.ids()
	_scenario_index = posmod(_scenario_index + step, ids.size())
	start_scenario(ids[_scenario_index])


func _array_position(value: Variant) -> Vector3:
	var coords := value as Array
	return Vector3(float(coords[0]), float(coords[1]), float(coords[2])) \
		if coords.size() >= 3 else Vector3.ZERO


func _set_environment_state(night: bool, dust: bool, headlights: bool) -> void:
	if gaze_night != night:
		toggle_day_night()
	if gaze_dust != dust:
		toggle_dust()
	if gaze_headlights != headlights:
		toggle_headlights()


func _clear_scenario_opponents() -> void:
	for extra in scenario_opponents:
		if is_instance_valid(extra):
			extra.queue_free()
	scenario_opponents.clear()


func clear_spectacle_fighters() -> void:
	for fighter in spectacle_fighters:
		if fighter != opponent and is_instance_valid(fighter):
			fighter.queue_free()
	scenario_opponents = scenario_opponents.filter(func(extra: Node3D) -> bool:
		return is_instance_valid(extra) and extra not in spectacle_fighters)
	spectacle_fighters.clear()
	if opponent != null:
		opponent.configure_identity("opponent", "player")
		opponent.set_target(player)


func configure_spectacle_match(left: Dictionary, right: Dictionary, spectacle_mode: String) -> bool:
	clear_spectacle_fighters()
	if opponent == null or lab_round == null or spectacle_mode != "watch":
		return false
	var left_id: String = String(left.get("id", ""))
	var right_id: String = String(right.get("id", ""))
	if left_id == "" or right_id == "":
		return false
	opponent.set_enabled(true)
	opponent.configure_identity(left_id, right_id)
	opponent.set_behavior(String(left.get("opponent_row", "duel")))
	opponent.set_weapon(String(left.get("weapon_id", "pistol")))
	var left_spawn := Transform3D(Basis.IDENTITY, Vector3(74, 0.05, 8))
	opponent.set_meta("scenario_spawn", left_spawn)
	opponent.reset_at(left_spawn)

	var right_fighter: Node3D = OPPONENT_SCRIPT.new()
	right_fighter.name = "SpectacleFighter_%s" % right_id
	add_child(right_fighter)
	right_fighter.setup(lab_round, opponent.body, String(right.get("opponent_row", "duel")), self)
	right_fighter.configure_identity(right_id, left_id)
	right_fighter.set_weapon(String(right.get("weapon_id", "pistol")))
	var right_spawn := Transform3D(Basis.IDENTITY, Vector3(82, 0.05, -8))
	right_fighter.set_meta("scenario_spawn", right_spawn)
	right_fighter.reset_at(right_spawn)
	opponent.set_target(right_fighter.body)
	right_fighter.set_target(opponent.body)
	scenario_opponents.append(right_fighter)
	spectacle_fighters = [opponent, right_fighter]
	scenario_player_spawn = Transform3D(Basis.IDENTITY, Vector3(78, 0.05, 15))
	adapter.reset_at(scenario_player_spawn)
	return true


func spectacle_facts() -> Dictionary:
	return {"count":spectacle_fighters.size(), "ids":spectacle_fighters.map(
		func(fighter: Node3D) -> String: return String(fighter.get("fighter_id")))}


func _clear_scenario_vehicles() -> void:
	for car in scenario_vehicles:
		if is_instance_valid(car):
			car.queue_free()
	scenario_vehicles.clear()


func _spawn_scenario_vehicles(raw_spawns: Variant, loadouts: Dictionary) -> void:
	var vehicle_spawns: Array = raw_spawns as Array if raw_spawns is Array else []
	var raw_ids: Variant = loadouts.get("vehicles", loadouts.get("vehicle", ""))
	var vehicle_ids: Array[String] = []
	if raw_ids is Array:
		for raw_id in raw_ids:
			vehicle_ids.append(String(raw_id))
	elif String(raw_ids) != "":
		vehicle_ids.append(String(raw_ids))
	for i in vehicle_spawns.size():
		var authored_id: String = vehicle_ids[mini(i, vehicle_ids.size() - 1)] \
			if not vehicle_ids.is_empty() else "scavenger"
		var vclass: String = "suv" if authored_id == "suv_armored" else authored_id
		if not ProtoCar3D.VEHICLES.has(vclass):
			vclass = "scavenger"
		var car := ProtoCar3D.create(vclass, Color("#78593e"))
		car.name = "ScenarioVehicle_%d" % (i + 1)
		add_child(car)
		var spawn := Transform3D(Basis.IDENTITY, _array_position(vehicle_spawns[i]))
		car.global_transform = spawn
		# Stationary scenario fixtures still need an awake physics body so the
		# VehicleWheel3D suspension initializes finite render transforms.
		car.axis_lock_linear_x = true
		car.axis_lock_linear_y = true
		car.axis_lock_linear_z = true
		car.axis_lock_angular_x = true
		car.axis_lock_angular_y = true
		car.axis_lock_angular_z = true
		car.can_sleep = false
		car.add_to_group("lab_scenario_vehicle")
		car.set_meta("scenario_spawn", spawn)
		car.set_meta("lab_vehicle_id", authored_id)
		car.set_meta("lab_armored", authored_id == "suv_armored")
		if authored_id == "suv_armored":
			car.armor = maxf(car.armor, 100.0)
		car.set_meta("scenario_damage", car.snapshot_damage())
		scenario_vehicles.append(car)


func _reset_scenario_vehicles() -> void:
	for car in scenario_vehicles:
		if not is_instance_valid(car):
			continue
		car.global_transform = car.get_meta("scenario_spawn", car.global_transform)
		car.linear_velocity = Vector3.ZERO
		car.angular_velocity = Vector3.ZERO
		car.restore_damage(car.get_meta("scenario_damage", {}) as Dictionary)
	_scenario_vehicle_hp = _scenario_vehicle_health()


func _scenario_vehicle_health() -> float:
	var total: float = 0.0
	for car in scenario_vehicles:
		if not is_instance_valid(car):
			continue
		var parts: Dictionary = car.snapshot_damage().get("components", {})
		for hp in parts.values():
			total += float(hp)
	return total


func scenario_objective() -> Dictionary:
	var kind: String = String(scenario_win_condition.get("type", "free_play"))
	var target: int = maxi(1, int(scenario_win_condition.get("value", 1)))
	var progress: int = _scenario_progress
	if lab_round != null and lab_round.fighters.has("player"):
		var fighter: Dictionary = lab_round.fighters["player"]
		match kind:
			"rounds": progress = int(fighter.get("rounds", 0))
			"points": progress = int(fighter.get("points", 0))
			"hits": progress = int(fighter.get("hits", 0))
			"find_and_tag": progress = mini(1, int(fighter.get("hits", 0)))
	var complete: bool = _scenario_complete or progress >= target
	return {"type": kind, "progress": progress, "target": target, "complete": complete}


func _update_scenario_runtime(delta: float) -> void:
	if current_scenario == "free_play" or scenario_win_condition.is_empty():
		return
	_scenario_elapsed += delta
	var kind: String = String(scenario_win_condition.get("type", ""))
	if kind == "survive_pass" and not scenario_vehicles.is_empty() \
		and is_instance_valid(scenario_vehicles[0]):
		var pass_car: ProtoCar3D = scenario_vehicles[0]
		pass_car.global_position.z -= 8.0 * delta
		if pass_car.global_position.z <= scenario_player_spawn.origin.z - 28.0:
			_scenario_progress = int(scenario_win_condition.get("value", 1))
			_scenario_complete = true
	elif kind == "penetrations":
		var health_now: float = _scenario_vehicle_health()
		if health_now < _scenario_vehicle_hp - 0.01:
			_scenario_progress += 1
		_scenario_vehicle_hp = health_now


func reset_station() -> void:
	if adapter == null:
		return
	if lab_round != null:
		lab_round.reset_match()
	reset_fighters()
	if surface_tool != null:
		set_surface("asphalt")
		set_condition_preset("fresh")
	if impact_bay != null:
		impact_bay.reset()
	character.hp = 100.0
	character.dead = false
	for part in character.body.values():
		part.hp = part.max_hp
	adapter.weapon.mag = int(adapter.weapon.info()["mag_size"])
	_throw_hold = 0.0


func reset_fighters() -> void:
	if adapter != null:
		adapter.reset_at(scenario_player_spawn)
	if opponent != null and opponent.enabled:
		opponent.reset_at(opponent.get_meta("scenario_spawn", opponent_spawn))
	for extra in scenario_opponents:
		if is_instance_valid(extra):
			extra.reset_at(extra.get_meta("scenario_spawn", Transform3D.IDENTITY))
	_reset_scenario_vehicles()


func feed_for_test(source: Variant) -> void:
	input_source.feed_for_test(source)


func _physics_process(delta: float) -> void:
	if adapter == null or player == null:
		return
	if lab_round != null:
		lab_round.tick(delta)
	_update_scenario_runtime(delta)
	_update_mirror(delta)
	_chaos_clock_ms += delta * 1000.0
	if calibration != null:
		var raw_controls: Dictionary = input_source.raw_pad_state()
		raw_controls["keyboard_move"] = input_source.keyboard_action_move()
		raw_controls["mouse"] = get_viewport().get_mouse_position()
		raw_controls["buttons"] = {"sprint":Input.is_action_pressed("drivn_sprint"),
			"dive":Input.is_action_pressed("jump"), "fire":Input.is_action_pressed("drivn_fire"),
			"reload":Input.is_action_pressed("drivn_reload")}
		calibration.sample(raw_controls, delta)
		hud.refresh_calibration(calibration.oscilloscope(), calibration.drift_result())
	var command: RefCounted = input_source.sample(camera, player.global_position, delta)
	if chaos != null and String(chaos.preset_id) != "local":
		chaos.enqueue(command, _chaos_clock_ms)
		var delivered: Array = chaos.pump(_chaos_clock_ms)
		if not delivered.is_empty():
			_network_command = (delivered[-1]["command"] as RefCounted).duplicate_frame()
		command = _network_command.duplicate_frame() if _network_command != null \
			else COMMAND_SCRIPT.new()
	_update_weapon_radial(command, delta)
	if weapon_wheel != null and bool(weapon_wheel.is_open):
		command.set("move", Vector3.ZERO)
		command.set("sprint", false)
		command.set("fire_pressed", false)
		command.set("fire_held", false)
	if lab_round != null and lab_round.commands_frozen():
		var frozen: RefCounted = COMMAND_SCRIPT.new()
		frozen.set("aim_world", command.get("aim_world"))
		command = frozen
	if hud != null and (hud.verdict_open() or hud.calibration_open()):
		var modal_command: RefCounted = COMMAND_SCRIPT.new()
		modal_command.set("aim_world", command.get("aim_world"))
		command = modal_command
	_update_gaze_source(command, delta)
	_last_command = command
	adapter.apply_command(command, delta)
	adapter.weapon.tick(delta, self)
	if bool(command.get("reload_pressed")):
		adapter.weapon.mag = int(adapter.weapon.info()["mag_size"])
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
	if impact_bay != null:
		hud.set_impact_bay(impact_bay.readout(), current_station == "VEHICLE DAMAGE BAY")
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


func _ensure_weapon_wheel() -> void:
	if weapon_wheel != null:
		return
	weapon_wheel = WEAPON_WHEEL_SCRIPT.create()
	add_child(weapon_wheel)
	if calibration != null:
		weapon_wheel.hold_threshold = calibration.hold_threshold


func _update_weapon_radial(command: RefCounted, delta: float) -> void:
	if bool(command.get("radial_pressed")):
		_ensure_weapon_wheel()
		_radial_down = true
		var wheel_ids: Array[String] = ["fists", "pistol", "scrap_smg", "shotgun", "grenade"]
		weapon_wheel.configure(wheel_ids, radial_selection)
		weapon_wheel.begin_hold()
	if not _radial_down or weapon_wheel == null:
		return
	if bool(command.get("radial_held")):
		weapon_wheel.advance_hold(delta)
		if bool(weapon_wheel.is_open):
			var aim: Vector3 = command.get("aim_world")
			weapon_wheel.update_pointer(Vector2(aim.x, aim.z))
	if bool(command.get("radial_released")):
		_radial_down = false
		var selected: String = String(weapon_wheel.release())
		if selected in ["fists", "pistol", "scrap_smg", "shotgun", "grenade"]:
			radial_selection = selected
		if ProtoWeapon.WEAPONS.has(selected):
			adapter.set_weapon(selected)


func _diagnostic_readout(facts: Dictionary) -> String:
	var replay_status: String = "FROZEN" if replay != null and replay.frozen else \
		"REC %.1fs" % (float(replay.frame_count()) / 60.0 if replay != null else 0.0)
	var tool_state: String = "%s/%s/CAM %s/%s/LOAD %d%%" % [
		String(surface_tool.active_id).to_upper() if surface_tool != null else "ASPHALT",
		String(surface_tool.active_condition).to_upper() if surface_tool != null else "FRESH",
		"ON" if camera_wall != null and bool(camera_wall.facts()["visible"]) else "OFF",
		String(chaos.preset_id).to_upper() if chaos != null else "LOCAL", int(_chaos_load * 100.0)]
	var net: Dictionary = chaos.transport_facts() if chaos != null else {}
	var perf: Dictionary = chaos.performance_facts() if chaos != null else {}
	var budget: String = String(perf.get("first_exceeded", ""))
	if budget == "":
		budget = "OK"
	var objective: Dictionary = scenario_objective()
	var readout: String = "TOOLS  %s · X-RAY %s · BLACK BOX %s · %dm %s · DOOR %s · %s/%s · F/G/W %.0f°/%.0f°/%.0f° · LOS %s · %s\nNET %.0fms JIT %.0f LOSS %.0f%% Q%d DROP %d · CPU %.1fms SCRIPT~ %.1fms PHYS %.1fms DRAW %d · BUDGET %s · GOAL %s %d/%d" % [
		tool_state,
		"ON" if diagnostics.updates_enabled() else "OFF", replay_status,
		gaze_target_distance, "BINOC" if gaze_binoculars else "NORMAL",
		"OPEN" if gaze_door_open else "CLOSED",
		"NIGHT" if gaze_night else "DAY", "DUST" if gaze_dust else "CLEAR",
		float(facts.get("forward_yaw_deg", 0.0)), float(facts.get("head_yaw_deg", 0.0)),
		float(facts.get("weapon_yaw_deg", 0.0)), "CLEAR" if bool(facts.get("los", false)) else "BLOCKED",
		String(facts.get("source", "turn")).to_upper(),
		float(net.get("latency_ms", 0.0)), float(net.get("jitter_ms", 0.0)),
		float(net.get("loss", 0.0)) * 100.0, int(net.get("queued", 0)), int(net.get("dropped", 0)),
		float(perf.get("frame_cpu_ms", 0.0)), float(perf.get("script_estimate_ms", 0.0)),
		float(perf.get("physics_ms", 0.0)), int(perf.get("render_draw_calls", 0)), budget.to_upper(),
		String(objective.get("type", "free_play")).to_upper(), int(objective.get("progress", 0)),
		int(objective.get("target", 1))]
	return readout + "\nDAMAGE  CARS %d · PANELS %d · EVENTS %d · REUSE %d · WORST HIT %d µs" % [
		int(perf.get("damaged_cars", 0)), int(perf.get("damage_panels", 0)),
		int(perf.get("deform_events", 0)), int(perf.get("mark_reuses", 0)),
		int(perf.get("impact_us", 0))]


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
		"surface": adapter.surface.duplicate(true),
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
	adapter.set_surface(state.get("surface", {"id": "asphalt"}))
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
		body_adapter.set_surface(adapter.surface)
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
		if not adapter.weapon.is_melee():
			return false
	var direction: Vector3 = command.get("aim_world")
	if active_mode != "hybrid" and adapter.weapon.is_melee():
		return _physical_melee(direction)
	if adapter.weapon.fire(self, adapter.muzzle_world(), direction):
		adapter.apply_recoil(direction, adapter.weapon.info().get("recoil", {}),
			character.level("strength"))
		return true
	return false


func _physical_melee(direction: Vector3) -> bool:
	if not adapter.weapon.can_fire():
		return false
	var row: Dictionary = adapter.weapon.info()
	adapter.weapon._cd = float(row["cooldown"])
	adapter.right_hand.apply_central_impulse(direction.normalized() * adapter.right_hand.mass * 2.2)
	if opponent == null or lab_round == null or lab_round.phase != "active":
		return true
	var to_target: Vector3 = opponent.body.global_position - player.global_position
	to_target.y = 0.0
	if to_target.length() <= float(row.get("reach", 1.9)) \
			and direction.normalized().dot(to_target.normalized()) \
			>= cos(deg_to_rad(float(row.get("arc_deg", 70.0)) * 0.5)) \
			and _physical_melee_clear(opponent.body):
		opponent.take_damage(float(row.get("damage", 8.0)), player)
		opponent.body.velocity += to_target.normalized() * float(row.get("shove", 1.2))
		adapter.weapon._combo = adapter.weapon._combo + 1 \
			if adapter.weapon._combo_t > 0.0 else 1
		adapter.weapon._combo_t = 1.2
		if adapter.weapon._combo % 3 == 0:
			lab_round.score("player", "clean_combo")
			if int(adapter.condition.get("martial_arts", 0)) >= 2:
				lab_round.knockdown("opponent", "player")
	return true


func _physical_melee_clear(target: CollisionObject3D) -> bool:
	var query := PhysicsRayQueryParameters3D.create(
		player.global_position + Vector3(0, 0.25, 0),
		target.global_position + Vector3(0, 0.85, 0))
	var excluded: Array[RID] = weapon_exclusions()
	excluded.append(target.get_rid())
	query.exclude = excluded
	return player.get_world_3d().direct_space_state.intersect_ray(query).is_empty()


func weapon_exclusions() -> Array[RID]:
	var excluded: Array[RID] = []
	if adapter != null and "parts" in adapter:
		for part in (adapter.parts as Dictionary).values():
			if part is CollisionObject3D:
				excluded.append((part as CollisionObject3D).get_rid())
	return excluded


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
			KEY_U: cycle_surface()
			KEY_I: cycle_condition()
			KEY_K: toggle_camera_wall()
			KEY_L: toggle_controller_calibration()
			KEY_N: cycle_scenario()
			KEY_B: cycle_transport()
			KEY_M: cycle_chaos_load()
			KEY_V: hud.toggle_verdict()
			KEY_Z:
				if current_station == "VEHICLE DAMAGE BAY" and impact_bay != null:
					impact_bay.cycle_vehicle()
			KEY_X:
				if current_station == "VEHICLE DAMAGE BAY" and impact_bay != null:
					impact_bay.cycle_zone()
			KEY_P:
				if current_station == "VEHICLE DAMAGE BAY" and impact_bay != null:
					impact_bay.cycle_preset()
			KEY_C:
				if current_station == "VEHICLE DAMAGE BAY" and impact_bay != null:
					impact_bay.apply_selected()
			KEY_BACKSPACE: reset_station()
	elif event is InputEventJoypadButton and event.pressed:
		match (event as InputEventJoypadButton).button_index:
			JOY_BUTTON_DPAD_RIGHT: _cycle_opponent_behavior()
			JOY_BUTTON_DPAD_LEFT: cycle_surface()
			JOY_BUTTON_DPAD_UP: cycle_condition()
			JOY_BUTTON_DPAD_DOWN: toggle_camera_wall()
			JOY_BUTTON_Y: cycle_body_mode()
			JOY_BUTTON_LEFT_SHOULDER: cycle_scenario()
			JOY_BUTTON_BACK: toggle_replay_freeze()
			JOY_BUTTON_START: reset_station()


func emit_noise(_at: Vector3, _radius: float, _kind: String = "") -> void:
	pass


func grant_xp(_id: String, _amount: float) -> void:
	pass


func on_explosion(_at: Vector3, _damage: float, _blast: float) -> void:
	pass


func _exit_tree() -> void:
	Engine.time_scale = _prior_time_scale
