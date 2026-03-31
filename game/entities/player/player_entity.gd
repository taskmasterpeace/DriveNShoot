## This script is attached to the Player node and is specifically designed to represent player entities in the game.
## The Player node serves as the foundation for creating main playable characters.
class_name PlayerEntity
extends CharacterEntity

@export_group("States")
@export var on_transfer_start: State ## State to enable when player starts transfering.
@export var on_transfer_end: State ## State to enable when player ends transfering.

var player_id: int = 1 ## A unique id that is assigned to the player on creation. Player 1 will have player_id = 1 and each additional player will have an incremental id, 2, 3, 4, and so on.
var equipped = 0 ## The id of the weapon equipped by the player.
var repair_kits: int = 1
var hud_instance: CanvasLayer


signal kits_changed(amount: int)
signal action_updated(text: String, progress: float)

var _extract_timer: float = 0.0
const EXTRACT_TIME: float = 2.0


func _process(delta: float) -> void:
	super._process(delta) # If parent has process
	
	# Extract Logic
	if Input.is_action_pressed("extract"):
		_process_extract(delta)
	elif _extract_timer > 0.0:
		_extract_timer = 0.0
		action_updated.emit("", 0.0)

func _process_extract(delta: float) -> void:
	if velocity.length() > 50.0: # Must be effectively stopped
		_extract_timer = 0.0
		action_updated.emit("Stop to Extract!", 0.0)
		return
		
	if has_node("/root/GameState") and get_node("/root/GameState").current_state == 1: # RUN state
		_extract_timer += delta
		var progress = clamp(_extract_timer / EXTRACT_TIME, 0.0, 1.0)
		action_updated.emit("Extracting...", progress)
		
		if _extract_timer >= EXTRACT_TIME:
			_extract_timer = 0.0
			action_updated.emit("", 0.0)
			get_node("/root/GameState").extract()
	else:
		_extract_timer = 0.0 # Not in run or invalid state

func notify_action(text: String, progress: float) -> void:
	# Public method for controllers to update HUD
	action_updated.emit(text, progress)
	
func show_warning(text: String) -> void:
	if hud_instance and hud_instance.has_method("show_warning"):
		hud_instance.show_warning(text)

func use_repair_kit() -> bool:

	if repair_kits > 0:
		repair_kits -= 1
		kits_changed.emit(repair_kits)
		return true
	return false

func add_repair_kit(amount: int) -> void:
	repair_kits += amount
	kits_changed.emit(repair_kits)




func _ready():
	super._ready()
	Globals.transfer_start.connect(func(): 
		on_transfer_start.enable()
	)
	Globals.transfer_complete.connect(func(): on_transfer_end.enable())
	Globals.destination_found.connect(func(destination_path): _move_to_destination(destination_path))
	
	# Wiring Gameplay Components
	if not survival_stats:
		survival_stats = get_node_or_null("SurvivalStats")
	
	var weapon_system = get_node_or_null("WeaponSystem")
	if weapon_system and weapon:
		weapon_system.initialize(weapon)
		
	var hud_scene = load("res://game/scenes/hud/hud_overlay.tscn")
	if hud_instance:
		hud_instance = hud_scene.instantiate()
		add_child(hud_instance)
		if hud_instance.has_method("setup"):
			hud_instance.setup(survival_stats, weapon_system)
		if hud_instance.has_method("update_kits"):
			kits_changed.connect(hud_instance.update_kits)
		if hud_instance.has_method("update_action"):
			action_updated.connect(hud_instance.update_action)
		
		var interaction_controller = get_node_or_null("InteractionController")
		if interaction_controller and hud_instance.has_method("connect_interaction_controller"):
			hud_instance.connect_interaction_controller(interaction_controller)

			
	# Wire Interaction Controller
	var interaction_controller = get_node_or_null("InteractionController")
	if interaction_controller:
		interaction_controller.entered_vehicle.connect(_on_entered_vehicle)
		interaction_controller.exited_vehicle.connect(_on_exited_vehicle)

	receive_data(DataManager.get_player_data(player_id))
	
	# Apply Kit Upgrade
	if has_node("/root/GameState"):
		repair_kits = get_node("/root/GameState").get_starting_kits()
		kits_changed.emit(repair_kits) # Update HUD immediately


func _on_entered_vehicle(vehicle: Node2D) -> void:
	if hud_instance and hud_instance.has_method("connect_vehicle"):
		hud_instance.connect_vehicle(vehicle)

func _on_exited_vehicle(vehicle: Node2D) -> void:
	if hud_instance and hud_instance.has_method("disconnect_vehicle"):
		hud_instance.disconnect_vehicle()


##Get the player data to save.
func get_data():
	var data = DataPlayer.new()
	var player_data = DataManager.get_player_data(player_id)
	if player_data:
		data = player_data
	data.position = position
	data.facing = facing
	data.hp = health_controller.hp
	data.max_hp = health_controller.max_hp
	data.inventory = inventory.items if inventory else []
	data.equipped = equipped
	return data

##Handle the received player data (from a save file or when moving to another level).
func receive_data(data):
	if data:
		global_position = data.position
		facing = data.facing
		if health_controller:
			health_controller.hp = data.hp
			health_controller.max_hp = data.max_hp
		if inventory:
			inventory.items = data.inventory
		equipped = data.equipped

func _move_to_destination(destination_path: String):
	if !destination_path:
		return
	var destination = get_tree().root.get_node(destination_path)
	if !destination:
		return
	var direction = facing
	if destination is Transfer and destination.direction:
		direction = destination.direction.to_vector
	DataManager.save_player_data(player_id, {
		position = destination.global_position,
		facing = direction
	})

func disable_entity(value: bool, delay = 0.0):
	await get_tree().create_timer(delay).timeout
	stop()
	input_enabled = !value
