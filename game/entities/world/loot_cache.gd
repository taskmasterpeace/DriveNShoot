class_name LootCache
extends StaticBody2D

enum CacheType { MIXED, FUEL, SCRAP }
@export var type: CacheType = CacheType.MIXED
var is_opened: bool = false
@export var loot_amount: int = 1 # Repair Kits

func get_interaction_text() -> String:
	match type:
		CacheType.FUEL: return "Syphoning..." if not is_opened else "Empty"
		CacheType.SCRAP: return "Scavenging Scrap..." if not is_opened else "Empty"
		_: return "Scavenging..." if not is_opened else "Empty"

func can_interact() -> bool:
	return not is_opened

func open(player: Node2D) -> void:
	if is_opened: return
	is_opened = true
	
	var r = randf()
	var text = "Empty..."
	
	if type == CacheType.FUEL:
		# Fake Fuel: Just scrap for now or special message
		var amount = randi_range(20, 50)
		if has_node("/root/GameState"):
			get_node("/root/GameState").add_scrap(amount)
		text = "Found Fuel! (+%d Scrap)" % amount
		
	elif type == CacheType.SCRAP:
		var amount = randi_range(15, 40)
		if has_node("/root/GameState"):
			get_node("/root/GameState").add_scrap(amount)
		text = "Found %d Scrap!" % amount
		
	else: # MIXED
		if r < 0.6: # 60% Kit
			if player.has_method("add_repair_kit"):
				player.add_repair_kit(loot_amount)
				text = "Found Repair Kit!"
		elif r < 0.9: # 30% Scrap
			var amount = randi_range(10, 30)
			if has_node("/root/GameState"):
				get_node("/root/GameState").add_scrap(amount)
			text = "Found %d Scrap!" % amount
		elif r < 0.95: # 5% Data Fragment (Rare!)
			if has_node("/root/GameState"):
				get_node("/root/GameState").add_fragment(1)
			text = "FOUND DATA FRAGMENT!"
		else:
			# 5% Junk
			text = "Junk..."
		
	print(text)
	if player.has_method("notify_action"):
		player.notify_action(text, 1.0) # Show result briefly
		
	# GameState Heat handled by controller
		
	# Visual feedback
	modulate = Color(0.5, 0.5, 0.5)
	# Or Queue Free?
	# Better to leave it as "looted" empty prop so player sees they got it.
