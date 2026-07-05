## PROTO-3D — the CarWorld dream, proven in the engine we already have.
## Real vehicle physics (VehicleBody3D), top-down zoom camera, binocular cone,
## get out of the car, walk into the safehouse, go upstairs.
## Run this scene directly: res://proto3d/proto3d.tscn
extends Node3D

enum Mode { DRIVE, FOOT }

const INTERACT_RANGE := 3.4
const ZOOM_STEP := 0.07
const KILL_Y := -12.0

var mode: Mode = Mode.DRIVE
var player: ProtoPlayer3D
var cars: Array[ProtoCar3D] = []
var active_car: ProtoCar3D = null
var cam_rig: ProtoCameraRig
var vision_cone: ProtoVisionCone
var hud: ProtoHUD
var house: ProtoHouse

## Key ring: key_id -> display name.
var keys: Dictionary = {}

## Inventory & the shared interface (Container pillar): pack + panel + wounds.
var backpack: ProtoContainer = ProtoContainer.new("Backpack")
var panel: ProtoContainerPanel = null
var bleeding: int = 0 ## 0-3; crashes cause it, bandages cure it

## The Arsenal: owned guns + equipped index. Ammo lives in the backpack.
var weapons: Array = []
var equipped: int = -1
var aim_override: Vector3 = Vector3.ZERO ## sims set this (headless has no real mouse)

## Stage 3: the RPG spine — skills by use, 6-part body, health cap, permadeath.
var character: ProtoCharacter = ProtoCharacter.new()
var _wound_rng := RandomNumberGenerator.new()
var _odometer: float = 0.0
var _prev_car_pos: Vector3 = Vector3.ZERO

## Dogs & the Stress vital (docs/systems/DOGS.md)
var all_dogs: Array[ProtoDog] = []   ## every dog in the world (strays included)
var dogs: Array[ProtoDog] = []       ## adopted pack
var stress: float = 0.0              ## 0-100; throttles stamina regen
var last_dog_alert: Dictionary = {}  ## sim hook: {dog, behind, at}
var last_dog_nose: Dictionary = {}   ## sim hook: {dog, stash}

var audio: ProtoAudio = null
var _engine_loop: AudioStreamPlayer3D = null
var _fire_loop: AudioStreamPlayer3D = null

var _current_interactable: Node3D = null
var _last_safe: Vector3 = Vector3(2.5, 1.2, 390)
var _safe_timer: float = 0.0


func _ready() -> void:
	_build_environment()
	var info: Dictionary = ProtoWorldBuilder.build_world(self)
	house = info["house"]

	# Cars
	var colors: Array[Color] = [Color(0.62, 0.18, 0.12), Color(0.24, 0.32, 0.24)]
	var spawns: Array[Transform3D] = info["car_spawns"]
	for i in spawns.size():
		var car := ProtoCar3D.create(colors[i % colors.size()])
		car.transform = spawns[i]
		add_child(car)
		cars.append(car)
	cars[0].display_name = "Scavenger"
	# The car parked in Meridian is locked — its key is in the safehouse stash.
	cars[1].display_name = "sedan"
	cars[1].locked = true
	cars[1].key_id = "meridian_car_key"
	cars[1].key_display = "the Meridian car key"

	# Player starts driving car 0 on the interstate.
	player = ProtoPlayer3D.create()
	player.position = Vector3(6, 0.2, 388)
	add_child(player)

	cam_rig = ProtoCameraRig.create()
	add_child(cam_rig)

	vision_cone = ProtoVisionCone.create()
	add_child(vision_cone)

	hud = ProtoHUD.create()
	hud.layer = 2 # above the vision-cone dimmer
	add_child(hud)

	audio = ProtoAudio.new()
	add_child(audio)
	_wound_rng.randomize()
	character.leveled.connect(func(id: String, lvl: int) -> void:
		hud.toast("⬆️ %s %s reached level %d" % [ProtoCharacter.SKILLS[id]["emoji"], ProtoCharacter.SKILLS[id]["name"], lvl])
		audio.play_ui("blip", -4.0))
	character.died.connect(_on_death)

	panel = ProtoContainerPanel.create(self)
	add_child(panel)
	backpack.add("jack", 5)

	# A supply chest inside the safehouse — same interface as every trunk.
	# The shotgun lives here; the stash upstairs holds the pistol; rockets ride
	# in the SEDAN's trunk (the key/hotwire loop pays off in firepower).
	var chest := ProtoChest.create("Chest", {"bandage": 2, "meat": 2, "jack": 8, "shotgun": 1, "12ga": 10})
	chest.position = Vector3(108.2, 0.05, -324.0)
	add_child(chest)
	cars[1].trunk.add("pipe_rocket", 1)
	cars[1].trunk.add("rocket", 3)

	# The kennel strays: one of each type, distinct breeds.
	var kennel_specs: Array = [
		[ProtoDog.DogType.SECURITY, "Brutus", "Shepherd", Vector3(121.5, 0.4, -315)],
		[ProtoDog.DogType.HUNTER, "Scout", "Bloodhound", Vector3(124.5, 0.4, -315)],
		[ProtoDog.DogType.COMPANION, "Lucky", "Mutt", Vector3(121.5, 0.4, -317.5)],
		[ProtoDog.DogType.CUDDLE, "Biscuit", "Pocket", Vector3(124.5, 0.4, -317.5)],
	]
	for spec in kennel_specs:
		var dog := ProtoDog.create(spec[0], spec[1], spec[2])
		dog.position = spec[3]
		add_child(dog)
		all_dogs.append(dog)

	# Lurkers: something out there for the dogs to smell.
	for lpos in [Vector3(162, 0.4, -362), Vector3(14, 0.4, -110), Vector3(58, 0.4, -205)]:
		var lurker := ProtoLurker.create()
		lurker.position = lpos
		add_child(lurker)

	house.tracked = player
	enter_car(cars[0])
	cam_rig.snap_to_target()


func _build_environment() -> void:
	var sun := DirectionalLight3D.new()
	sun.rotation_degrees = Vector3(-52, -38, 0)
	sun.light_color = Color(1.0, 0.92, 0.78)
	sun.light_energy = 1.25
	sun.shadow_enabled = true
	sun.directional_shadow_max_distance = 140.0
	add_child(sun)

	var env := Environment.new()
	var sky := Sky.new()
	var sky_mat := ProceduralSkyMaterial.new()
	sky_mat.sky_top_color = Color(0.55, 0.62, 0.7)
	sky_mat.sky_horizon_color = Color(0.82, 0.72, 0.55)
	sky_mat.ground_bottom_color = Color(0.45, 0.38, 0.28)
	sky_mat.ground_horizon_color = Color(0.82, 0.72, 0.55)
	sky.sky_material = sky_mat
	env.background_mode = Environment.BG_SKY
	env.sky = sky
	env.ambient_light_source = Environment.AMBIENT_SOURCE_SKY
	env.ambient_light_energy = 0.6
	env.tonemap_mode = Environment.TONE_MAPPER_FILMIC
	env.fog_enabled = true
	env.fog_light_color = Color(0.78, 0.70, 0.55)
	env.fog_density = 0.0006
	env.fog_sky_affect = 0.3
	var we := WorldEnvironment.new()
	we.environment = env
	add_child(we)


func _unhandled_input(event: InputEvent) -> void:
	if event.is_action_pressed("interact"):
		if panel.is_open:
			panel.close()
		elif mode == Mode.DRIVE:
			_exit_car()
		elif _current_interactable and player.move_state == ProtoPlayer3D.FootState.NORMAL:
			_current_interactable.call("interact", self)
	elif event is InputEventKey and event.pressed and not event.echo:
		var kc := (event as InputEventKey).keycode
		if kc == KEY_C and not dogs.is_empty():
			for d in dogs:
				d.whistle()
			hud.toast("*whistle* — the pack returns")
		elif kc == KEY_TAB:
			if panel.is_open:
				panel.close()
			else:
				panel.open(backpack, null) # just your pack
		elif kc == KEY_R:
			if character.dead:
				get_tree().reload_current_scene()
			else:
				reload_equipped()
		elif kc == KEY_K:
			hud.toggle_sheet(_sheet_text())
		elif kc >= KEY_1 and kc <= KEY_3:
			var idx := kc - KEY_1
			if idx < weapons.size():
				equipped = idx
				notify("Equipped the %s" % weapons[idx].info()["name"])
	elif event is InputEventMouseButton and event.pressed \
			and (event as InputEventMouseButton).button_index == MOUSE_BUTTON_LEFT:
		if mode == Mode.FOOT and not cam_rig.binoculars:
			fire_equipped()
	elif event is InputEventMouseButton and event.pressed:
		var mb := event as InputEventMouseButton
		# While glassing, the wheel magnifies the binocular view; otherwise it zooms the camera.
		if mb.button_index == MOUSE_BUTTON_WHEEL_UP:
			if cam_rig.binoculars:
				cam_rig.add_binocular_zoom(0.25)
			else:
				cam_rig.add_zoom(-ZOOM_STEP)
		elif mb.button_index == MOUSE_BUTTON_WHEEL_DOWN:
			if cam_rig.binoculars:
				cam_rig.add_binocular_zoom(-0.25)
			else:
				cam_rig.add_zoom(ZOOM_STEP)


func _physics_process(delta: float) -> void:
	# Zoom fallback keys (no wheel on some setups)
	if Input.is_key_pressed(KEY_Z):
		cam_rig.add_zoom(-0.02)
	if Input.is_key_pressed(KEY_X):
		cam_rig.add_zoom(0.02)

	# Binoculars: hold B or right mouse. On foot, your body turns to follow the glass.
	var binoc := Input.is_key_pressed(KEY_B) or Input.is_mouse_button_pressed(MOUSE_BUTTON_RIGHT)
	cam_rig.binoculars = binoc
	hud.set_binoculars(binoc)
	if mode == Mode.FOOT:
		player.face_override = cam_rig.binocular_aim_dir() if binoc else Vector3.ZERO

	if mode == Mode.DRIVE and active_car:
		hud.set_speed(active_car.current_mph, true)
		hud.set_dashboard(active_car.dashboard())
		# Driving skill grows with miles, not menus.
		_odometer += active_car.global_position.distance_to(_prev_car_pos) if _prev_car_pos != Vector3.ZERO else 0.0
		_prev_car_pos = active_car.global_position
		if _odometer > 150.0:
			_odometer = 0.0
			grant_xp("driving", 2.0)
		# Riding a dead car is riding a coffin — throw the driver clear.
		if active_car.dead:
			hud.toast("The %s is GONE — get clear!" % active_car.display_name)
			cam_rig.add_trauma(0.9)
			hud.flash_pain()
			_exit_car()
	else:
		hud.set_speed(0.0, false)
		hud.set_dashboard(null)

	_update_audio_loops()
	var wpn := current_weapon()
	if wpn:
		wpn.tick(delta)
		hud.set_ammo(wpn.info()["emoji"], wpn.info()["name"], wpn.mag, backpack.count(wpn.info()["ammo"]), mode == Mode.FOOT)
	else:
		hud.set_ammo("", "", 0, 0, false)

	_update_stress(delta)
	_watch_crash_wounds()
	_update_vision_cone(delta, binoc)
	_update_interact_prompt()
	_update_hotwire(delta) # after the prompt poll — hotwire progress owns the chip while held
	_update_respawn(delta)
	_update_location_label()


## The perception cone: clear where you're looking, dim where you aren't.
## Follows the body on foot, the car while driving, and your AIM while glassing.
func _update_vision_cone(delta: float, binoc: bool) -> void:
	var cam := get_viewport().get_camera_3d()
	var body: Node3D = active_car if (mode == Mode.DRIVE and active_car) else player
	if cam == null or body == null:
		return
	var facing: Vector3 = body.call("facing") if body.has_method("facing") else Vector3.FORWARD
	var params: Array = ProtoVisionCone.MODE_DRIVE if mode == Mode.DRIVE else ProtoVisionCone.MODE_FOOT
	if binoc:
		params = ProtoVisionCone.MODE_BINOC
		var aim := cam_rig.binocular_aim_dir()
		if aim.length_squared() > 0.01:
			facing = aim
	vision_cone.update_cone(cam, body.global_position, facing, params, delta)


var _hotwire_t: float = 0.0

## Hold E next to a locked car (no key) to hotwire it — slow, and later: loud.
func _update_hotwire(delta: float) -> void:
	var target := _current_interactable as ProtoCar3D
	var valid: bool = mode == Mode.FOOT and target != null and target.locked \
		and not target.dead and not has_key(target.key_id)
	var dur := _hotwire_duration() # Mechanics skill speeds this up
	if valid and Input.is_action_pressed("interact"):
		_hotwire_t += delta
		hud.show_prompt("HOTWIRING the %s... %d%%" % [target.display_name, int(_hotwire_t / dur * 100.0)])
		if _hotwire_t >= dur:
			target.locked = false
			_hotwire_t = 0.0
			notify("Hotwired the %s" % target.display_name)
			grant_xp("mechanics", 12.0)
			stress = minf(100.0, stress + 8.0) # nerves — and later, noise/heat
	else:
		_hotwire_t = 0.0


## Engine hum pitches with speed; fire crackle rides any burning car.
func _update_audio_loops() -> void:
	if mode == Mode.DRIVE and active_car and not active_car.dead:
		if _engine_loop == null or not is_instance_valid(_engine_loop) or _engine_loop.get_parent() != active_car:
			if _engine_loop and is_instance_valid(_engine_loop):
				_engine_loop.queue_free()
			_engine_loop = audio.attach_loop("engine", active_car, -10.0)
		_engine_loop.pitch_scale = 0.75 + clampf(absf(active_car.forward_speed) / active_car.top_speed, 0.0, 1.0) * 1.5
	elif _engine_loop and is_instance_valid(_engine_loop):
		_engine_loop.queue_free()
		_engine_loop = null
	# Fire crackle on whatever car is burning near you
	var burning: ProtoCar3D = null
	for c in cars:
		if is_instance_valid(c) and c.fire_state == ProtoCar3D.FireState.ON_FIRE:
			burning = c
			break
	if burning and (_fire_loop == null or not is_instance_valid(_fire_loop)):
		_fire_loop = audio.attach_loop("fire", burning, -4.0)
	elif burning == null and _fire_loop and is_instance_valid(_fire_loop):
		_fire_loop.queue_free()
		_fire_loop = null


## The Stress vital: threats wind you up, Cuddle dogs calm you down, and stress
## throttles stamina regen (DOGS.md §2 — why comfort is a mechanic, not a skin).
func _update_stress(delta: float) -> void:
	var rise := 0.0
	if mode == Mode.FOOT:
		for node in get_tree().get_nodes_in_group("threat"):
			var t := node as Node3D
			if t and is_instance_valid(t) and t.global_position.distance_to(player.global_position) < 14.0:
				rise = 9.0
				break
	var calm := 3.0
	var comfort_near := false
	for d in dogs:
		var aura: float = d.params()["calm_aura"]
		if aura > 0.0 and is_instance_valid(d) and d.global_position.distance_to(player.global_position) < 6.0:
			calm += aura
			if aura >= 5.0:
				comfort_near = true # a true Cuddle dog at your side
	stress = clampf(stress + (rise - calm) * delta, 0.0, 100.0)
	player.stamina_regen_mult = lerpf(1.0, 0.35, stress / 100.0)
	# The moodle corner IS the meter display (PZ-style; user spec).
	hud.set_vitals(player.stamina, player.max_stamina, stress, comfort_near)


# --- Dog services (called by ProtoDog) ---------------------------------------

func register_dog(dog: ProtoDog) -> void:
	if not dogs.has(dog):
		dogs.append(dog)


func on_dog_alert(dog: ProtoDog, _threat: Node3D, behind: bool) -> void:
	last_dog_alert = {"dog": dog.dog_name, "behind": behind, "at": Time.get_ticks_msec()}
	var bark: String = dog.params()["bark"]
	audio.play_at("growl" if dog.dog_type == ProtoDog.DogType.SECURITY else "bark", dog.global_position)
	if behind:
		hud.toast("🐕 %s %s — something's BEHIND you!" % [dog.dog_name, bark])
	else:
		hud.toast("🐕 %s %s — something's out there" % [dog.dog_name, bark])
	stress = minf(100.0, stress + 6.0)


func on_dog_nose(dog: ProtoDog, stash: Node3D) -> void:
	last_dog_nose = {"dog": dog.dog_name, "stash": stash}
	hud.toast("🐕 %s points — something's stashed nearby" % dog.dog_name)


## Finds the nearest interactable with a live prompt and shows its chip.
func _update_interact_prompt() -> void:
	_current_interactable = null
	if mode == Mode.DRIVE:
		if active_car and active_car.current_mph < 8.0:
			hud.show_prompt("E — Get out")
		else:
			hud.show_prompt("")
		return
	var best: Node3D = null
	var best_d := INTERACT_RANGE
	var best_prompt := ""
	for node in get_tree().get_nodes_in_group("interactable"):
		var n := node as Node3D
		if n == null or not is_instance_valid(n):
			continue
		var p: Vector3 = n.call("interact_position")
		var d := p.distance_to(player.global_position)
		if d < best_d:
			var prompt: String = n.call("interact_prompt", self)
			if prompt != "":
				best = n
				best_d = d
				best_prompt = prompt
	_current_interactable = best
	hud.show_prompt(best_prompt)


## World-edge safety net (M2 streaming makes this obsolete): remember the last
## grounded position; anything that falls below KILL_Y comes back to it.
func _update_respawn(delta: float) -> void:
	var body: Node3D = active_car if mode == Mode.DRIVE else player
	if body == null:
		return
	_safe_timer += delta
	var grounded := false
	if body is RigidBody3D:
		grounded = absf((body as RigidBody3D).linear_velocity.y) < 0.6
	elif body is CharacterBody3D:
		grounded = (body as CharacterBody3D).is_on_floor()
	if _safe_timer > 1.0 and grounded and body.global_position.y > -1.0 and body.global_position.y < 30.0:
		_safe_timer = 0.0
		_last_safe = body.global_position
	if body.global_position.y < KILL_Y:
		body.global_position = _last_safe + Vector3(0, 2.0, 0)
		if body is RigidBody3D:
			(body as RigidBody3D).linear_velocity = Vector3.ZERO
			(body as RigidBody3D).angular_velocity = Vector3.ZERO
			body.global_transform = Transform3D(Basis.IDENTITY, _last_safe + Vector3(0, 2.0, 0))
		elif body is CharacterBody3D:
			(body as CharacterBody3D).velocity = Vector3.ZERO
		hud.toast("The wasteland spit you back out")


# --- The shared interface: containers, items, wounds -------------------------

## One call opens ANY container (trunk/chest/corpse) against your pack.
func open_container(theirs: ProtoContainer) -> void:
	panel.open(backpack, theirs)


## Item effects (data → verb). Returns true if consumed.
func use_item(id: String) -> bool:
	if ProtoWeapon.WEAPONS.has(id):
		for w in weapons:
			if w.id == id:
				notify("Already carrying the %s" % w.info()["name"])
				return false
		var wpn := ProtoWeapon.new(id)
		weapons.append(wpn)
		equipped = weapons.size() - 1
		notify("Equipped the %s (%s)" % [wpn.info()["name"], str(weapons.size())])
		return true
	match id:
		"bandage":
			if bleeding > 0 or character.worst_part() != "" and character.body[character.worst_part()].ratio() < 1.0:
				bleeding = 0
				hud.set_condition("hurt", 0)
				var part := character.worst_part()
				if part != "":
					character.treat(part, 30.0) # treatment = the part recovers, the CAP comes back
				notify("Bandaged the %s (cap %d)" % [part.replace("_", " "), int(character.hp_cap())])
				return true
			notify("No wound to bandage")
			return false
		"meat":
			stress = maxf(0.0, stress - 18.0)
			notify("Ate — nerves settle")
			return true
	return false


# --- Firing (COMBAT_AND_GEAR: aim is intent, shots fly the rolled vector) -----

func current_weapon() -> ProtoWeapon:
	return weapons[equipped] if equipped >= 0 and equipped < weapons.size() else null


## Where the player intends to shoot: mouse ray onto the aim plane (or sim override).
func aim_direction() -> Vector3:
	if aim_override.length_squared() > 0.01:
		return aim_override.normalized()
	var cam := get_viewport().get_camera_3d()
	if cam == null:
		return player.facing()
	var mouse := get_viewport().get_mouse_position()
	var from := cam.project_ray_origin(mouse)
	var dir := cam.project_ray_normal(mouse)
	if absf(dir.y) < 0.001:
		return player.facing()
	var t := (1.0 - from.y) / dir.y # intersect the y=1.0 aim plane
	var point := from + dir * t
	var out := point - player.global_position
	out.y = 0.0
	return out.normalized() if out.length_squared() > 0.01 else player.facing()


func fire_equipped() -> void:
	var w := current_weapon()
	if w == null or mode != Mode.FOOT or panel.is_open:
		return
	if w.mag <= 0:
		notify("*click* — reload (R)")
		return
	var dir := aim_direction()
	player.face_override = dir
	player.facing_dir = dir
	if w.fire(self, player.global_position + Vector3(0, 1.2, 0), dir):
		cam_rig.add_trauma(0.18)
		stress = minf(100.0, stress + 1.5) # gunfire frays nerves (and heat, later)
		audio.play_at("shotgun" if w.id == "shotgun" else "shot", player.global_position)


func reload_equipped() -> void:
	var w := current_weapon()
	if w == null:
		return
	var ammo_id: String = w.info()["ammo"]
	var need: int = w.info()["mag_size"] - w.mag
	var have := backpack.count(ammo_id)
	var take: int = mini(need, have)
	if take <= 0:
		notify("No %s left" % ammo_id)
		return
	backpack.remove(ammo_id, take)
	w.mag += take
	audio.play_ui("click", -4.0)
	notify("Reloaded (+%d)" % take)


func on_explosion(pos: Vector3) -> void:
	cam_rig.add_trauma(0.7)
	audio.play_at("explosion", pos, 4.0)
	if player.global_position.distance_to(pos) < 7.0:
		hud.flash_pain()
		give_bleeding(1)


## Crashes wound the DRIVER too (bandage from any trunk/chest/pack).
func give_bleeding(tier: int) -> void:
	bleeding = clampi(maxi(bleeding, tier), 0, 3)
	hud.set_condition("hurt", bleeding)
	if tier > 0:
		# The wound lands on a real body part; the HEALTH CAP drops with it.
		character.take_wound(character.random_part(_wound_rng), 8.0 + 8.0 * tier)
		audio.play_at("hurt", player.global_position, -2.0)
		hud.toast("🩸 You're hurt (cap %d) — find a bandage" % int(character.hp_cap()))
		stress = minf(100.0, stress + 10.0)


func grant_xp(id: String, amount: float) -> void:
	character.add_xp(id, amount)


## The character sheet (K) — stats speak emoji, per the moodle law.
func _sheet_text() -> String:
	var lines: Array[String] = []
	lines.append("❤️ HP %d / %d (cap)" % [int(character.hp), int(character.hp_cap())])
	lines.append("")
	var tier_txt: Array = ["GOOD", "WORN", "CRITICAL", "BROKEN"]
	for part in ProtoCharacter.PART_NAMES:
		var d: Damageable = character.body[part]
		lines.append("%s %-7s %s" % [d.emoji, part.replace("_", " "), tier_txt[d.tier()]])
	lines.append("")
	for id in ProtoCharacter.SKILLS:
		var s: Dictionary = character.skills[id]
		lines.append("%s %-13s lv %d  (%d xp)" % [ProtoCharacter.SKILLS[id]["emoji"], ProtoCharacter.SKILLS[id]["name"], s["level"], int(s["xp"])])
	lines.append("")
	lines.append("🪙 Jack: %d   🩸 bleeding: %s   😰 stress: %d" % [backpack.count("jack"), str(bleeding), int(stress)])
	return "\n".join(lines)


func _hotwire_duration() -> float:
	return maxf(2.5, 5.0 - 0.5 * character.level("mechanics"))


func _on_death() -> void:
	player.is_active = false
	if active_car:
		active_car.is_active = false
	hud.show_death("YOU DIED — the Deathlands keep what they take.\nPress R to start a new run.")
	cam_rig.add_trauma(1.0)


var _last_chassis: float = -1.0

func _watch_crash_wounds() -> void:
	if mode != Mode.DRIVE or active_car == null or active_car.dead:
		_last_chassis = -1.0
		return
	var c: float = active_car.components["chassis"].hp
	if _last_chassis > 0.0 and _last_chassis - c > 15.0:
		give_bleeding(1 if _last_chassis - c < 30.0 else 2)
		hud.flash_pain()
		cam_rig.add_trauma(0.55)
	elif _last_chassis > 0.0 and _last_chassis - c > 5.0:
		cam_rig.add_trauma(0.3) # every real hit bumps the camera
	_last_chassis = c


# --- Key ring / interactable services ---------------------------------------

func has_key(key_id: String) -> bool:
	return keys.has(key_id)


func give_key(key_id: String, display: String) -> void:
	keys[key_id] = display
	hud.set_keys(keys.values())
	hud.toast("Got %s" % display)


func notify(text: String) -> void:
	hud.toast(text)


func _update_location_label() -> void:
	var pos := active_car.global_position if (mode == Mode.DRIVE and active_car) else player.global_position
	if pos.x > 35.0:
		hud.set_location("MERIDIAN — POP. UNKNOWN")
	else:
		hud.set_location("DEATHLANDS — INTERSTATE 9")


func enter_car(car: ProtoCar3D) -> void:
	mode = Mode.DRIVE
	active_car = car
	car.is_active = true
	player.is_active = false
	player.visible = false
	player.process_mode = Node.PROCESS_MODE_DISABLED
	cam_rig.target = car
	hud.set_mode(true)


func _exit_car() -> void:
	if active_car == null:
		return
	mode = Mode.FOOT
	active_car.is_active = false
	# Step out on the driver's side (left). global_basis.x is the car's RIGHT, so negate it.
	var out_pos := active_car.global_position - active_car.global_basis.x * 2.3
	out_pos.y = active_car.global_position.y + 0.3
	player.global_position = out_pos
	player.velocity = Vector3.ZERO
	player.process_mode = Node.PROCESS_MODE_INHERIT
	player.visible = true
	player.is_active = true
	cam_rig.target = player
	active_car = null
	hud.set_mode(false)
