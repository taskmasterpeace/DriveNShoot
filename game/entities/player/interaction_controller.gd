class_name InteractionController
extends Node

## Handles generic interactions (Vehicles, Doors, NPCs, Loot)
## Replaces dedicated player_vehicle_controller logic.

@export var player: PlayerEntity
@export var detection_area: Area2D

signal entered_vehicle(vehicle: VehicleEntity)
signal exited_vehicle(vehicle: VehicleEntity)

var interactables: Array[Node2D] = []
var current_vehicle: VehicleEntity = null
var is_in_vehicle: bool = false

func _ready() -> void:
	if detection_area:
		detection_area.body_entered.connect(_on_body_entered)
		detection_area.body_exited.connect(_on_body_exited)
		detection_area.area_entered.connect(_on_area_entered) # For Area2D interactables (like GardenPlot)
		detection_area.area_exited.connect(_on_area_exited)

var hold_timer: float = 0.0
const REPAIR_TIME: float = 2.0

func _process(delta: float) -> void:
	if is_in_vehicle:
		# Vehicle handles return input usually, but we can listen for "force exit" if needed
		return
		
	if Input.is_action_pressed("interact"):
		_process_hold_interaction(delta)
	else:
		if hold_timer > 0.0:
			hold_timer = 0.0
			if player.has_method("notify_action"):
				player.notify_action("", 0.0)
		
	if Input.is_action_just_pressed("interact"):

		_try_interact()
		
func _process_hold_interaction(delta: float) -> void:
	var nearest = _get_nearest_interactable()
	if not nearest: return
	
	var is_repair = nearest is VehicleEntity and nearest.get("is_broken")
	var is_loot = nearest is LootCache and nearest.can_interact()
	var is_garage = nearest is GarageTerminal
	
	if is_repair or is_loot or is_garage:
		hold_timer += delta
		var progress = clamp(hold_timer / REPAIR_TIME, 0.0, 1.0)
		
		# Feedback Text
		var action_text = "Repairing..."
		if is_loot or is_garage:
			action_text = nearest.get_interaction_text()
			
		if player.has_method("notify_action"):
			player.notify_action(action_text, progress)
			
		if hold_timer >= REPAIR_TIME:
			if is_repair:
				_perform_repair(nearest)
			elif is_loot:
				_perform_loot(nearest)
			elif is_garage:
				nearest.open_menu()
				
			hold_timer = 0.0
			if player.has_method("notify_action"):
				player.notify_action("", 0.0)

func _perform_loot(cache: LootCache) -> void:
	cache.open(player)
	if has_node("/root/GameState"):
		get_node("/root/GameState").add_heat(10, "Loot")

func _perform_repair(vehicle: VehicleEntity) -> void:
	if player.use_repair_kit():
		vehicle.repair()
		if has_node("/root/GameState"):
			get_node("/root/GameState").add_heat(15, "Repair")
		print("Repair Complete! Kits remaining: %d" % player.repair_kits)
	else:
		if player.has_method("notify_action"):
			player.notify_action("No Repair Kits!", 0.0) # Flash error
			# Ideally clear after delay, but this works for now to interrupt bar
		print("No Repair Kits!")
		hold_timer = 0.0 # Reset to prevent spamming

func _get_nearest_interactable() -> Node2D:
	if interactables.is_empty():
		return null
	
	var nearest: Node2D = null
	var nearest_dist: float = INF
	
	for obj in interactables:
		var dist = player.global_position.distance_to(obj.global_position)
		if dist < nearest_dist:
			nearest_dist = dist
			nearest = obj
	return nearest
	
func _try_interact() -> void:
	if interactables.is_empty():
		return
	
	var nearest = _get_nearest_interactable()
	
	if nearest:
		if nearest is VehicleEntity:
			if nearest.get("is_broken"):
				if player.has_method("show_warning"): player.show_warning("Hold E to Repair")
				else: print("Vehicle is Broken! Hold E to Repair.")
				return
			enter_vehicle(nearest)
		elif nearest is LootCache:
			if nearest.can_interact():
				if player.has_method("show_warning"): player.show_warning("Hold E to Scavenge")
			return
		elif nearest.has_method("interact"):
			# ... rest of interaction logic

			if nearest.has_method("interact_with"):
				nearest.interact_with(player)
			else:
				nearest.interact()

# --- Vehicle Logic (Migrated) ---
func enter_vehicle(vehicle: VehicleEntity) -> void:
	if is_in_vehicle or not vehicle: return
	if vehicle.has_method("can_enter") and not vehicle.can_enter(player): return

	current_vehicle = vehicle
	is_in_vehicle = true

	player.visible = false
	player.process_mode = Node.PROCESS_MODE_DISABLED
	# Physics process disabled by process_mode
	
	if player.has_node("CollisionShape2D"):
		player.get_node("CollisionShape2D").disabled = true

	vehicle.driver_exited.connect(_on_driver_exited, CONNECT_ONE_SHOT)
	vehicle.enter_vehicle(player)
	vehicle.enter_vehicle(player)
	entered_vehicle.emit(vehicle)

func _on_driver_exited(driver: Node2D) -> void:
	if driver == player:
		exit_vehicle()

func exit_vehicle() -> void:
	if not is_in_vehicle or not current_vehicle: return

	var vehicle = current_vehicle
	is_in_vehicle = false
	var exit_pos = vehicle.get_exit_position()

	player.global_position = exit_pos
	player.visible = true
	player.process_mode = Node.PROCESS_MODE_INHERIT
	
	if player.has_node("CollisionShape2D"):
		player.get_node("CollisionShape2D").disabled = false

	current_vehicle = null
	exited_vehicle.emit(vehicle)

signal interactable_detected(obj: Node2D)

func _on_body_entered(body: Node2D) -> void:
	if body == player: return
	if body.is_in_group("interactable") or body is VehicleEntity or body is LootCache:
		if body not in interactables:
			interactables.append(body)
			interactable_detected.emit(body)

func _on_body_exited(body: Node2D) -> void:
	if body in interactables:
		interactables.erase(body)

func _on_area_entered(area: Area2D) -> void:
	var parent = area.get_parent() # Assuming parent is the interactable
	if parent and (parent.is_in_group("interactable") or parent is LootCache):
		if parent not in interactables:
			interactables.append(parent)
			interactable_detected.emit(parent)
			
func _on_area_exited(area: Area2D) -> void:
	var parent = area.get_parent()
	if parent in interactables:
		interactables.erase(parent)
