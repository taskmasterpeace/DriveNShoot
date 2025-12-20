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

var upgrade_keys = ["kits", "reliability", "armor"]

func _ready() -> void:
	visible = false
@onready var vehicles_button = $Panel/VehiclesButton
const VEHICLE_SELECTOR_SCENE = preload("res://game/scenes/ui/vehicle_selector.tscn")
var vehicle_selector_instance = null

func _ready() -> void:
	visible = false
	back_button.pressed.connect(func(): close())
	
	if has_node("Panel/VehiclesButton"):
		vehicles_button = $Panel/VehiclesButton
		vehicles_button.pressed.connect(_open_vehicles)
	
	for i in range(3):
		var btn = cards[i].get_node("BuyButton")
		btn.pressed.connect(func(): _buy(i))
		
	# Instantiate selector
	vehicle_selector_instance = VEHICLE_SELECTOR_SCENE.instantiate()
	add_child(vehicle_selector_instance)

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
		print("Bought %s" % key)
