## FIGHT NIGHT '99 - deterministic two-player road-legend fighter.
## Original characters, ring, move states, guards, meter, and tournament art.
extends "res://proto3d/games/game_cartridge.gd"

const Draw = preload("res://proto3d/games/console/console_draw.gd")
const ARCHETYPES: Dictionary = {
	"road_warden": {"name": "ROAD WARDEN", "max_hp": 108, "speed": 6.0, "power": 1.0},
	"pit_medic": {"name": "PIT MEDIC", "max_hp": 96, "speed": 7.2, "power": 0.9},
	"toll_breaker": {"name": "TOLL BREAKER", "max_hp": 122, "speed": 5.0, "power": 1.2},
}
const SPECIAL_COST := 50.0
const ATTACK_RANGE := 88.0
const THROW_RANGE := 74.0
const ROUNDS_TO_WIN := 2
const FLOOR_Y := 548.0

var fighters: Array = []
var _rng := RandomNumberGenerator.new()
var _status: Label = null


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	Draw.header(self, "FIGHT NIGHT '99", "BOOTLEG ROAD-LEGEND CIRCUIT // BEST OF THREE")
	_status = Draw.status(self)
	queue_redraw()


func start_match(new_seed: int, new_seats: Array) -> void:
	super.start_match(new_seed, new_seats)
	_rng.seed = new_seed
	fighters.clear()
	var archetype_ids: Array[String] = ["road_warden", "pit_medic", "toll_breaker"]
	for index in 2:
		var archetype := String((new_seats[index] as Dictionary).get("archetype", archetype_ids[index])) \
			if index < new_seats.size() else archetype_ids[_rng.randi_range(0, archetype_ids.size() - 1)]
		if not ARCHETYPES.has(archetype):
			archetype = archetype_ids[index]
		var stats: Dictionary = ARCHETYPES[archetype]
		var spawn_x := 420.0 if index == 0 else 860.0
		fighters.append({"id": index, "archetype": archetype, "name": String(stats["name"]),
			"x": spawn_x, "spawn_x": spawn_x, "facing": 1 if index == 0 else -1,
			"max_hp": int(stats["max_hp"]), "hp": int(stats["max_hp"]),
			"speed": float(stats["speed"]), "power": float(stats["power"]),
			"crouched": false, "guard": "none", "state": "idle", "recovery": 0,
			"stun": 0, "meter": 0.0, "rounds": 0, "wins": 0,
			"ai": index >= new_seats.size()})
	_render()


func apply_inputs(new_tick: int, snapshots: Array) -> void:
	if not active or paused or finished:
		return
	tick = maxi(tick, new_tick)
	for index in fighters.size():
		var fighter: Dictionary = fighters[index]
		var input: Dictionary = _ai_snapshot(index) if bool(fighter.get("ai", false)) \
			else _snapshot_for_fighter(index, snapshots)
		_apply_fighter_input(index, input)
	_update_states()
	_render()


func _apply_fighter_input(index: int, input: Dictionary) -> void:
	if input.is_empty():
		return
	var fighter: Dictionary = fighters[index]
	var move: Vector2 = input.get("move", Vector2.ZERO)
	fighter["crouched"] = move.y > 0.45
	var held: Dictionary = input.get("held", {})
	fighter["guard"] = ("low" if bool(fighter["crouched"]) else "high") \
		if bool(held.get("stance", false)) else "none"
	if int(fighter.get("stun", 0)) <= 0 and absf(move.x) > 0.05:
		fighter["x"] = clampf(float(fighter["x"]) + move.x * float(fighter["speed"]), 260.0, 1020.0)
		fighter["facing"] = 1 if move.x > 0.0 else -1
	fighters[index] = fighter
	var opponent := 1 - index
	if float((fighters[opponent] as Dictionary)["x"]) > float((fighters[index] as Dictionary)["x"]):
		(fighters[index] as Dictionary)["facing"] = 1
	else:
		(fighters[index] as Dictionary)["facing"] = -1
	var pressed: Dictionary = input.get("pressed", {})
	if bool(pressed.get("primary", false)):
		attempt_attack(index, "low" if bool((fighters[index] as Dictionary)["crouched"]) else "high")
	elif bool(pressed.get("secondary", false)):
		var defender: Dictionary = fighters[opponent]
		attempt_attack(index, "throw" if String(defender.get("guard", "none")) != "none" \
			else "heavy")
	elif bool(pressed.get("mobility", false)):
		attempt_attack(index, "special")


func attempt_attack(attacker: int, kind: String) -> bool:
	if finished or attacker < 0 or attacker >= fighters.size():
		return false
	var defender := 1 - attacker
	var source: Dictionary = fighters[attacker]
	var target: Dictionary = fighters[defender]
	if int(source.get("recovery", 0)) > 0 or int(source.get("stun", 0)) > 0:
		return false
	var distance := absf(float(source["x"]) - float(target["x"]))
	var max_range := THROW_RANGE if kind == "throw" else ATTACK_RANGE
	if distance > max_range:
		return false
	var base_damage := 0
	var recovery := 10
	match kind:
		"high":
			base_damage = 11
		"low":
			base_damage = 9
			recovery = 9
		"heavy":
			base_damage = 18
			recovery = 17
		"throw":
			if String(target.get("guard", "none")) == "none":
				return false
			base_damage = 14
			recovery = 15
		"special":
			if float(source.get("meter", 0.0)) < SPECIAL_COST:
				return false
			source["meter"] = float(source["meter"]) - SPECIAL_COST
			base_damage = 27
			recovery = 21
		_:
			return false
	var blocked := (kind == "high" and String(target.get("guard", "none")) == "high") \
		or (kind == "low" and String(target.get("guard", "none")) == "low")
	if kind in ["throw", "special"]:
		blocked = false
	source["state"] = "attack_%s" % kind
	source["recovery"] = recovery
	fighters[attacker] = source
	if blocked:
		target["meter"] = minf(100.0, float(target.get("meter", 0.0)) + 5.0)
		target["state"] = "guard_%s" % target.get("guard", "high")
		fighters[defender] = target
		return true
	var damage := maxi(1, int(round(float(base_damage) * float(source["power"]))))
	if kind != "special":
		source = fighters[attacker]
		source["meter"] = minf(100.0, float(source.get("meter", 0.0)) + float(damage) * 0.65)
		fighters[attacker] = source
	return apply_damage(defender, damage, attacker)


func apply_damage(index: int, amount: int, attacker: int) -> bool:
	if finished or index < 0 or index >= fighters.size() or amount <= 0:
		return false
	var fighter: Dictionary = fighters[index]
	fighter["hp"] = maxi(0, int(fighter["hp"]) - amount)
	fighter["stun"] = 7
	fighter["state"] = "stunned"
	fighter["meter"] = minf(100.0, float(fighter.get("meter", 0.0)) + float(amount) * 0.35)
	fighters[index] = fighter
	if int(fighter["hp"]) <= 0:
		_round_knockout(attacker, index)
	return true


func _round_knockout(winner: int, _loser: int) -> void:
	var fighter: Dictionary = fighters[winner]
	fighter["rounds"] = int(fighter.get("rounds", 0)) + 1
	fighters[winner] = fighter
	if int(fighter["rounds"]) >= ROUNDS_TO_WIN:
		_complete_match(winner)
		return
	for index in fighters.size():
		var reset: Dictionary = fighters[index]
		reset["hp"] = int(reset["max_hp"])
		reset["x"] = float(reset["spawn_x"])
		reset["guard"] = "none"
		reset["crouched"] = false
		reset["state"] = "idle"
		reset["recovery"] = 0
		reset["stun"] = 0
		fighters[index] = reset


func _complete_match(winner: int) -> void:
	if finished or winner < 0 or winner >= fighters.size():
		return
	var fighter: Dictionary = fighters[winner]
	fighter["wins"] = int(fighter.get("wins", 0)) + 1
	fighters[winner] = fighter
	finish_match({"primary": int(fighter["wins"]),
		"secondary": {"winner": winner, "hp_remaining": int(fighter.get("hp", 0)),
			"rounds": int(fighter.get("rounds", 0))},
		"outcome": "complete", "ranked": true})


func _update_states() -> void:
	for index in fighters.size():
		var fighter: Dictionary = fighters[index]
		fighter["recovery"] = maxi(0, int(fighter.get("recovery", 0)) - 1)
		fighter["stun"] = maxi(0, int(fighter.get("stun", 0)) - 1)
		if int(fighter["recovery"]) == 0 and int(fighter["stun"]) == 0 \
				and not String(fighter.get("state", "")).begins_with("guard"):
			fighter["state"] = "idle"
		fighters[index] = fighter


func _ai_snapshot(index: int) -> Dictionary:
	var fighter: Dictionary = fighters[index]
	var target: Dictionary = fighters[1 - index]
	var delta := float(target["x"]) - float(fighter["x"])
	var move := Vector2(signf(delta), 0) if absf(delta) > ATTACK_RANGE * 0.75 else Vector2.ZERO
	var held: Dictionary = {}
	var pressed: Dictionary = {}
	if absf(delta) <= ATTACK_RANGE and int(fighter.get("recovery", 0)) == 0:
		if tick % 4 == 0:
			held["stance"] = true
		elif float(fighter.get("meter", 0.0)) >= SPECIAL_COST and tick % 5 == 0:
			pressed["mobility"] = true
		elif tick % 3 == 0:
			pressed["secondary"] = true
		else:
			pressed["primary"] = true
	return {"seat": index, "move": move, "aim": Vector2.ZERO,
		"held": held, "pressed": pressed, "released": {}}


func _snapshot_for_fighter(index: int, snapshots: Array) -> Dictionary:
	if index >= seats.size():
		return {}
	var wanted := int((seats[index] as Dictionary).get("seat", index))
	for value in snapshots:
		var input: Dictionary = value
		if int(input.get("seat", -1)) == wanted:
			return input
	return {}


func place_for_test(index: int, x: float) -> void:
	var fighter: Dictionary = fighters[index]
	fighter["x"] = x
	fighters[index] = fighter


func snapshot() -> Dictionary:
	var state := super.snapshot()
	state["fighters"] = fighters.duplicate(true)
	state["rng_state"] = _rng.state
	state["last_result"] = last_result.duplicate(true)
	return state


func restore_snapshot(state: Dictionary) -> void:
	super.restore_snapshot(state)
	fighters = (state.get("fighters", fighters) as Array).duplicate(true)
	_rng.state = int(state.get("rng_state", _rng.state))
	last_result = (state.get("last_result", last_result) as Dictionary).duplicate(true)
	_render()


func debug_force_finish() -> bool:
	if finished or fighters.is_empty():
		return false
	var fighter: Dictionary = fighters[0]
	fighter["rounds"] = ROUNDS_TO_WIN
	fighters[0] = fighter
	_complete_match(0)
	_render()
	return finished


func _render() -> void:
	if _status != null and fighters.size() == 2:
		_status.text = "%s  HP %03d  METER %03d  R%d  //  %s  HP %03d  METER %03d  R%d" % [
			String((fighters[0] as Dictionary).get("name", "P1")), int((fighters[0] as Dictionary).get("hp", 0)),
			int((fighters[0] as Dictionary).get("meter", 0)), int((fighters[0] as Dictionary).get("rounds", 0)),
			String((fighters[1] as Dictionary).get("name", "P2")), int((fighters[1] as Dictionary).get("hp", 0)),
			int((fighters[1] as Dictionary).get("meter", 0)), int((fighters[1] as Dictionary).get("rounds", 0))]
	queue_redraw()


func _draw() -> void:
	draw_rect(Rect2(Vector2.ZERO, size), Draw.INK)
	draw_rect(Rect2(70, 115, 1140, 500), Color("2d2722"), true)
	# Original truck-stop ring and crowd silhouettes.
	for index in 20:
		var x := 90.0 + index * 58.0
		var h := 32.0 + float((index * 23) % 28)
		draw_circle(Vector2(x, 205 - h), 10, Color("464038"))
		draw_rect(Rect2(x - 8, 205 - h, 16, h), Color("3b362f"), true)
	draw_rect(Rect2(215, FLOOR_Y - 8, 850, 72), Color("3d3027"), true)
	draw_rect(Rect2(215, FLOOR_Y - 8, 850, 72), Draw.RUST, false, 4.0)
	draw_line(Vector2(220, 425), Vector2(1060, 425), Draw.AMBER, 4.0)
	draw_line(Vector2(220, 465), Vector2(1060, 465), Draw.BONE, 3.0)
	for index in fighters.size():
		var fighter: Dictionary = fighters[index]
		var x := float(fighter["x"])
		var crouch := bool(fighter.get("crouched", false))
		var height := 72.0 if not crouch else 48.0
		var color := Draw.team_color(index)
		var torso := Rect2(x - 20, FLOOR_Y - height, 40, height - 22)
		draw_rect(torso, color, true)
		draw_circle(Vector2(x, FLOOR_Y - height - 12), 16, color.lightened(0.15))
		draw_line(Vector2(x - 14, FLOOR_Y), Vector2(x - 22, FLOOR_Y + 18), Draw.BONE, 7.0)
		draw_line(Vector2(x + 14, FLOOR_Y), Vector2(x + 22, FLOOR_Y + 18), Draw.BONE, 7.0)
		var facing := float(fighter["facing"])
		if String(fighter.get("state", "")).begins_with("attack"):
			draw_line(Vector2(x + facing * 14, FLOOR_Y - height + 18),
				Vector2(x + facing * 48, FLOOR_Y - height + 10), Draw.AMBER, 9.0)
		if String(fighter.get("guard", "none")) != "none":
			draw_arc(Vector2(x + facing * 20, FLOOR_Y - height + 22), 22, -PI * 0.5, PI * 0.5, 12, Draw.SIGNAL, 5.0)
		draw_rect(Rect2(x - 42, FLOOR_Y + 27, 84, 6), Draw.RUST, true)
		draw_rect(Rect2(x - 42, FLOOR_Y + 27,
			84.0 * float(fighter["hp"]) / float(fighter["max_hp"]), 6), color, true)
