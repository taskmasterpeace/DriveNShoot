class_name TownZone
extends Node2D

## Town Zone (Safe Hub)
## Contains spawn points and the gate to start a run.

@onready var spawn_point = $SpawnPoint
@onready var return_point = $ReturnPoint
@onready var start_gate = $StartGate

const VEHICLE_SCENE = preload("res://entities/vehicles/vehicle_entity.tscn")
var current_vehicle: Node2D = null

func _ready() -> void:
	if start_gate:
		start_gate.body_entered.connect(_on_gate_entered)
		
	spawn_vehicle()
	if has_node("/root/GameState"):
		var gs := get_node("/root/GameState")
		gs.vehicle_selected.connect(func(_id): spawn_vehicle())
		# Respawn a fresh town vehicle whenever the player returns to town after a run.
		gs.state_changed.connect(func(s): if s == 0: spawn_vehicle()) # 0 = TOWN

func spawn_vehicle() -> void:
	if current_vehicle:
		current_vehicle.queue_free()
		current_vehicle = null
		
	var gs = get_node_or_null("/root/GameState")
	if not gs: return
	
	current_vehicle = VEHICLE_SCENE.instantiate()
	current_vehicle.data = gs.get_selected_vehicle_data()
	add_child(current_vehicle)
	current_vehicle.global_position = spawn_point.global_position
	# Ensure it's active? Or empty waiting for driver?
	# Waiting for driver.

func _on_gate_entered(body: Node2D) -> void:
	if body.is_in_group("player"):
		print("Player entered Start Gate -> triggering run.")
		if has_node("/root/GameState"):
			get_node("/root/GameState").start_run()
