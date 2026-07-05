## Stage 6 slice proof — MERIDIAN LIVES (WORLD_NPCS.md §6): buy/sell at the
## trader through the SAME container panel (jack flows backward), take a Sec-Man
## bounty, kill the mark, claim the jack, watch esteem drop prices — then commit
## a CRIME and watch the town close up (SUSPECT: no trade, no work, gouged prices).
## Inputs only for interactions; positioning teleports = stage-setting (allowed).
## Run: godot --headless --path game res://proto3d/tests/town_sim.tscn
extends Node

var main: Node3D
var t: float = 0.0
var phase: int = 0
var phase_t: float = 0.0
var passed: int = 0
var failed: int = 0
var _did: bool = false
var _did2: bool = false
var _step: int = 0

var _trader: ProtoNPC
var _secman: ProtoNPC
var _jack0: int = 0
var _jack_preclaim: int = 0


func _ready() -> void:
	var packed: PackedScene = load("res://proto3d/proto3d.tscn")
	main = packed.instantiate()
	add_child(main)
	print("TOWN: scene up")


func _check(name: String, ok: bool) -> void:
	if ok:
		passed += 1
		print("TOWN: PASS - %s" % name)
	else:
		failed += 1
		print("TOWN: FAIL - %s" % name)


func _tap_interact() -> void:
	for pressed in [true, false]:
		var ev := InputEventAction.new()
		ev.action = "interact"
		ev.pressed = pressed
		Input.parse_input_event(ev)


func _click() -> void:
	for pressed in [true, false]:
		var ev := InputEventMouseButton.new()
		ev.button_index = MOUSE_BUTTON_LEFT
		ev.pressed = pressed
		Input.parse_input_event(ev)


func _key(code: Key) -> void:
	for pressed in [true, false]:
		var ev := InputEventKey.new()
		ev.keycode = code
		ev.physical_keycode = code
		ev.pressed = pressed
		Input.parse_input_event(ev)


func _place(pos: Vector3) -> void:
	main.player.global_position = pos
	main.player.velocity = Vector3.ZERO


func _find_npcs() -> void:
	for node in main.get_children():
		if node is ProtoNPC:
			if (node as ProtoNPC).role == "trade":
				_trader = node
			else:
				_secman = node


func _next() -> void:
	phase += 1
	phase_t = 0.0
	_did = false
	_did2 = false
	_step = 0


func _physics_process(delta: float) -> void:
	t += delta
	phase_t += delta
	match phase:
		0: # boot, on foot
			if phase_t > 0.6:
				_tap_interact()
				_next()
		1: # STAGE: arm up, walk to the stall, E opens the SHOP
			if phase_t > 0.4:
				_find_npcs()
				_check("Meridian has a trader and a Sec-Man", _trader != null and _secman != null)
				main.backpack.add("jack", 60)
				main.backpack.add("scrap", 3)
				main.backpack.add("pistol", 1)
				main.backpack.add("9mm", 24)
				main.use_item("pistol")
				_place(Vector3(100.0, 0.35, -317.4)) # street side of the stall
				main.player.snap_orientation(Vector3(0, 0, 1)) # face Mercy over the counter
				_tap_interact()
				_next()
		2: # BUY and SELL through the one panel — jack flows backward
			if phase_t > 0.5 and not _did:
				_did = true
				_check("E on the trader opens the SHOP (same panel)", main.panel.is_open and main.panel._merchant != null)
				_jack0 = main.backpack.count("jack")
				main.panel._on_move(main.panel._theirs, main.panel._mine, "bandage") # BUY
				_check("BUY: bandage arrives, 12 jack leaves (%d -> %d)" % [_jack0, main.backpack.count("jack")],
					main.backpack.count("bandage") == 1 and main.backpack.count("jack") == _jack0 - 12)
				main.panel._on_move(main.panel._mine, main.panel._theirs, "scrap") # SELL
				_check("SELL: scrap to the stall, +2 jack", main.backpack.count("jack") == _jack0 - 10
					and _trader.stock.count("scrap") == 1 and main.backpack.count("scrap") == 2)
				_tap_interact() # close the panel
			elif _did and phase_t > 0.8:
				_next()
		3: # the Sec-Man offers WORK
			if not _did:
				_did = true
				_place(Vector3(104.0, 0.35, -315.8))
			elif phase_t > 0.5:
				_tap_interact()
				_next()
		4:
			if phase_t > 0.4:
				_check("bounty OFFERED: a mark is live at the water point", main.bounty.get("state", "") == "open"
					and is_instance_valid(main.bounty.get("target")))
				_check("BOUNTY waypoint added (N can cycle to it)", main.waypoints.size() == 4)
				_place(Vector3(138.0, 0.35, -352.0)) # 8m west of the mark
				_next()
		5: # kill the mark (combat path: aim intent + clicks, Look Arc and all)
			var tgt: Variant = main.bounty.get("target") # untyped: may be freed
			if main.bounty.get("state", "") == "filled":
				_check("kill detected the moment it happens (bounty FILLED)", true)
				_jack_preclaim = main.backpack.count("jack")
				_place(Vector3(104.0, 0.35, -315.8)) # back to Bridger
				_next()
			elif tgt != null and is_instance_valid(tgt) and not tgt.dead:
				main.aim_override = (tgt.global_position - main.player.global_position).normalized()
				if phase_t > 0.3:
					_click()
			if phase_t > 8.0:
				_check("kill detected the moment it happens (bounty FILLED)", false)
				_next()
		6: # claim: jack + esteem, waypoint gone, prices soften
			if not _did:
				_did = true # settle a beat at Bridger
			elif not _did2 and phase_t > 0.5:
				_did2 = true
				_tap_interact() # exactly ONE tap — a second would re-offer a fresh bounty
			elif _did2 and main.backpack.count("jack") == _jack_preclaim + 25:
				_check("claim pays +25 jack", true)
				_check("Meridian NOTICED (esteem 20)", main.respect.esteem("meridian") >= 20.0)
				_check("bounty cleared + waypoint removed", main.bounty.is_empty() and main.waypoints.size() == 3)
				_check("esteem talks: bandage 12 -> %d jack" % main.trade_price("bandage", false),
					main.trade_price("bandage", false) == 11)
				_next()
			elif phase_t > 4.0:
				_check("claim pays +25 jack", false)
				_next()
		7: # CRIME: put a bullet in the trader — the ledger takes infamy
			if not _did:
				_did = true
				# West of the stall shooting EAST: everything downrange is Meridian's
				# own street — a stray pinned shot hits at worst the OTHER townsperson,
				# which is the same crime against the same ledger.
				_place(Vector3(96.0, 0.35, -315.0))
				_key(KEY_R) # top the mag first
			elif is_instance_valid(_trader) and main.respect.infamy("meridian") < 60.0:
				main.aim_override = (_trader.global_position + Vector3(0, 1.1, 0) - main.player.global_position).normalized()
				if phase_t > 0.5 and fmod(phase_t, 0.4) < delta:
					_click()
				if phase_t > 4.0:
					_check("shooting a townsperson is a CRIME (infamy)", false)
					_next()
			else:
				_check("shooting a townsperson is a CRIME (infamy %.0f)" % main.respect.infamy("meridian"),
					main.respect.infamy("meridian") >= 60.0)
				_check("standing flips to SUSPECT (net %.0f)" % main.respect.net("meridian"),
					main.respect.standing("meridian") == "SUSPECT")
				_check("infamy gouges: bandage now %d jack" % main.trade_price("bandage", false),
					main.trade_price("bandage", false) >= 16)
				_next()
		8: # the town closes up: no trade, no work (each step fires exactly once)
			if _step == 0:
				_step = 1
				_place(Vector3(100.0, 0.35, -317.0)) # at the stall
			elif _step == 1 and phase_t > 0.5:
				_step = 2
				_tap_interact()
			elif _step == 2 and phase_t > 1.0:
				_step = 3
				_check("Mercy refuses a SUSPECT (no shop)", not main.panel.is_open)
				_place(Vector3(104.0, 0.35, -315.8)) # at the Sec-Man
			elif _step == 3 and phase_t > 1.6:
				_step = 4
				_tap_interact()
			elif _step == 4 and phase_t > 2.2:
				_check("Bridger refuses a SUSPECT (no work)", main.bounty.is_empty())
				_next()
		9:
			print("TOWN RESULTS: %d passed, %d failed" % [passed, failed])
			print("TOWN: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
			get_tree().quit(0 if failed == 0 else 1)

	if t > 40.0:
		print("TOWN: TIMEOUT in phase %d" % phase)
		print("TOWN RESULTS: %d passed, %d failed" % [passed, failed])
		get_tree().quit(1)
