extends CanvasLayer

@onready var container = $Panel/HBoxContainer
@onready var close_button = $Panel/CloseButton

# Card Preset
const CARD_SCENE = preload("res://game/scenes/ui/vehicle_card.tscn")

func _ready() -> void:
	visible = false
	close_button.pressed.connect(close)
	
	if has_node("/root/GameState"):
		get_node("/root/GameState").vehicle_unlocked.connect(_on_unlock)

func open() -> void:
	visible = true
	_refresh_cards()
	get_tree().paused = true

func close() -> void:
	visible = false
	get_tree().paused = false

func _refresh_cards() -> void:
	for child in container.get_children():
		child.queue_free()
		
	var ids = ["balanced", "fast", "tank"]
	var names = ["Scavenger", "Interceptor", "Behemoth"]
	var reqs = ["Default", "Unlock: 2000 Scrap", "Unlock: 5000 Scrap"]
	
	var gs = get_node("/root/GameState")
	
	for i in range(ids.size()):
		var id = ids[i]
		var card = CARD_SCENE.instantiate()
		container.add_child(card)
		
		var is_unlocked = gs.unlocked_vehicles.has(id)
		var is_selected = gs.selected_vehicle_id == id
		
		card.setup(names[i], reqs[i], is_unlocked, is_selected)
		card.selected.connect(func(): _on_card_selected(id))

func _on_card_selected(id: String) -> void:
	var gs = get_node("/root/GameState")
	gs.select_vehicle(id)
	_refresh_cards() # Update selected state

func _on_unlock(_id: String) -> void:
	if visible:
		_refresh_cards()
