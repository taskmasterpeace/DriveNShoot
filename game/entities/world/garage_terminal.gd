class_name GarageTerminal
extends StaticBody2D

# Reuse InteractionController "interactable" group logic if possible
# But LootCache used specific class check.
# We should update InteractionController to handle "GarageTerminal".

const UPGRADE_MENU_SCENE = preload("res://scenes/ui/upgrade_menu.tscn")
var menu_instance = null

func _ready() -> void:
	menu_instance = UPGRADE_MENU_SCENE.instantiate()
	add_child(menu_instance)

func can_interact() -> bool:
	return true

func get_interaction_text() -> String:
	return "Open Garage"

func open_menu() -> void:
    # We want a main menu for the garage now? Or just tab between Upgrades and Vehicles?
    # For now, let's keep it simple: Upgrade Menu is default, maybe add a button THERE to switch?
    # OR: Just open Upgrade Menu, and I'll add a "VEHICLES" button to the Upgrade Menu.
	if menu_instance:
		menu_instance.open()
