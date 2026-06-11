class_name TownZone
extends Node2D

## Town Zone (Safe Hub)
## Contains spawn points and the gate to start a run.

@onready var spawn_point = $SpawnPoint
@onready var return_point = $ReturnPoint
@onready var start_gate = $StartGate

const VEHICLE_SCENE = preload("res://entities/vehicles/vehicle_entity.tscn")
const NPC_SCRIPT = preload("res://entities/npcs/town_npc.gd")
var current_vehicle: Node2D = null

func _ready() -> void:
	if start_gate:
		start_gate.body_entered.connect(_on_gate_entered)
		
	spawn_vehicle()
	if has_node("/root/GameState"):
		var gs := get_node("/root/GameState")
		gs.vehicle_selected.connect(func(_id): spawn_vehicle())
		# Respawn a fresh town vehicle whenever the player returns to town after a run.
		gs.state_changed.connect(func(s): if s == 0: spawn_vehicle()) # 0 = TOWN

	_decorate()

## Populates the town with buildings, props, and talkable NPCs for visual life.
func _decorate() -> void:
	var buildings := [
		["building_garage", Vector2(280, -160)],
		["building_shop", Vector2(-320, -150)],
		["building_gas_station", Vector2(360, 180)],
		["building_bunker", Vector2(-360, 220)],
		["building_guard_tower", Vector2(0, -470)],
	]
	for b in buildings:
		_spawn_building("res://entities/world/sprites/%s.png" % b[0], b[1], 0.8)

	for bp in [Vector2(-460, 0), Vector2(460, -60)]:
		_spawn_building("res://entities/world/sprites/prop_barricade.png", bp, 0.7)

	_spawn_npc("Mechanic", "res://entities/npcs/sprites/npc_mechanic.png", Vector2(180, -120),
		["Engine trouble? The garage'll patch you up.", "Keep that armor topped off out there."])
	var trader = _spawn_npc("Trader", "res://entities/npcs/sprites/npc_trader.png", Vector2(-180, -120),
		["Scrap buys upgrades and guns. Bring me plenty.", "Word is the Road Captain runs the deep lanes."])
	if trader:
		# Branching DialogueManager conversation (falls back to the flavor lines above if unavailable).
		trader.dialogue_path = "res://dialogues/trader.dialogue"
		trader.dialogue_title = "trader"
	# Contract-giver (the mission board): hands out a bounty you fulfil out on the road.
	var captain = _spawn_npc("Captain Vale", "res://entities/npcs/sprites/npc_guard.png", Vector2(0, -300),
		["The Deathlands are crawling. I pay for thinned herds."])
	if captain:
		captain.gives_contract = true
		captain.contract_kills = Const.CONTRACT_KILLS
		captain.contract_reward = Const.CONTRACT_REWARD

## A solid building/prop: sprite + a collision box (block layer) sized from the texture, so the
## player drives and walks around it.
func _spawn_building(tex_path: String, pos: Vector2, collision_scale: float) -> void:
	var body: StaticBody2D = StaticBody2D.new()
	body.collision_layer = 1 # block
	body.collision_mask = 0
	body.position = pos
	body.z_index = -2
	var spr: Sprite2D = Sprite2D.new()
	spr.texture = load(tex_path)
	body.add_child(spr)
	var col: CollisionShape2D = CollisionShape2D.new()
	var rect: RectangleShape2D = RectangleShape2D.new()
	var sz: Vector2 = spr.texture.get_size() if spr.texture else Vector2(80, 80)
	rect.size = sz * collision_scale
	col.shape = rect
	body.add_child(col)
	add_child(body)

func _spawn_npc(npc_name: String, tex_path: String, pos: Vector2, lines: Array) -> Node2D:
	var npc = NPC_SCRIPT.new()
	npc.npc_name = npc_name
	npc.lines = lines
	npc.position = pos
	var spr := Sprite2D.new()
	spr.texture = load(tex_path)
	npc.add_child(spr)
	add_child(npc)
	return npc

func spawn_vehicle() -> void:
	if current_vehicle:
		current_vehicle.queue_free()
		current_vehicle = null
		
	var gs = get_node_or_null("/root/GameState")
	if not gs: return
	
	current_vehicle = VEHICLE_SCENE.instantiate()
	current_vehicle.data = gs.get_selected_vehicle_data()
	add_child(current_vehicle)
	current_vehicle.global_position = spawn_point.global_position
	# Ensure it's active? Or empty waiting for driver?
	# Waiting for driver.

func _on_gate_entered(body: Node2D) -> void:
	if body.is_in_group("player"):
		print("Player entered Start Gate -> triggering run.")
		if has_node("/root/GameState"):
			get_node("/root/GameState").start_run()
