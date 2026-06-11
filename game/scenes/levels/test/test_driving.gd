## Test scene for vehicle driving mechanics.
## Walk around with WASD/Arrows, press E near a car to enter, drive with WASD/Arrows, press E to exit.
extends Node2D

const PURSUER_SCENE: PackedScene = preload("res://entities/vehicles/pursuer_vehicle.tscn")

@onready var player: CharacterBody2D = $Player
@onready var instructions_label: Label = $UI/Instructions
@onready var speed_label: Label = $UI/SpeedLabel

var player_in_vehicle: bool = false
var active_vehicle: VehicleEntity = null

func _ready() -> void:
	# Connect ALL vehicle signals so camera works when switching cars
	for v: Node in get_tree().get_nodes_in_group("vehicle"):
		if v is VehicleEntity:
			v.driver_entered.connect(_on_any_vehicle_entered.bind(v))
			v.driver_exited.connect(_on_any_vehicle_exited.bind(v))

	_spawn_test_enemies()
	_add_minimap()
	_update_instructions()

func _add_minimap() -> void:
	var minimap: Minimap = Minimap.new()
	$UI.add_child(minimap)
	minimap.player = player

## Drops a couple of hostile vehicles into the arena so combat is demonstrable on launch:
## a rammer that charges and a shooter that keeps its distance and fires back.
func _spawn_test_enemies() -> void:
	var rammer: PursuerAI = PURSUER_SCENE.instantiate()
	rammer.behavior_type = PursuerAI.BehaviorType.RAMMER
	_configure_test_enemy(rammer, Vector2(-150, -550))

	var shooter: PursuerAI = PURSUER_SCENE.instantiate()
	shooter.behavior_type = PursuerAI.BehaviorType.SHOOTER
	_configure_test_enemy(shooter, Vector2(180, -750))

func _configure_test_enemy(enemy: PursuerAI, spawn_pos: Vector2) -> void:
	# Free-roam chase in the open test arena (no road lane to clamp to).
	enemy.road_center_x = 0.0
	enemy.lane_width = 100000.0
	add_child(enemy)
	enemy.global_position = spawn_pos

func _process(_delta: float) -> void:
	# Update speed display from whichever vehicle is active
	if player_in_vehicle and active_vehicle:
		speed_label.text = "%d MPH" % int(active_vehicle.current_mph)
	else:
		speed_label.text = ""

func _on_any_vehicle_entered(_driver: Node2D, vehicle: VehicleEntity) -> void:
	player_in_vehicle = true
	active_vehicle = vehicle
	_update_instructions()

func _on_any_vehicle_exited(_driver: Node2D, vehicle: VehicleEntity) -> void:
	player_in_vehicle = false
	active_vehicle = null
	_update_instructions()

func _update_instructions() -> void:
	if instructions_label:
		if player_in_vehicle:
			instructions_label.text = "Drive = WASD/Stick | Gas/Brake = R2/L2 | Fire = LMB/RB | Handbrake = Space | Exit = E/X"
		else:
			instructions_label.text = "WASD/Arrows/Stick = Walk | E/X = Enter Vehicle (get close to a car)"
