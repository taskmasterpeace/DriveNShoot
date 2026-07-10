## Standalone, save-free comparison space for character physics, grip/aim,
## combat, throwing, cameras, and later vehicle deformation.
class_name ProtoPhysicsCombatLab
extends Node3D

const INPUT_SCRIPT := preload("res://proto3d/tools/physics_lab/lab_input.gd")
const ADAPTER_SCRIPT := preload("res://proto3d/tools/physics_lab/lab_body_adapter.gd")
const HUD_SCRIPT := preload("res://proto3d/tools/physics_lab/lab_hud.gd")
const THROWABLE_SCRIPT := preload("res://proto3d/throwable.gd")

var save_isolated: bool = true
var lab_mode: bool = true
var active_mode: String = "hybrid"
var stations: Dictionary = {}
var current_station: String = "BODY LANE"
var station_spawn: Transform3D = Transform3D(Basis.IDENTITY, Vector3(0, 0.05, 0))
var adapter: Node = null
var player: Node3D = null
var character: ProtoCharacter = ProtoCharacter.new()
var hud: CanvasLayer = null
var camera: Camera3D = null
var input_source: RefCounted = null
var current_scenario: String = "free_play"
var opponent_behavior: String = "PASSIVE"
var _prior_time_scale: float = 1.0
var _throw_hold: float = 0.0
var _last_command: RefCounted = null


func _ready() -> void:
	_prior_time_scale = Engine.time_scale
	ProtoInputMap.ensure()
	_build_world()
	input_source = INPUT_SCRIPT.new()
	hud = HUD_SCRIPT.new()
	add_child(hud)
	hud.setup()
	switch_mode("hybrid")
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

	ProtoWorldBuilder.box_body(self, Vector3(132, 0.4, 38), Vector3(52, -0.2, 0),
		Color("#282622"))
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


func switch_mode(id: String) -> bool:
	if id != "hybrid":
		return false
	var at: Transform3D = station_spawn
	if adapter != null:
		at = player.global_transform
		adapter.queue_free()
	adapter = ADAPTER_SCRIPT.new()
	add_child(adapter)
	adapter.setup({})
	active_mode = id
	player = adapter.combat_body()
	adapter.reset_at(at)
	return true


func start_scenario(id: String) -> void:
	current_scenario = id
	reset_station()


func reset_station() -> void:
	if adapter == null:
		return
	adapter.reset_at(station_spawn)
	character.hp = 100.0
	character.dead = false
	for part in character.body.values():
		part.hp = part.max_hp
	adapter.weapon.mag = int(adapter.weapon.info()["mag_size"])
	_throw_hold = 0.0


func feed_for_test(source: Variant) -> void:
	input_source.feed_for_test(source)


func _physics_process(delta: float) -> void:
	if adapter == null or player == null:
		return
	var command: RefCounted = input_source.sample(camera, player.global_position, delta)
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
		String(adapter.condition.get("id", "fresh")).to_upper(), opponent_behavior)
	var desired: Vector3 = player.global_position + Vector3(10, 20, 17)
	camera.global_position = camera.global_position.lerp(desired, clampf(delta * 4.0, 0.0, 1.0))
	camera.look_at(player.global_position + Vector3(3, 0, 0), Vector3.UP)


func _fire_weapon(command: RefCounted) -> void:
	if adapter.weapon.mag <= 0:
		return
	var direction: Vector3 = command.get("aim_world")
	if adapter.weapon.fire(self, adapter.muzzle_world(), direction):
		player.gun_recoil(adapter.weapon.info().get("recoil", {}), character.level("strength"))


func _release_throw(command: RefCounted) -> void:
	var row: Dictionary = THROWABLE_SCRIPT.row("grenade")
	var charge: float = THROWABLE_SCRIPT.charge_for(_throw_hold, row)
	var inherited: Vector3 = player.velocity
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
			KEY_F4: reset_station()


func emit_noise(_at: Vector3, _radius: float, _kind: String = "") -> void:
	pass


func grant_xp(_id: String, _amount: float) -> void:
	pass


func on_explosion(_at: Vector3, _damage: float, _blast: float) -> void:
	pass


func _exit_tree() -> void:
	Engine.time_scale = _prior_time_scale
