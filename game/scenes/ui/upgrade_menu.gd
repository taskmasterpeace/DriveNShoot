extends CanvasLayer

@onready var scrap_label = $Panel/ScrapLabel
@onready var cards = [
	$Panel/HBox/Card1,
	$Panel/HBox/Card2,
	$Panel/HBox/Card3
]
@onready var back_button = $Panel/BackButton

var upgrades_data = {
	"kits": { 
		"costs": [15, 35, 70], 
		"desc": ["Start with 1 Kit", "Start with 2 Kits", "Start with 3 Kits", "Start with 4 Kits"] 
	},
	"reliability": { 
		"costs": [20, 45, 90], 
		"desc": ["Base Breakdown", "-20% Chance", "-40% Chance", "-55% Chance"] 
	},
	"armor": { 
		"costs": [15, 40, 85], 
		"desc": ["Base Armor", "-10% Damage", "-20% Damage", "-30% Damage"] 
	}
}

var upgrade_keys: Array[String] = ["kits", "reliability", "armor"]

@onready var vehicles_button: Button = $Panel/VehiclesButton
const VEHICLE_SELECTOR_SCENE: PackedScene = preload("res://scenes/ui/vehicle_selector.tscn")
var vehicle_selector_instance: CanvasLayer = null
var weapon_shop: VBoxContainer = null

func _ready() -> void:
	visible = false
	back_button.pressed.connect(func(): close())

	if has_node("Panel/VehiclesButton"):
		vehicles_button = $Panel/VehiclesButton
		vehicles_button.pressed.connect(_open_vehicles)

	for i in range(3):
		var btn: Button = cards[i].get_node("BuyButton")
		btn.pressed.connect(_buy.bind(i))

	# Instantiate vehicle selector
	vehicle_selector_instance = VEHICLE_SELECTOR_SCENE.instantiate()
	add_child(vehicle_selector_instance)

	_build_weapon_shop()

## Builds the arms-dealer weapon list in code (buy / equip your vehicle's primary gun).
func _build_weapon_shop() -> void:
	var gs = get_node_or_null("/root/GameState")
	if not gs or not has_node("Panel"):
		return
	weapon_shop = VBoxContainer.new()
	weapon_shop.position = Vector2(40, 360)
	weapon_shop.add_theme_constant_override("separation", 4)
	$Panel.add_child(weapon_shop)

	var title := Label.new()
	title.text = "ARMS DEALER"
	weapon_shop.add_child(title)

	if not gs.weapons_changed.is_connected(_refresh_weapon_shop):
		gs.weapons_changed.connect(_refresh_weapon_shop)
	_refresh_weapon_shop()

func _refresh_weapon_shop() -> void:
	var gs = get_node_or_null("/root/GameState")
	if not gs or not weapon_shop:
		return
	# Clear old rows, keep the title at index 0.
	for i in range(weapon_shop.get_child_count() - 1, 0, -1):
		weapon_shop.get_child(i).queue_free()

	for id in gs.WEAPON_ORDER:
		var entry = gs.WEAPON_CATALOG[id]
		var btn := Button.new()
		if gs.equipped_weapon_id == id:
			btn.text = "%s — EQUIPPED" % entry["name"]
			btn.disabled = true
		elif gs.owned_weapons.has(id):
			btn.text = "%s — EQUIP" % entry["name"]
		else:
			btn.text = "%s — BUY (%d)" % [entry["name"], entry["price"]]
			btn.disabled = gs.scrap < entry["price"]
		btn.pressed.connect(_on_weapon_pressed.bind(id))
		weapon_shop.add_child(btn)

func _on_weapon_pressed(id: String) -> void:
	var gs = get_node_or_null("/root/GameState")
	if not gs:
		return
	if gs.owned_weapons.has(id):
		gs.equip_weapon(id)
	else:
		gs.try_buy_weapon(id)
	_refresh_weapon_shop()
	_update_ui()

func _open_vehicles() -> void:
	vehicle_selector_instance.open()

func open() -> void:
	visible = true
	get_tree().paused = true # Pause game logic while in menu (if desired)
	_update_ui()
	
func close() -> void:
	visible = false
	get_tree().paused = false
	
func _update_ui() -> void:
	var gs = get_node("/root/GameState")
	scrap_label.text = "Scrap: %d" % gs.scrap
	
	for i in range(3):
		var key = upgrade_keys[i]
		var data = upgrades_data[key]
		var tier = 0
		if key == "kits": tier = gs.kits_tier
		elif key == "reliability": tier = gs.reliability_tier
		elif key == "armor": tier = gs.armor_tier
		
		var card = cards[i]
		
		# Name already set in scene
		var desc_lbl = card.get_node("Desc")
		var cost_lbl = card.get_node("Cost")
		var btn = card.get_node("BuyButton")
		
		var current_effect = data.desc[tier]
		var next_effect = "MAXED"
		var cost = 0
		
		if tier < 3:
			next_effect = data.desc[tier+1]
			cost = data.costs[tier]
			cost_lbl.text = "Cost: %d" % cost
			btn.disabled = gs.scrap < cost
			btn.text = "BUY"
		else:
			cost_lbl.text = "MAXED"
			btn.disabled = true
			btn.text = "MAX"
			
		desc_lbl.text = "Current: %s\nNext: %s" % [current_effect, next_effect]

func _buy(index: int) -> void:
	var gs = get_node("/root/GameState")
	var key = upgrade_keys[index]
	
	if gs.try_buy_upgrade(key):
		_update_ui()
