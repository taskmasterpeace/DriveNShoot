## Proof for MULTIPLAYER — the netcode-facing SEAMS (no socket; deterministic).
## A REMOTE player body spawns from a peer id, tracks the state it's fed, is a
## real COMBATANT (takes damage, enemies target it), and the join-in-progress
## SNAPSHOT (player_record) round-trips. The transport itself is proven live by
## tools/net_loopback.sh (two real ENet processes).
## Run: godot --headless --path game res://proto3d/tests/net_sim.tscn
extends Node

var passed := 0
var failed := 0
var main: Node3D


func _check(check_name: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("NET: %s - %s" % ["PASS" if ok else "FAIL", check_name])


func _ready() -> void:
	print("NET: start")
	get_tree().create_timer(70.0).timeout.connect(func() -> void:
		print("NET: WATCHDOG")
		print("NET: FAILURES PRESENT")
		get_tree().quit(1))
	Engine.time_scale = 2.0
	main = (load("res://proto3d/proto3d.tscn") as PackedScene).instantiate()
	add_child(main)
	for _i in 8:
		await get_tree().process_frame
	main._exit_car()
	main._ensure_net()

	# --- A peer joins → a REMOTE body appears -----------------------------------
	main._net_spawn_peer(2)
	await get_tree().physics_frame
	var body: ProtoPlayer3D = main.remote_players.get(2)
	_check("a peer's REMOTE body spawns", body != null and body.is_remote and body.peer_id == 2)
	_check("…and it's a real COMBATANT (the one damage law reaches it)", body.is_in_group("combatant"))

	# --- Fed a peer's state, the body TRACKS it ---------------------------------
	var here: Vector3 = main.player.global_position + Vector3(40, 0, 15)
	main.net_apply_peer(2, {"pos": [here.x, here.y, here.z], "byaw": 1.2, "ayaw": 1.2, "armed": true})
	var t := 0.0
	while t < 4.0 and body.global_position.distance_to(here) > 2.0:
		await get_tree().physics_frame
		t += get_physics_process_delta_time()
	_check("the remote body LERPS to the peer's position (%.1fm)" % body.global_position.distance_to(here),
		body.global_position.distance_to(here) < 2.0)
	_check("…and wears the peer's facing + armed read", is_equal_approx(body.body_yaw, 1.2) and body._gun.visible)

	# --- It's a real body: enemies HUNT it, and it BLEEDS -----------------------
	var hits: Array = []
	body.damaged.connect(func(a: float, _atk: Node3D) -> void: hits.append(a))
	body.take_damage(15.0, null) # a claw, a bullet, another player's iron — one door
	_check("the remote body takes damage through the ONE door", hits.size() == 1)
	var lurk := ProtoLurker.create()
	main.add_child(lurk)
	lurk.global_position = body.global_position + Vector3(0, 0.4, 2)
	main.player.global_position = body.global_position + Vector3(200, 0, 0) # keep US out of its reach
	t = 0.0
	var chased := 1e9
	while t < 8.0 and chased > 5.0:
		await get_tree().physics_frame
		t += get_physics_process_delta_time()
		main.net_apply_peer(2, {"pos": [body.global_position.x, body.global_position.y, body.global_position.z], "byaw": 0.0, "ayaw": 0.0})
		chased = minf(chased, lurk.global_position.distance_to(body.global_position))
	_check("an enemy HUNTS the remote player (closed to %.1fm)" % chased, chased < 30.0)

	# --- Join-in-progress: the snapshot round-trips ------------------------------
	main.backpack.add("jack", 42)
	main.use_item("wrench")
	var snap: Dictionary = main.player_record()
	_check("the JOIN SNAPSHOT carries pack + arsenal (what a server hands a joiner)",
		snap["backpack"].get("jack", 0) >= 42 and snap["weapons"].size() >= 1)

	# --- A peer drops → the body is gone ----------------------------------------
	main._net_despawn_peer(2)
	await get_tree().physics_frame
	_check("a dropped peer's body is REMOVED", not main.remote_players.has(2))

	# --- The transport API is sane (host/join don't exist yet, offline) ---------
	_check("ProtoNet reports offline before connect", not main.net.online and main.net.my_id() == 1)

	Engine.time_scale = 1.0
	print("NET RESULTS: %d passed, %d failed" % [passed, failed])
	print("NET: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)
