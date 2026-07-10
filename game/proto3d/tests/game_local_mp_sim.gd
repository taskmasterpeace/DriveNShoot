## LOCAL means local in the DRIVN world: the second character must physically
## enter the cartridge row's terminal radius before two seats may start.
extends Node

var passed := 0
var failed := 0
var main: Node3D = null


func _check(label: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("GAME_LOCAL_MP: %s - %s" % ["PASS" if ok else "FAIL", label])


func _ready() -> void:
	print("GAME_LOCAL_MP: start")
	get_tree().create_timer(90.0).timeout.connect(func() -> void:
		print("GAME_LOCAL_MP: WATCHDOG")
		get_tree().quit(1))
	main = (load("res://proto3d/proto3d.tscn") as PackedScene).instantiate()
	add_child(main)
	for _frame in 10:
		await get_tree().process_frame
	main.game_deck.ledger.unlock("dial_tanks")
	var console: Node3D = main.game_console
	if console == null or not console.has_method("local_offer"):
		_check("the physical console exposes the generic local terminal broker", false)
		_finish()
		return
	_check("the physical console exposes the generic local terminal broker", true)

	var remote := CharacterBody3D.new()
	remote.name = "NearbyPeerBody"
	main.add_child(remote)
	var radius := float(main.game_deck.registry.get_game("dial_tanks").get("local_radius_m", 0.0))
	remote.global_position = console.global_position + Vector3(radius + 2.5, 0.0, 0.0)
	var far_offer: Dictionary = console.local_offer("dial_tanks", 2, remote, 1)
	_check("a connected character outside the declared local radius is refused", far_offer.is_empty())

	# Move a real CharacterBody through physics frames; no teleport satisfies the
	# acceptance step from outside to inside.
	for _step in 45:
		remote.velocity = (console.global_position - remote.global_position).normalized() * 5.0
		remote.move_and_slide()
		await get_tree().physics_frame
		if remote.global_position.distance_to(console.global_position) < radius - 0.5:
			break
	var offer: Dictionary = console.local_offer("dial_tanks", 2, remote, 1)
	_check("walking the remote character into radius creates a two-seat offer",
		not offer.is_empty() and (offer.get("seats", []) as Array).size() == 2)
	_check("the accepted offer starts the ordinary owned cartridge",
		console.start_local_offer(offer) and main.game_deck.state == "PLAYING"
		and (main.game_deck.cartridge.get("seats") as Array).size() == 2)

	var tanks_before: Array = (main.game_deck.cartridge.get("tanks") as Array).duplicate(true)
	var key := InputEventKey.new()
	key.physical_keycode = KEY_W
	key.keycode = KEY_W
	key.pressed = true
	main.game_deck.feed_event(key)
	var stick := InputEventJoypadMotion.new()
	stick.device = 1
	stick.axis = JOY_AXIS_LEFT_Y
	stick.axis_value = -1.0
	main.game_deck.feed_event(stick)
	main.game_deck.process_tick()
	var tanks_after: Array = main.game_deck.cartridge.get("tanks")
	_check("both declared local seats control the same live match",
		Vector2((tanks_after[0] as Dictionary).get("pos")) != Vector2((tanks_before[0] as Dictionary).get("pos"))
		and Vector2((tanks_after[1] as Dictionary).get("pos")) != Vector2((tanks_before[1] as Dictionary).get("pos")))
	_check("local invitations never pause DRIVN", Engine.time_scale == 1.0)
	_finish()


func _finish() -> void:
	print("GAME_LOCAL_MP RESULTS: %d passed, %d failed" % [passed, failed])
	print("GAME_LOCAL_MP: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)
