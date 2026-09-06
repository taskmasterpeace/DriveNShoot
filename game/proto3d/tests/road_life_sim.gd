extends Node

var passed: int = 0
var failed: int = 0
var main: Node
var exercised: bool = false

func check(label: String, condition: bool) -> void:
	passed += int(condition)
	failed += int(not condition)
	print("ROAD LIFE: %s - %s" % ["PASS" if condition else "FAIL", label])

func _ready() -> void:
	get_tree().create_timer(120.0).timeout.connect(func() -> void: get_tree().quit(1))
	check("real road-life component exists", FileAccess.file_exists("res://proto3d/realm/road_life.gd"))
	if failed == 0:
		if "--restart-check" in OS.get_cmdline_user_args():
			await restart_check()
		else:
			await exercise()
		check("exercise reached completion without script interruption", exercised)
	print("ROAD LIFE: %d passed, %d failed" % [passed, failed])
	get_tree().quit(0 if failed == 0 else 1)

func exercise() -> void:
	var disk_before_boot: String = FileAccess.get_file_as_string("user://drivn.save") if FileAccess.file_exists("user://drivn.save") else ""
	main = load("res://proto3d/proto3d.tscn").instantiate()
	add_child(main)
	await frames(10)
	var disk_after_boot: String = FileAccess.get_file_as_string("user://drivn.save") if FileAccess.file_exists("user://drivn.save") else ""
	check("boot never creates or overwrites player checkpoint", disk_before_boot == disk_after_boot)
	check("main attaches visible office and three parcels", main.road_life != null and main.road_life.sites.size() == 3)
	var life: Node = main.road_life
	var state: RefCounted = life.state
	# Row-variation regression: the objective must advertise the selected parcel,
	# not a parallel hardcoded first-deed name or price.
	var first_home: Node3D = life.sites[0]
	var first_name: String = first_home.row.name
	var first_price: int = int(first_home.row.price)
	first_home.row.name = "ROW-VARIANT HOMESTEAD"
	first_home.row.price = 0
	await frames(3)
	check("objective reads selected parcel name and price rows", "ROW-VARIANT HOMESTEAD" in life.objective.text and "0 banked" in life.objective.text)
	first_home.row.name = first_name
	first_home.row.price = first_price
	check("replacement freight cannot mint vendor cash", main.trade_price("freight_medicine", true) == 0 and main.trade_price("freight_parts", true) == 0 and main.trade_price("freight_cells", true) == 0)
	# Arrangement only: boot is at the wheel; the real interact input exits it.
	await action("interact")
	await frames(5)
	check("real input exits car", main.mode == main.Mode.FOOT)
	stage(life.office.interact_position() + Vector3(0,0,1))
	await frames(8)
	await action("interact")
	check("shared interact opens office", life.panel.is_open)
	await activate("accept:medicine")
	check("GUI acceptance supplies real cargo", state.jobs.active == "medicine" and main.backpack.count("freight_medicine") == 1)
	var start: Vector3 = main.player.global_position
	Input.action_press("move_up")
	await frames(20)
	Input.action_release("move_up")
	check("modal stops held movement", main.player.global_position.distance_to(start) < 0.2)
	# Physical T remains polled even when the modal consumes gameplay events.
	var wait_key: InputEventKey = InputEventKey.new()
	wait_key.keycode = KEY_T
	wait_key.physical_keycode = KEY_T
	wait_key.pressed = true
	Input.parse_input_event(wait_key)
	await get_tree().process_frame
	await frames(3)
	check("physical T reaches held input state", Input.is_key_pressed(KEY_T))
	var clock_before: float = main.daynight.day * 24.0 + main.daynight.hour
	await frames(30)
	var modal_hours: float = main.daynight.day * 24.0 + main.daynight.hour - clock_before
	check("modal T keeps ordinary clock progression", not main.daynight.waiting and modal_hours > 0.0 and modal_hours < 0.05)
	await action("interact")
	check("interact closes modal", not life.panel.is_open)
	clock_before = main.daynight.day * 24.0 + main.daynight.hour
	await frames(30)
	var wait_hours: float = main.daynight.day * 24.0 + main.daynight.hour - clock_before
	check("held T resumes normal waiting after modal closes", main.daynight.waiting and wait_hours > 0.2 and wait_hours > modal_hours * 20.0)
	print("ROAD LIFE: physical T clock deltas modal=%.6fh closed=%.6fh" % [modal_hours, wait_hours])
	wait_key = InputEventKey.new()
	wait_key.keycode = KEY_T
	wait_key.physical_keycode = KEY_T
	Input.parse_input_event(wait_key)
	await get_tree().process_frame
	await frames(3)
	check("releasing physical T ends waiting", not main.daynight.waiting)
	check("destination required", not state.deliver("medicine", life.receivers.medicine.interact_position()).ok)
	# Vehicle arrangement on the real Richmond road; input owns the ensuing drive.
	var car: ProtoCar3D = main.cars[0]
	car.global_position = Vector3(300,1,-284)
	car.rotation = Vector3(0,-PI / 2.0,0)
	car.linear_velocity = Vector3.ZERO
	car.angular_velocity = Vector3.ZERO
	stage(Vector3(300,0.3,-281))
	await frames(12)
	await action("interact")
	check("shared interact takes freight into driver's seat", main.mode == main.Mode.DRIVE)
	var drive_start: Vector3 = car.global_position
	Input.action_press("move_up")
	await frames(120)
	Input.action_release("move_up")
	Input.action_press("jump")
	await frames(100)
	Input.action_release("jump")
	check("real gas input drives cargo along existing road", car.global_position.distance_to(drive_start) > 5.0 and main.backpack.count("freight_medicine") == 1)
	await action("interact")
	check("park and interact returns driver to foot", main.mode == main.Mode.FOOT)
	var receiver: Node3D = life.receivers.medicine
	# Stage on the road near the receiver, then WALK the final approach using input.
	stage(receiver.interact_position() + Vector3(0,0,6))
	await frames(8)
	Input.action_press("move_up")
	await frames(50)
	Input.action_release("move_up")
	await frames(8)
	await action("interact")
	check("real walk reaches delivery interaction", life.panel.is_open and life.panel.board == receiver)
	var saved_path: String = state.checkpoint_path
	state.checkpoint_path = "user://missing-dir/reward.save"
	var unpaid: Dictionary = state.deliver("medicine", receiver.interact_position())
	check("failed reward write keeps cargo active and unpaid", not unpaid.ok and state.balance() == 0 and state.jobs.active == "medicine" and main.backpack.count("freight_medicine") == 1)
	state.checkpoint_path = saved_path
	if life.panel.is_open:
		await activate("deliver")
	check("one payout consumes cargo and adds supply", state.balance() == 160 and main.backpack.count("freight_medicine") == 0 and main.backpack.count("household_pantry") == 1)
	check("completed marker exists before replay", state.jobs.completed.has("medicine"))
	var reward: Dictionary = state.deliver("medicine", receiver.interact_position())
	check("reward replay does not mint supply", reward.ok and state.balance() == 160 and main.backpack.count("household_pantry") == 1)
	life.panel.close()
	var home: Node3D = life.sites[0]
	stage(home.interact_position() + Vector3(0,0,1))
	await frames(10)
	await action("interact")
	check("parcel input opens deed panel", life.panel.is_open and life.panel.site == home)
	await mouse_activate("purchase")
	check("GUI buys addressed home with banked money", state.balance() == 10 and state.ledger.can_access("local_driver", "roadstead_001"))
	check("purchase click does not leak an unarmed fire hold", not main._fist_pressed)
	var second_site: Node3D = life.sites[1]
	var second_name: String = second_site.row.name
	var second_price: int = int(second_site.row.price)
	second_site.row.name = "NEXT ROW-VARIANT HOMESTEAD"
	second_site.row.price = state.balance()
	await frames(3)
	check("objective selects next unowned parcel by row id", "NEXT ROW-VARIANT HOMESTEAD" in life.objective.text and "10 banked" in life.objective.text)
	second_site.row.name = second_name
	second_site.row.price = second_price
	var pre_store: Dictionary = main.capture_save()
	await activate("store:household_pantry")
	check("storage conserves backpack item", main.backpack.count("household_pantry") == 0 and state.ledger.snapshot().parcels.roadstead_001.items.get("household_pantry", 0) == 1)
	await activate("take:household_pantry")
	check("take restores item", main.backpack.count("household_pantry") == 1)
	check("explicit store transaction succeeds", state.transfer("roadstead_001", "household_pantry", false, "sim:store").ok)
	check("explicit take transaction succeeds", state.transfer("roadstead_001", "household_pantry", true, "sim:take").ok)
	check("historical take replay cannot duplicate backpack", state.transfer("roadstead_001", "household_pantry", true, "sim:take").ok and main.backpack.count("household_pantry") == 1)
	var disk: Dictionary = str_to_var(FileAccess.get_file_as_string(state.checkpoint_path))
	check("checkpoint joins all transaction halves", disk.player.backpack.household_pantry == 1 and disk.road_life.ledger.parcels.roadstead_001.items.is_empty())
	main.apply_save(disk)
	check("restart/load preserves replay receipt", state.transfer("roadstead_001", "household_pantry", true, "sim:take").ok and main.backpack.count("household_pantry") == 1)
	var receipt_state: Dictionary = state.ledger.snapshot()
	check("runtime conflict probe has the historical take receipt", receipt_state.receipts.has("sim:take"))
	var pack_before_conflict: Dictionary = main.backpack.slots.duplicate(true)
	var ledger_before_conflict: Dictionary = receipt_state.duplicate(true)
	var conflict: Dictionary = state.transfer("roadstead_001", "scrap", true, "sim:take")
	check("runtime replay conflict returns exact receipt error", not conflict.ok and conflict.error == "receipt_conflict")
	check("runtime replay conflict changes neither backpack nor ledger", main.backpack.slots == pack_before_conflict and state.ledger.snapshot() == ledger_before_conflict)
	state.checkpoint_path = "user://road_restart.save"
	state.transfer("roadstead_001", "household_pantry", false, "restart:store")
	state.transfer("roadstead_001", "household_pantry", true, "restart:take")
	state.checkpoint_path = "user://drivn.save"
	state.transfer("roadstead_001", "household_pantry", false, "sim:later-store")
	main.apply_save(pre_store)
	check("old save rewinds storage and backpack together", main.backpack.count("household_pantry") == 1 and state.ledger.snapshot().parcels.roadstead_001.items.is_empty())
	var broken: Dictionary = main.capture_save()
	broken.road_life = {"version": 1}
	broken.player.backpack = {"scrip": 99999}
	var cash: int = main.backpack.count("scrip")
	main.apply_save(broken)
	check("corrupt present field rejects before any main state", main.backpack.count("scrip") == cash and state.balance() == 10)
	var old_path: String = state.checkpoint_path
	state.checkpoint_path = "user://missing-dir/reject.save"
	var result: Dictionary = state.transfer("roadstead_001", "household_pantry", false, "sim:failed-write")
	check("failed write leaves backpack and ledger unchanged", not result.ok and main.backpack.count("household_pantry") == 1 and state.ledger.snapshot().parcels.roadstead_001.items.is_empty())
	state.checkpoint_path = old_path
	check("guest key grant is local and persisted", state.guest("roadstead_001", true).ok and state.ledger.can_access("local_guest", "roadstead_001"))
	check("guest revocation applies", state.guest("roadstead_001", false).ok and not state.ledger.can_access("local_guest", "roadstead_001"))
	var meals: int = main.backpack.count("canned_food")
	check("household supply has real food purpose", state.unpack_pantry("roadstead_001").ok and main.backpack.count("household_pantry") == 0 and main.backpack.count("canned_food") == meals + 3)
	check("second contract accepts", state.accept("spare_parts").ok)
	main.backpack.remove("freight_parts", 1) # arrange lost cargo, like dropping it in the ordinary pack panel
	check("missing cargo never pays", not state.deliver("spare_parts", main.player.global_position).ok and state.balance() == 10)
	check("lost cargo recovery is explicit", state.recover().ok and main.backpack.count("freight_parts") == 1)
	check("cannot duplicate already carried cargo", not state.recover().ok)
	check("cancel allows another attempt without payout", state.cancel().ok and state.jobs.active == "" and main.backpack.count("freight_parts") == 0 and state.balance() == 10)
	main._ensure_net()
	var online_before: bool = main.net.online
	main.net.online = true
	check("online transactions are blocked", not state.accept("spare_parts").ok and not state.purchase("roadstead_002", "online:buy").ok)
	var before_online_apply: Dictionary = main.capture_save()
	var changed_online: Dictionary = before_online_apply.duplicate(true)
	changed_online.player.backpack = {"scrip": 9999}
	main.apply_save(changed_online)
	check("online direct local load is blocked", main.backpack.count("scrip") != 9999)
	check("online save/load refuse local checkpoint overwrite", main.save_game().is_empty() and not main.load_game())
	main.net.online = online_before
	# Door traversal arrangement starts outside the ramp; all functional motion is input.
	stage(home.global_position + Vector3(0,0.1,8.8))
	await frames(8)
	Input.action_press("move_up")
	await frames(90)
	Input.action_release("move_up")
	await frames(8)
	var local: Vector3 = home.to_local(main.player.global_position)
	check("real input walks ramp porch and doorway", local.z < 3.5 and local.z > -4.0 and local.y > 0.3)
	check("roof cuts away over entered cottage", not home.roofs.is_empty() and not home.roofs[0].visible)
	# Stage on supported decking, then use real input to cross onto each visible
	# outer strip. Stopping velocity only lets gravity settle the reached point.
	stage(home.to_global(Vector3(0, 1.3, 5.0)))
	await frames(45)
	var porch_y: float = home.to_local(main.player.global_position).y
	for edge: Dictionary in [
		{"action": "move_left", "start_x": -3.55, "direction": -1.0, "label": "left"},
		{"action": "move_right", "start_x": 3.55, "direction": 1.0, "label": "right"},
	]:
		stage(home.to_global(Vector3(float(edge.start_x), porch_y + 0.1, 5.0)))
		await frames(3)
		await hold_action(String(edge.action), 22)
		main.player.velocity = Vector3.ZERO
		await frames(25)
		var edge_local: Vector3 = home.to_local(main.player.global_position)
		print("ROAD LIFE: porch %s reference_y=%.3f reached=%s" % [edge.label, porch_y, edge_local])
		var reached_strip: bool = edge_local.x * float(edge.direction) > 4.05 and edge_local.x * float(edge.direction) < 4.75
		check("actual input reaches visible %s porch edge" % edge.label, reached_strip)
		check("visible %s porch edge keeps raised-floor support" % edge.label, reached_strip and edge_local.y >= porch_y - 0.12)
	# Close paths use physical events, not direct panel callbacks.
	stage(home.interact_position() + Vector3(0,0,1))
	await frames(8)
	await action("interact")
	check("pad close starts with open panel", life.panel.is_open)
	var joy: InputEventJoypadButton = InputEventJoypadButton.new()
	joy.button_index = JOY_BUTTON_B
	joy.pressed = true
	Input.parse_input_event(joy)
	await frames(3)
	joy = InputEventJoypadButton.new()
	joy.button_index = JOY_BUTTON_B
	Input.parse_input_event(joy)
	await frames(3)
	check("physical pad B closes without stale movement lock", not life.panel.is_open and not main.player.input_locked)
	await action("interact")
	var esc: InputEventKey = InputEventKey.new()
	esc.keycode = KEY_ESCAPE
	esc.pressed = true
	Input.parse_input_event(esc)
	await frames(3)
	check("physical Escape closes panel", not life.panel.is_open)
	for index: int in [1, 2]:
		var next_home: Node3D = life.sites[index]
		stage(next_home.global_position + Vector3(0,0.1,8.8))
		await frames(8)
		Input.action_press("move_up")
		await frames(90)
		Input.action_release("move_up")
		await frames(8)
		check("other parcel doorway traversable: " + String(next_home.row.id), next_home.to_local(main.player.global_position).z < 3.5)
	var default_encounter: bool = bool(state.definitions.last_light.get("encounter", false))
	state.definitions.last_light.encounter = false
	check("row-disabled risk contract accepts", state.accept("last_light").ok)
	stage(life.receivers.last_light.global_position + Vector3(0,0.2,12))
	await frames(15)
	check("active job encounter flag disables materialization", not is_instance_valid(life._encounter))
	check("row-disabled risk contract cancels", state.cancel().ok)
	state.definitions.last_light.encounter = default_encounter
	check("last-light risk contract accepts", state.accept("last_light").ok)
	stage(life.receivers.last_light.global_position + Vector3(0,0.2,12))
	await frames(15)
	check("contract road encounter is the real actor", is_instance_valid(life._encounter) and life._encounter is ProtoLurker)
	if is_instance_valid(life._encounter):
		var enemy: ProtoLurker = life._encounter
		# Arrange combatants within melee reach; damage/kill/loot use real weapon inputs.
		enemy.global_position = main.player.global_position + Vector3(0,0,-1.2)
		main.use_item("wrench")
		for hit: int in 6:
			if not is_instance_valid(enemy):
				break
			main.aim_override = enemy.global_position - main.player.global_position
			await action("drivn_fire")
			await frames(45)
		check("real weapon inputs kill job-related enemy", not is_instance_valid(enemy))
		var loot_exists: bool = false
		for node: Node in get_tree().get_nodes_in_group("interactable"):
			if node is ProtoCorpse and node.global_position.distance_to(main.player.global_position) < 20 and node.container.count("scrip") == 2:
				loot_exists = true
		check("encounter leaves existing real corpse loot", loot_exists)
	var legacy: Dictionary = main.capture_save()
	legacy.erase("road_life")
	main.apply_save(legacy)
	check("legacy missing field resets only road-life ledger", state.balance() == 0 and not state.ledger.can_access("local_driver", "roadstead_001"))
	main.queue_free()
	await frames(4)
	exercised = true

func restart_check() -> void:
	main = load("res://proto3d/proto3d.tscn").instantiate()
	add_child(main)
	await frames(8)
	var data: Variant = str_to_var(FileAccess.get_file_as_string("user://road_restart.save"))
	check("prior process wrote restart checkpoint", data is Dictionary and data.has("road_life"))
	if data is Dictionary:
		main.apply_save(data)
		check("new process recovers owner fund cargo and receipt", main.road_life.state.balance() == 10 and main.road_life.state.ledger.can_access("local_driver", "roadstead_001") and main.backpack.count("household_pantry") == 1)
		check("new process replay does not duplicate", main.road_life.state.transfer("roadstead_001", "household_pantry", true, "restart:take").ok and main.backpack.count("household_pantry") == 1)
	main.queue_free()
	await frames(4)
	exercised = true

func stage(position: Vector3) -> void:
	main.player.global_position = position
	main.player.velocity = Vector3.ZERO
	main.player.move_state = ProtoPlayer3D.FootState.NORMAL

func frames(count: int) -> void:
	for i: int in count:
		await get_tree().physics_frame

func action(id: String) -> void:
	var event: InputEventAction = InputEventAction.new()
	event.action = id
	event.pressed = true
	Input.parse_input_event(event)
	await frames(3)
	event = InputEventAction.new()
	event.action = id
	event.pressed = false
	Input.parse_input_event(event)
	await frames(3)

func hold_action(id: String, count: int) -> void:
	var event: InputEventAction = InputEventAction.new()
	event.action = id
	event.pressed = true
	Input.parse_input_event(event)
	await frames(count)
	event = InputEventAction.new()
	event.action = id
	event.pressed = false
	Input.parse_input_event(event)
	await frames(3)

func activate(id: String) -> void:
	if not main.road_life.panel.buttons.has(id):
		check("button available: " + id, false)
		return
	main.road_life.panel.buttons[id].grab_focus()
	await frames(2)
	await action("ui_accept")
	await frames(3)

func mouse_activate(id: String) -> void:
	if not main.road_life.panel.buttons.has(id):
		check("mouse button available: " + id, false)
		return
	var button: Button = main.road_life.panel.buttons[id]
	# Headless windows are 64px wide while the UI stays 1920px logical.
	# parse_input_event consumes physical-window coordinates, like a real mouse.
	var pointer: Vector2 = get_viewport().get_final_transform() * button.get_global_rect().get_center()
	var event: InputEventMouseButton = InputEventMouseButton.new()
	event.position = pointer
	event.button_index = MOUSE_BUTTON_LEFT
	event.pressed = true
	Input.parse_input_event(event)
	await frames(2)
	event = InputEventMouseButton.new()
	event.position = pointer
	event.button_index = MOUSE_BUTTON_LEFT
	Input.parse_input_event(event)
	await frames(5)
