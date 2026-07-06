class_name LootCache
extends StaticBody2D

enum CacheType { MIXED, FUEL, SCRAP }
@export var type: CacheType = CacheType.MIXED
var is_opened: bool = false
@export var loot_amount: int = 1 # Repair Kits
@export var loot_multiplier: float = 1.0 ## Scales scrap rewards; foot-only ruins set this >1.
@export var pickup_kind: String = "" ## health/ammo/repair/scrap/fuel/armor — set by the spawner so the pickup does what its icon shows.

func _ready() -> void:
	add_to_group("loot") # so the minimap and other systems can locate caches

func get_interaction_text() -> String:
	if is_opened:
		return "Empty"
	match pickup_kind:
		"health": return "Grabbing Medkit..."
		"ammo": return "Restocking Ammo..."
		"repair": return "Taking Repair Kit..."
		_: return "Scavenging..."

func can_interact() -> bool:
	return not is_opened

func open(player: Node2D) -> void:
	if is_opened:
		return
	is_opened = true
	var gs = get_node_or_null("/root/GameState")
	var mult: float = maxf(1.0, loot_multiplier)
	var text := "Empty..."

	match pickup_kind:
		"health":
			var healed: int = int(12 * mult)
			if player and "health_controller" in player and player.health_controller:
				player.health_controller.change_hp(healed, "Medkit")
			text = "Patched up! (+%d HP)" % healed
		"repair":
			if player and player.has_method("add_repair_kit"):
				player.add_repair_kit(loot_amount)
			text = "Found a Repair Kit!"
		"ammo":
			_reload_player_weapons(player)
			text = "Ammo restocked!"
		"scrap", "fuel", "armor":
			var amount: int = int(randi_range(15, 40) * mult)
			if gs:
				gs.add_scrap(amount)
			text = "Found %d Scrap!" % amount
		_:
			text = _open_legacy(player, gs, mult)

	print(text)
	if player and player.has_method("notify_action"):
		player.notify_action(text, 1.0)
	modulate = Color(0.5, 0.5, 0.5) # looted prop

## Reloads the on-foot weapon and any player-owned vehicle's mounted weapons.
func _reload_player_weapons(player: Node2D) -> void:
	if player and "weapon_system" in player and player.weapon_system:
		player.weapon_system.start_reload()
	for v in get_tree().get_nodes_in_group("vehicle"):
		if v is VehicleEntity and v.team == 0:
			for w in v.mounted_weapons:
				w.start_reload()

## Legacy CacheType behaviour for caches placed without a pickup_kind (e.g. ruin caches).
func _open_legacy(player: Node2D, gs, mult: float) -> String:
	if type == CacheType.FUEL:
		var amount: int = int(randi_range(20, 50) * mult)
		if gs: gs.add_scrap(amount)
		return "Found Fuel! (+%d Scrap)" % amount
	if type == CacheType.SCRAP:
		var amount: int = int(randi_range(15, 40) * mult)
		if gs: gs.add_scrap(amount)
		return "Found %d Scrap!" % amount
	# MIXED
	var r := randf()
	if r < 0.6:
		if player and player.has_method("add_repair_kit"):
			player.add_repair_kit(loot_amount)
		return "Found Repair Kit!"
	elif r < 0.9:
		var amount: int = int(randi_range(10, 30) * mult)
		if gs: gs.add_scrap(amount)
		return "Found %d Scrap!" % amount
	elif r < 0.95:
		if gs: gs.add_fragment(1)
		return "FOUND DATA FRAGMENT!"
	return "Junk..."
