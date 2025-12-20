class_name GardenPlot
extends Area2D

## GardenPlot
## Simple farming plot. Plants seeds, grows over days.

enum State { EMPTY, PLANTED, GROWING, READY }
var state = State.EMPTY

@onready var sprite = $Sprite2D
@onready var plant_timer = $PlantTimer # Optional, if we want real-time instead of day-based

var days_growing: int = 0
var days_to_grow: int = 3

func _ready() -> void:
	if has_node("/root/TimeSystem"):
		get_node("/root/TimeSystem").day_changed.connect(_on_day_changed)
	update_visuals()

func interact(player: Node2D) -> void:
	match state:
		State.EMPTY:
			# In a full system, check player inventory for seeds
			plant_seed()
		State.READY:
			harvest()

func plant_seed() -> void:
	print("Planted seed.")
	state = State.PLANTED
	days_growing = 0
	update_visuals()

func _on_day_changed(_day: int) -> void:
	if state == State.PLANTED or state == State.GROWING:
		days_growing += 1
		if days_growing >= days_to_grow:
			state = State.READY
			print("Crop is ready!")
		else:
			state = State.GROWING
		update_visuals()

func harvest() -> void:
	print("Harvested crop!")
	state = State.EMPTY
	update_visuals()

func update_visuals() -> void:
	if not sprite: return
	
	match state:
		State.EMPTY:
			sprite.modulate = Color(0.4, 0.2, 0.1) # Brown soil
		State.PLANTED:
			sprite.modulate = Color(0.4, 0.6, 0.1) # Greenish tint (seeds)
		State.GROWING:
			sprite.modulate = Color(0.2, 0.8, 0.2) # Growing green
		State.READY:
			sprite.modulate = Color(1.0, 0.8, 0.2) # Golden wheat
