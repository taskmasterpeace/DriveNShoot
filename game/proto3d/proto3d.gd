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

## Navigation: N cycles points of interest; the HUD draws the arrow.
const CARRY_CAP := 32.0 ## kg-ish; STR raises this later (attributes hook)
var waypoints: Array = [] ## [name, Vector3-or-Node3D]
var waypoint_idx: int = -1
var stream: ProtoWorldStream = null

## Dogs & the Stress vital (docs/systems/DOGS.md)
var all_dogs: Array[ProtoDog] = []   ## every dog in the world (strays included)
var dogs: Array[ProtoDog] = []       ## adopted pack
var stress: float = 0.0              ## 0-100; throttles stamina regen
var last_dog_alert: Dictionary = {}  ## sim hook: {dog, behind, at}
var last_dog_nose: Dictionary = {}   ## sim hook: {dog, stash}

## Stage 6 slice: the Respect Ledger + town work (WORLD_NPCS.md §6 — the town
## remembers you: esteem opens jobs and drops prices, infamy closes both).
var respect: ProtoRespect = ProtoRespect.new()
var bounty: Dictionary = {} ## {state: ""/open/filled, target, reward, giver, last_pos}
var _crime_cd: float = 0.0
var _last_standing: String = "NEUTRAL"

## The metaworld (METASYSTEM.md) + the 4-in-1 whistle button.
var metaworld: ProtoMetaworld = null
const WHISTLE_HOLD := 0.35
const WHISTLE_TAPWIN := 0.32
var _wh_down: bool = false
var _wh_down_t: float = 0.0
var _wh_hold_fired: bool = false
var _wh_taps: int = 0
var _wh_gap: float = 0.0
var last_whistle: String = "" ## sim hook

var audio: ProtoAudio = null
## YOUR engine is non-positional: camera zoom must never silence the machine
## under you (playtest). World sounds (fire, other cars later) stay 3D.
var _engine_loop: AudioStreamPlayer = null
var _fire_loop: AudioStreamPlayer3D = null

var _current_interactable: Node3D = null
var _last_safe: Vector3 = Vector3(2.5, 1.2, 390)
var _safe_timer: float = 0.0

## Perception FADE (PZ-style): things outside your sight fade out; static things
## you've already seen stay a faint "memory" ghost. See METASYSTEM/ENGINE §5.
var _percept_origin: Vector3 = Vector3.ZERO
var _percept_facing: Vector3 = Vector3.FORWARD
var _fade_recompute_t: float = 0.0
var _fade_target: Dictionary = {}   ## entity -> target transparency
var _fade_cur: Dictionary = {}      ## entity -> current transparency
var _fade_meshes: Dictionary = {}   ## entity -> Array[MeshInstance3D] (cached)
var _seen_ids: Dictionary = {}      ## instance_id -> true (the "memory")


func _ready() -> void:
	_build_environment()
	var info: Dictionary = ProtoWorldBuilder.build_world(self)
	house = info["house"]

	# Cars
	var colors: Array[Color] = [Color(0.62, 0.18, 0.12), Color(0.24, 0.32, 0.24)]
	var spawns: Array[Transform3D] = info["car_spawns"]
	for i in spawns.size():
		var car := ProtoCar3D.create("scavenger", colors[i % colors.size()])
		car.transform = spawns[i]
		add_child(car)
		cars.append(car)
	cars[0].display_name = "Scavenger"
	# The car parked in Meridian is locked — its key is in the safehouse stash.
	cars[1].display_name = "sedan"
	cars[1].locked = true
	cars[1].key_id = "meridian_car_key"
	cars[1].key_display = "the Meridian car key"

	# THE FLEET (VEHICLES.md §8): five wildly different rides scattered where
	# you'll actually meet them. Every one is just a data row.
	var fleet: Array = [
		["motorcycle", Color(0.16, 0.16, 0.18), Vector3(98, 0.5, -288), 0.0],
		["van", Color(0.5, 0.46, 0.38), Vector3(122, 0.5, -292), PI / 2.0],
		["buggy", Color(0.66, 0.42, 0.14), Vector3(46, 0.5, -272), -0.6],
		["pickup", Color(0.45, 0.2, 0.12), Vector3(70, 0.5, -300), 0.4], # the off-road truck, parked in the dirt
		["semi", Color(0.24, 0.3, 0.42), Vector3(-11, 0.8, -150), 0.0],
	]
	for f in fleet:
		var v := ProtoCar3D.create(f[0], f[1])
		v.position = f[2]
		v.rotation.y = f[3]
		add_child(v)
		cars.append(v)
		if f[0] == "motorcycle":
			v.rider_thrown.connect(_on_rider_thrown.bind(v))
		elif f[0] == "semi":
			# The Longhaul spawns with its trailer already coupled, pointing north.
			var trailer := ProtoCar3D.create("trailer", Color(0.55, 0.53, 0.5))
			trailer.position = f[2] + Vector3(0, 0, 7.3)
			trailer.rotation.y = f[3]
			add_child(trailer)
			cars.append(trailer)
			ProtoCar3D.couple(v, trailer)
			trailer.trunk.add("scrap", 12) # something heavy already riding it

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
	var chest := ProtoChest.create("Chest", {"bandage": 2, "meat": 2, "jack": 8, "shotgun": 1, "12ga": 10, "eyepatch": 1})
	chest.position = Vector3(108.2, 0.05, -324.0)
	add_child(chest)
	cars[1].trunk.add("pipe_rocket", 1)
	cars[1].trunk.add("rocket", 3)
	# Stage 4: melee + throwables in the world. The hood MG default is GONE
	# (playtest): in a vehicle you fire YOUR OWN gun out the window (LMB).
	# The mount SYSTEM stays in code for a later build.
	backpack.add("wrench", 1)
	chest.container.add("machete", 1)
	chest.container.add("grenade", 2)

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

	# Stage 6 slice: MERIDIAN LIVES — a trader to spend jack at, a Sec-Man with
	# work. The market sits ACROSS the street from the safehouse — deliberately
	# clear of the kennel→chest corridor (dogs charge in straight lines; furniture
	# on their desire path traps them — dogmeta taught us).
	var trader := ProtoNPC.create("trader")
	trader.position = Vector3(100.0, 0.2, -315.0)
	add_child(trader)
	ProtoWorldBuilder.box_body(self, Vector3(1.8, 0.9, 0.7), Vector3(100.0, 0.45, -316.2), Color(0.40, 0.30, 0.18))
	var secman := ProtoNPC.create("secman")
	secman.position = Vector3(104.0, 0.2, -314.0)
	add_child(secman)
	respect.changed.connect(_on_respect_changed)

	waypoints = [["SAFEHOUSE", Vector3(110, 0, -325)], ["KENNEL", Vector3(123, 0, -316)], ["YOUR CAR", cars[0]]]

	stream = ProtoWorldStream.new()
	add_child(stream)
	stream.setup(waypoints)

	metaworld = ProtoMetaworld.new()
	add_child(metaworld)
	metaworld.setup(self)
	metaworld.come_home.connect(func(text: String) -> void: hud.toast(text))

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
	elif event is InputEventKey and (event as InputEventKey).keycode == KEY_C and not (event as InputEventKey).echo:
		_whistle_input((event as InputEventKey).pressed)
	elif event is InputEventKey and event.pressed and not event.echo:
		var kc := (event as InputEventKey).keycode
		if kc == KEY_TAB:
			if panel.is_open:
				panel.close()
			else:
				panel.open(backpack, null) # just your pack
		elif kc == KEY_R:
			if character.dead:
				get_tree().reload_current_scene()
			elif mode == Mode.DRIVE and active_car and active_car.mount_weapon:
				_reload_mount()
			else:
				reload_equipped()
		elif kc == KEY_G:
			throw_grenade()
		elif kc == KEY_M:
			stream.toggle_map()
		elif kc == KEY_K:
			hud.toggle_sheet(_sheet_text())
		elif kc == KEY_N:
			waypoint_idx = ((waypoint_idx + 2) % (waypoints.size() + 1)) - 1 # -1(off) -> 0 -> 1 -> 2 -> -1
			if waypoint_idx >= 0:
				hud.toast("📍 Waypoint: %s" % waypoints[waypoint_idx][0])
			else:
				hud.toast("📍 Waypoint off")
		elif kc >= KEY_1 and kc <= KEY_3:
			var idx := kc - KEY_1
			if idx < weapons.size():
				equipped = idx
				notify("Equipped the %s" % weapons[idx].info()["name"])
	elif event is InputEventMouseButton and event.pressed \
			and (event as InputEventMouseButton).button_index == MOUSE_BUTTON_LEFT:
		if panel.is_open or cam_rig.binoculars:
			pass
		elif mode == Mode.FOOT:
			fire_equipped()
		elif mode == Mode.DRIVE:
			# Mounts are optional hardware now; by default you shoot YOUR gun.
			if active_car and active_car.mount_weapon:
				fire_mount()
			else:
				fire_from_vehicle()
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

	# Binoculars: hold B or right mouse. One gaze pipeline: glassing and gunfighting
	# both feed AIM INTENT, and the Look Arc drags the body when the target is past
	# the head's limit — you physically turn to glass or shoot behind you.
	var binoc := Input.is_key_pressed(KEY_B) or Input.is_mouse_button_pressed(MOUSE_BUTTON_RIGHT)
	cam_rig.binoculars = binoc
	hud.set_binoculars(binoc)
	if mode == Mode.FOOT:
		# TWIN-STICK: the arms/gun track the mouse ALWAYS — you no longer have to
		# fire to look where you're pointing. Binoculars feed the same intent.
		var bdir := cam_rig.binocular_aim_dir()
		if binoc and bdir.length_squared() > 0.01:
			player.set_aim_intent(bdir)
		elif not panel.is_open:
			player.set_aim_intent(aim_direction())
		else:
			player.clear_aim_intent()

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
	if mode == Mode.FOOT:
		player.set_armed(wpn != null)
	if mode == Mode.DRIVE and active_car and active_car.mount_weapon:
		active_car.mount_weapon.tick(delta)
		var mw: ProtoWeapon = active_car.mount_weapon
		hud.set_ammo(mw.info()["emoji"], mw.info()["name"], mw.mag, backpack.count(mw.info()["ammo"]), true)
		hud.update_reticle(mw.current_spread(self), get_viewport().get_mouse_position(), true)
	elif wpn and mode == Mode.DRIVE:
		# Your own iron rides with you: ammo + reticle stay live behind the wheel.
		var is_md := wpn.is_melee()
		hud.set_ammo(wpn.info()["emoji"], wpn.info()["name"], wpn.mag if not is_md else 0, backpack.count(wpn.info()["ammo"]) if not is_md else 0, true)
		hud.update_reticle(wpn.current_spread(self), get_viewport().get_mouse_position(), not is_md)
	elif wpn and mode == Mode.FOOT:
		var is_m := wpn.is_melee()
		hud.set_ammo(wpn.info()["emoji"], wpn.info()["name"], wpn.mag if not is_m else 0, backpack.count(wpn.info()["ammo"]) if not is_m else 0, true)
		hud.update_reticle(wpn.current_spread(self), get_viewport().get_mouse_position(), not is_m and not cam_rig.binoculars, player.aim_pinned())
	else:
		hud.set_ammo("", "", 0, 0, false)
		hud.update_reticle(0.0, Vector2.ZERO, false)

	# Encumbrance: an overloaded pack slows your legs (STR raises the cap later).
	var load := backpack.total_weight()
	var over := load / CARRY_CAP
	player.speed_mult = 1.0 if over <= 1.0 else maxf(0.45, 1.0 - (over - 1.0) * 0.8)
	hud.set_condition("heavy", 0 if over <= 1.0 else (3 if over > 1.5 else 1))

	# Waypoint arrow + world streaming
	var cam := get_viewport().get_camera_3d()
	var body_pos: Vector3 = (active_car if mode == Mode.DRIVE and active_car else player).global_position
	stream.update_stream(body_pos, self)
	if waypoint_idx >= 0 and cam:
		var wp: Array = waypoints[waypoint_idx]
		var tpos: Vector3 = wp[1].global_position if wp[1] is Node3D else wp[1]
		hud.update_nav(cam, body_pos, tpos, wp[0])
	else:
		hud.update_nav(cam, body_pos, Vector3.ZERO, "")

	hud.set_hp(character.hp, character.hp_cap(), not character.dead)
	_crime_cd = maxf(0.0, _crime_cd - delta)
	_update_bounty()
	_update_whistle(delta)
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
	if mode == Mode.FOOT:
		# The cone follows your EYES (torso) — it lags the gun and keeps the rear
		# blind spot. While glassing, it rides the aim so you see where you point.
		facing = player.aim_facing() if binoc else player.sight_facing()
	elif mode == Mode.DRIVE and active_car:
		# Look where you're GOING, not where the nose is pointed: in a drift the
		# chassis yaws off travel, and facing the nose read as "looking sideways
		# while driving straight" (playtest). Fall back to the nose when crawling.
		var vel := active_car.linear_velocity
		vel.y = 0.0
		if vel.length() > 4.0:
			facing = vel.normalized()
	var params: Array = ProtoVisionCone.MODE_DRIVE if mode == Mode.DRIVE else ProtoVisionCone.MODE_FOOT
	if binoc:
		params = ProtoVisionCone.MODE_BINOC
		if mode == Mode.DRIVE:
			var aim := cam_rig.binocular_aim_dir()
			if aim.length_squared() > 0.01:
				facing = aim # glassing from the cab pans free (no neck sim in a car yet)
	elif character.vision_yaw_offset != 0.0:
		facing = facing.rotated(Vector3.UP, character.vision_yaw_offset) # eye patch: lose a SIDE
	# The raycast pass is HERE now: the LOS fan stops sight at walls and spills
	# through doorways/windows — indoors or out. (Replaces the old flat "~5.5m
	# indoors" clamp; the room's real shape is the clamp.)
	var range_mult := character.vision_range_mult
	_refresh_sight_exclusions()
	var reach: float = maxf(params[2] * clampf(range_mult, 0.12, 2.0), params[1])
	var occl := _cast_sight_fan(body.global_position, reach)
	vision_cone.update_cone(cam, body.global_position, facing, params, delta,
		character.vision_arc_mult, range_mult, occl)
	_percept_origin = body.global_position
	_percept_facing = facing
	_update_perception_fade(delta)


# --- LOS occlusion (the raycast pass): walls end sight, apertures let it through --

const SIGHT_RAYS := 96
var _sight_excl: Array[RID] = []


## Bodies that never BLOCK sight — you, cars, dogs, threats. Bodies aren't walls;
## only world statics (walls, closed doors, terrain) end a sight ray.
func _refresh_sight_exclusions() -> void:
	_sight_excl.clear()
	if player:
		_sight_excl.append(player.get_rid())
	for c in cars:
		if is_instance_valid(c):
			_sight_excl.append(c.get_rid())
	for g in ["threat", "proto_dog", "npc"]:
		for node in get_tree().get_nodes_in_group(g):
			var b := node as PhysicsBody3D
			if b and is_instance_valid(b):
				_sight_excl.append(b.get_rid())


## TRUE if world geometry (a wall, a closed door) stands between two points.
## The FADE asks it per entity; the lurker asks it before freezing ("can he
## actually SEE me?"). Uses the exclusion list refreshed each physics frame.
func sight_blocked(from_eye: Vector3, to_eye: Vector3) -> bool:
	var space: PhysicsDirectSpaceState3D = player.get_world_3d().direct_space_state
	var q := PhysicsRayQueryParameters3D.create(from_eye, to_eye)
	q.exclude = _sight_excl
	return not space.intersect_ray(q).is_empty()


## The sight fan: SIGHT_RAYS horizontal rays at eye height, full 360° starting
## at -PI. Each entry = meters until a wall (or `reach`). Feeds the cone
## shader's 1D depth map and occl_range_at() queries. Rays start inside your
## own capsule — hit_from_inside is off by default, and dynamics are excluded.
func _cast_sight_fan(apex: Vector3, reach: float) -> PackedFloat32Array:
	var out := PackedFloat32Array()
	out.resize(SIGHT_RAYS)
	var space: PhysicsDirectSpaceState3D = player.get_world_3d().direct_space_state
	var eye := apex + Vector3(0, 1.5, 0)
	for i in SIGHT_RAYS:
		var ang := -PI + (float(i) + 0.5) / float(SIGHT_RAYS) * TAU
		var dir := Vector3(cos(ang), 0, sin(ang))
		var q := PhysicsRayQueryParameters3D.create(eye, eye + dir * reach)
		q.exclude = _sight_excl
		var hit: Dictionary = space.intersect_ray(q)
		out[i] = clampf((hit["position"] as Vector3).distance_to(eye), 0.4, reach) if not hit.is_empty() else reach
	return out


## Things outside your sight fade out; static things you've seen linger as a ghost.
func _update_perception_fade(delta: float) -> void:
	_fade_recompute_t -= delta
	if _fade_recompute_t <= 0.0:
		_fade_recompute_t = 0.09 # recompute membership ~11 Hz; lerp every frame
		var half: float = vision_cone.current_half_angle()
		var range_m: float = maxf(vision_cone.last_range_m, 8.0)
		var near_m: float = maxf(vision_cone.last_clear_m, 4.0)
		var cos_half: float = cos(half)
		var fdir := _percept_facing
		fdir.y = 0.0
		fdir = fdir.normalized() if fdir.length_squared() > 0.01 else Vector3.FORWARD
		var seen: Dictionary = {}
		for g in ["threat", "proto_dog", "interactable"]:
			for node in get_tree().get_nodes_in_group(g):
				var e := node as Node3D
				if e == null or not is_instance_valid(e) or e == player or e == active_car:
					continue
				var to := e.global_position - _percept_origin
				to.y = 0.0
				var d := to.length()
				if d > 100.0:
					continue
				var in_shape: bool = d < near_m or (d < range_m and fdir.dot(to.normalized()) > cos_half)
				# Walls end sight: cone membership means nothing without LOS.
				var is_seen: bool = in_shape and not sight_blocked(
					_percept_origin + Vector3(0, 1.5, 0), e.global_position + Vector3(0, 0.9, 0))
				if is_seen:
					_seen_ids[e.get_instance_id()] = true
				var dynamic: bool = e is ProtoLurker or e is ProtoDog
				var remembered: bool = _seen_ids.has(e.get_instance_id())
				# seen -> solid; unseen dynamic -> nearly gone; unseen static-you've-seen -> ghost.
				_fade_target[e] = 0.0 if is_seen else (0.88 if dynamic else (0.5 if remembered else 0.9))
				seen[e] = true
		# forget entities that left range/freed
		for e in _fade_target.keys():
			if not seen.has(e) or not is_instance_valid(e):
				_fade_target.erase(e)
				_fade_cur.erase(e)
				_fade_meshes.erase(e)

	# Lerp every frame (cheap) toward the target and apply.
	var k := 1.0 - exp(-9.0 * delta)
	for e in _fade_target.keys():
		if not is_instance_valid(e):
			continue
		var cur: float = _fade_cur.get(e, 0.0)
		cur = lerpf(cur, _fade_target[e], k)
		_fade_cur[e] = cur
		_apply_transparency(e, cur)


func _apply_transparency(e: Node3D, t: float) -> void:
	var meshes: Array = _fade_meshes.get(e, [])
	if meshes.is_empty():
		_collect_meshes(e, meshes)
		_fade_meshes[e] = meshes
	for m in meshes:
		if is_instance_valid(m):
			(m as MeshInstance3D).transparency = t


func _collect_meshes(n: Node, out: Array) -> void:
	for c in n.get_children():
		if c is MeshInstance3D:
			out.append(c)
		if c.get_child_count() > 0:
			_collect_meshes(c, out)


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
		if _engine_loop == null or not is_instance_valid(_engine_loop):
			_engine_loop = audio.attach_flat_loop("engine", -10.0)
		_engine_loop.pitch_scale = 0.75 + clampf(absf(active_car.forward_speed) / maxf(active_car.top_speed, 1.0), 0.0, 1.0) * 1.5
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
		if not is_instance_valid(d): # dogs dehydrate now — always check first
			continue
		var aura: float = d.params()["calm_aura"]
		if aura > 0.0 and d.global_position.distance_to(player.global_position) < 6.0:
			calm += aura
			if aura >= 5.0:
				comfort_near = true # a true Cuddle dog at your side
	stress = clampf(stress + (rise - calm) * delta, 0.0, 100.0)
	player.stamina_regen_mult = lerpf(1.0, 0.35, stress / 100.0)
	# The moodle corner IS the meter display (PZ-style; user spec).
	hud.set_vitals(player.stamina, player.max_stamina, stress, comfort_near)


# --- Dog services (called by ProtoDog) ---------------------------------------

func register_dog(dog: ProtoDog) -> void:
	for i in range(dogs.size() - 1, -1, -1):
		if not is_instance_valid(dogs[i]):
			dogs.remove_at(i)
	if not dogs.has(dog):
		dogs.append(dog)


func _whistle_input(pressed: bool) -> void:
	if pressed:
		if not _wh_down:
			_wh_down = true
			_wh_down_t = 0.0
			_wh_hold_fired = false
	elif _wh_down:
		_wh_down = false
		if not _wh_hold_fired:
			_wh_taps += 1
			_wh_gap = 0.0


## One button, four whistles: tap = heel, double = guard, triple = seek, hold = sic.
func _update_whistle(delta: float) -> void:
	if _wh_down:
		_wh_down_t += delta
		if _wh_down_t >= WHISTLE_HOLD and not _wh_hold_fired:
			_wh_hold_fired = true
			_dog_command("sic")
	elif _wh_taps > 0:
		_wh_gap += delta
		if _wh_gap >= WHISTLE_TAPWIN:
			match _wh_taps:
				1: _dog_command("heel")
				2: _dog_command("guard")
				_: _dog_command("seek")
			_wh_taps = 0


func _dog_command(cmd: String) -> void:
	last_whistle = cmd
	if dogs.is_empty():
		return
	match cmd:
		"heel":
			for d in dogs:
				if is_instance_valid(d): d.command_heel()
			hud.toast("🐕 *whistle* — heel!")
		"guard":
			for d in dogs:
				if is_instance_valid(d): d.command_guard(player.global_position)
			hud.toast("🐕 *whistle-whistle* — GUARD this spot!")
		"seek":
			var loot := _nearest_loot()
			for d in dogs:
				if is_instance_valid(d): d.command_seek(loot)
			hud.toast("🐕 *whistle ×3* — go find it!" if loot else "🐕 *whistle ×3* — nothing to sniff out")
		"sic":
			var threat := _nearest_threat()
			for d in dogs:
				if is_instance_valid(d): d.command_sic(threat)
			hud.toast("🐕 *loooong whistle* — SIC 'EM!" if threat else "🐕 *long whistle* — no target near")


func _nearest_threat() -> Node3D:
	var best: Node3D = null
	var bd: float = 60.0
	for node in get_tree().get_nodes_in_group("threat"):
		var t := node as Node3D
		if t and is_instance_valid(t):
			var dd := t.global_position.distance_to(player.global_position)
			if dd < bd:
				bd = dd
				best = t
	return best


func _nearest_loot() -> Node3D:
	var best: Node3D = null
	var bd: float = 90.0
	for node in get_tree().get_nodes_in_group("interactable"):
		if not (node is ProtoStash or node is ProtoChest):
			continue
		if node is ProtoStash and (node as ProtoStash).taken:
			continue
		var np := node as Node3D
		if is_instance_valid(np):
			var dd := np.global_position.distance_to(player.global_position)
			if dd < bd:
				bd = dd
				best = np
	return best


func on_dog_alert(dog: ProtoDog, _threat: Node3D, behind: bool) -> void:
	last_dog_alert = {"dog": dog.dog_name, "behind": behind, "at": Time.get_ticks_msec()}
	# The dog's senses become YOURS: a snapshot bubble where it smelled the threat.
	if _threat and is_instance_valid(_threat):
		vision_cone.reveal_at(_threat.global_position)
	var bark: String = dog.params()["bark"]
	audio.play_at("growl" if dog.dog_type == ProtoDog.DogType.SECURITY else "bark", dog.global_position)
	if behind:
		hud.toast("🐕 %s %s — something's BEHIND you!" % [dog.dog_name, bark])
	else:
		hud.toast("🐕 %s %s — something's out there" % [dog.dog_name, bark])
	stress = minf(100.0, stress + 6.0)


func on_dog_nose(dog: ProtoDog, stash: Node3D) -> void:
	last_dog_nose = {"dog": dog.dog_name, "stash": stash}
	if stash and is_instance_valid(stash):
		vision_cone.reveal_at(stash.global_position)
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
		# Respawn NUDGED toward the world center so a rim-recorded safe spot
		# can't dump you straight back over the edge (fall-loop bug).
		var safe := _last_safe
		var inward := -Vector3(safe.x, 0, safe.z).normalized() if safe.length() > 10.0 else Vector3.ZERO
		safe += inward * 12.0 + Vector3(0, 2.0, 0)
		if body is RigidBody3D:
			(body as RigidBody3D).linear_velocity = Vector3.ZERO
			(body as RigidBody3D).angular_velocity = Vector3.ZERO
			body.global_transform = Transform3D(Basis.IDENTITY, safe)
		elif body is CharacterBody3D:
			body.global_position = safe
			(body as CharacterBody3D).velocity = Vector3.ZERO
		hud.toast("The wasteland spit you back out")


# --- The shared interface: containers, items, wounds -------------------------

## One call opens ANY container (trunk/chest/corpse) against your pack.
func open_container(theirs: ProtoContainer) -> void:
	panel.open(backpack, theirs)


# --- Stage 6 slice: trade, bounties, crime (the town remembers) ---------------

## Trading IS the container interface with jack flowing backward (§7 multi-use:
## the same panel that loots a trunk is the shop).
func open_trade(npc: ProtoNPC) -> void:
	panel.open(backpack, npc.stock, npc)


## price = archetype base × the ledger's opinion of you. Selling pays about
## half, sweetened as the town trusts you more.
func trade_price(id: String, selling: bool) -> int:
	var base: int = ProtoNPC.PRICES.get(id, 3)
	var mult: float = respect.price_mult(ProtoNPC.FACTION)
	if selling:
		return maxi(1, int(floor(base * 0.5 * (2.0 - mult))))
	return maxi(1, int(ceil(base * mult)))


## The Sec-Man's job chain: offer → live → claim. Standing gates it upstream
## (a SUSPECT never even hears the offer — ProtoNPC.interact refuses first).
func secman_talk(npc: ProtoNPC) -> void:
	match bounty.get("state", ""):
		"open":
			notify("Bridger: 'It's still breathing. The jack waits.'")
		"filled":
			var reward: int = int(bounty.get("reward", 25))
			backpack.add("jack", reward)
			respect.add_esteem(ProtoNPC.FACTION, 20.0)
			notify("Bridger: 'Clean work.' +%d jack — Meridian noticed." % reward)
			bounty = {}
			for i in range(waypoints.size() - 1, -1, -1):
				if waypoints[i][0] == "BOUNTY":
					waypoints.remove_at(i)
			waypoint_idx = mini(waypoint_idx, waypoints.size() - 1)
			audio.play_ui("blip", -2.0)
		_:
			var mark := ProtoLurker.create()
			add_child(mark)
			mark.global_position = Vector3(146.0, 0.4, -352.0) # the water point
			bounty = {"state": "open", "target": mark, "reward": 25,
				"giver": npc.npc_name, "last_pos": mark.global_position}
			waypoints.append(["BOUNTY", mark])
			notify(ProtoNPC.ARCHETYPES[npc.archetype]["greet"])
			audio.play_ui("blip", -6.0)


## The bounty tick: notice the kill the moment it happens; the waypoint keeps
## pointing at where it FELL once the node is gone.
func _update_bounty() -> void:
	if bounty.get("state", "") != "open":
		return
	# UNTYPED on purpose: a freed instance can't be assigned to a typed Node3D
	# (house gotcha) — is_instance_valid does the sorting.
	var tgt: Variant = bounty.get("target")
	if tgt != null and is_instance_valid(tgt) and not tgt.dead:
		bounty["last_pos"] = tgt.global_position
		return
	bounty["state"] = "filled"
	for wp in waypoints:
		if wp[0] == "BOUNTY":
			wp[1] = bounty.get("last_pos", player.global_position)
	notify("🎯 Bounty filled — see Bridger for your jack")
	grant_xp("marksmanship", 4.0)


## A bullet into a townsperson: the ledger takes INFAMY, the town closes up.
func on_npc_attacked(_npc: ProtoNPC, _dmg: float) -> void:
	if _crime_cd > 0.0:
		return # one crime per volley — a shotgun blast isn't six separate murders
	_crime_cd = 1.0
	respect.add_infamy(ProtoNPC.FACTION, 60.0)
	stress = minf(100.0, stress + 12.0)
	notify("🚨 Word spreads fast in Meridian")


func _on_respect_changed(faction: String) -> void:
	var s := respect.standing(faction)
	if s != _last_standing:
		_last_standing = s
		hud.toast("🏛️ MERIDIAN now sees you as %s" % s)


## Item effects (data → verb). Returns true if consumed.
func use_item(id: String) -> bool:
	if id == "eyepatch":
		character.set_eyepatch(not character.eyepatch)
		notify("You cover one eye — half the world goes dark" if character.eyepatch else "Both eyes open again")
		return false # toggles; never consumed
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


## The world POINT under the cursor (mouse ray onto the aim plane; sims project
## their override direction 25 m out). Bullets converge EXACTLY here — the gun
## rides in the right hand, so firing along (point - muzzle) is what makes the
## cursor honest at close range (muzzle-parallax bug, caught by combat_feel_sim).
func aim_point() -> Vector3:
	var anchor: Vector3 = active_car.global_position if (mode == Mode.DRIVE and active_car) else player.global_position
	if aim_override.length_squared() > 0.01:
		# Sim convention: a LONG override vector carries its own range (aim AT the
		# target, converge there — like the mouse does); a unit vector = 25 m out.
		var d := aim_override.length()
		return anchor + aim_override.normalized() * (d if d > 2.0 else 25.0)
	var cam := get_viewport().get_camera_3d()
	if cam == null:
		return anchor + player.facing() * 25.0
	var mouse := get_viewport().get_mouse_position()
	var from := cam.project_ray_origin(mouse)
	var dir := cam.project_ray_normal(mouse)
	if absf(dir.y) < 0.001:
		return anchor + player.facing() * 25.0
	var t := (1.0 - from.y) / dir.y # intersect the y=1.0 aim plane
	return from + dir * t


## Where the player intends to shoot, as a direction from the body's center
## (orientation, cone, melee). Muzzle-true bullet paths use aim_point() instead.
func aim_direction() -> Vector3:
	var anchor: Vector3 = active_car.global_position if (mode == Mode.DRIVE and active_car) else player.global_position
	var out := aim_point() - anchor
	out.y = 0.0
	return out.normalized() if out.length_squared() > 0.01 else player.facing()


func fire_equipped() -> void:
	var w := current_weapon()
	if w == null or mode != Mode.FOOT or panel.is_open:
		return
	if w.mag <= 0 and not w.is_melee():
		notify("*click* — reload (R)")
		return
	player.enter_stance() # a raised gun = combat stance: slow feet, no sprint
	player.aim_now(aim_direction()) # orient arms/eyes at the intent
	# The BULLET flies muzzle → aim point, so it lands exactly under the cursor
	# (the muzzle sits in the right hand — center-based directions shot wide).
	var muzzle := player.muzzle_world()
	var shot := aim_point() - muzzle
	shot.y = 0.0
	var dir := shot.normalized() if shot.length_squared() > 0.01 else player.aim_facing()
	if w.fire(self, muzzle, dir):
		if w.is_melee():
			cam_rig.add_trauma(0.08) # quiet: no gunshot, no nerve spike, no heat
		else:
			player.gun_recoil() # the kick you FEEL in the hand
			cam_rig.add_trauma(0.26 if w.id == "shotgun" else 0.18)
			stress = minf(100.0, stress + 1.5) # gunfire frays nerves (and heat, later)
			audio.play_at("shotgun" if w.id == "shotgun" else "shot", player.global_position)


## G lobs a grenade toward the mouse (arc + fuse; blast reuses on_explosion).
func throw_grenade() -> void:
	if mode != Mode.FOOT or panel.is_open or not backpack.remove("grenade", 1):
		return
	player.enter_stance()
	var dir := player.aim_now(aim_direction()) # your arms obey the same arc as the gun
	var g := ProtoWeapon.ProtoGrenade.new()
	g.vel = dir * 9.0 + Vector3.UP * 5.0
	add_child(g)
	g.global_position = player.global_position + Vector3(0, 1.4, 0) + dir * 0.6
	notify("Grenade out!")


## Shooting from the driver's seat: YOUR equipped gun, out the window, at the
## mouse (VEHICLES.md §6). Right-handed in a left seat — wasteland pragmatism.
func fire_from_vehicle() -> void:
	if mode != Mode.DRIVE or active_car == null or active_car.dead:
		return
	var w := current_weapon()
	if w == null:
		return
	if w.is_melee():
		notify("Can't swing steel from the driver's seat")
		return
	if w.mag <= 0:
		notify("*click* — reload (R)")
		return
	var origin: Vector3 = active_car.global_position \
		+ Vector3(0, active_car.spec["chassis"].y * 0.5 + 0.7, 0) \
		- active_car.global_basis.x * 0.5 # the driver's window
	# The FULL 3D line, not flattened: the window sits HIGH (semi cab higher yet) —
	# a horizontal ray sails over heads. Shots angle DOWN to the aim point.
	var shot := aim_point() - origin
	var dir := shot.normalized() if shot.length_squared() > 0.01 else active_car.facing()
	if w.fire(self, origin, dir):
		cam_rig.add_trauma(0.15)
		stress = minf(100.0, stress + 1.5)
		audio.play_at("shotgun" if w.id == "shotgun" else "shot", active_car.global_position)


## A bike has no cab: the crash THROWS you. You leave the saddle with the bike's
## momentum, tumble (dive state), and take the wound the cab would have eaten.
func _on_rider_thrown(dv: float, bike: ProtoCar3D) -> void:
	if active_car != bike or mode != Mode.DRIVE or character.dead:
		return
	var vel: Vector3 = bike.linear_velocity
	mode = Mode.FOOT
	bike.is_active = false
	active_car = null
	player.global_position = bike.global_position + Vector3(0, 1.1, 0) - bike.global_basis.x * 1.4
	player.process_mode = Node.PROCESS_MODE_INHERIT
	player.visible = true
	player.is_active = true
	player.tumble(vel * 0.75) # airborne meat: dive-tumble along the bike's momentum
	cam_rig.target = player
	hud.set_mode(false)
	# The wound the cab would have eaten, scaled by class (bike wound_mult 2.5).
	var dmg: float = clampf(dv * 1.6, 8.0, 40.0) * bike.spec.get("wound_mult", 1.0)
	character.take_wound(character.random_part(_wound_rng), dmg)
	give_bleeding(2)
	hud.flash_pain()
	cam_rig.add_trauma(0.9)
	audio.play_at("hurt", player.global_position)
	stress = minf(100.0, stress + 18.0)
	notify("💥 THROWN from the %s — the road ate %d hp" % [bike.display_name, int(dmg)])


## The hood MG (vehicle mount): same weapon system, fires where the car points.
func fire_mount() -> void:
	if mode != Mode.DRIVE or active_car == null or active_car.dead or active_car.mount_weapon == null:
		return
	var w: ProtoWeapon = active_car.mount_weapon
	if w.mag <= 0:
		notify("*click* — MG dry, reload (R)")
		return
	var fwd := active_car.facing()
	if w.fire(self, active_car.global_position + fwd * 2.6 + Vector3(0, 0.8, 0), fwd):
		cam_rig.add_trauma(0.1)
		audio.play_at("shot", active_car.global_position, -4.0, 1.3)


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


func _reload_mount() -> void:
	var w: ProtoWeapon = active_car.mount_weapon
	var need: int = w.info()["mag_size"] - w.mag
	var take: int = mini(need, backpack.count("9mm"))
	if take <= 0:
		notify("No 9mm for the MG")
		return
	backpack.remove("9mm", take)
	w.mag += take
	audio.play_ui("click", -4.0)
	notify("MG reloaded (+%d)" % take)


func on_explosion(pos: Vector3) -> void:
	cam_rig.add_trauma(0.7)
	audio.play_at("explosion", pos, 4.0)
	if player.global_position.distance_to(pos) < 7.0:
		hud.flash_pain()
		give_bleeding(1)


## Drop an item at your feet — it lands in (or merges into) a ground pile.
func drop_item(id: String) -> bool:
	if not backpack.remove(id, 1):
		return false
	var pile: ProtoChest = null
	for node in get_children():
		if node is ProtoChest and node.container.label == "Dropped gear" \
				and node.global_position.distance_to(player.global_position) < 2.5:
			pile = node
			break
	if pile == null:
		pile = ProtoChest.create("Dropped gear", {}, false) # loot piles never dent a car
		add_child(pile)
		pile.global_position = player.global_position + player.facing() * 1.0
	pile.container.add(id, 1)
	audio.play_ui("blip", -12.0)
	return true


## A lurker's claw connects: body wound + bleed + fear. Combat is two-way now.
func on_player_clawed(damage: float, _who: Node3D) -> void:
	if character.dead or mode == Mode.DRIVE:
		return # the cab protects you — ON FOOT you're meat
	character.take_wound(character.random_part(_wound_rng), damage)
	ProtoFloater.pop(self, player.global_position + Vector3(0, 1.8, 0), "-%d" % int(damage), Color(0.95, 0.35, 0.25), 110)
	bleeding = clampi(maxi(bleeding, 1), 0, 3)
	hud.set_condition("hurt", maxi(bleeding, 1))
	hud.flash_pain()
	cam_rig.add_trauma(0.35)
	audio.play_at("hurt", player.global_position)
	stress = minf(100.0, stress + 14.0)
	if character.hp < 30.0:
		hud.toast("❤️ %d — GET OUT OF THERE" % int(character.hp))


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
	lines.append("🏛️ MERIDIAN: %s  (esteem %d · infamy %d · notoriety %d)" % [respect.standing("meridian"),
		int(respect.esteem("meridian")), int(respect.infamy("meridian")), int(respect.notoriety("meridian"))])
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
	if pos.x > 35.0 and pos.x < 190.0 and pos.z < -230.0 and pos.z > -380.0:
		hud.set_location("MERIDIAN — POP. UNKNOWN")
	elif absf(pos.x) < 30.0:
		hud.set_location("INTERSTATE 9 — %s" % stream.current_state(pos.x))
	else:
		hud.set_location("DEATHLANDS — %s" % stream.current_state(pos.x))


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
