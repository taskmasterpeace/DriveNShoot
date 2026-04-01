## Test scene for vehicle driving mechanics.
## Walk around with WASD/Arrows, press E near a car to enter, drive with WASD/Arrows, press E to exit.
extends Node2D

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

	_update_instructions()

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
			instructions_label.text = "WASD/Arrows/Stick = Drive | R2/L2 = Gas/Brake | Space/Square = Handbrake | E/X = Exit"
		else:
			instructions_label.text = "WASD/Arrows/Stick = Walk | E/X = Enter Vehicle (get close to a car)"
