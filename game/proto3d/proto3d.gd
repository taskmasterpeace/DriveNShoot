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
var devmode: ProtoDevMode = null ## F10 — the in-game test environment
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

## Navigation: N cycles points of interest; the HUD draws the arrow. You can
## also PICK a destination off the atlas (click a town) and plant a HOME beacon
## (F) anywhere you decide to live — both land in the same waypoints list.
const CARRY_CAP := 32.0 ## kg-ish; STR raises this later (attributes hook)
var waypoints: Array = [] ## [name, Vector3-or-Node3D]
var waypoint_idx: int = -1
var stream: ProtoWorldStream = null
const HOME_KEY := "🏠 HOME"
const COURSE_PREFIX := "🧭 " ## a map-picked destination — only ever one at a time

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
## The SOUNDSCAPE (SoundForge wiring): feet on real surfaces, breath when you're
## gassed, and an ambient bed that follows the biome and the clock.
var _step_dist: float = 0.0
var _snd_foot_state: ProtoPlayer3D.FootState = ProtoPlayer3D.FootState.NORMAL
var _breath: AudioStreamPlayer = null
var _amb: AudioStreamPlayer = null
var _amb_id: String = ""
var _amb_poll: float = 0.0
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
	DrivnData.ensure() # THE DATA SPINE: fold data/vehicles.json into the fleet before anything spawns
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

	# Player starts driving car 0 on the interstate. His LOOK is a data row — a
	# scavenger by default; character creation (Rung 5) will let you author it.
	player = ProtoPlayer3D.create(ProtoPuppet.look("scav"))
	player.position = Vector3(6, 0.2, 388)
	add_child(player)

	cam_rig = ProtoCameraRig.create()
	add_child(cam_rig)

	vision_cone = ProtoVisionCone.create()
	add_child(vision_cone)

	hud = ProtoHUD.create()
	hud.layer = 2 # above the vision-cone dimmer
	add_child(hud)
	hud.set_circuit(circuit_level, circuit_beats) # the loop is on screen from minute one

	audio = ProtoAudio.new()
	add_child(audio)
	_wound_rng.randomize()
	character.leveled.connect(func(id: String, lvl: int) -> void:
		# COMPELLING = the level-up tells you exactly what you just got.
		var row: Dictionary = ProtoCharacter.SKILLS[id]
		hud.toast("⬆️ %s %s lv %d — now: %s" % [row["emoji"], row["name"], lvl, character.skill_effect_line(id)])
		audio.play_ui("blip", -4.0)
		_apply_skill_effects())
	character.died.connect(_on_death)

	panel = ProtoContainerPanel.create(self)
	add_child(panel)
	backpack.add("jack", 5)

	# A supply chest inside the safehouse — same interface as every trunk.
	# The shotgun lives here; the stash upstairs holds the pistol; rockets ride
	# in the SEDAN's trunk (the key/hotwire loop pays off in firepower).
	var chest := ProtoChest.create("Chest", {"bandage": 2, "meat": 2, "jack": 8, "shotgun": 1, "12ga": 10, "eyepatch": 1, "drone": 1,
		"medkit": 1, "water": 2, "jerry_can": 1, "car_parts": 1, "flare": 2, "map_fragment": 1})
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
	# Sam the Drifter waits by the market — 40 jack buys a gun that walks with you.
	var drifter := ProtoNPC.create("drifter")
	drifter.position = Vector3(97.0, 0.2, -312.5)
	add_child(drifter)
	respect.changed.connect(_on_respect_changed)

	sview = ProtoSecondaryView.create()
	add_child(sview)

	char_create = ProtoCharCreate.create(self)
	add_child(char_create)

	waypoints = [["SAFEHOUSE", Vector3(110, 0, -325)], ["KENNEL", Vector3(123, 0, -316)], ["YOUR CAR", cars[0]]]

	# The macro map (DEATHLANDS USA) feeds streaming, surfaces, and the HUD.
	ProtoWorldBuilder.usmap = ProtoUSMap.get_default()
	stream = ProtoWorldStream.new()
	add_child(stream)
	stream.setup(waypoints, self)

	metaworld = ProtoMetaworld.new()
	add_child(metaworld)
	metaworld.setup(self)
	metaworld.come_home.connect(func(text: String) -> void: hud.toast(text))

	house.tracked = player
	_apply_skill_effects()
	enter_car(cars[0])
	cam_rig.snap_to_target()


var daynight: ProtoDayNight = null
var weather: ProtoWeather = null
var radio: ProtoRadio = null
var carousel: ProtoCarousel = null
var events: ProtoEvents = null
var rulers: Dictionary = {} ## the Divided States' rulers (data/rulers.json)
var _sun: DirectionalLight3D = null
var _env: Environment = null
var _pet_cd: float = 0.0

## The night pack (howler.gd): deep night spawns hunters; dawn burns them off.
## First-night grace is long so sims dipping into night stay deterministic.
var howlers: Array = []
var _pack_cd: float = 35.0

## Timed reloads: swapping a mag is a COMMITMENT (fire is blocked meanwhile).
var _reload_t: float = 0.0
var _reload_wpn: ProtoWeapon = null

## Recon tags (binoculars name what they see) — cached scan, refreshed ~8 Hz.
var _recon_t: float = 0.0
var _recon_entries: Array = []

## STAGE 7: companions (people follow the same law as the pack) + the Second
## Window. STAGE 8 rung 1: the scout drone.
var companions: Array = []
var sview: ProtoSecondaryView = null
var char_create: ProtoCharCreate = null
var drone: ProtoDrone = null


func _build_environment() -> void:
	var sun := DirectionalLight3D.new()
	sun.rotation_degrees = Vector3(-52, -38, 0)
	sun.light_color = Color(1.0, 0.92, 0.78)
	sun.light_energy = 1.25
	sun.shadow_enabled = true
	sun.directional_shadow_max_distance = 140.0
	add_child(sun)
	_sun = sun

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
	_env = env
	# The clock: sun, sky, headlights, and the night's tax on your eyes.
	daynight = ProtoDayNight.new()
	add_child(daynight)
	daynight.setup(_sun, _env)
	# The SKY has opinions too: dust/rain/heat tax sight, grip, and the engine.
	weather = ProtoWeather.create(self)
	add_child(weather)
	# The AIRWAVES (Y to scan) and THE CAROUSEL (the ring under the bases).
	radio = ProtoRadio.create(self)
	add_child(radio)
	carousel = ProtoCarousel.create(self)
	add_child(carousel)
	# The calendar has plans (daily/weekly events) + the rulers read your ledger.
	events = ProtoEvents.create(self)
	add_child(events)
	if FileAccess.file_exists("res://data/rulers.json"):
		var rj: Variant = JSON.parse_string(FileAccess.get_file_as_string("res://data/rulers.json"))
		if rj is Dictionary:
			rulers = rj


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
			elif mode == Mode.DRIVE and active_car and not active_car.dead:
				panel.open(backpack, active_car.trunk) # reach the trunk from the seat
			else:
				panel.open(backpack, null) # just your pack
		elif kc == KEY_Y:
			radio.scan() # sweep the dial — the wasteland talks if you listen
		elif kc == KEY_F10:
			# DEV MODE — the in-game test environment (built lazily; a tool, not a menu)
			if devmode == null:
				devmode = ProtoDevMode.create(self)
				add_child(devmode)
			else:
				devmode.toggle()
		elif kc == KEY_H:
			_honk()
		elif kc == KEY_P:
			_pet_dog()
		elif kc == KEY_V:
			sview.cycle(self)
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
		elif kc == KEY_F:
			set_home()
		elif kc == KEY_J:
			char_create.toggle()
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
				_reload_t = 0.0 # switching abandons the mag swap
				_reload_wpn = null
				notify("Equipped the %s" % weapons[idx].info()["name"])
	elif event is InputEventMouseButton and event.pressed \
			and (event as InputEventMouseButton).button_index == MOUSE_BUTTON_LEFT:
		if panel.is_open or cam_rig.binoculars or stream.map_open():
			pass # a click on the open map sets your course, it doesn't fire your gun
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
		_apply_hand_pose(wpn)
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

	# Encumbrance: an overloaded pack slows your legs — STRENGTH raises the cap
	# (the promised hook, now live: carry_cap() = 32 + 2.5/lv).
	var load := backpack.total_weight()
	var over := load / character.carry_cap()
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
	# Feed the puppet: injuries slump the body, death flops it. hurt = how far below a
	# full health cap you are (a wounded survivor moves wounded).
	player.hurt = clampf(1.0 - character.hp_cap() / 100.0, 0.0, 1.0)
	player.dead_vis = character.dead
	_sync_wound_effects()
	_crime_cd = maxf(0.0, _crime_cd - delta)
	_pet_cd = maxf(0.0, _pet_cd - delta)
	# Hold T to WAIT: the clock sprints (the world doesn't) — sit out the night.
	daynight.waiting = Input.is_key_pressed(KEY_T) and not panel.is_open
	# Headlights answer the dark on their own.
	for c in cars:
		if is_instance_valid(c):
			c.set_headlights(daynight.is_dark())
	_update_night_pack(delta)
	_update_skill_trickle(delta)
	_update_reload(delta)
	sview.update_view(self)
	_update_bounty()
	_update_whistle(delta)
	_update_soundscape(delta)
	_update_pirates(delta)
	_update_stress(delta)
	_watch_crash_wounds()
	_update_vision_cone(delta, binoc)
	_update_recon_tags(binoc)
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
	# NIGHT is the other clamp: after dark you simply see LESS — how much less is
	# the MOON's call. HEADLIGHTS carve it back open: driving with the lamps on,
	# the beam is your sight (this is why night driving works at all).
	# WEATHER is the third clamp: a dust storm strips even noon down to arm's
	# length — and headlights can't carve through dust like they carve night.
	var range_mult := character.vision_range_mult * daynight.vision_mult() * weather.vision_mult() * character.head_clarity()
	if mode == Mode.DRIVE and active_car and active_car.headlights_on:
		range_mult = maxf(range_mult, character.vision_range_mult * 0.85 * weather.vision_mult())
	_refresh_sight_exclusions()
	var reach: float = maxf(params[2] * clampf(range_mult, 0.12, 2.0), params[1])
	var occl := _cast_sight_fan(body.global_position, reach)
	vision_cone.update_cone(cam, body.global_position, facing, params, delta,
		character.vision_arc_mult, range_mult, occl)
	_percept_origin = body.global_position
	_percept_facing = facing
	_update_perception_fade(delta)


# --- Recon: the binoculars NAME what they see (the distance problem, solved) ---

func _update_recon_tags(binoc: bool) -> void:
	var cam := get_viewport().get_camera_3d()
	if not binoc or cam == null:
		if hud.recon_tag_count > 0:
			hud.set_recon_tags(cam, [])
		return
	_recon_t -= get_physics_process_delta_time()
	if _recon_t <= 0.0:
		_recon_t = 0.12
		_recon_entries = []
		var origin: Vector3 = active_car.global_position if (mode == Mode.DRIVE and active_car) else player.global_position
		var dir := cam_rig.binocular_aim_dir()
		if dir.length_squared() < 0.01:
			dir = player.aim_facing()
		var half: float = ProtoVisionCone.MODE_BINOC[0] * character.vision_arc_mult
		var reach: float = ProtoVisionCone.MODE_BINOC[2] * character.vision_range_mult * daynight.vision_mult() * weather.vision_mult()
		var eye := origin + Vector3(0, 1.5, 0)
		var found: Array = []
		for g in ["threat", "proto_dog", "npc", "interactable"]:
			for node in get_tree().get_nodes_in_group(g):
				var e := node as Node3D
				if e == null or not is_instance_valid(e) or e == player or e == active_car:
					continue
				var to := e.global_position - origin
				to.y = 0.0
				var d := to.length()
				if d < 10.0 or d > reach:
					continue # too close to need naming / beyond the glass
				if dir.dot(to.normalized()) < cos(half):
					continue
				if sight_blocked(eye, e.global_position + Vector3(0, 0.9, 0)):
					continue
				found.append([d, e.global_position, "%s — %dm" % [_recon_name(e), int(d)]])
		found.sort_custom(func(a, b): return a[0] < b[0])
		for f in found.slice(0, 6):
			_recon_entries.append([f[1], f[2]])
	hud.set_recon_tags(cam, _recon_entries)


func _recon_name(e: Node3D) -> String:
	if e is ProtoCompanion:
		return "SAM (yours)"
	if e is ProtoHowler:
		return "HOWLER"
	if e is ProtoLurker:
		return "LURKER"
	if e is ProtoDog:
		return (e as ProtoDog).dog_name.to_upper()
	if e is ProtoNPC:
		return (e as ProtoNPC).npc_name
	if e is ProtoCar3D:
		return (e as ProtoCar3D).display_name
	if e is ProtoChest:
		return (e as ProtoChest).container.label
	if e is ProtoStash:
		return "stash"
	return "?"


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
		# A dog riding shotgun is WITH you — its calm rides along (cab therapy).
		if aura > 0.0 and (d.riding_in == active_car and d.riding_in != null \
				or d.global_position.distance_to(player.global_position) < 6.0):
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
				3: _dog_command("seek")
				_: _dog_command("shield") # C×4 — the SOULBOUND-only 5th command
			_wh_taps = 0


## THE SOUNDSCAPE: dive thump on the commit, feet that speak the surface under
## them, breath when you're gassed, and one ambient bed that follows biome+clock.
func _update_soundscape(delta: float) -> void:
	if audio == null or player == null:
		return
	# DIVE lands once, on the state transition.
	if player.move_state != _snd_foot_state:
		if player.move_state == ProtoPlayer3D.FootState.DIVE:
			audio.play_at("dive", player.global_position, -10.0)
		_snd_foot_state = player.move_state

	# FOOTSTEPS: distance-driven (cadence tracks real speed); the surface picks
	# the voice. Sprinting feet are louder — stealth already models the noise.
	if mode == Mode.FOOT and player.is_on_floor() and player.move_state == ProtoPlayer3D.FootState.NORMAL:
		var hspeed := Vector2(player.velocity.x, player.velocity.z).length()
		if hspeed > 0.6:
			_step_dist += hspeed * delta
			if _step_dist >= 1.55:
				_step_dist = 0.0
				audio.play_at("footstep_" + _step_surface(), player.global_position,
					-12.0 if player.sprinting() else -17.0)
		else:
			_step_dist = 0.0

	# SPRINT BREATH: a private loop while running or badly gassed; fades out after.
	var winded: bool = mode == Mode.FOOT \
		and (player.sprinting() or player.stamina < player.max_stamina * 0.22)
	if winded and _breath == null:
		_breath = audio.attach_flat_loop("breath_sprint", -16.0)
	elif not winded and _breath != null:
		var old_b := _breath
		_breath = null
		var twb := old_b.create_tween()
		twb.tween_property(old_b, "volume_db", -44.0, 0.7)
		twb.tween_callback(old_b.queue_free)

	# AMBIENT BED: crickets at night, murmur in town, the biome's voice elsewhere.
	# Polled every few seconds; beds crossfade so the world never hard-cuts.
	_amb_poll -= delta
	if _amb_poll <= 0.0:
		_amb_poll = 4.0
		var want := _ambient_bed()
		if want != _amb_id:
			_amb_id = want
			if _amb != null:
				var old_a := _amb
				_amb = null
				var twa := old_a.create_tween()
				twa.tween_property(old_a, "volume_db", -50.0, 1.4)
				twa.tween_callback(old_a.queue_free)
			if want != "":
				_amb = audio.attach_flat_loop(want, -50.0)
				var twi := _amb.create_tween()
				twi.tween_property(_amb, "volume_db", -22.0, 1.8)


## Which bed the moment calls for: night owns the dark, town owns Meridian,
## the biome owns the rest.
func _ambient_bed() -> String:
	if daynight != null and daynight.is_dark():
		return "amb_night"
	var pos := active_car.global_position if (mode == Mode.DRIVE and active_car) else player.global_position
	if pos.x > 35.0 and pos.x < 190.0 and pos.z < -230.0 and pos.z > -380.0:
		return "amb_town" # Meridian's box (same rect the location label reads)
	var biome: String = stream.biome_at(pos) if stream != null else "scrub"
	match biome:
		"desert": return "amb_desert"
		"forest", "swamp": return "amb_forest"
		"urban": return "amb_town"
		_: return "amb_plains"


## What's under your boots: interiors are wood, registered road rects asphalt,
## the green biomes grass, and the wasteland default is dirt.
func _step_surface() -> String:
	if house != null and house.tracked_inside:
		return "wood"
	var pos := player.global_position
	if ProtoWorldBuilder.surface_at(pos) == "road":
		return "asphalt"
	var biome: String = stream.biome_at(pos) if stream != null else "scrub"
	if biome in ["forest", "plains", "farmland", "swamp"]:
		return "grass"
	return "dirt"


func _dog_command(cmd: String) -> void:
	last_whistle = cmd
	# The whistle is YOURS — it sounds whether or not a dog is listening.
	match cmd:
		"heel": audio.play_ui("whistle_short", -6.0)
		"guard": audio.play_ui("whistle_double", -6.0)
		"seek": audio.play_ui("whistle_double", -6.0, 1.15) # same call, higher — "go find"
		"sic": audio.play_ui("whistle_long", -6.0)
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
		"shield":
			# The 5th command is EARNED: only a SOULBOUND partner answers it.
			var any := false
			for d in dogs:
				if is_instance_valid(d) and d.command_shield():
					any = true
			audio.play_ui("whistle_long", -6.0, 1.25)
			hud.toast("🐕 *four sharp* — SHIELD! Your partner locks to your hip" if any
				else "🐕 *four sharp* — …only a SOULBOUND partner answers that call")


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


## A dog's warning only reaches you within EARSHOT (playtest: a dog across the
## map kept pinging the HUD). Past this it barks at the wasteland, not at you.
const DOG_EARSHOT: float = 25.0


func on_dog_alert(dog: ProtoDog, _threat: Node3D, behind: bool) -> void:
	if dog.global_position.distance_to(player.global_position) > DOG_EARSHOT:
		return
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
	if dog.global_position.distance_to(player.global_position) > DOG_EARSHOT:
		return # its find, not your toast — walk with the dog if you want the nose
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


# --- PvP prep (the dog pattern, scaled up): ONE snapshot of everything that IS
# "the player" — saves, join-in-progress handoffs, and respawn loadouts all read
# the same two functions. ------------------------------------------------------

func player_record() -> Dictionary:
	var w_out: Array = []
	for w in weapons:
		w_out.append({"id": w.id, "mag": w.mag})
	return {"pos": [player.global_position.x, player.global_position.y, player.global_position.z],
		"appearance": player.appearance.duplicate(true), "character": character.to_record(),
		"backpack": backpack.slots.duplicate(), "weapons": w_out, "equipped": equipped}


func player_restore(rec: Dictionary) -> void:
	var p: Array = rec.get("pos", [0.0, 1.0, 0.0])
	player.global_position = Vector3(float(p[0]), float(p[1]), float(p[2]))
	player.velocity = Vector3.ZERO
	if rec.has("appearance") and not (rec["appearance"] as Dictionary).is_empty():
		player.rebuild_puppet(rec["appearance"])
		_last_pose_id = "∅" # re-apply the equipped weapon's grip next frame
	character.from_record(rec.get("character", {}))
	backpack.slots = (rec.get("backpack", {}) as Dictionary).duplicate()
	backpack.changed.emit()
	weapons.clear()
	for wr in rec.get("weapons", []):
		var wpn := ProtoWeapon.new(String(wr["id"]))
		wpn.mag = int(wr.get("mag", 0))
		weapons.append(wpn)
	equipped = clampi(int(rec.get("equipped", -1)), -1, weapons.size() - 1)


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


## CHARACTER CREATION (J): the chosen row flows into BOTH the body and the stats —
## the puppet is rebuilt left/right-handed with a blind eye and a limp, and the same
## picks narrow the vision cone and slow the legs. You author who you are.
func apply_character(c: Dictionary) -> void:
	var look: Dictionary = ProtoPuppet.look(c.get("look", "scav"))
	look["handed"] = c.get("handed", "right")
	look["blind_eye"] = c.get("blind_eye", "")
	look["limp"] = c.get("bad_leg", "")
	player.rebuild_puppet(look)
	_last_pose_id = "∅" # force the equipped weapon's hand pose to re-apply next frame
	# The same choices are STAT hooks, not just looks.
	character.set_blind_eye(c.get("blind_eye", ""))
	created_limp = String(c.get("bad_leg", "")) # _sync_wound_effects folds it into leg_mult live
	notify("🧬 You are who you are now.")


## HOME BEACON (F): plant a home wherever you're standing or driving. It becomes
## a waypoint you can always steer back to (N) and a 🏠 mark on both maps —
## "your favorite neighborhood," even if that's the middle of nowhere.
func set_home() -> void:
	var pos: Vector3 = (active_car if mode == Mode.DRIVE and active_car else player).global_position
	pos.y = 0.0
	for wp in waypoints:
		if wp[0] == HOME_KEY:
			wp[1] = pos
			notify("🏠 Home moved here")
			return
	waypoints.append([HOME_KEY, pos])
	notify("🏠 Home planted — press N to steer back anytime")


## MAP-PICKED COURSE: click a town (or any spot) on the atlas → a single course
## waypoint, selected on the spot so the arrow points there the moment you close
## the map. Only ever one course at a time (a new pick replaces the old).
func set_map_course(label: String, pos: Vector3) -> void:
	pos.y = 0.0
	# Drop any existing course first (identity = the compass prefix).
	for i in range(waypoints.size() - 1, -1, -1):
		if String(waypoints[i][0]).begins_with(COURSE_PREFIX):
			waypoints.remove_at(i)
	waypoints.append([COURSE_PREFIX + label, pos])
	waypoint_idx = waypoints.size() - 1
	hud.toast("🧭 Course set: %s" % label)
	audio.play_ui("blip", -4.0)


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
	if id == "drone":
		# STAGE 8 rung 1 (Robotics): deploy the bird. It patrols overhead, pings
		# threats into your perception, and lands as a pickup when the cell dies.
		if drone != null and is_instance_valid(drone):
			notify("The bird's already up (V to watch it)")
			return false
		drone = ProtoDrone.create(self, player.global_position)
		add_child(drone)
		drone.global_position = player.global_position + Vector3(0, 2.0, 0)
		audio.play_ui("blip", -6.0)
		notify("🛸 Drone up — it patrols and PINGS what it sees (V to ride its eye)")
		return true
	match id:
		"bandage":
			if bleeding > 0 or character.worst_part() != "" and character.body[character.worst_part()].ratio() < 1.0:
				bleeding = 0
				hud.set_condition("hurt", 0)
				var part := character.worst_part()
				if part != "":
					character.treat(part, 30.0 * character.heal_mult()) # First Aid: skilled hands heal harder
				grant_xp("first_aid", 4.0)
				notify("Bandaged the %s (cap %d)" % [part.replace("_", " "), int(character.hp_cap())])
				return true
			notify("No wound to bandage")
			return false
		"medkit":
			bleeding = 0
			hud.set_condition("hurt", 0)
			for part in character.body:
				character.treat(part, 25.0 * character.heal_mult())
			grant_xp("first_aid", 6.0)
			notify("⛑️ Patched up head to toe (cap %d)" % int(character.hp_cap()))
			return true
		"painkillers":
			var part := character.worst_part()
			if part != "":
				character.treat(part, 12.0 * character.heal_mult())
			stress = maxf(0.0, stress - 8.0)
			grant_xp("first_aid", 2.0)
			notify("💊 The edge comes off")
			return true
		"meat":
			stress = maxf(0.0, stress - 18.0)
			notify("Ate — nerves settle")
			return true
		"canned_food":
			var part := character.worst_part()
			if part != "":
				character.treat(part, 10.0)
			stress = maxf(0.0, stress - 10.0)
			notify("🥫 A hot meal. Things feel possible")
			return true
		"water":
			player.stamina = player.max_stamina
			stress = maxf(0.0, stress - 6.0)
			notify("💧 Cold and clean — legs come back")
			return true
		"coffee":
			player.stamina = minf(player.max_stamina, player.stamina + 40.0)
			stress = maxf(0.0, stress - 15.0)
			notify("☕ Awake now")
			return true
		"whiskey":
			stress = maxf(0.0, stress - 30.0)
			character.body["torso"].damage(4.0)
			notify("🥃 Warm all the way down. The liver objects")
			return true
		"jerry_can":
			var rig := _rig_in_reach()
			if rig == null:
				notify("No rig in reach for the fuel")
				return false
			rig.fuel = minf(100.0, rig.fuel + 40.0)
			notify("🛢️ Fueled the %s (%d%%)" % [rig.display_name, int(rig.fuel)])
			return true
		"car_parts":
			var rig := _rig_in_reach()
			if rig == null:
				notify("No rig in reach to fix")
				return false
			var worst := ""
			var worst_r := 1.1
			for cid in rig.components:
				if rig.components[cid].ratio() < worst_r:
					worst_r = rig.components[cid].ratio()
					worst = cid
			if worst == "" or worst_r >= 1.0:
				notify("The %s doesn't need parts" % rig.display_name)
				return false
			rig.components[worst].restore(35.0 * character.repair_mult()) # Mechanics: parts go further
			character.add_xp("mechanics", 14.0)
			notify("⚙️ Rebuilt the %s's %s" % [rig.display_name, worst.replace("_", " ")])
			return true
		"tire_kit":
			var rig := _rig_in_reach()
			if rig == null:
				notify("No rig in reach to fix")
				return false
			if rig.components["tires"].ratio() >= 1.0:
				notify("Those tires are fine")
				return false
			rig.components["tires"].restore(50.0 * character.repair_mult())
			character.add_xp("mechanics", 8.0)
			notify("🛞 Patched the %s's rubber" % rig.display_name)
			return true
		"duct_tape":
			var rig := _rig_in_reach()
			if rig == null:
				notify("No rig in reach to tape")
				return false
			rig.components["chassis"].restore(12.0 * character.repair_mult())
			character.add_xp("mechanics", 3.0)
			notify("🧷 Taped. It'll hold. Probably")
			return true
		"flare":
			var flare := Node3D.new()
			flare.add_to_group("flare_light")
			var lamp := OmniLight3D.new()
			lamp.light_color = Color(1.0, 0.28, 0.12)
			lamp.light_energy = 3.4
			lamp.omni_range = 22.0
			flare.add_child(lamp)
			var core := MeshInstance3D.new()
			var cm := BoxMesh.new()
			cm.size = Vector3(0.12, 0.1, 0.12)
			core.mesh = cm
			core.material_override = ProtoWorldBuilder.material(Color(1.0, 0.3, 0.12), 0.2, true)
			flare.add_child(core)
			add_child(flare)
			flare.global_position = player.global_position + player.facing() * 1.2 + Vector3(0, 0.1, 0)
			var timer := get_tree().create_timer(30.0)
			timer.timeout.connect(func() -> void:
				if is_instance_valid(flare):
					flare.queue_free())
			notify("🚨 Flare down — 30 seconds of light")
			return true
		"map_fragment":
			var um: ProtoUSMap = ProtoWorldBuilder.usmap
			if um == null or not um.ok or um.towns.is_empty():
				notify("The fragment is illegible")
				return false
			var town: Dictionary = um.towns[randi() % um.towns.size()]
			var tp: Vector2 = town["pos"]
			var ccx := int(floor(tp.x / ProtoWorldStream.CHUNK))
			var ccz := int(floor(tp.y / ProtoWorldStream.CHUNK))
			var r: int = character.fragment_reveal_radius() # Scavenging reads the land wider
			for dx in range(-r, r + 1):
				for dz in range(-r, r + 1):
					stream.visited["%d,%d" % [ccx + dx, ccz + dz]] = \
						Vector2((ccx + dx + 0.5) * ProtoWorldStream.CHUNK, (ccz + dz + 0.5) * ProtoWorldStream.CHUNK)
			grant_xp("scavenging", 4.0)
			notify("🗺️ %s marked on your map (M)" % town["name"])
			return true
	return false


## The rig your hands can reach: the one you're driving, or the nearest live
## vehicle within a wrench's walk (fuel/parts/tape route through this).
func _rig_in_reach() -> ProtoCar3D:
	if mode == Mode.DRIVE and active_car != null:
		return active_car
	var best: ProtoCar3D = null
	var best_d := 10.0
	for node in get_tree().get_nodes_in_group("interactable"):
		if node is ProtoCar3D:
			var car := node as ProtoCar3D
			if car.dead or car.vclass == "trailer":
				continue
			var d := car.global_position.distance_to(player.global_position)
			if d < best_d:
				best_d = d
				best = car
	return best


# --- Firing (COMBAT_AND_GEAR: aim is intent, shots fly the rolled vector) -----

func current_weapon() -> ProtoWeapon:
	return weapons[equipped] if equipped >= 0 and equipped < weapons.size() else null


## Pose the hands to the equipped weapon (the grip is the WEAPON's property).
## Only on change — cheap, and a pistol-low vs shotgun-shoulder vs rocket-on-shoulder
## read is instant.
var _last_pose_id: String = "∅"
func _apply_hand_pose(wpn: ProtoWeapon) -> void:
	var id: String = wpn.id if wpn else ""
	if id == _last_pose_id or player.puppet == null:
		return
	_last_pose_id = id
	if wpn == null:
		player.puppet.set_hand_pose(Vector3.ZERO, false)
		player.puppet.raised = true
		return
	var pose: Dictionary = wpn.info().get("hand_pose", {"offset": Vector3.ZERO, "two_handed": false})
	player.puppet.set_hand_pose(pose.get("offset", Vector3.ZERO), pose.get("two_handed", false))
	# Guns ride raised (the twin-stick aim read); steel is CARRIED — the arm hangs
	# and only comes up in the swing (playtest: the always-raised wrench floated).
	player.puppet.raised = not wpn.is_melee()


## The world POINT under the cursor (mouse ray onto the aim plane; sims project
## their override direction 25 m out). Bullets converge EXACTLY here — the gun
## rides in the right hand, so firing along (point - muzzle) is what makes the
## cursor honest at close range (muzzle-parallax bug, caught by combat_feel_sim).
func aim_point() -> Vector3:
	var anchor: Vector3 = active_car.global_position if (mode == Mode.DRIVE and active_car) else player.global_position
	if aim_override.length_squared() > 0.01:
		# Sim convention: a LONG override vector carries its own range (aim AT the
		# target, converge there — like the mouse does); a unit vector = 25 m out
		# at CHEST height (the mouse plane's y=1.0 equivalent — keeps flat aims flat).
		var d := aim_override.length()
		if d > 2.0:
			return anchor + aim_override
		return anchor + aim_override.normalized() * 25.0 + Vector3(0, 1.0, 0)
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
	if w == null or mode != Mode.FOOT or panel.is_open or _reload_t > 0.0:
		return
	if w.mag <= 0 and not w.is_melee():
		notify("*click* — reload (R)")
		return
	player.enter_stance() # a raised gun = combat stance: slow feet, no sprint
	player.aim_now(aim_direction()) # orient arms/eyes at the intent
	# The BULLET flies muzzle → aim point in FULL 3D: exactly under the cursor
	# laterally AND angled to the target's height — low loping howlers taught us
	# a hand-height horizontal ray flies right over short things.
	var muzzle := player.muzzle_world()
	var shot := aim_point() - muzzle
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
	if mode != Mode.DRIVE or active_car == null or active_car.dead or _reload_t > 0.0:
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
	_unboard_dogs(bike)
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


# --- Stage 7: hiring a companion ------------------------------------------------

## 40 jack: Sam stops being an NPC and becomes YOURS — follows, fights, scouts.
func hire_companion(npc: ProtoNPC) -> void:
	# The NPC's archetype names the CREW row — new hires are rows, not code.
	var cid: String = {"drifter": "sam", "mechanic": "hazel", "medic": "mercer"}.get(npc.archetype, "sam")
	var cost: int = ProtoCompanion.CREW[cid]["hire_cost"]
	if not backpack.remove("jack", cost):
		notify("%s: '%d. I count fewer in that pack.'" % [ProtoCompanion.CREW[cid]["name"], cost])
		return
	var c := ProtoCompanion.create(self, cid)
	add_child(c)
	c.global_position = npc.global_position
	companions.append(c)
	npc.queue_free()
	audio.play_ui("blip", -4.0)
	notify("🧍 %s shoulders the load: 'Where we headed?'" % ProtoCompanion.CREW[cid]["name"])


# --- The night pack -----------------------------------------------------------

## A pack materializes out of the dark — the howl is your only warning.
func spawn_howler_pack(origin: Vector3, count: int = 3) -> void:
	for i in count:
		var h := ProtoHowler.create(self)
		add_child(h)
		var ang := TAU * float(i) / float(count)
		h.global_position = origin + Vector3(cos(ang), 0.0, sin(ang)) * 6.0 + Vector3(0, 0.4, 0)
		# THE PACK HAS ROLES: a big pack brings a SCREAMER (the conductor — kill it
		# first), a charger (impatient teeth), and circlers who take their turn.
		if i == 0 and count >= 3:
			h.set_role("screamer")
		elif i <= 1:
			h.set_role("charger")
		else:
			h.set_role("circler")
		howlers.append(h)
	audio.play_at("howl", origin, 6.0)
	hud.toast("🌙 Something HOWLS out in the dark")
	stress = minf(100.0, stress + 10.0)


func _update_night_pack(delta: float) -> void:
	_pack_cd = maxf(0.0, _pack_cd - delta)
	howlers = howlers.filter(func(h): return is_instance_valid(h))
	if daynight.is_dark() and _pack_cd <= 0.0 and howlers.is_empty() and not character.dead:
		_pack_cd = 90.0
		var ang := _wound_rng.randf() * TAU
		var base: Vector3 = active_car.global_position if (mode == Mode.DRIVE and active_car) else player.global_position
		spawn_howler_pack(base + Vector3(cos(ang), 0.0, sin(ang)) * 45.0)


# --- Timed reloads (combat feel: the mag swap is a commitment) ------------------

func is_reloading() -> bool:
	return _reload_t > 0.0


func _update_reload(delta: float) -> void:
	if _reload_t <= 0.0:
		return
	_reload_t -= delta
	if _reload_t > 0.0:
		return
	var w := _reload_wpn
	_reload_wpn = null
	if w == null or not weapons.has(w):
		return
	var ammo_id: String = w.info()["ammo"]
	var take: int = mini(w.info()["mag_size"] - w.mag, backpack.count(ammo_id))
	if take > 0:
		backpack.remove(ammo_id, take)
		w.mag += take
		audio.play_ui("click", -4.0, 0.8)
		notify("Reloaded (+%d)" % take)


# --- Doing stuff from the driver's seat ---------------------------------------

## H — the HORN: every pack dog in earshot comes running to the vehicle.
func _honk() -> void:
	if mode != Mode.DRIVE or active_car == null or active_car.dead:
		return
	audio.play_at("honk", active_car.global_position, 2.0)
	var called := 0
	for d in dogs:
		# A horn CARRIES — and a bonded pack (⭐ Kinship) hears it farther out.
		if is_instance_valid(d) and d.riding_in == null \
				and d.global_position.distance_to(active_car.global_position) < character.horn_recall_radius():
			d.command_heel()
			called += 1
	notify("📯 HOOOONK — %s" % ("the pack comes running" if called > 0 else "the wasteland ignores you"))


## P — pet the nearest dog (riding shotgun, or at your side on foot). Nerves settle.
func _pet_dog() -> void:
	if _pet_cd > 0.0 or character.dead:
		return
	var target: ProtoDog = null
	for d in dogs:
		if not is_instance_valid(d):
			continue
		if mode == Mode.DRIVE and d.riding_in == active_car and d.riding_in != null:
			target = d
			break
		elif mode == Mode.FOOT and d.riding_in == null \
				and d.global_position.distance_to(player.global_position) < 2.6:
			target = d
			break
	if target == null:
		return
	_pet_cd = 4.0
	grant_xp("kinship", 2.0) # ⭐ the bond is built one scratch at a time
	target.add_bond(4.0, self) # …and THIS dog remembers it was yours
	var aura: float = target.params()["calm_aura"]
	stress = maxf(0.0, stress - (18.0 if aura >= 5.0 else 10.0))
	audio.play_at("bark", (active_car.global_position if mode == Mode.DRIVE and active_car else target.global_position), -10.0, 1.35)
	notify("🐕 You scratch %s behind the ears — nerves settle" % target.dog_name)


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
	if _reload_t > 0.0:
		return # already working the mag
	var w := current_weapon()
	if w == null or w.is_melee():
		return
	if w.mag >= int(w.info()["mag_size"]):
		return
	if backpack.count(w.info()["ammo"]) <= 0:
		notify("No %s left" % w.info()["ammo"])
		return
	# The swap takes REAL time (per weapon); firing is blocked until it lands.
	_reload_t = float(w.info().get("reload_s", 1.0)) * character.reload_mult() # Marksmanship folds reload in
	_reload_wpn = w
	audio.play_ui("click", -4.0)
	notify("Reloading…")


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
	cam_rig.add_trauma(1.0) # THE WOW: a rocket hit KICKS the camera, hard
	# …and the blast HANGS for a heartbeat (micro slow-mo, real-time restore).
	if not _cine_lock:
		_cine_lock = true
		var prev := Engine.time_scale
		Engine.time_scale = prev * 0.5
		get_tree().create_timer(0.15, true, false, true).timeout.connect(func() -> void:
			Engine.time_scale = prev
			_cine_lock = false)
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
	# The blow ROCKS the body (Rung 6): flinch away from where the claw came from.
	var from_dir := player.facing()
	if _who and is_instance_valid(_who):
		var d: Vector3 = player.global_position - (_who as Node3D).global_position
		d.y = 0.0
		if d.length_squared() > 0.01:
			from_dir = -d.normalized() # toward the attacker
	player.flinch(from_dir)
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


## Push the passive skill effects into their carriers (on boot + every level-up):
## Endurance grows the stamina tank, Driving rides the active car, Stealth arms
## the body's noise profile. Everything else is read live at its call site.
func _apply_skill_effects() -> void:
	player.max_stamina = character.stamina_max()
	player.endurance_regen = character.stamina_regen_mult()
	player.stealth_base = character.stealth_detect_mult()
	if active_car:
		active_car.driver_control = character.drive_control()
		active_car.driver_top = character.drive_top_mult()


## XP-BY-USE trickles (the quiet skills level by doing, not by menus):
## sprinting teaches Endurance, hauling heavy teaches Strength, moving quiet
## near something that could kill you teaches Stealth.
var _trickle_t: Dictionary = {"endurance": 0.0, "strength": 0.0, "stealth": 0.0}
var _prev_foot_state: int = 0
func _update_skill_trickle(delta: float) -> void:
	if mode != Mode.FOOT or character.dead:
		return
	# A committed dive is endurance work too.
	if player.move_state != _prev_foot_state:
		if player.move_state == ProtoPlayer3D.FootState.DIVE:
			grant_xp("endurance", 1.5)
		_prev_foot_state = player.move_state
	if player._was_running:
		_trickle_t["endurance"] += delta
		if _trickle_t["endurance"] >= 3.0:
			_trickle_t["endurance"] = 0.0
			grant_xp("endurance", 1.0)
	var moving := player.velocity.length() > 1.0
	if moving and backpack.total_weight() > character.carry_cap() * 0.85:
		_trickle_t["strength"] += delta
		if _trickle_t["strength"] >= 4.0:
			_trickle_t["strength"] = 0.0
			grant_xp("strength", 1.0)
	if moving and not player._was_running:
		var near_threat := false
		for n in get_tree().get_nodes_in_group("threat"):
			if n is Node3D and is_instance_valid(n) \
					and (n as Node3D).global_position.distance_to(player.global_position) < 16.0:
				near_threat = true
				break
		if near_threat:
			_trickle_t["stealth"] += delta
			if _trickle_t["stealth"] >= 3.0:
				_trickle_t["stealth"] = 0.0
				grant_xp("stealth", 1.0)


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
	# THE SKILL TREE: ⭐ signatures first, then the rest. Every line shows the
	# level, an xp bar to the NEXT level, what the skill DOES for you right now,
	# and how it levels — the sheet sells the climb.
	lines.append("————— SKILLS (level by DOING) —————")
	var ordered: Array = []
	for id in ProtoCharacter.SKILLS:
		if ProtoCharacter.SKILLS[id].get("star", false):
			ordered.append(id)
	for id in ProtoCharacter.SKILLS:
		if not ProtoCharacter.SKILLS[id].get("star", false):
			ordered.append(id)
	for id in ordered:
		var row: Dictionary = ProtoCharacter.SKILLS[id]
		var s: Dictionary = character.skills[id]
		var lvl: int = s["level"]
		var xp_now: float = s["xp"] - 40.0 * lvl * lvl
		var xp_need: float = 40.0 * (lvl + 1) * (lvl + 1) - 40.0 * lvl * lvl
		var fill := int(clampf(xp_now / xp_need, 0.0, 1.0) * 6.0)
		var bar := ""
		for i in 6:
			bar += "▮" if i < fill else "▱"
		lines.append("%s %s %-12s lv %d %s  %s" % [row["emoji"], "⭐" if row.get("star", false) else " ",
			row["name"], lvl, bar, character.skill_effect_line(id)])
		lines.append("      ↳ %s · next lv: %s" % [row["how"], row["gain"]])
	lines.append("")
	lines.append("🪙 Jack: %d   🩸 bleeding: %s   😰 stress: %d" % [backpack.count("jack"), str(bleeding), int(stress)])
	lines.append("🏛️ MERIDIAN: %s  (esteem %d · infamy %d · notoriety %d)" % [respect.standing("meridian"),
		int(respect.esteem("meridian")), int(respect.infamy("meridian")), int(respect.notoriety("meridian"))])

	# ————— THE WORLD (surfacing pass: everything running behind your back) —————
	lines.append("")
	lines.append("————— THE CIRCUIT (the loop) —————")
	var pips := ""
	for k2 in ["scavenge", "upgrade", "push", "node"]:
		pips += "● " if circuit_beats[k2] else "○ "
	lines.append("🏁 lap %d: %s— scavenge a cache · buy gear · enter a new state · light a gate" % [circuit_level, pips])

	lines.append("")
	lines.append("————— THE DIVIDED STATES —————")
	for st in visited_states:
		var ru := ruler_of(st)
		var icon := "⚔️" if respect.standing(st) == "SUSPECT" else ("👑" if respect.standing(st) in ["TRUSTED", "HERO"] else "🪧")
		lines.append("%s %s — %s (%s)" % [icon, st, String(ru["ruler"]), respect.standing(st)])
	if events != null:
		lines.append("📅 today: %s%s" % ["quiet roads" if events.today_event in ["", "quiet"] else events.today_event,
			("  ·  ⚔️ WAR IN " + events.war_state) if events.war_state != "" else ""])
	if weather != null and weather.state != "clear":
		lines.append("%s %s — sight ×%.2f · grip ×%.2f" % [weather.icon(), weather.label(), weather.vision_mult(), ProtoWeather.grip_now])

	lines.append("")
	lines.append("————— THE PACK —————")
	var any_dog := false
	for ad in all_dogs:
		if ad is ProtoDog and is_instance_valid(ad) and ad.adopted:
			any_dog = true
			lines.append("🐕 %s (%s) — %s · saved ×%d · last fed day %d" % [ad.dog_name, ad.breed,
				ad.BOND_TIERS[ad.bond_tier()], ad.times_saved, ad.last_fed_day])
	if not any_dog:
		lines.append("(no pack yet — the kennel is by the safehouse)")
	lines.append("🐕‍🦺 whistle (C): ×1 heel · ×2 guard · ×3 seek · hold SIC · ×4 SHIELD (soulbound only)")
	for f in fallen_dogs:
		lines.append("🕯️ %s (%s · %s) — gone, not forgotten" % [f["name"], f["breed"], f["bond"]])

	lines.append("")
	lines.append("————— THE CAROUSEL —————")
	if carousel != null:
		var lit: Array = carousel.active.keys()
		if lit.is_empty():
			lines.append("🎠 0 / %d nodes — find a base, haul POWER to the ring, hold the SPIN-UP" % carousel.data.get("bases", []).size())
		else:
			lines.append("🎠 %d / %d nodes LIT: %s (jump costs a 🔋 power cell)" % [lit.size(), carousel.data.get("bases", []).size(), ", ".join(lit)])

	var taxes: Array = []
	if character.limp_side() != "":
		taxes.append("🦵 limping — speed ×%.2f" % character.wound_leg_mult())
	if character.aim_wobble() > 0.0:
		taxes.append("🎯 arm wobble — spread +%d%%" % int(character.aim_wobble() * 220))
	if character.head_clarity() < 1.0:
		taxes.append("🧠 blurred sight ×%.2f" % character.head_clarity())
	if character.wound_stamina_mult() < 1.0:
		taxes.append("🫁 winded — stamina regen ×%.2f" % character.wound_stamina_mult())
	if not taxes.is_empty():
		lines.append("")
		lines.append("————— WOUND TAXES (treat to clear) —————")
		for tx in taxes:
			lines.append(tx)
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

# --- THE CIRCUIT (goal: name the loop; end each cycle with an "I got stronger"
# beat): SCAVENGE → UPGRADE → PUSH DEEPER → LIGHT A NODE. All four = the payoff.
var circuit_level: int = 1
var circuit_beats: Dictionary = {"scavenge": false, "upgrade": false, "push": false, "node": false}
var visited_states: Dictionary = {}
var fallen_dogs: Array = [] ## the memorial — every adopted dog that didn't make it


func circuit_beat(kind: String) -> void:
	if not circuit_beats.has(kind) or circuit_beats[kind]:
		return
	circuit_beats[kind] = true
	var done: int = circuit_beats.values().count(true)
	notify("🏁 THE CIRCUIT %d: %s ✓ (%d/4)" % [circuit_level, kind.to_upper(), done])
	hud.set_circuit(circuit_level, circuit_beats)
	if done >= 4:
		_cycle_complete()


## The "I got stronger" beat — unmistakable, earned, and it primes the NEXT lap.
func _cycle_complete() -> void:
	circuit_level += 1
	for id in ProtoCharacter.SKILLS:
		grant_xp(id, 20.0)
	character.treat(character.worst_part(), 30.0)
	stress = maxf(0.0, stress - 40.0)
	backpack.add("power_cell", 1)
	for k in circuit_beats:
		circuit_beats[k] = false
	audio.play_ui("blip", 0.0, 0.5)
	hud.toast("🏁 CIRCUIT COMPLETE — you got STRONGER (lv %d: every skill fed, wounds knit, +1 cell for the ring)" % circuit_level)
	hud.set_circuit(circuit_level, circuit_beats)


# --- THE DIVIDED STATES REACT (goal: the lore bible becomes mechanics) ----------
## Crossing a border, its RULER reads your ledger: a SUSPECT gets hunters on the
## roads, a TRUSTED name gets the ruler's welcome, everyone else gets watched.
var bounty_hunted: bool = false
var _welcomed_states: Dictionary = {}


func ruler_of(state: String) -> Dictionary:
	return (rulers.get("states", {}) as Dictionary).get(state,
		rulers.get("default", {"ruler": "the local Baron", "title": "BARON", "attitude": 1.0}))


func on_state_entered(state: String) -> void:
	if not visited_states.has(state):
		visited_states[state] = true
		if visited_states.size() > 1: # home turf isn't a push
			circuit_beat("push")
	var r := ruler_of(state)
	match respect.standing(state):
		"SUSPECT":
			bounty_hunted = true
			notify("⚔️ %s HAS POSTED A BOUNTY ON YOU — hunters run %s's roads" % [String(r["ruler"]).to_upper(), state])
		"TRUSTED", "HERO":
			bounty_hunted = false
			if not _welcomed_states.has(state):
				_welcomed_states[state] = true
				backpack.add("jack", 15)
				notify("👑 %s SENDS A HERO'S WELCOME — an escort's purse rides with you (+15 jack)" % String(r["ruler"]).to_upper())
		_:
			bounty_hunted = false
			notify("🪧 %s territory — %s watches these roads" % [state, String(r["ruler"])])
	if events != null and events.war_state == state:
		notify("⚔️ …and you just drove INTO the war")


# --- THE WOW: cinematic combat reads --------------------------------------------
## A killing crit lands in SLOW MOTION — a third of a real second where the world
## holds its breath. Restores the PREVIOUS time scale (sims run hot; never stomp).
var _cine_lock: bool = false


func cinematic_kill(pos: Vector3) -> void:
	if _cine_lock:
		return
	_cine_lock = true
	var prev := Engine.time_scale
	Engine.time_scale = prev * 0.22
	cam_rig.add_trauma(0.35)
	audio.play_at("thunk", pos, 2.0, 0.6)
	var t := get_tree().create_timer(0.35, true, false, true) # real-time: ignores the slow-mo it made
	t.timeout.connect(func() -> void:
		Engine.time_scale = prev
		_cine_lock = false)


# --- THE PIPELINE IS A FEATURE (goal: the game visibly grows) --------------------
## Re-fold data/vehicles.json and reload the map LIVE: tune in VehicleForge or
## MapForge, press one dev-mode button, the running world updates. This is the
## modding surface arriving early.
func reload_content() -> Dictionary:
	DrivnData.vehicles.clear()
	DrivnData._loaded = false
	DrivnData.ensure()
	var map_ok := false
	if stream != null and stream.usmap != null:
		map_ok = stream.usmap.load_file(ProtoUSMap.PATH)
	notify("🔧 CONTENT RELOADED — %d vehicle rows, map %s. New spawns wear the new stats." % [DrivnData.vehicles.size(), "refreshed" if map_ok else "kept"])
	return {"vehicles": DrivnData.vehicles.size(), "map_ok": map_ok}


# --- ROAD PIRATES (goal: the vehicular half of the promise) --------------------
## An ambush is a SET-PIECE: two rigs thrown across the road ahead, one hungry
## engine in your mirror. The chaser runs the SAME autopilot the Proving Grounds
## built — ramming you is just "arrive_dist 0". Their trunks make it worth the
## fight; outrunning them is always on the table.
var pirates: Array = [] ## live chase cars
var _ambush_cd: float = 150.0 ## first window opens ~2.5 min in; then every 3+ min


func spawn_road_ambush() -> void:
	if mode != Mode.DRIVE or active_car == null:
		return
	var fwd: Vector3 = active_car.facing()
	var side := Vector3(fwd.z, 0, -fwd.x)
	# THE WALL: two dead rigs thrown across the lane ahead.
	var block_at := active_car.global_position + fwd * 210.0
	for i in 2:
		var b := ProtoCar3D.create(["pickup", "van"][i], Color(0.16, 0.14, 0.13))
		add_child(b)
		b.global_position = block_at + side * (i * 5.5 - 2.75) + Vector3(0, 1.0, 0)
		b.global_rotation.y = atan2(-fwd.x, -fwd.z) + (1.15 if i == 0 else -1.15)
		b.trunk.add("9mm", 20)
		b.trunk.add("jack", 10 + i * 8)
		b.trunk.add("scrap", 3)
	# THE MIRROR: a chaser drops in behind, wearing the chase brain.
	var ch := ProtoCar3D.create("buggy", Color(0.28, 0.1, 0.08))
	add_child(ch)
	ch.global_position = active_car.global_position - fwd * 70.0 + Vector3(0, 1.0, 0)
	ch.trunk.add("jack", 25)
	ch.trunk.add("12ga", 8)
	var ai := ProtoAutopilot.attach(ch)
	ai.target_node = active_car
	ai.arrive_dist = 0.0 # never brake for the target — the ARRIVAL is the ram
	pirates.append(ch)
	audio.play_at("howl", ch.global_position, 2.0, 1.4) # a war-whoop off the wind
	hud.toast("🏴 ROAD PIRATES — headlights in your mirror, steel across the road")
	stress = minf(100.0, stress + 14.0)


func _update_pirates(delta: float) -> void:
	# The road rolls the dice while you drive fast on asphalt — night doubles it.
	_ambush_cd -= delta
	if _ambush_cd <= 0.0 and mode == Mode.DRIVE and active_car != null \
			and absf(active_car.forward_speed) > 14.0 and active_car.current_surface == "road":
		_ambush_cd = randf_range(180.0, 320.0)
		# The dice read the WORLD: night favors them, a posted BOUNTY doubles them,
		# a state AT WAR triples them. Your ledger follows you onto the asphalt.
		var odds := (0.55 if daynight.is_dark() else 0.3) * (2.0 if bounty_hunted else 1.0)
		if events != null:
			odds *= events.pirate_mult(stream.current_state(active_car.global_position))
		if randf() < minf(odds, 0.95):
			spawn_road_ambush()
	# Resolution: dead = loot on the shoulder; outrun = they break off.
	for i in range(pirates.size() - 1, -1, -1):
		var p: ProtoCar3D = pirates[i]
		if not is_instance_valid(p):
			pirates.remove_at(i)
			continue
		if p.dead:
			pirates.remove_at(i)
			notify("🏴 The chaser's DONE — its trunk rides the shoulder now")
			continue
		var anchor: Vector3 = active_car.global_position if (mode == Mode.DRIVE and active_car) else player.global_position
		if p.global_position.distance_to(anchor) > 380.0:
			for c in p.get_children():
				if c is ProtoAutopilot:
					c.queue_free()
			p.is_active = false
			p.input_throttle = 0.0
			pirates.remove_at(i)
			notify("🏴 You LOST them — the mirror's empty")


## WOUNDS READ (goal): the paper-doll becomes the body's BEHAVIOR, live —
## a shot leg limps the rig and slows you, a shot arm shakes the barrel (spread
## already pays via current_spread), a cracked head narrows the cone, a broken
## torso empties your lungs. Heal, and the body straightens back out.
var created_limp: String = "" ## character-creation's permanent bad leg
var _limp_announced: String = "∅"
func _sync_wound_effects() -> void:
	# LEGS → the limp you can SEE + the speed you can FEEL.
	var wound_limp := character.limp_side()
	var eff_limp := wound_limp if wound_limp != "" else created_limp
	if player.puppet and player.puppet.appearance.get("limp", "") != eff_limp:
		player.puppet.appearance["limp"] = eff_limp
	player.leg_mult = (0.72 if created_limp != "" else 1.0) * character.wound_leg_mult()
	if wound_limp != _limp_announced:
		if wound_limp != "" and _limp_announced == "∅" or wound_limp != "" and _limp_announced == "":
			notify("🦵 Your leg gives — you LIMP now. The car is further than it was.")
		elif wound_limp == "" and _limp_announced != "" and _limp_announced != "∅":
			notify("🦵 The leg holds again")
		_limp_announced = wound_limp
	# ARMS → the rig's gun hand won't sit still (spread tax lives in the weapon).
	if player.puppet:
		player.puppet.aim_wobble = character.aim_wobble()
	# TORSO → stamina regen tax (stress already throttles; wounds stack on it).
	player.wound_regen_mult = character.wound_stamina_mult()


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
	var clock := "%s · " % daynight.clock_text()
	if weather != null and weather.state != "clear":
		clock = "%s %s · %s" % [weather.icon(), weather.label(), clock] # the sky leads the headline
	if pos.x > 35.0 and pos.x < 190.0 and pos.z < -230.0 and pos.z > -380.0:
		hud.set_location(clock + "MERIDIAN — POP. UNKNOWN")
		return
	if absf(pos.x) < 30.0 and absf(pos.z) < 450.0:
		hud.set_location(clock + "INTERSTATE 9 — %s" % stream.current_state(pos))
		return
	# On a macro interstate, the road names itself (I-70 — KANSAS).
	var um: ProtoUSMap = ProtoWorldBuilder.usmap
	if um != null and um.ok:
		var road := um.road_near(pos, 20.0)
		if not road.is_empty():
			hud.set_location(clock + "%s — %s" % [road["id"], stream.current_state(pos)])
			return
	hud.set_location(clock + "DEATHLANDS — %s" % stream.current_state(pos))


func enter_car(car: ProtoCar3D) -> void:
	mode = Mode.DRIVE
	active_car = car
	car.is_active = true
	audio.play_at("car_door", car.global_position, -6.0)
	# ⭐ Your DRIVING rides with you into any seat.
	car.driver_control = character.drive_control()
	car.driver_top = character.drive_top_mult()
	player.is_active = false
	player.visible = false
	player.process_mode = Node.PROCESS_MODE_DISABLED
	cam_rig.target = car
	hud.set_mode(true)
	# THE PACK RIDES ALONG: nearby dogs hop in, up to the class's dog_seats
	# (van 4, car/pickup 2, buggy 1, bike none). Overflow holds the ground.
	var seats: int = int(car.spec.get("dog_seats", 0))
	# Humans call shotgun first (Stage 7: one boarding law, animal or human).
	for c in companions:
		if seats <= 0:
			break
		if is_instance_valid(c) and c.riding_in == null and not c.staying \
				and c.global_position.distance_to(car.global_position) < 9.0:
			c.board(car)
			seats -= 1
			notify("🧍 %s climbs in" % c.comp_name)
	for d in dogs:
		if seats <= 0:
			break
		# Only FOLLOWERS ride. A dog on GUARD/SIC/SEEK is WORKING — it holds its
		# post (the metaworld's stay-behind loop depends on exactly that).
		if is_instance_valid(d) and d.riding_in == null \
				and d.state != ProtoDog.DogState.GUARD and d.state != ProtoDog.DogState.SIC \
				and d.state != ProtoDog.DogState.SEEK \
				and d.global_position.distance_to(car.global_position) < 9.0:
			d.board(car)
			seats -= 1
			notify("🐕 %s hops in" % d.dog_name)


func _unboard_dogs(car: ProtoCar3D) -> void:
	if car == null:
		return
	var i := 0
	for d in dogs:
		if is_instance_valid(d) and d.riding_in == car:
			i += 1
			d.unboard(car.global_position + car.global_basis.x * (1.8 + 0.7 * i) + Vector3(0, 0.4, 0))
	for c in companions:
		if is_instance_valid(c) and c.riding_in == car:
			i += 1
			c.unboard(car.global_position + car.global_basis.x * (1.8 + 0.7 * i) + Vector3(0, 0.4, 0))


func _exit_car() -> void:
	if active_car == null:
		return
	_unboard_dogs(active_car)
	audio.play_at("car_door", active_car.global_position, -6.0)
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
