class_name TownNPC
extends StaticBody2D

## A simple interactable town NPC. Press E nearby to hear a cycling flavor line. Code-generated
## (the town zone sets sprite/name/lines). A future step can swap this for branching DialogueManager
## conversations; this gives towns living, talkable characters now.

@export var npc_name: String = "Stranger"
var lines: Array = ["..."]
var _line_idx: int = 0

## Optional DialogueManager branching conversation. When set (and the addon + resource load),
## talking opens a real choice-driven dialogue balloon; otherwise we fall back to cycling lines.
var dialogue_path: String = ""
var dialogue_title: String = ""

## When true, this NPC runs the town mission board: it hands out a bounty contract
## ("wreck N pursuers") and reports progress / pays out on follow-up talks.
var gives_contract: bool = false
var contract_kills: int = 3
var contract_reward: int = 60

func _ready() -> void:
	add_to_group("interactable")
	# Interaction-detection area so the player's InteractionController picks us up (like the garage).
	var area: Area2D = Area2D.new()
	area.collision_layer = 1
	area.collision_mask = 2 # detect the player (character layer)
	var col: CollisionShape2D = CollisionShape2D.new()
	var shape: CircleShape2D = CircleShape2D.new()
	shape.radius = 90.0
	col.shape = shape
	area.add_child(col)
	add_child(area)

func get_interaction_text() -> String:
	return "Talk to %s" % npc_name

func can_interact() -> bool:
	return true

# Presence of interact() is how the InteractionController detects a talkable; interact_with does the work.
func interact() -> void:
	pass

func interact_with(player: Node) -> void:
	if gives_contract:
		_handle_contract(player)
		return
	if dialogue_path != "" and _try_show_dialogue():
		return
	if lines.is_empty():
		return
	var line: String = lines[_line_idx % lines.size()]
	_line_idx += 1
	var text: String = "%s: %s" % [npc_name, line]
	if player and player.has_method("notify_action"):
		player.notify_action(text, 1.0)
	elif player and player.has_method("show_warning"):
		player.show_warning(text)
	print(text)

## Open a DialogueManager balloon for this NPC. Returns false (so we fall back to flavor lines)
## if the addon is missing or the resource can't load — e.g. in a headless context.
func _try_show_dialogue() -> bool:
	var dm := get_node_or_null("/root/DialogueManager")
	if not dm:
		return false
	var res = load(dialogue_path)
	if not res:
		return false
	dm.show_dialogue_balloon(res, dialogue_title)
	return true

## Mission board: offer a bounty, report progress, and acknowledge completion on follow-up talks.
func _handle_contract(player: Node) -> void:
	var gs := get_node_or_null("/root/GameState")
	if not gs:
		return
	var text: String = ""
	if gs.has_active_contract():
		var c: Dictionary = gs.active_contract
		text = "%s: Bounty underway — %d/%d pursuers down. Keep hunting." % [npc_name, c["progress"], c["target"]]
	elif not gs.active_contract.is_empty() and gs.active_contract.get("done", false):
		gs.clear_finished_contract()
		text = "%s: Solid work. Your reward's been wired. Come back for another." % npc_name
	else:
		gs.accept_contract("kills", contract_kills, contract_reward)
		text = "%s: Contract — wreck %d pursuers out in the Deathlands. %d scrap when it's done." % [npc_name, contract_kills, contract_reward]
	if player and player.has_method("notify_action"):
		player.notify_action(text, 1.0)
	elif player and player.has_method("show_warning"):
		player.show_warning(text)
	print(text)
