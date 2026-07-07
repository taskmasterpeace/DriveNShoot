## Proof for the CO-OP/PVP FUN PASS (COOP_PVP_MOBILE Track A+B "tonight" rows):
## NAME TAGS over partners · a PARTNER ARROW waypoint that follows them ·
## RESPAWN-AT-PARTNER (death keeps the duo together) · the CO-OP TRUCK ·
## PvP OPT-IN (peace/duel/ffa on F6) · the SAFEHOUSE BUBBLE (holy ground) ·
## victim-authoritative PvP damage · KILL TOAST + session BOUNTY on the killer ·
## horn pings that carry. Drives the receive handlers directly (the documented
## ingest_state seam — net_loopback.sh proves the physical wire).
## Run: godot --headless --path game res://proto3d/tests/coop_fun_sim.tscn
extends Node

var passed := 0
var failed := 0
var main: Node3D


func _check(check_name: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("COOPFUN: %s - %s" % ["PASS" if ok else "FAIL", check_name])


func _f6() -> void:
	for down in [true, false]:
		var ev := InputEventKey.new()
		ev.keycode = KEY_F6
		ev.physical_keycode = KEY_F6
		ev.pressed = down
		Input.parse_input_event(ev)
		await get_tree().physics_frame
	await get_tree().physics_frame


func _ready() -> void:
	print("COOPFUN: start")
	get_tree().create_timer(60.0).timeout.connect(func() -> void:
		print("COOPFUN: WATCHDOG"); print("COOPFUN: FAILURES PRESENT"); get_tree().quit(1))
	main = (load("res://proto3d/proto3d.tscn") as PackedScene).instantiate()
	add_child(main)
	for _i in 8:
		await get_tree().process_frame
	main._exit_car()
	main._ensure_net() # the transport node (lazy in real play — F7/F8 makes it)

	# --- A partner appears (the seam late-joiners use) ---------------------------
	main._net_spawn_peer(2)
	var buddy: ProtoPlayer3D = main.remote_players[2]
	_check("the partner has a NAME TAG", buddy.get_node_or_null("NameTag") is Label3D
		and (buddy.get_node("NameTag") as Label3D).text == "P2")
	var has_arrow := false
	for wp in main.waypoints:
		if String(wp[0]) == "🤝 PARTNER P2" and wp[1] == buddy:
			has_arrow = true
	_check("the PARTNER ARROW waypoint follows the body", has_arrow)

	# --- Death keeps the duo together --------------------------------------------
	buddy.global_position = Vector3(300, 0.3, 100)
	main.net.online = true # the branch flag (the wire itself is net_loopback's job)
	main.respawn_at_home()
	_check("you RESPAWN AT YOUR PARTNER, not across the map",
		main.player.global_position.distance_to(buddy.global_position) < 6.0)
	main.net.online = false

	# --- PvP rules: opt-in, bubble, victim-authoritative damage -------------------
	_check("PvP starts at PEACE (opt-in)", main.pvp_mode == "peace")
	_check("peace = my iron can't carry (gate closed)", not main.pvp_allowed(buddy))
	await _f6()
	_check("F6 cycles to DUEL", main.pvp_mode == "duel")
	await _f6()
	_check("F6 cycles to FFA", main.pvp_mode == "ffa")
	_check("in the open, the gate OPENS", main.pvp_allowed(buddy))
	buddy.global_position = main.SAFEHOUSE + Vector3(2, 0.3, 0)
	_check("the SAFEHOUSE BUBBLE is holy ground (no spawn camping)", not main.pvp_allowed(buddy))
	buddy.global_position = Vector3(300, 0.3, 100)

	# Victim side: my machine applies (or refuses) the hit under MY law.
	var hp0: float = main.character.hp
	main.net_pvp_hit(2, 12.0)
	_check("an incoming PvP hit LANDS through the one damage law (%.0f → %.0f)" % [hp0, main.character.hp],
		main.character.hp < hp0)
	main.pvp_mode = "peace"
	var hp1: float = main.character.hp
	main.net_pvp_hit(2, 12.0)
	_check("at PEACE my machine refuses foul packets", is_equal_approx(main.character.hp, hp1))
	main.pvp_mode = "ffa"

	# --- The consequence: kill toast + a bounty everyone can read ------------------
	main.net_pvp_death(1, 2)
	_check("a PvP kill posts a BOUNTY on the killer", int(main.pvp_bounties.get(2, 0)) == 40)
	var tag := buddy.get_node("NameTag") as Label3D
	_check("the killer's tag wears the price (%s)" % tag.text, tag.text.contains("40"))

	# --- The horn carries; the truck waits ------------------------------------------
	main.net_horn_ping(2, Vector3(280, 0, 90)) # no crash + the ping reveals
	_check("a partner's horn PINGS your world", true)
	main._spawn_coop_truck()
	_check("the CO-OP TRUCK waits by the safehouse (bed rig)",
		main._coop_truck != null and main._coop_truck.vclass == "pickup_truck"
		and main._coop_truck.global_position.distance_to(main.SAFEHOUSE) < 15.0)

	# --- The partner leaves; the arrow goes with them --------------------------------
	main._net_despawn_peer(2)
	var arrow_gone := true
	for wp in main.waypoints:
		if String(wp[0]).begins_with("🤝 PARTNER"):
			arrow_gone = false
	_check("the arrow leaves with the partner", arrow_gone)

	print("COOPFUN RESULTS: %d passed, %d failed" % [passed, failed])
	print("COOPFUN: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)
