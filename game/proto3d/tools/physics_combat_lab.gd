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
var _prior_time_scale: float = 1.0
var _throw_hold: float = 0.0
var _last_command: RefCounted = null
const OPPONENT_BEHAVIORS: Array[String] = ["passive", "return_fire", "hunter", "duel"]


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
	add_child(world_env)
	var sun := DirectionalLight3D.new()
	sun.rotation_degrees = Vector3(-52, -28, 0)
	sun.light_color = Color("#ffe0a8")
	sun.light_energy = 1.25
	sun.shadow_enabled = true
	add_child(sun)

	# Long enough to measure a full sprint, dive recovery, and charged throws
	# without a physics body reaching the edge during one comparison pass.
	ProtoWorldBuilder.box_body(self, Vector3(132, 0.4, 160), Vector3(52, -0.2, 0),
		Color("#282622"))
	_build_navigation_floor()
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


func _build_navigation_floor() -> void:
	var region := NavigationRegion3D.new()
	region.name = "LabNavigation"
	var nav := NavigationMesh.new()
	nav.vertices = PackedVector3Array([
		Vector3(-12, 0.05, -76), Vector3(116, 0.05, -76),
		Vector3(116, 0.05, 76), Vector3(-12, 0.05, 76)])
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
	var command: RefCounted = input_source.sample(camera, player.global_position, delta)
	if lab_round != null and lab_round.commands_frozen():
		var frozen: RefCounted = COMMAND_SCRIPT.new()
		frozen.set("aim_world", command.get("aim_world"))
		command = frozen
	_last_command = command
	adapter.apply_command(command, delta)
	adapter.weapon.tick(delta, self)
	if bool(command.get("fire_pressed")) or (bool(command.get("fire_held")) and adapter.weapon.is_automatic()):
		_fire_weapon(command)
	if bool(command.get("throw_pressed")):
		_throw_hold = 0.0
	if bool(command.get("throw_held")):
		_throw_hold += delta
	if bool(command.get("throw_released")):
		_release_throw(command)
	_update_station()
	var metrics: Dictionary = adapter.metrics()
	hud.refresh(active_mode, current_station, adapter.weapon, metrics,
		String(adapter.condition.get("id", "fresh")).to_upper(), _round_readout())
	var desired: Vector3 = player.global_position + Vector3(10, 20, 17)
	camera.global_position = camera.global_position.lerp(desired, clampf(delta * 4.0, 0.0, 1.0))
	camera.look_at(player.global_position + Vector3(3, 0, 0), Vector3.UP)


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


func _fire_weapon(command: RefCounted) -> void:
	if adapter.weapon.mag <= 0:
		return
	var direction: Vector3 = command.get("aim_world")
	if adapter.weapon.fire(self, adapter.muzzle_world(), direction):
		adapter.apply_recoil(direction, adapter.weapon.info().get("recoil", {}),
			character.level("strength"))


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
