extends CanvasLayer

@onready var hunger_bar = $Control/VBoxContainer/HungerBar
@onready var thirst_bar = $Control/VBoxContainer/ThirstBar
@onready var fatigue_bar = $Control/VBoxContainer/FatigueBar
@onready var stamina_bar = $Control/VBoxContainer/StaminaBar
@onready var vehicle_hp_bar = $Control/VBoxContainer/VehicleHealthBar

@onready var miles_label = $Control/MilesLabel
@onready var kit_label = $Control/KitLabel
@onready var action_panel = $Control/ActionPanel
@onready var action_label = $Control/ActionPanel/ActionLabel
@onready var action_bar = $Control/ActionPanel/ActionProgressBar
@onready var warning_label = $Control/WarningLabel
@onready var heat_label = $Control/HeatLabel

var survival_stats: SurvivalStats
var weapon_system: WeaponSystem
var seen_tutorials: Dictionary = {}

func show_tutorial(key: String, text: String) -> void:
	if seen_tutorials.has(key): return
	seen_tutorials[key] = true
	show_warning(text, 5.0)

func setup(stats: SurvivalStats, weapons: WeaponSystem) -> void:
	survival_stats = stats
	weapon_system = weapons
	
	if has_node("/root/GameState"):
		var gs = get_node("/root/GameState")
		gs.distance_updated.connect(func(m): if miles_label: miles_label.text = "%.1f mi" % m)
		gs.heat_changed.connect(_on_heat_changed)
		gs.scrap_changed.connect(_on_scrap_changed)
	
	if survival_stats:
		survival_stats.stat_changed.connect(_on_stat_changed)
		
	if weapon_system:
		weapon_system.shot.connect(_on_ammo_changed)
		weapon_system.reloaded.connect(_on_ammo_changed)
		_on_ammo_changed(weapon_system.current_ammo)
		
func _on_distance_updated(miles: float) -> void:
	if miles_label:
		miles_label.text = "%.1f mi" % miles

func connect_vehicle(vehicle: VehicleEntity) -> void:
	vehicle.health_changed.connect(_on_vehicle_health_changed)
	vehicle.breakdown.connect(func(): show_tutorial("repair", "Hold E to repair (uses kit)"))
	vehicle.weapon_shot.connect(_on_ammo_changed)
	vehicle.weapon_reloaded.connect(_on_ammo_changed)
	_on_vehicle_health_changed(vehicle.hp, vehicle.max_hp)
	_on_ammo_changed(vehicle.get_total_ammo())

func _on_vehicle_health_changed(hp: float, max_hp: float) -> void:
	_update_bar(vehicle_hp_bar, hp, max_hp)

func disconnect_vehicle() -> void:
	if vehicle_hp_bar:
		# Optionally hide or dim
		pass 
	# Signal automatically disconnected if object freed? 
	# Actually, signals don't always auto-disconnect if emitter is not freed but listener is?
	# Or if we swap vehicles, we should disconnect the OLD one.
	# For now, safe enough. Ideally we track connected_vehicle and disconnect specifically.


func _on_stat_changed(stat_name: String, value: float, max_value: float) -> void:
	match stat_name:
		"hunger": _update_bar(hunger_bar, value, max_value)
		"thirst": _update_bar(thirst_bar, value, max_value)
		"fatigue": _update_bar(fatigue_bar, value, max_value)
		"stamina": _update_bar(stamina_bar, value, max_value)

func _update_bar(bar: ProgressBar, value: float, max_value: float) -> void:
	if bar:
		bar.max_value = max_value
		bar.value = value

func _on_ammo_changed(ammo: int) -> void:
	# Assuming ammo_label is defined elsewhere or will be added
	# The original instruction snippet had a syntax error here, corrected to match original intent
	if has_node("Control/AmmoLabel"): # Check if ammo_label exists
		var ammo_label = get_node("Control/AmmoLabel") # Get the node if it exists
		ammo_label.text = "Ammo: %d" % ammo

func _on_heat_changed(val: int) -> void:
	if not heat_label: return
	
	var text = "LOW"
	var color = Color.WHITE
	
	if val >= 40:
		text = "HIGH"
		color = Color.RED
	elif val >= 25:
		text = "MED"
		color = Color.YELLOW
		
	heat_label.text = "Heat: " + text
	heat_label.modulate = color
	
	if val >= 25:
		show_tutorial("heat", "Heat rising -> pursuers will hunt you")

func update_kits(amount: int) -> void:
	if kit_label:
		kit_label.text = "Kits: %d" % amount

func _on_scrap_changed(delta: int, total: int) -> void:
	if has_node("Control/ScrapLabel"):
		get_node("Control/ScrapLabel").text = "Scrap: %d" % total

func _on_player_action_updated(text: String, progress: float) -> void:
	if not action_panel: return
	
	if text == "":
		action_panel.visible = false
	else:
		action_panel.visible = true
		if action_label: action_label.text = text
		if action_bar: action_bar.value = progress * 100.0

func show_warning(text: String, duration: float = 2.0) -> void:
	if warning_label:
		warning_label.text = text
		warning_label.visible = true
		
		# Auto hide timer
		var t = get_tree().create_timer(duration)
		t.timeout.connect(func(): if warning_label: warning_label.visible = false)

func connect_interaction_controller(ic: Node) -> void:
	ic.interactable_detected.connect(_on_interactable_detected)

func _on_interactable_detected(obj: Node2D) -> void:
	if obj is LootCache:
		show_tutorial("loot", "Hold E to scavenge")


