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
var traffic: ProtoTraffic = null
var bandits: ProtoBandits = null ## the gang director (BANDIT_CONVOY_ECOSYSTEM.md) ## ambient lane-followers (ROAD_TRAFFIC_OVERHAUL.md)
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
var _engine_noise_cd: float = 0.0   ## throttling the engine's own noise EVENT (not the sound)
var _music_noise_cd: float = 0.0    ## the radio's periodic noise EVENT while it plays

## THE NOISE LAYER (spawn-ecology foundation — owner ask: "the radio needs to
## sound like it's coming out of the car" + volume/radius must matter to threats).
## A short pruned log of loud EVENTS (radio, engine roar, horn, later: gunfire,
## TV). Nothing PUSHES to a listener — threats POLL noises_in(their_pos). Kept
## general on purpose: other systems (media_panel/tv, migration ecology) call
## emit_noise() too, behind a has_method guard.
var _noise_log: Array[Dictionary] = []
const NOISE_TTL_MS := 8000.0 ## ~8s memory, then an event ages out

## Any system can report a loud moment here. radius_m is how far it CARRIES,
## not how far it's "loud" — a howler within radius_m of pos can hear it.
func emit_noise(pos: Vector3, radius_m: float, kind: String = "misc") -> void:
	_noise_log.append({"pos": pos, "radius": radius_m, "kind": kind, "time": Time.get_ticks_msec()})
	_prune_noise()


## Every live event whose radius still reaches `pos` — a howler calls this with
## its OWN position to ask "what can I hear from here right now?".
func noises_in(pos: Vector3) -> Array:
	_prune_noise()
	var out: Array = []
	for n in _noise_log:
		if (n["pos"] as Vector3).distance_to(pos) <= float(n["radius"]):
			out.append(n)
	return out


func _prune_noise() -> void:
	var now := float(Time.get_ticks_msec())
	if _noise_log.is_empty():
		return
	_noise_log = _noise_log.filter(func(n: Dictionary) -> bool: return now - float(n["time"]) < NOISE_TTL_MS)

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
	ProtoInputMap.ensure() # THE BINDINGS ARE ROWS: keys+mouse+PAD fold before any input is read
	DrivnData.ensure() # THE DATA SPINE: fold data/vehicles.json into the fleet before anything spawns
	ProtoContainer.ensure_items() # …and data/items.json onto the item catalog (a new item = a ROW)
	ProtoNPC.ensure_prices() # …and data/prices.json onto the price list
	ProtoNPC.ensure_archetypes() # …and data/npcs.json archetypes (mechanic/medic hires)
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
	# ONE DAMAGE LAW: the player is an ordinary body — everything that hurts him
	# calls take_damage; the signal routes it into the wound system here.
	player.damaged.connect(func(amount: float, attacker: Node3D) -> void:
		on_player_clawed(amount, attacker)
		pad_rumble(0.5, clampf(amount / 25.0, 0.2, 1.0), 0.25)) # the hit lands in your HANDS
	player.dove.connect(dive_dilation) # the shootdodge's 0.6× air

	cam_rig = ProtoCameraRig.create()
	add_child(cam_rig)

	vision_cone = ProtoVisionCone.create()
	add_child(vision_cone)

	hud = ProtoHUD.create()
	hud.layer = 2 # above the vision-cone dimmer
	add_child(hud)
	hud.set_circuit(circuit_level, circuit_beats) # the loop is on screen from minute one

	# THE FRONT DOOR: a title menu, but ONLY on a real launch — sims instantiate
	# this scene under a harness (current_scene != self), so they skip it.
	if get_tree().current_scene == self:
		menu_open = true
		var m := ProtoMenu.create(self)
		add_child(m)

	audio = ProtoAudio.new()
	add_child(audio)
	objectives = ProtoObjectives.create(self)
	add_child(objectives)
	_spawn_signs()
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
	backpack.add("scrip", 5)

	# A supply chest inside the safehouse — same interface as every trunk.
	# The shotgun lives here; the stash upstairs holds the pistol; rockets ride
	# in the SEDAN's trunk (the key/hotwire loop pays off in firepower).
	var chest := ProtoChest.create("Chest", {"bandage": 2, "meat": 2, "scrip": 8, "shotgun": 1, "12ga": 10, "eyepatch": 1, "drone": 1,
		"medkit": 1, "water": 2, "jerry_can": 1, "car_parts": 1, "flare": 2, "map_fragment": 1,
		"surveil_cam": 2, "walkie": 1, "motion_sensor": 2, "book_home": 1, "lockpick": 1})
	chest.position = Vector3(108.2, 0.05, -324.0)
	add_child(chest)
	cars[1].trunk.add("pipe_rocket", 1)
	cars[1].trunk.add("rocket", 3)
	# Stage 4: melee + throwables in the world. The hood MG default is GONE
	# (playtest): in a vehicle you fire YOUR OWN gun out the window (LMB).
	# The mount SYSTEM stays in code for a later build.
	backpack.add("wrench", 1)
	chest.container.add("machete", 1)
	chest.container.add("bat", 1)   # the launcher — knock a howler clean off you
	chest.container.add("mine", 2)  # deployables: plant one on a chokepoint
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

	# Stage 6 slice: MERIDIAN LIVES — a trader to spend scrip at, a Sec-Man with
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
	# Sam the Drifter waits by the market — 40 scrip buys a gun that walks with you.
	var drifter := ProtoNPC.create("drifter")
	drifter.position = Vector3(97.0, 0.2, -312.5)
	add_child(drifter)
	respect.changed.connect(_on_respect_changed)

	sview = ProtoSecondaryView.create()
	add_child(sview)
	# The dynamic split-screen + the drone-pilot state machine (dormant until you fly one).
	split_view = ProtoSplitView.create()
	add_child(split_view)
	drone_pilot = ProtoDronePilot.new()
	add_child(drone_pilot)
	drone_pilot.shut_off.connect(func() -> void:
		split_view.deactivate()
		if drone != null and is_instance_valid(drone):
			drone.piloted = false
			# QoL: a pilot-landed bird PARKS where you set it down (grabbable with E,
			# rotors still) and its patrol re-anchors HERE for when you next send it up.
			drone.parked = true
			drone._anchor = drone.global_position
		grant_xp("piloting", 6.0) # a landing you walk away from — the skill's payday
		notify("🛸 Drone off — you have your body back. E near the bird packs it up."))

	char_create = ProtoCharCreate.create(self)
	add_child(char_create)

	waypoints = [["SAFEHOUSE", SAFEHOUSE], ["KENNEL", Vector3(123, 0, -316)], ["YOUR CAR", cars[0]],
		["⚒ TEST GROUNDS", ProtoTestGrounds.ORIGIN]] # the try-everything field (south of home)

	# The macro map (DIVIDED STATES USA) feeds streaming, surfaces, and the HUD.
	ProtoWorldBuilder.usmap = ProtoUSMap.get_default()
	stream = ProtoWorldStream.new()
	add_child(stream)
	stream.setup(waypoints, self)

	# THE TRAFFIC SYSTEM (ROAD_TRAFFIC_OVERHAUL.md §3.4): ambient agents on the
	# road polylines — right-hand lanes, following, exits, promote-on-touch.
	traffic = ProtoTraffic.create(self, stream.usmap)
	add_child(traffic)

	# THE BANDIT DIRECTOR (BANDIT_CONVOY_ECOSYSTEM.md): gangs watch their roads,
	# raise checkpoints, fly drones — strongest in the Southwest.
	bandits = ProtoBandits.create(self)
	add_child(bandits)

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
var world_state: ProtoWorldState = null ## THE LIVING WORLD: state control + law profiles + offline catch-up
var rulers: Dictionary = {} ## the Divided States' rulers (data/rulers.json)
var homebase: ProtoHomebase = null
var objectives: ProtoObjectives = null ## THE FIRST RUN onboarding thread (armed by begin_new_game)
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
## GUNFEEL PASS #4: the reload is staged into two audible beats WITHOUT
## changing total reload_s — "reload_drop" plays at the start (reload_equipped),
## "reload_insert" plays once the countdown crosses RELOAD_INSERT_PCT of the
## total, the existing finish click (chamber) is untouched.
const RELOAD_INSERT_PCT: float = 0.6
var _reload_total: float = 0.0
var _reload_insert_done: bool = false

## UNARMED (MOVESET.txt): empty hands are never empty. One button, three reads —
## TAP = the punch combo, HOLD = a shove that makes space, SPRINT+tap = a TACKLE
## that floors them. Two standing rows, one instance each; MARTIAL ARTS grows all.
var fists: ProtoWeapon = ProtoWeapon.new("fists")
var palm: ProtoWeapon = ProtoWeapon.new("shove_palm")
var _fist_pressed: bool = false
var _fist_hold: float = 0.0
const SHOVE_HOLD := 0.28
var _tackle_t: float = 0.0

## THE PAD (controller arc): right stick aims (twin-stick — feeds the same
## aim_override the sims use), triggers swap jobs by mode (FOOT: RT fire · DRIVE:
## RT gas, LT brake), and hits RUMBLE in your hands. All bindings are ROWS.
var _fire_down: bool = false          ## latch: a trigger's repeat events fire once
var _pad_aiming: bool = false         ## right stick currently owns the aim
var _pad_prev_drive: bool = false     ## for the trigger job-swap on mode change
var controls_panel: Node = null       ## the rebind UI (F11 / menu)

## GRAB & DRAG (MOVESET.txt): hold E on a chest/body = haul it behind you (slow,
## heavy, teaches STRENGTH); tap E keeps its old meaning (open). E again drops it.
var _grab_down: bool = false
var _grab_t: float = 0.0
var _dragging: Node3D = null
var _drag_xp_m: float = 0.0

## WATER ON FOOT (MOVESET.txt): one AUTOMATIC state by depth — no key. Water
## within a stride of dry land is a WADE (slow); open water is a SWIM (slower,
## lungs draining, hands busy — no shooting); an empty tank starts DROWNING.
var water_state: String = "" ## "" | "wade" | "swim"
var _drown_warned: bool = false
const WATER_PROBE_M := 6.0

## THE MEDIA LAYER (docs/cinema.md): catalog + TV panel + press desk + music.
var media_registry: ProtoMediaRegistry = null
var media_panel: ProtoMediaPanel = null
var newsroom: ProtoNewsroom = null
var music: ProtoMusic = null
var radio_dial: ProtoRadioDial = null ## the frequency-tuning radio face (O opens it)
var skill_tree: ProtoSkillTree = null ## the visual mastery tree (U opens it; K stays the atlas)
var book_panel: ProtoBookPanel = null ## THE LIBRARY — the in-game manuals (bookshelf / book items)
var surveil_cams: Array = [] ## placed ProtoSurveilCam eyes — the V-window CAMS feed
var _dog_eye_grace: float = 0.0 ## covers the obey delay between the seek whistle and SEEK
var _drone_warned: int = 0 ## piloting battery warnings fired (0 none · 1 @20% · 2 @10%)
var last_walkie_report: String = "" ## sim hook: the walkie-talkie's last chatter line
var media_unlocked: Dictionary = {} ## id -> true (found DVDs/tapes/reels)
var media_watched: Dictionary = {}  ## id -> true (the shelf remembers)
var drive_in: ProtoDriveIn = null   ## the lot off the Meridian road
var public_screen: ProtoPublicScreen = null ## the bar set on the cross street
var drone_dock: ProtoDroneDock = null ## the helipad by the safehouse door
var test_grounds: ProtoTestGrounds = null ## ⚒ the labeled try-everything field (south of home)

## Recon tags (binoculars name what they see) — cached scan, refreshed ~8 Hz.
var _recon_t: float = 0.0
var _recon_entries: Array = []

## STAGE 7: companions (people follow the same law as the pack) + the Second
## Window. STAGE 8 rung 1: the scout drone.
var companions: Array = []
var sview: ProtoSecondaryView = null
var char_create: ProtoCharCreate = null
var drone: ProtoDrone = null
## DRONE PILOTING + dynamic split-screen (docs/design/DYNAMIC_SPLIT_DRONE.md). Both are
## additive and dormant until you turn a drone on — default off, zero impact on normal play.
var split_view: ProtoSplitView = null
var drone_pilot: ProtoDronePilot = null


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
	# THE LIVING WORLD: the map is politically alive — states have controllers + law
	# profiles, and a state can FALL while you're gone (offline catch-up on load).
	world_state = ProtoWorldState.create(self)
	add_child(world_state)
	# THE MEDIA LAYER (docs/cinema.md): the catalog, the safehouse TV's panel, the
	# press desk, and the music shelf. MediaForge (:8897) fills the folders; the
	# engine only reads rows. A bare catalog is fine — the TV just says so.
	media_registry = ProtoMediaRegistry.load_manifest()
	media_panel = ProtoMediaPanel.create(self)
	add_child(media_panel)
	newsroom = ProtoNewsroom.create(self)
	music = ProtoMusic.create(self)
	add_child(music)
	# THE RADIO FACE (control_gallery goal): a frequency dial with preset stations. O opens it.
	radio_dial = ProtoRadioDial.create(music)
	add_child(radio_dial)
	# THE SKILL TREE (control/skill goal): a visual mastery tree, perks light as you level
	# by doing. U opens it; the K text sheet (world atlas) stays exactly as it was.
	skill_tree = ProtoSkillTree.create(self, character)
	add_child(skill_tree)
	# THE LIBRARY (ship-guide): the manuals live IN the world — a bookshelf by the TV.
	book_panel = ProtoBookPanel.create(self)
	add_child(book_panel)
	var shelf := ProtoBookshelf.create(self)
	add_child(shelf)
	shelf.global_position = SAFEHOUSE + Vector3(-3.8, 0, -0.6)
	var tv := ProtoTV.create()
	add_child(tv)
	tv.global_position = SAFEHOUSE + Vector3(-3.0, 0, -2.0) # the corner of home
	tv.rotation.y = 0.7 # angled at the room
	if media_panel != null:
		media_panel.tv_set = tv # close the panel mid-reel → the picture lands ON the set
	# THE DRIVE-IN (cinema.md Phase 3): a lot off the Meridian road. Its screen
	# faces the parking rows; locked found_* reels scatter on the lot (Phase 4).
	drive_in = ProtoDriveIn.create(self)
	add_child(drive_in)
	drive_in.global_position = Vector3(60, 0, -240)
	drive_in.seed_pickups()
	# A PUBLIC SCREEN on the Meridian cross street (cinema.md Phase 5): a loop
	# nobody chose, tuned by channel rows; world-event clips cut in.
	public_screen = ProtoPublicScreen.create(self)
	add_child(public_screen)
	public_screen.global_position = Vector3(82, 0, -297)
	public_screen.power_on()
	# THE DRONE DOCK by the safehouse door (LIVING_WORLD Phase 3): launch a route
	# scout without your body leaving home — the remote eye of the return loop.
	drone_dock = ProtoDroneDock.create(self)
	add_child(drone_dock)
	drone_dock.global_position = SAFEHOUSE + Vector3(3.0, 0, -3.5)
	# HOME: the build board by the safehouse door — scrap's sink, the base game.
	homebase = ProtoHomebase.create(self)
	add_child(homebase)
	# ⚒ THE TEST GROUNDS (owner: "everything there for me to test, named useful"):
	# the labeled fairground on the south field — motor pool, armory, supply,
	# range, stable, gator pen, dig spot, and signs to what can't move here.
	test_grounds = ProtoTestGrounds.create(self)
	add_child(test_grounds)
	# DEV EXAMPLE — THE CAROUSEL PORTAL (docs/design/CAROUSEL_PORTAL.md). NOT wired to
	# the bases/jump yet (owner's call): one live instance out front of the safehouse so
	# you can walk up, press E, and hear the computer count you down 10→1 as it winds up.
	var carousel_portal := ProtoCarouselPortal.create(self)
	add_child(carousel_portal)
	carousel_portal.global_position = SAFEHOUSE + Vector3(9.0, 0, 5.0)
	if FileAccess.file_exists("res://data/rulers.json"):
		var rj: Variant = JSON.parse_string(FileAccess.get_file_as_string("res://data/rulers.json"))
		if rj is Dictionary:
			rulers = rj


func _unhandled_input(event: InputEvent) -> void:
	# THE RETURN BRIEFING owns the screen first: any key/click steps you into the day.
	if hud != null and hud.briefing_shown():
		if (event is InputEventKey and event.pressed and not event.echo) \
			or (event is InputEventMouseButton and event.pressed):
			dismiss_briefing()
		return
	if menu_open:
		return # the title menu owns the input until you pick a door
	if controls_panel != null and controls_panel.is_open:
		# The rebind panel owns the hardware while it's up — except its own toggle
		# (and never mid-capture: the key you press is the key you MEANT to bind).
		if event.is_action_pressed("drivn_controls") and not controls_panel.capturing():
			toggle_controls_panel()
		return
	if event.is_action_pressed("interact"):
		# Piloting a drone? Interact brings it in — you can't just switch it off in the air,
		# so this starts a landing; it shuts off (and frees you) once it's down.
		if drone_pilot != null and drone_pilot.is_active():
			drone_pilot.request_off()
			return
		if panel.is_open:
			panel.close()
		elif media_panel != null and media_panel.is_open:
			media_panel.close() # E turns the set off
		elif mode == Mode.DRIVE:
			if passenger_of_ai:
				# PASSENGER seat: E is TAP-vs-HOLD — tap = get out, HOLD = slide
				# over and TAKE THE WHEEL. (The driver's E stays instant.)
				_e_down = true
				_e_t = 0.0
			else:
				_exit_car()
		elif _dragging != null:
			_drop_drag() # E while hauling = set it down
		elif _current_interactable and player.move_state == ProtoPlayer3D.FootState.NORMAL:
			if _current_interactable is ProtoChest:
				# GRAB & DRAG (MOVESET.txt): E on a chest/body is TAP-vs-HOLD —
				# tap = open it, HOLD = grab it and haul it somewhere better.
				_grab_down = true
				_grab_t = 0.0
			else:
				_current_interactable.call("interact", self)
	elif event.is_action_released("interact"):
		if _e_down:
			_e_down = false
			if _e_t < 0.4 and mode == Mode.DRIVE:
				_exit_car()
		if _grab_down:
			_grab_down = false
			if _grab_t < 0.35 and is_instance_valid(_current_interactable) and _current_interactable is ProtoChest:
				_current_interactable.call("interact", self) # the TAP: open it
	# THE ACTION CHAIN (controller arc): every verb is an ACTION — the same elif
	# fires from its key, its mouse button, OR its pad binding (input_bindings.json
	# rows; rebind in the CONTROLS panel, F11). PS pads read as the same buttons.
	elif event.is_action_pressed("drivn_whistle"):
		_whistle_input(true)
	elif event.is_action_released("drivn_whistle"):
		_whistle_input(false)
	elif event.is_action_pressed("drivn_fire") and not _fire_down:
		# ONE fire verb, any hardware (LMB, RT, a rebind). The latch eats the
		# trigger's repeated motion events; RT in DRIVE is the GAS, not the gun.
		_fire_down = true
		if panel.is_open or cam_rig.binoculars or stream.map_open():
			pass # a click on the open map sets your course, it doesn't fire your gun
		elif mode == Mode.FOOT:
			if current_weapon() == null:
				_unarmed_press() # empty hands: tap punch · hold shove · sprint tackle
			else:
				fire_equipped()
		elif mode == Mode.DRIVE and not (event is InputEventJoypadMotion):
			_fire_from_seat()
	elif event.is_action_released("drivn_fire"):
		_fire_down = false
		_unarmed_release() # a quick release = the TAP (punch); held past the beat = shove
	elif event.is_action_pressed("drivn_fire_drive"):
		if mode == Mode.DRIVE:
			_fire_from_seat() # LB / L1 — the wheel-hand trigger
	elif event.is_action_pressed("drivn_pack"):
		if panel.is_open:
			panel.close()
		elif media_panel != null and media_panel.is_open:
			media_panel.close()
		elif mode == Mode.DRIVE and active_car and not active_car.dead:
			panel.open(backpack, active_car.trunk) # reach the trunk from the seat
		else:
			panel.open(backpack, null) # just your pack
	elif event.is_action_pressed("drivn_radio"):
		radio.scan() # sweep the dial — the wasteland talks if you listen
	elif event.is_action_pressed("drivn_radio_power"):
		# THE RADIO FACE (control_gallery goal): O opens the DIAL — sweep the FREQUENCY to a
		# preset station, flip power, set volume, all from the panel. (The old bare O=power
		# toast is now the dial's POWER button; the station/volume keys L / , / . still work.)
		if radio_dial != null:
			radio_dial.toggle()
	elif event.is_action_pressed("drivn_radio_station"):
		if music.next_station():
			notify("📻 %s" % music.station_name())
		else:
			notify("📻 …no stations. Drop mp3s in game/media/music/radio/<station_name>/")
	elif event.is_action_pressed("drivn_radio_vol_down"):
		music.set_volume_pct(music.volume_pct - 10)
		notify("📻 volume %d%%" % music.volume_pct)
	elif event.is_action_pressed("drivn_radio_vol_up"):
		music.set_volume_pct(music.volume_pct + 10)
		notify("📻 volume %d%%" % music.volume_pct)
	elif event.is_action_pressed("drivn_save"):
		save_game()
	elif event.is_action_pressed("drivn_load"):
		load_game()
	elif event.is_action_pressed("drivn_host"):
		_ensure_net()
		net.host()
	elif event.is_action_pressed("drivn_join"):
		_ensure_net()
		net.join()
	elif event.is_action_pressed("drivn_devmode"):
		# DEV MODE — the in-game test environment (built lazily; a tool, not a menu)
		if devmode == null:
			devmode = ProtoDevMode.create(self)
			add_child(devmode)
		else:
			devmode.toggle()
	elif event.is_action_pressed("drivn_controls"):
		toggle_controls_panel()
	elif event.is_action_pressed("drivn_horn"):
		_honk()
	elif event.is_action_pressed("drivn_pvp"):
		# PVP RULES (fun pass): cycles peace → duel → ffa. In a session the
		# HOST owns the rules; solo you can still read the three states.
		if net != null and net.online and not net.is_server():
			notify("⚔️ Only the HOST sets the PvP rules")
		else:
			var order: Array = ["peace", "duel", "ffa"]
			pvp_mode = order[(order.find(pvp_mode) + 1) % order.size()]
			if net != null:
				net.send_pvp_mode(pvp_mode)
			notify("⚔️ PvP: %s" % pvp_label())
			_refresh_peer_tags()
	elif event.is_action_pressed("drivn_pet"):
		_pet_dog()
	elif event.is_action_pressed("drivn_views"):
		sview.cycle(self)
	elif event.is_action_pressed("drivn_reload"):
		if character.dead:
			respawn_at_home() # soft respawn — the world persists, only you reset
		elif mode == Mode.DRIVE and active_car and active_car.mount_weapon:
			_reload_mount()
		else:
			reload_equipped()
	elif event.is_action_pressed("drivn_grenade"):
		throw_grenade()
	elif event.is_action_pressed("drivn_map"):
		stream.toggle_map()
	elif event.is_action_pressed("drivn_beacon"):
		set_home()
	elif event.is_action_pressed("drivn_char_create"):
		char_create.toggle()
	elif event.is_action_pressed("drivn_sheet"):
		hud.toggle_sheet(_sheet_text())
	elif event.is_action_pressed("drivn_skill_tree"):
		skill_tree.toggle() # the visual mastery tree — perks light as skills level by doing
	elif event.is_action_pressed("drivn_waypoints"):
		waypoint_idx = ((waypoint_idx + 2) % (waypoints.size() + 1)) - 1 # -1(off) -> 0 -> 1 -> 2 -> -1
		if waypoint_idx >= 0:
			hud.toast("📍 Waypoint: %s" % waypoints[waypoint_idx][0])
		else:
			hud.toast("📍 Waypoint off")
	elif event.is_action_pressed("drivn_weapon_next"):
		# RB / R1: cycle the arsenal without a number row (the pad's slot picker).
		if not weapons.is_empty():
			_equip_slot((equipped + 1) % weapons.size())
	elif event.is_action_pressed("drivn_weapon_1"):
		_equip_slot(0)
	elif event.is_action_pressed("drivn_weapon_2"):
		_equip_slot(1)
	elif event.is_action_pressed("drivn_weapon_3"):
		_equip_slot(2)
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
	if objectives != null:
		objectives.tick(delta) # THE FIRST RUN watches for its next beat
	# DRONE PILOTING: while you're flying the bird, your body is a sitting duck — steer the
	# drone with your move keys and update the flight. All dormant unless a session is live.
	if drone_pilot != null and drone_pilot.is_active():
		drone_pilot.update(delta)
		if drone_pilot.body_immobile():
			var stick := Vector3(
				Input.get_axis("move_left", "move_right"), 0.0,
				Input.get_axis("move_up", "move_down"))
			drone_pilot.pilot_input(stick)
			# 🛸 PILOTING levels by DOING: stick time — actual steering, never AFK hover.
			if stick.length() > 0.1:
				grant_xp("piloting", delta * 1.5)
		# QoL: low-battery warnings while you fly — 20% heads-up, 10% means turn back NOW.
		if drone != null and is_instance_valid(drone):
			var bp: float = drone.battery_pct()
			if bp <= 10.0 and _drone_warned < 2:
				_drone_warned = 2
				audio.play_ui("sensor_ping", -4.0)
				notify("🛸 BATTERY 10%% — it comes DOWN when it dies. Turn back.")
			elif bp <= 20.0 and _drone_warned < 1:
				_drone_warned = 1
				audio.play_ui("blip", -6.0)
				notify("🛸 Battery 20%% — think about heading home.")
	# THE DOG'S EYE winds down with the search: when the seeking dog comes off SEEK (found
	# it / recalled / died) the split folds back to one view and the default range returns.
	# A short grace covers the obey delay — command_seek QUEUES the state, so the eye must
	# not fold in the beat between the whistle and the dog actually turning to seek.
	if split_view != null and split_view.active and split_view._remote is ProtoDog:
		var eye_dog := split_view._remote as ProtoDog
		_dog_eye_grace = maxf(0.0, _dog_eye_grace - delta)
		if is_instance_valid(eye_dog) and eye_dog.state == ProtoDog.DogState.SEEK:
			_dog_eye_grace = 0.0 # the seek landed — from here, leaving SEEK folds the eye
		elif not is_instance_valid(eye_dog) or _dog_eye_grace <= 0.0:
			split_view.deactivate()
			split_view.max_separation = 22.0
	# THE WHEEL HOT-WIRE (goal — we already had hot-wiring; now it lives where it belongs):
	# seated in a keyed car you don't own, holding the GAS works the wires — Mechanics
	# speeds it — then the crank takes over. Progress rides the prompt chip.
	if mode == Mode.DRIVE and active_car != null and not active_car.dead \
			and not active_car.engine_on and active_car.ignition == "none":
		if Input.get_action_strength("move_up") > 0.2:
			_wire_t += delta
			var dur := _hotwire_duration()
			hud.show_prompt("🔌 HOT-WIRING the %s... %d%%" % [active_car.display_name, int(_wire_t / dur * 100.0)])
			if _wire_t >= dur:
				_wire_t = 0.0
				active_car.ignition = "hotwire"
				notify("🔌 Wires kissed — now CRANK it (hold the gas).")
				grant_xp("mechanics", 12.0)
				stress = minf(100.0, stress + 8.0)
		else:
			_wire_t = 0.0
	# A container/loot panel is MODAL: freeze the feet so you can't walk off with it
	# glued to the screen (playtest: "open the cache, walk away, it acts weird").
	# The TV is modal the same way — you sit down to watch. Piloting a drone freezes you too.
	player.input_locked = panel.is_open or (media_panel != null and media_panel.is_open) \
		or (controls_panel != null and controls_panel.is_open) \
		or (drone_pilot != null and drone_pilot.body_immobile()) \
		or (radio_dial != null and radio_dial.is_open) \
		or (skill_tree != null and skill_tree.is_open) \
		or (book_panel != null and book_panel.is_open)
	# On foot the camera tilts into a real 3D angle; at the wheel it's GTA2 top-down.
	cam_rig.on_foot = mode == Mode.FOOT
	_update_signs()
	_update_pad(delta) # the second stick + mode-aware triggers + rumble decay
	# Zoom fallback keys (no wheel on some setups) — rebindable actions now.
	if Input.is_action_pressed("drivn_zoom_in"):
		cam_rig.add_zoom(-0.02)
	if Input.is_action_pressed("drivn_zoom_out"):
		cam_rig.add_zoom(0.02)

	# Binoculars: hold B, right mouse, or R3 — one ACTION, any hardware. One gaze
	# pipeline: glassing and gunfighting both feed AIM INTENT, and the Look Arc
	# drags the body when the target is past the head's limit.
	var binoc := Input.is_action_pressed("drivn_binoculars")
	cam_rig.binoculars = binoc
	hud.set_binoculars(binoc)
	# The BODY reads it too — the hand comes to the face so other players know
	# you're glassing (owner 2026-07-08). Both puppet types carry the flag.
	if player != null and player.puppet != null and "binoculars" in player.puppet:
		player.puppet.binoculars = binoc
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

	_update_audio_loops(delta)
	var wpn := current_weapon()
	if wpn:
		wpn.tick(delta, self) # main threaded through for the pump-chain beats (GUNFEEL PASS)
	# The unarmed rows are ALWAYS live (cooldowns + the combo window decay).
	fists.tick(delta, self)
	palm.tick(delta, self)
	_update_tackle(delta)
	_update_drag(delta)
	_update_water(delta)
	if _fist_pressed:
		_fist_hold += delta
		if _fist_hold >= SHOVE_HOLD:
			_fist_pressed = false
			_fire_unarmed(palm) # the HOLD read: shove — make space
	if mode == Mode.FOOT:
		player.set_armed(wpn != null)
		_apply_hand_pose(wpn)
	if mode == Mode.DRIVE and active_car and active_car.mount_weapon:
		active_car.mount_weapon.tick(delta, self)
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
	player.speed_mult = (1.0 if over <= 1.0 else maxf(0.45, 1.0 - (over - 1.0) * 0.8)) \
		* (0.55 if _dragging != null else 1.0) \
		* (0.55 if water_state == "wade" else (0.45 if water_state == "swim" else 1.0))
	hud.set_condition("heavy", 0 if over <= 1.0 else (3 if over > 1.5 else 1))

	# Waypoint arrow + world streaming
	var cam := get_viewport().get_camera_3d()
	# THE VISIBLE RIDER (rider_exposed rigs): saddle pin + riding pose + live aim arm.
	if mode == Mode.DRIVE and active_car != null and not character.dead and bool(active_car.spec.get("rider_exposed", false)):
		_pose_exposed_rider(delta)
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
	# The TV no longer fast-forwards time (owner 2026-07-07: "that's absurd") —
	# a broadcast runs at 1:1 and the AIR CLOCK keeps the schedule honest.
	daynight.waiting = Input.is_key_pressed(KEY_T) and not panel.is_open
	# Headlights answer the dark on their own.
	for c in cars:
		if is_instance_valid(c):
			c.set_headlights(daynight.is_dark())
	if not net_is_client(): # a client's threats come from the host, not its own director
		_update_night_pack(delta)
	_update_skill_trickle(delta)
	_update_reload(delta)
	sview.update_view(self)
	_update_bounty()
	_update_whistle(delta)
	_update_soundscape(delta)
	_update_pirates(delta)
	_update_road_read()
	_update_traffic(delta)
	if net != null and net.online:
		net.tick(delta) # broadcast my body ~20 Hz to the other players
	# The E-hold clock (tap = out, hold = take the wheel from the passenger seat).
	if _e_down:
		_e_t += delta
		if _e_t >= 0.5:
			_e_down = false
			if passenger_of_ai:
				take_wheel()
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
		# Glassing points WHERE THE MOUSE POINTS — on foot or in the cab (owner
		# 2026-07-08: "wherever you put your mouse, that's where you're looking").
		# The mouse feeds binocular_aim_dir; fall back to the body's aim (sims +
		# pad glassing) so the cone always tracks where you intend to look.
		var aim := cam_rig.binocular_aim_dir()
		if aim.length_squared() < 0.01:
			aim = aim_direction()
		if aim.length_squared() > 0.01:
			facing = aim
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
var _wire_t: float = 0.0 ## the WHEEL hot-wire's own clock (the door hold-E owns _hotwire_t)

## THE ENTRY LADDER (goal — locks/picking/glass): hold E on a locked car and you either
## PICK the lock (lockpick in the pack: quiet, Mechanics-scaled, the pick survives) or
## SMASH THE GLASS with a fist (no pick: 0.6s, glass everywhere, a 55m noise the night
## hears). Hot-wiring is no longer a door trick — it happens AT THE WHEEL (see the
## drive block): a smashed-into car still needs wiring before it cranks.
const SMASH_S := 0.6
const GLASS_NOISE_M := 55.0

func _update_hotwire(delta: float) -> void:
	var target := _current_interactable as ProtoCar3D
	var valid: bool = mode == Mode.FOOT and target != null and target.locked \
		and not target.dead and not has_key(target.key_id)
	if not (valid and Input.is_action_pressed("interact")):
		_hotwire_t = 0.0
		return
	var picking: bool = backpack.count("lockpick") > 0
	var dur: float = _hotwire_duration() if picking else SMASH_S
	_hotwire_t += delta
	hud.show_prompt("%s the %s... %d%%" % ["🔓 PICKING" if picking else "🥊 SMASHING",
		target.display_name, int(_hotwire_t / dur * 100.0)])
	if _hotwire_t < dur:
		return
	_hotwire_t = 0.0
	target.locked = false
	if picking:
		audio.play_at("click", target.global_position, -4.0)
		emit_noise(target.global_position, 6.0, "pick")
		notify("🔓 Picked the %s's lock — quiet as you like." % target.display_name)
		grant_xp("mechanics", 12.0)
	else:
		target.window_broken = true
		audio.play_at("glass_break", target.global_position, -2.0)
		emit_noise(target.global_position, GLASS_NOISE_M, "glass")
		notify("🥊 Glass everywhere — the %s is open, and the night HEARD it." % target.display_name)
		stress = minf(100.0, stress + 6.0)
		grant_xp("strength", 2.0)


## The crank caught — the engine barks awake (start/stop law: you HEAR the state change).
func _on_engine_started(car: ProtoCar3D) -> void:
	audio.play_at("engine_start", car.global_position, -4.0)
	emit_noise(car.global_position, 30.0, "engine")


## Engine hum pitches with speed; fire crackle rides any burning car — a RUNNING engine
## only (ignition law: a dead motor is silent).
func _update_audio_loops(delta: float) -> void:
	if mode == Mode.DRIVE and active_car and not active_car.dead and active_car.engine_on:
		if _engine_loop == null or not is_instance_valid(_engine_loop):
			_engine_loop = audio.attach_flat_loop("engine", -10.0)
		_engine_loop.pitch_scale = 0.75 + clampf(absf(active_car.forward_speed) / maxf(active_car.top_speed, 1.0), 0.0, 1.0) * 1.5
		# THE ENGINE ROARS (owner ask — noise must matter): hard throttle is a
		# migration-worthy event, independent of the hum's own volume/pitch.
		_engine_noise_cd -= delta
		if active_car.input_throttle > 0.5 and _engine_noise_cd <= 0.0:
			_engine_noise_cd = 1.0
			emit_noise(active_car.global_position, 40.0, "engine")
	elif _engine_loop and is_instance_valid(_engine_loop):
		_engine_loop.queue_free()
		_engine_loop = null
	# THE CAR RADIO IS POSITIONAL (owner ask): the music emitter rides whatever
	# body is carrying it — the active car if you're at the wheel/nearby, else
	# the player on foot (a carried radio). Its own noise EVENT fires on a slow
	# clock so a loud station is a standing beacon, not a one-shot ping.
	if music != null:
		var carrier: Node3D = active_car if (active_car and not active_car.dead) else player
		music.attach_to(carrier)
		# IN THE CAB vs OUTSIDE (P0-3 muffle): driver AND a passenger riding along
		# (passenger_of_ai) are both "in the cab" — same condition that keeps the
		# engine loop alive above. The instant you're out (_exit_car already nulls
		# active_car), the muffle engages within this same frame — no separate poll.
		music.set_interior(mode == Mode.DRIVE and active_car != null and not active_car.dead)
		# DEAD BATTERY = SILENCE, not static (car_3d.gd owns the component; this is
		# a read-only poll of the SAME gate headlights already use).
		var battery_dead := active_car != null and is_instance_valid(active_car) \
			and "components" in active_car and (active_car.components as Dictionary).has("battery") \
			and (active_car.components["battery"] as Damageable).tier() == Damageable.Tier.BROKEN
		music.set_powered(not (active_car != null and battery_dead))
		_music_noise_cd -= delta
		if music.is_playing() and music.power_on and _music_noise_cd <= 0.0:
			_music_noise_cd = 2.0
			emit_noise(carrier.global_position, lerpf(0.0, 90.0, float(music.volume_pct) / 100.0), "radio")
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
			# THE DOG'S EYE (dynamic-split goal): a PARTNER+ dog on a seek carries the
			# split view — the tighter the bond, the farther it ranges before the screen
			# splits (docs/design/DYNAMIC_SPLIT_DRONE.md §Future). SOULBOUND sees farthest.
			if loot != null and split_view != null and not split_view.active:
				for d in dogs:
					if is_instance_valid(d) and d.bond_tier() >= 2: # PARTNER or SOULBOUND
						split_view.max_separation = 30.0 if d.bond_tier() == 2 else 45.0
						split_view.activate(player, d)
						_dog_eye_grace = 3.0 # ride out the obey delay before SEEK lands
						notify("👁 %s carries your eye — the screen splits as the search ranges out" % d.dog_name)
						break
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
	# PILOTING owns the prompt line (QoL): the controls + the live battery, always visible.
	if drone_pilot != null and drone_pilot.body_immobile():
		var b: String = (" · batt %d%%" % int(drone.battery_pct())) if (drone != null and is_instance_valid(drone)) else ""
		hud.show_prompt("🛸 PILOTING — move keys fly · E brings it in to LAND%s" % b)
		return
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
	backpack.slots = migrate_item_ids((rec.get("backpack", {}) as Dictionary).duplicate())
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

## Trading IS the container interface with scrip flowing backward (§7 multi-use:
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
			notify("Bridger: 'It's still breathing. The scrip waits.'")
		"filled":
			var reward: int = int(bounty.get("reward", 25))
			backpack.add("scrip", reward)
			respect.add_esteem(ProtoNPC.FACTION, 20.0)
			notify("Bridger: 'Clean work.' +%d scrip — Meridian noticed." % reward)
			audio.play_at("vo_bridger_clean", npc.global_position, 2.0)
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
## The DRONE's report lands on the map (LIVING_WORLD Phase 3): one 🛸 HAZARD
## waypoint, always the freshest mark — N cycles to it like any other pin.
func mark_hazard(pos: Vector3) -> void:
	pos.y = 0.0
	for i in range(waypoints.size() - 1, -1, -1):
		if String(waypoints[i][0]).begins_with("🛸 HAZARD"):
			waypoints.remove_at(i)
			waypoint_idx = mini(waypoint_idx, waypoints.size() - 1)
	waypoints.append(["🛸 HAZARD (drone mark)", pos])
	hud.toast("🛸 Hazard MARKED on the map")


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
	notify("🎯 Bounty filled — see Bridger for your scrip")
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
	# HUNGER: any row with food_val FEEDS you (generic — the rows rule).
	var fv: float = float(ProtoContainer.ITEMS.get(id, {}).get("food_val", 0))
	if fv > 0.0:
		character.eat(fv)
	if id == "eyepatch":
		character.set_eyepatch(not character.eyepatch)
		notify("You cover one eye — half the world goes dark" if character.eyepatch else "Both eyes open again")
		return false # toggles; never consumed
	if ProtoWeapon.WEAPONS.has(id):
		# Already own it? USING a gun you carry means DRAW it — switch, don't refuse.
		for i in weapons.size():
			if weapons[i].id == id:
				_equip_slot(i)
				return false
		var wpn := ProtoWeapon.new(id)
		weapons.append(wpn)
		equipped = weapons.size() - 1
		notify("Equipped the %s (%s)" % [wpn.info()["name"], str(weapons.size())])
		return true
	if id == "cooked_meal":
		stress = maxf(0.0, stress - 12.0)
		notify("🍲 Hot food off your own stove. The road feels shorter.")
		return true
	if id.begins_with("book_"):
		# THE LIBRARY: a manual is an ITEM too — found on the road, read from the pack.
		if book_panel != null and not ProtoBookPanel.book_by_id(id).is_empty():
			book_panel.open_book(id)
			return true
		return false
	if id == "surveil_cam":
		# GADGET: plant a camera facing the way you stand — it feeds the V-window (CAMS).
		var sc := ProtoSurveilCam.create(self, Vector3.ZERO, player.facing())
		add_child(sc)
		var cam_at: Vector3 = player.global_position + player.facing() * 1.2
		sc.global_position = Vector3(cam_at.x, 0.0, cam_at.z)
		audio.play_ui("camera_click", -6.0)
		notify("📹 Camera planted — V cycles to its feed. E packs it back up.")
		return true
	if id == "motion_sensor":
		# GADGET: the wasteland's cheapest guard dog — pings when a threat crosses it.
		var ms := ProtoMotionSensor.create(self, Vector3.ZERO)
		add_child(ms)
		var ms_at: Vector3 = player.global_position + player.facing() * 1.2
		ms.global_position = Vector3(ms_at.x, 0.0, ms_at.z)
		audio.play_ui("camera_click", -6.0)
		notify("📡 Motion sensor armed — it'll ping you when something crosses it.")
		return true
	if id == "walkie":
		# GADGET: key the walkie and LISTEN — nearby movement bleeds through the static.
		# Reveals the nearest threat and reports the direction. Never leaves your pack.
		audio.play_ui("walkie_squelch", -8.0)
		var nearest: Node3D = null
		var best := 90.0
		for node in get_tree().get_nodes_in_group("threat"):
			var t := node as Node3D
			if t == null or not is_instance_valid(t) or t is StaticBody3D:
				continue
			var d := t.global_position.distance_to(player.global_position)
			if d < best:
				best = d
				nearest = t
		if nearest != null:
			var to := nearest.global_position - player.global_position
			var dir := "north" if to.z < -absf(to.x) else ("south" if to.z > absf(to.x) else ("east" if to.x > 0.0 else "west"))
			vision_cone.reveal_at(nearest.global_position)
			last_walkie_report = "chatter puts movement %s, ~%dm out" % [dir, int(best)]
			notify("🎙 …kzzt… %s …kzzt…" % last_walkie_report)
		else:
			last_walkie_report = "dead air"
			notify("🎙 …kzzt… dead air. Nothing moving close.")
		return true
	if id == "mine":
		# DEPLOYABLE: plant it at your feet (or just behind the rig if driving).
		var m := ProtoMine.create(self)
		add_child(m)
		var at: Vector3 = (active_car.global_position - active_car.facing() * 2.5) if mode == Mode.DRIVE and active_car else (player.global_position + player.facing() * 1.0)
		m.global_position = Vector3(at.x, 0.05, at.z)
		audio.play_ui("blip", -6.0)
		notify("💣 Mine planted — it arms in a second. Don't be the first one back.")
		return true
	if id == "mount_schematic":
		# Fort Hood's gift, USED: bolt a hood MG to your rig. Activates the whole
		# existing mount fire/reload path (LMB fires it, R reloads from 9mm).
		if mode != Mode.DRIVE or active_car == null or active_car.dead:
			notify("📐 Bolt a mount to a RIG — get behind the wheel first")
			return false
		if active_car.mount_weapon != null:
			notify("📐 This rig already carries a mount")
			return false
		active_car.mount_weapon = ProtoWeapon.new("car_mg")
		audio.play_ui("blip", -3.0)
		notify("🔩 Hood MG bolted to the %s — LMB fires it, R reloads (9mm)" % active_car.display_name)
		return true
	if id == "drone":
		# STAGE 8 rung 1 (Robotics): deploy the bird. It patrols overhead, pings
		# threats into your perception, and lands as a pickup when the cell dies.
		if drone != null and is_instance_valid(drone):
			# The bird's already up → TAKE THE STICK: fly it yourself (body immobile, the
			# screen splits as it ranges out — docs/design/DYNAMIC_SPLIT_DRONE.md).
			if drone_pilot != null and not drone_pilot.is_active():
				drone.piloted = true
				drone.parked = false # off the ground — the stick is yours
				enter_drone_pilot(drone)
				return true
			notify("The bird's already up")
			return false
		drone = ProtoDrone.create(self, player.global_position)
		add_child(drone)
		drone.global_position = player.global_position + Vector3(0, 2.0, 0)
		audio.play_ui("blip", -6.0)
		notify("🛸 Drone up — it patrols and PINGS what it sees. Use the drone again to TAKE THE STICK.")
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
	player.puppet.set_hand_pose(pose.get("offset", Vector3.ZERO), pose.get("two_handed", false),
		pose.get("grip_l", Vector3.ZERO), pose.get("grip_r", Vector3.ZERO))
	# THE SILHOUETTE (weapons-as-data): rebuild the held mesh so a pistol reads as
	# a pistol, a shotgun as a shotgun — the shape is the WEAPON's property, a row.
	var shp: Dictionary = ProtoWeapon.shape(id)
	player.puppet.set_weapon_mesh(shp.get("parts", []), shp.get("muzzle_z", 0.34))
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
	if water_state == "swim":
		notify("🫧 Your hands are keeping you afloat")
		return
	if w.mag <= 0 and not w.is_melee():
		audio.play_ui("click", -2.0) # GUNFEEL #3: dry-fire is HEARD, not just read
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
			# RIG V2 PHASE 3: the kick you FEEL — the weapon's recoil ROW, eaten by muscle
			player.gun_recoil(w.info().get("recoil", {}), character.level("strength"))
			cam_rig.add_trauma(0.26 if w.id == "shotgun" else 0.18)
			stress = minf(100.0, stress + 1.5) # gunfire frays nerves (and heat, later)
			# GUNFEEL #2: fire_sfx is a ROW now (was id=="shotgun" ternary) — the
			# .get fallback keeps every existing row's sound identical by default.
			audio.play_at(String(w.info().get("fire_sfx", "shot")), player.global_position)


# --- THE MEDIA LAYER (docs/cinema.md): the TV, the catalog, the collection ----

## The TV's E lands here: news on the ticker, then the shelf. Airing a TV
## bulletin marks it HEARD (one showing each — the set drains its own medium,
## exactly as the radio drains the dial's).
func open_media_panel() -> void:
	if media_panel == null:
		return
	if newsroom != null:
		var line := newsroom.latest_tv_line()
		media_panel.set_ticker(line)
		if line != "" and world_state != null:
			for b in world_state.broadcast_queue:
				if String(b.get("medium", "")) == "tv" and not bool(b.get("heard", false)):
					b["heard"] = true
					break
	media_panel.open()


func mark_media_watched(id: String) -> void:
	media_watched[id] = true


## A found DVD/tape/reel lands here (Phase 4): the collection GROWS.
func unlock_media(id: String, how: String = "") -> void:
	if media_unlocked.has(id) or media_registry == null:
		return
	media_unlocked[id] = true
	var title := String(media_registry.get_media(id).get("title", id))
	notify("📼 NEW ON THE SHELF — %s%s" % [title, (" (" + how + ")") if how != "" else ""])


# --- WATER ON FOOT (MOVESET.txt): wade the edges, swim the open, drown empty --

func _update_water(delta: float) -> void:
	var prev := water_state
	if mode != Mode.FOOT or player == null:
		water_state = ""
	elif ProtoWorldBuilder.surface_at(player.global_position) != "water":
		water_state = ""
	else:
		# DEPTH by shore probe: dry ground within a stride = you can still stand.
		var here := player.global_position
		var deep := true
		for off in [Vector3(WATER_PROBE_M, 0, 0), Vector3(-WATER_PROBE_M, 0, 0),
				Vector3(0, 0, WATER_PROBE_M), Vector3(0, 0, -WATER_PROBE_M)]:
			if ProtoWorldBuilder.surface_at(here + off) != "water":
				deep = false
				break
		water_state = "swim" if deep else "wade"
	if water_state != prev:
		if water_state == "swim":
			notify("🌊 Deep water — you're SWIMMING. Watch your lungs.")
		elif water_state == "wade":
			notify("🌊 Wading — slow going.")
	player.swimming = water_state == "swim" # the tank bleeds in the player's own loop
	if water_state != "swim":
		_drown_warned = false
		return
	# Empty lungs = the water starts taking (the torso pays first).
	if player.stamina <= 0.0 and character != null and not character.dead:
		character.take_wound("torso", 3.5 * delta)
		if not _drown_warned:
			_drown_warned = true
			notify("🫧 YOU'RE DROWNING — get to land!")


# --- GRAB & DRAG (MOVESET.txt): haul a body/crate to where it's needed --------

func _update_drag(delta: float) -> void:
	if _grab_down:
		_grab_t += delta
		if _grab_t >= 0.35:
			_grab_down = false
			if _current_interactable is ProtoChest and mode == Mode.FOOT:
				_dragging = _current_interactable
				notify("🫳 Dragging %s — E to set it down" % (_dragging as ProtoChest).container.label.to_lower())
	if _dragging == null:
		return
	if not is_instance_valid(_dragging) or mode != Mode.FOOT or panel.is_open:
		_dragging = null
		return
	# The haul: it trails your back at arm's length, heavy on your heels.
	var tow := player.global_position - player.facing() * 1.3
	var prev := _dragging.global_position
	var next := prev.lerp(Vector3(tow.x, prev.y, tow.z), clampf(8.0 * delta, 0.0, 1.0))
	_dragging.global_position = next
	# Hauling heavy TEACHES (strength "levels by hauling"): a point every 8 dragged meters.
	_drag_xp_m += prev.distance_to(next)
	if _drag_xp_m >= 8.0:
		_drag_xp_m = 0.0
		grant_xp("strength", 1.0)


func _drop_drag() -> void:
	if _dragging != null:
		notify("You set it down.")
	_dragging = null


# --- THE PAD DRIVER (controller arc) -------------------------------------------

## Per-frame pad work: the RIGHT STICK is the second half of twin-stick (it owns
## aim_override while deflected — the exact seam the sims aim with), and the
## TRIGGERS swap jobs when you take the wheel (RT gas / LT brake, GTA-style).
func _update_pad(_delta: float) -> void:
	var driving := mode == Mode.DRIVE
	if driving != _pad_prev_drive:
		_pad_prev_drive = driving
		_swap_drive_triggers(driving)
	# Right-stick aim: deflected = it owns the reticle; released = the mouse resumes.
	var av := Vector3(Input.get_axis("drivn_aim_left", "drivn_aim_right"), 0,
		-Input.get_axis("drivn_aim_down", "drivn_aim_up"))
	if av.length() > 0.25:
		aim_override = av.normalized() # a UNIT vector = 25 m out (the aim_point law)
		_pad_aiming = true
	elif _pad_aiming:
		_pad_aiming = false
		aim_override = Vector3.ZERO # hand the reticle back to the mouse


## Entering the cab, the triggers become PEDALS (RT throttle, LT brake — the
## car already drinks move_up/move_down strengths); on foot they're weapons again.
func _swap_drive_triggers(on: bool) -> void:
	for pair in [["move_up", "axis:rt"], ["move_down", "axis:lt"]]:
		var action := String(pair[0])
		for e in InputMap.action_get_events(action):
			if e is InputEventJoypadMotion and ((e as InputEventJoypadMotion).axis == JOY_AXIS_TRIGGER_RIGHT \
					or (e as InputEventJoypadMotion).axis == JOY_AXIS_TRIGGER_LEFT):
				InputMap.action_erase_event(action, e)
		if on:
			InputMap.action_add_event(action, ProtoInputMap.descriptor_to_event(String(pair[1])))


## RUMBLE: the hit lands in your hands. Every connected pad shakes (co-op couch).
func pad_rumble(weak: float, strong: float, dur: float = 0.2) -> void:
	for dev in Input.get_connected_joypads():
		Input.start_joy_vibration(dev, weak, strong, dur)


## The one drive-fire door (mount if bolted, else your own iron out the window).
func _fire_from_seat() -> void:
	if active_car and active_car.mount_weapon:
		fire_mount()
	else:
		fire_from_vehicle()


func _equip_slot(idx: int) -> void:
	if idx < 0 or idx >= weapons.size():
		return
	equipped = idx
	_reload_t = 0.0 # switching abandons the mag swap
	_reload_wpn = null
	notify("Equipped the %s" % weapons[idx].info()["name"])


func toggle_controls_panel() -> void:
	if controls_panel == null:
		controls_panel = ProtoControlsPanel.create(self)
		add_child(controls_panel)
	else:
		controls_panel.toggle()


# --- UNARMED (MOVESET.txt): tap punch · hold shove · sprint-tackle ------------

func _unarmed_press() -> void:
	if panel.is_open or _reload_t > 0.0:
		return
	if water_state == "swim":
		notify("🫧 Your hands are keeping you afloat")
		return
	if player.sprinting() and _tackle_t <= 0.0:
		_tackle() # sprint + strike = the bull-rush
		return
	_fist_pressed = true
	_fist_hold = 0.0


func _unarmed_release() -> void:
	if not _fist_pressed:
		return
	_fist_pressed = false
	if _fist_hold < SHOVE_HOLD:
		_fire_unarmed(fists) # the TAP: jab → jab → cross/kick


## Fire one of the standing unarmed rows through the ONE melee law.
func _fire_unarmed(w: ProtoWeapon) -> void:
	if mode != Mode.FOOT or panel.is_open or _reload_t > 0.0:
		return
	player.enter_stance()
	player.aim_now(aim_direction())
	if w.fire(self, player.muzzle_world(), aim_direction()):
		cam_rig.add_trauma(0.08) # quiet, like all melee — no heat, no nerve spike


## THE TACKLE: a gap-closer that ends in a KNOCKDOWN — THEY hit the ground, you
## stay up. The down window is yours (finish it or blow past). Stamina-gated.
func _tackle() -> void:
	if player.stamina < 10.0:
		return
	player.stamina -= 10.0
	_tackle_t = 0.45
	var dir := player.velocity
	dir.y = 0.0
	dir = dir.normalized() if dir.length() > 1.0 else player.facing()
	player.velocity += dir * 7.5 # the rush — carried by your own sprint
	player.enter_stance()
	if player.has_method("punch"):
		player.punch(1)
	if audio:
		audio.play_at("whoosh", player.global_position, -8.0)


## The rush window: first body you reach goes DOWN (combatant ∪ threat, wall-law).
func _update_tackle(delta: float) -> void:
	if _tackle_t <= 0.0:
		return
	_tackle_t -= delta
	var fwd := player.velocity
	fwd.y = 0.0
	fwd = fwd.normalized() if fwd.length_squared() > 0.5 else player.facing()
	var targets: Array = get_tree().get_nodes_in_group("combatant").duplicate()
	for th in get_tree().get_nodes_in_group("threat"):
		if not targets.has(th):
			targets.append(th)
	for node in targets:
		var t := node as Node3D
		if t == null or not is_instance_valid(t) or t == player:
			continue
		var to_t := t.global_position - player.global_position
		to_t.y = 0.0
		if to_t.length() <= 1.7 and fwd.dot(to_t.normalized()) > 0.3 \
				and ProtoWeapon.melee_clear(player, t) and t.has_method("take_damage"):
			var mult: float = character.unarmed_dmg_mult() if character else 1.0
			if t.has_method("shove"):
				t.shove(to_t.normalized(), 5.0 * (character.shove_mult() if character else 1.0))
			if t.has_method("knock_down"):
				t.knock_down() # the point of the move: THEY eat the floor
			t.take_damage(10.0 * mult)
			ProtoFX.blood(self, t.global_position + Vector3(0, 1.0, 0))
			ProtoFloater.pop(self, t.global_position + Vector3(0, 2.1, 0), "TACKLED", Color(0.95, 0.8, 0.35), 130)
			if audio:
				audio.play_at("thunk", t.global_position, -2.0)
			cam_rig.add_trauma(0.2)
			grant_xp("martial_arts", 2.0)
			grant_xp("strength", 1.0)
			_tackle_t = 0.0
			return


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
		audio.play_ui("click", -2.0) # GUNFEEL #3: dry-fire is HEARD, not just read
		notify("*click* — reload (R)")
		return
	var origin: Vector3 = active_car.global_position \
		+ Vector3(0, active_car.spec["chassis"].y * 0.5 + 0.7, 0) \
		- active_car.global_basis.x * 0.5 # the driver's window
	if bool(active_car.spec.get("rider_exposed", false)):
		origin = player.muzzle_world() # THE VISIBLE RIDER: the shot leaves the gun you can SEE
	# The FULL 3D line, not flattened: the window sits HIGH (semi cab higher yet) —
	# a horizontal ray sails over heads. Shots angle DOWN to the aim point.
	var shot := aim_point() - origin
	var dir := shot.normalized() if shot.length_squared() > 0.01 else active_car.facing()
	if w.fire(self, origin, dir):
		# GUNFEEL #7: the same on-foot juice, from the window — flash + brass
		# PARENTED TO THE CAR (global_position resolves through the parent
		# transform every frame, so both ride the car's motion for their life).
		ProtoFX.muzzle_flash(active_car, origin, dir)
		ProtoFX.casing(active_car, origin, dir.cross(Vector3.UP).normalized() * -1.0)
		cam_rig.add_trauma(0.26 if w.id == "shotgun" else 0.18) # same per-weapon table as on-foot (:1935)
		stress = minf(100.0, stress + 1.5)
		audio.play_at(String(w.info().get("fire_sfx", "shot")), active_car.global_position)


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

## 40 scrip: Sam stops being an NPC and becomes YOURS — follows, fights, scouts.
func hire_companion(npc: ProtoNPC) -> void:
	# The NPC's archetype names the CREW row — new hires are rows, not code.
	var cid: String = {"drifter": "sam", "mechanic": "hazel", "medic": "mercer"}.get(npc.archetype, "sam")
	var cost: int = ProtoCompanion.CREW[cid]["hire_cost"]
	if not backpack.remove("scrip", cost):
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
	if net_is_client():
		return # the HOST owns the pack — a client sees it as ghosts, never spawns its own
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
	# BEAT 2: once we've crossed RELOAD_INSERT_PCT of the total (elapsed, not
	# remaining), the fresh mag seats — fires exactly once per reload.
	if not _reload_insert_done and _reload_total > 0.0 \
			and (_reload_total - _reload_t) >= _reload_total * RELOAD_INSERT_PCT:
		_reload_insert_done = true
		audio.play_at("reload_insert", player.global_position, -4.0)
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
	emit_noise(active_car.global_position, 70.0, "horn") # a migration trigger, same as the spec
	var called := 0
	for d in dogs:
		# A horn CARRIES — and a bonded pack (⭐ Kinship) hears it farther out.
		if is_instance_valid(d) and d.riding_in == null \
				and d.global_position.distance_to(active_car.global_position) < character.horn_recall_radius():
			d.command_heel()
			called += 1
	notify("📯 HOOOONK — %s" % ("the pack comes running" if called > 0 else "the wasteland ignores you"))
	# The horn CARRIES over the net (fun pass): comedy and navigation in one.
	if net != null and net.online:
		net.send_horn_ping()


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
		audio.play_ui("click", -2.0) # GUNFEEL #3: dry-fire is HEARD, not just read
		notify("*click* — MG dry, reload (R)")
		return
	var fwd := active_car.facing()
	var origin := active_car.global_position + fwd * 2.6 + Vector3(0, 0.8, 0)
	if w.fire(self, origin, fwd):
		# GUNFEEL #7: the hood MG gets the same flash+brass, parented to the car
		# (mount trauma stays as-is — this weapon's own 0.1 is untouched).
		ProtoFX.muzzle_flash(active_car, origin, fwd)
		ProtoFX.casing(active_car, origin, fwd.cross(Vector3.UP).normalized() * -1.0)
		cam_rig.add_trauma(0.1)
		audio.play_at(String(w.info().get("fire_sfx", "shot")), active_car.global_position, -4.0, 1.3)


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
	_reload_total = _reload_t
	_reload_insert_done = false
	_reload_wpn = w
	audio.play_at("reload_drop", player.global_position, -4.0) # BEAT 1: the spent mag hits the floor
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


func on_explosion(pos: Vector3, damage: float = 0.0, blast: float = 0.0) -> void:
	cam_rig.add_trauma(1.0) # THE WOW: a rocket hit KICKS the camera, hard
	pad_rumble(0.9, 1.0, 0.45) # …and the pad in your hands
	# …and the blast HANGS for a heartbeat (micro slow-mo, real-time restore).
	if not _cine_lock:
		_cine_lock = true
		var prev := Engine.time_scale
		Engine.time_scale = prev * 0.5
		get_tree().create_timer(0.15, true, false, true).timeout.connect(func() -> void:
			Engine.time_scale = prev
			_cine_lock = false)
	audio.play_at("explosion", pos, 4.0)
	# THE SHOCKWAVE (playtest: explosions should THROW things). Radial damage +
	# knockback + a flat-out chance, falling off with distance, on the ONE DAMAGE
	# LAW group (combatant ∪ threat) so pirates and howlers both feel it.
	if blast > 0.0:
		var seen: Array = get_tree().get_nodes_in_group("combatant").duplicate()
		for th in get_tree().get_nodes_in_group("threat"):
			if not seen.has(th):
				seen.append(th)
		for node in seen:
			var t := node as Node3D
			if t == null or not is_instance_valid(t) or t == player:
				continue
			var d: float = t.global_position.distance_to(pos)
			if d >= blast:
				continue
			var falloff: float = 1.0 - d / blast # 1 at ground zero → 0 at the rim
			if t.has_method("take_damage"):
				t.take_damage(damage) # full lethality in the radius (unchanged); KNOCKBACK is what falls off
			if t.has_method("shove"):
				var away: Vector3 = (t.global_position - pos)
				away.y = 0.0
				t.shove(away.normalized() if away.length() > 0.01 else player.facing(), 9.0 * falloff)
			if falloff > 0.4 and t.has_method("knock_down"):
				t.knock_down()
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
## Turn a drone ON and fly it: starts the pilot session and raises the dynamic split view
## (your body = view 1, the drone = view 2; it auto-splits as the bird ranges out).
func enter_drone_pilot(d: Node3D) -> void:
	if drone_pilot == null or split_view == null or d == null:
		return
	if drone_pilot.start(d):
		_drone_warned = 0 # fresh flight, fresh battery warnings
		# 🛸 PILOTING pays out: a practiced hand flies faster, sips the battery, and
		# holds a clean signal farther before the screen splits.
		drone_pilot.speed_mult = character.pilot_speed_mult()
		drone_pilot.drain_mult = character.pilot_drain_mult()
		split_view.max_separation = character.pilot_signal_m()
		split_view.activate(player, d)
		notify("🛸 PILOTING — fly it with your move keys; the screen SPLITS as it ranges. Interact to bring it in and land.")


func on_player_clawed(damage: float, _who: Node3D) -> void:
	if character.dead:
		return
	# Hit while piloting a drone? Your immobile body must bail — the bird hovers, you fight.
	if drone_pilot != null and drone_pilot.body_immobile():
		drone_pilot.on_attacked()
	if mode == Mode.DRIVE and active_car != null and is_instance_valid(active_car) and not active_car.dead:
		# The cab shields YOU — but the beast mauls the RIG (armor blunts it inside
		# take_damage). You CAN be torn up in your ride now; drive off or it dies.
		active_car.take_damage(damage)
		cam_rig.add_trauma(0.28)
		ProtoFloater.pop(self, active_car.global_position + Vector3(0, 1.6, 0), "-%d" % int(damage), Color(0.9, 0.55, 0.2), 100)
		audio.play_at("thunk", active_car.global_position, -3.0)
		if active_car.components["chassis"].ratio() < 0.3:
			hud.toast("🚗 the rig's coming apart — shake them or it's scrap")
		return
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
	lines.append("🪙 Scrip: %d   🩸 bleeding: %s   😰 stress: %d" % [backpack.count("scrip"), str(bleeding), int(stress)])
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
		for sid in carousel.any_under_siege():
			lines.append("⚠️ %s UNDER SIEGE — reach it by DAY %d or lose it" % [carousel.base_row(sid)["name"], carousel.gates[sid].siege_deadline_day])

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


var deaths: int = 0

func _on_death() -> void:
	player.is_active = false
	player.dead_vis = true
	if active_car:
		active_car.is_active = false
	# The WORLD persists (this is not permadeath — that's reserved for the dogs).
	# You black out and wake at the safehouse; the wasteland takes a cut.
	hud.show_death("YOU WENT DOWN — the Divided States take their cut.\nPress R to wake at the safehouse.")
	cam_rig.add_trauma(1.0)


## Soft respawn: you come to on the safehouse cot, mended, but lighter. Your rig
## stays where it died — go get it. Dogs, lit nodes, respect, the clock: all persist.
func respawn_at_home() -> void:
	deaths += 1
	character.revive()
	# The toll: the wasteland scavenges a cut of what you were carrying.
	var lost_scrap: int = int(backpack.count("scrap") * 0.4)
	var lost_jack: int = int(backpack.count("scrip") * 0.3)
	if lost_scrap > 0:
		backpack.remove("scrap", lost_scrap)
	if lost_jack > 0:
		backpack.remove("scrip", lost_jack)
	# Wake on foot at the safehouse door; leave the car (and its cargo) behind.
	# CO-OP (fun pass): if a PARTNER is out there, you come to BESIDE THEM —
	# death keeps the duo together instead of a cross-map drive of shame.
	mode = Mode.FOOT
	active_car = null
	player.is_active = true
	player.dead_vis = false
	var woke_at_partner := false
	if net != null and net.online:
		for id in remote_players:
			var buddy: ProtoPlayer3D = remote_players[id]
			if is_instance_valid(buddy):
				player.global_position = buddy.global_position + Vector3(2.5, 0.3, 0)
				woke_at_partner = true
				notify("🤝 Your partner dragged you back to your feet.")
				break
	if not woke_at_partner:
		player.global_position = SAFEHOUSE + Vector3(0, 0.3, 0)
	if cam_rig != null:
		cam_rig.target = player
	hud.hide_death()
	hud.set_circuit(circuit_level, circuit_beats)
	var toll := ""
	if lost_scrap > 0 or lost_jack > 0:
		toll = " Lost %d scrap, %d scrip." % [lost_scrap, lost_jack]
	notify("🩹 You came to on the safehouse cot.%s Your rig's still out there." % toll)
	if audio != null:
		audio.play_ui("blip", -2.0)


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
				backpack.add("scrip", 15)
				notify("👑 %s SENDS A HERO'S WELCOME — an escort's purse rides with you (+15 scrip)" % String(r["ruler"]).to_upper())
		_:
			bounty_hunted = false
			notify("🪧 %s territory — %s watches these roads" % [state, String(r["ruler"])])
	if events != null and events.war_state == state:
		notify("⚔️ …and you just drove INTO the war")
	# THE LIVING WORLD: a state line can now be a LAW line. If a faction holds this state,
	# announce its law — and if your kit is contraband here, warn you. A risk you can SEE,
	# not a punishment: possession only flags you if you're seen or searched.
	if world_state != null and world_state.controller_of(state) != "free_counties":
		var law: Dictionary = world_state.law_for(state)
		notify("🪧 %s is under %s — %s" % [state, law.get("name", "occupation"), law.get("blurb", "")])
		var flags: Array = world_state.player_contraband(state)
		if not flags.is_empty():
			notify("⚠️ CONTRABAND in %s: %s — keep it out of sight at checkpoints" % [state, ", ".join(flags)])


# --- THE WOW: cinematic combat reads --------------------------------------------
## A killing crit lands in SLOW MOTION — a third of a real second where the world
## holds its breath. Restores the PREVIOUS time scale (sims run hot; never stomp).
var _cine_lock: bool = false


## THE SHOOTDODGE's juice: the air goes 0.6× while you fly. Same contract as
## cinematic_kill — store the PREVIOUS scale, restore the PREVIOUS scale, share
## the one lock so the two slow-mos can never stack or fight (sims run hot).
func dive_dilation(air_game_s: float) -> void:
	if _cine_lock:
		return
	_cine_lock = true
	var prev := Engine.time_scale
	Engine.time_scale = prev * 0.6
	var t := get_tree().create_timer(air_game_s / 0.6, true, false, true) # real time
	t.timeout.connect(func() -> void:
		Engine.time_scale = prev
		_cine_lock = false)


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


## GUNFEEL PASS #5: HIT-STOP — a landed NON-kill hit dips time briefly so the
## connection reads, on any weapon row with "hit_stop" true (playtest dial —
## melee/shotgun/rocket true, rapid-fire pistol/car_mg false: see weapon.gd).
## Same lock/restore contract as cinematic_kill/dive_dilation: skip entirely
## if a cinematic already owns the lock (a killing crit is BIGGER and better-
## tuned — hit-stop must never fight it), and restore the EXACT previous
## scale (never assume 1.0 — sims stage time_scale != 1.0 to prove this).
const HIT_STOP_SCALE: float = 0.75
const HIT_STOP_S: float = 0.06 ## real-time; ~50-70ms spec band, chosen midpoint


func hit_stop() -> void:
	if _cine_lock:
		return
	_cine_lock = true
	var prev := Engine.time_scale
	Engine.time_scale = prev * HIT_STOP_SCALE
	var t := get_tree().create_timer(HIT_STOP_S, true, false, true) # real time, ignores its own dip
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
	# MOTIONFORGE live loop: re-fold motions.json so a browser tweak lands on the
	# NEXT stride of every rig already walking (statics — no respawn needed).
	ProtoPuppet._motion_folded = false
	ProtoPuppet.ensure_motions()
	ProtoQuadruped._motion_folded = false
	ProtoQuadruped.ensure_motions()
	# Traffic knobs ride the same door (data/traffic.json — density, speeds, exits).
	ProtoTraffic._folded = false
	ProtoTraffic.ensure_rows()
	ProtoBandits._folded = false
	ProtoBandits.ensure_rows()
	notify("🔧 CONTENT RELOADED — %d vehicle rows, map %s, motion+traffic rows refolded. New spawns wear the new stats." % [DrivnData.vehicles.size(), "refreshed" if map_ok else "kept"])
	return {"vehicles": DrivnData.vehicles.size(), "map_ok": map_ok}


# --- MULTIPLAYER (docs/MULTIPLAYER_PLAN): the whole build was aimed here. F7
# hosts, F8 joins 127.0.0.1. Each remote human is a real body in the combatant
# group — it moves, it fights, enemies hunt it. Co-op first; PvP already works
# through the one damage law. -----------------------------------------------------
var net: ProtoNet = null
var menu_open: bool = false ## the title menu is up — gameplay input waits
var remote_players: Dictionary = {} ## peer_id -> ProtoPlayer3D
var remote_cars: Dictionary = {}    ## peer_id -> ProtoCar3D (a peer at the wheel)
var enemy_ghosts: Dictionary = {}   ## host enemy instance_id -> ghost body (on clients)

## PVP RULES (COOP_PVP_MOBILE Track B): readable, OPT-IN, consequence-bearing.
## peace = co-op only · duel = damage on, kills read as DUELS · ffa = open season.
## Either way the SAFEHOUSE BUBBLE is holy ground (no spawn camping). F6 cycles
## (host-authoritative in a session); kills post a session BOUNTY on the killer.
var pvp_mode: String = "peace"
var pvp_bounties: Dictionary = {} ## peer_id -> scrip on their head (session ledger)
var _coop_truck: ProtoCar3D = null
var _pvp_rng := RandomNumberGenerator.new()
const SAFE_BUBBLE_M := 18.0


## True on a CLIENT (online, not the host) — it must NOT sim its own enemies/world;
## the host is authoritative and streams them. Offline/host both run the world.
func net_is_client() -> bool:
	return net != null and net.online and not net.is_server()


func _ensure_net() -> void:
	if net == null:
		net = ProtoNet.create(self)
		add_child(net)
		net.peer_joined.connect(_net_spawn_peer)
		net.peer_left.connect(_net_despawn_peer)


func _net_spawn_peer(id: int) -> void:
	if remote_players.has(id):
		return
	var body := ProtoPlayer3D.create(ProtoPuppet.look("drifter"))
	body.is_remote = true
	body.peer_id = id
	body.name = "RemotePlayer_%d" % id
	add_child(body)
	body.global_position = player.global_position + Vector3(3, 0, 0)
	remote_players[id] = body
	# NAME TAG (fun pass): P<id> floats over the body — no more shooting your friend.
	var tag := Label3D.new()
	tag.name = "NameTag"
	tag.text = "P%d" % id
	tag.font_size = 64
	tag.pixel_size = 0.01
	tag.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	tag.modulate = Color(0.96, 0.72, 0.2)
	tag.position = Vector3(0, 2.3, 0)
	body.add_child(tag)
	# PARTNER ARROW: a waypoint that FOLLOWS the body (N cycles to your buddy).
	waypoints.append(["🤝 PARTNER P%d" % id, body])
	# The PvP wire: my iron landing on this body may carry over the net (gated).
	body.damaged.connect(func(amount: float, _attacker: Node3D) -> void:
		_on_remote_player_damaged(id, amount))
	# THE CO-OP TRUCK (host, first friend in): a bed rig waits by the safehouse —
	# one drives, one rides the BED. The whole fantasy, parked.
	if net != null and net.is_server() and _coop_truck == null:
		_spawn_coop_truck()
	_refresh_peer_tags()


func _net_despawn_peer(id: int) -> void:
	if remote_players.has(id):
		if is_instance_valid(remote_players[id]):
			remote_players[id].queue_free()
		remote_players.erase(id)
	# Drop the partner arrow with the partner.
	for i in range(waypoints.size() - 1, -1, -1):
		if String(waypoints[i][0]) == "🤝 PARTNER P%d" % id:
			waypoints.remove_at(i)
	waypoint_idx = mini(waypoint_idx, waypoints.size() - 1)


## THE FUN-PASS SURFACE (Track A+B): tags, rules, bounties, the truck, the horn.

func _spawn_coop_truck() -> void:
	_coop_truck = ProtoCar3D.create("pickup_truck", Color(0.5, 0.35, 0.2))
	add_child(_coop_truck)
	_coop_truck.global_position = SAFEHOUSE + Vector3(8, 0.5, 2)
	notify("🛻 A bed rig waits by the safehouse — one DRIVES, one rides the BED.")


func pvp_label() -> String:
	match pvp_mode:
		"peace": return "PEACE — no player damage"
		"duel": return "DUEL — damage ON, kills read as duels"
	return "FREE-FOR-ALL — open season outside the safehouse bubble"


func in_safe_bubble(pos: Vector3) -> bool:
	return pos.distance_to(SAFEHOUSE) < SAFE_BUBBLE_M


## May MY hit hurt this remote body right now? The opt-in + the holy ground.
func pvp_allowed(victim: Node3D) -> bool:
	if pvp_mode == "peace" or victim == null or not is_instance_valid(victim):
		return false
	if in_safe_bubble(victim.global_position) or in_safe_bubble(player.global_position):
		return false
	return true


func _on_remote_player_damaged(peer_id: int, amount: float) -> void:
	var body: ProtoPlayer3D = remote_players.get(peer_id)
	if body == null or not pvp_allowed(body):
		return
	net.send_pvp_hit(peer_id, amount)


func net_set_pvp(mode: String) -> void:
	pvp_mode = mode
	notify("⚔️ HOST sets the rules — %s" % pvp_label())
	_refresh_peer_tags()


## The victim's machine applies the hit through the ONE damage law (a random
## part, like any real blow) — and reports its own death to the room.
func net_pvp_hit(from_peer: int, amount: float) -> void:
	if pvp_mode == "peace" or in_safe_bubble(player.global_position):
		return # my law, my ground: foul packets can't hurt me at home
	character.take_wound(character.random_part(_pvp_rng), amount)
	notify("⚔️ TAKING FIRE from Player %d!" % from_peer)
	if character.dead:
		net.send_pvp_death(from_peer)
		net_pvp_death(net.my_id() if net != null else 0, from_peer)


## Everyone reads the consequence: the toast names the rules, the killer wears
## a BOUNTY the whole room can see (the tag goes red with a price).
func net_pvp_death(victim_peer: int, killer_peer: int) -> void:
	pvp_bounties[killer_peer] = int(pvp_bounties.get(killer_peer, 0)) + 40
	var line := "DUEL SETTLED" if pvp_mode == "duel" else "MURDER ON THE OPEN ROAD"
	notify("☠️ %s — Player %d downed Player %d. Bounty on P%d: %d scrip." \
		% [line, killer_peer, victim_peer, killer_peer, int(pvp_bounties[killer_peer])])
	_refresh_peer_tags()


func net_horn_ping(from_peer: int, pos: Vector3) -> void:
	vision_cone.reveal_at(pos)
	if audio != null:
		audio.play_at("honk", pos, -4.0)
	notify("📯 Player %d leans on the horn — over THERE." % from_peer)


func _refresh_peer_tags() -> void:
	for id in remote_players:
		var body: ProtoPlayer3D = remote_players[id]
		if not is_instance_valid(body):
			continue
		var tag := body.get_node_or_null("NameTag") as Label3D
		if tag == null:
			continue
		var bounty := int(pvp_bounties.get(id, 0))
		tag.text = "P%d" % id + ((" · ☠️%d" % bounty) if bounty > 0 else "")
		tag.modulate = Color(0.95, 0.25, 0.15) if (pvp_mode != "peace" or bounty > 0) else Color(0.96, 0.72, 0.2)


## Net → world: a peer's latest body state. A DRIVING peer shows a real rig on
## the road (its on-foot body hides); an on-foot peer shows the body (its car,
## if any, despawns). Late joiners spawn on first sight.
func net_apply_peer(id: int, st: Dictionary) -> void:
	if not remote_players.has(id):
		_net_spawn_peer(id)
	var body: ProtoPlayer3D = remote_players.get(id)
	if body == null or not is_instance_valid(body):
		return
	var p: Array = st.get("pos", [0, 0, 0])
	var pos := Vector3(float(p[0]), float(p[1]), float(p[2]))
	if bool(st.get("drive", false)):
		# The peer is at the wheel: drive a REMOTE car; park their body inside it.
		var car: ProtoCar3D = remote_cars.get(id)
		if car == null or not is_instance_valid(car) or car.vclass != String(st.get("vclass", "scavenger")):
			if car != null and is_instance_valid(car):
				car.queue_free()
			car = ProtoCar3D.create(String(st.get("vclass", "scavenger")), Color(0.3, 0.4, 0.55))
			car.use_player_input = false
			car.set_physics_process(false) # it's a puppet — the driver's client owns the physics
			add_child(car)
			remote_cars[id] = car
		car.global_position = car.global_position.lerp(pos, 0.35)
		car.global_rotation.y = lerp_angle(car.global_rotation.y, float(st.get("byaw", 0.0)), 0.35)
		body.visible = false
		body.global_position = pos
	else:
		if remote_cars.has(id) and is_instance_valid(remote_cars[id]):
			remote_cars[id].queue_free()
			remote_cars.erase(id)
		body.visible = true
		body.apply_remote_state(pos, float(st.get("byaw", 0.0)),
			float(st.get("ayaw", 0.0)), float(st.get("hurt", 0.0)))
		body.set_armed(bool(st.get("armed", false)))


# --- HOST-AUTHORITATIVE ENEMIES: the host owns the howlers + lurkers so every
# client fights the SAME pack. The host streams their transforms; clients render
# GHOSTS and suppress their own enemy sim (net_is_client gates the spawners). ----

func net_enemy_states() -> Array:
	var out: Array = []
	for grp in ["threat"]:
		for e in get_tree().get_nodes_in_group(grp):
			if e is Node3D and is_instance_valid(e) and not (e is ProtoPlayer3D) \
					and not (e is ProtoCompanion) and not e.is_in_group("net_ghost"):
				var kind := "lurker"
				if e is ProtoHowler:
					kind = "howler"
				out.append({"id": e.get_instance_id(), "kind": kind,
					"pos": [e.global_position.x, e.global_position.y, e.global_position.z],
					"byaw": (e as Node3D).rotation.y})
	return out


func net_apply_enemies(states: Array) -> void:
	var seen: Dictionary = {}
	for s in states:
		var eid: int = int(s["id"])
		seen[eid] = true
		var g: Node3D = enemy_ghosts.get(eid)
		if g == null or not is_instance_valid(g):
			g = _make_enemy_ghost(String(s.get("kind", "lurker")))
			add_child(g)
			enemy_ghosts[eid] = g
		var p: Array = s["pos"]
		g.global_position = g.global_position.lerp(Vector3(float(p[0]), float(p[1]), float(p[2])), 0.4)
		g.rotation.y = float(s.get("byaw", 0.0))
	for eid in enemy_ghosts.keys():
		if not seen.has(eid): # the host says it's gone (killed / despawned)
			if is_instance_valid(enemy_ghosts[eid]):
				enemy_ghosts[eid].queue_free()
			enemy_ghosts.erase(eid)


## A lightweight visual stand-in for a host-owned enemy (clients don't sim AI).
func _make_enemy_ghost(kind: String) -> Node3D:
	var n := StaticBody3D.new()
	n.add_to_group("net_ghost")
	var mesh := MeshInstance3D.new()
	var bm := CapsuleMesh.new()
	bm.radius = 0.34
	bm.height = 1.5
	mesh.mesh = bm
	mesh.material_override = ProtoWorldBuilder.material(
		Color(0.16, 0.13, 0.11) if kind == "howler" else Color(0.12, 0.11, 0.10), 1.0)
	mesh.position.y = 0.75
	n.add_child(mesh)
	return n


# --- SAVE / LOAD (the biggest missing single-player feature — player_record was
# built for exactly this). F5 writes ONE JSON, F9 restores it: the player (pos,
# wounds, skills, pack, arsenal), the pack (per-dog bond + memory), the ring
# (lit nodes), the home (upgrades re-raised), the ledger, the clock, THE CIRCUIT.
const SAVE_PATH := "user://drivn.save"
const SAVE_VERSION := 1 ## bump when the save shape changes; load tolerates older via .get() defaults
## THE ONE safehouse anchor (the door / respawn / go-home / dev-teleport all read this).
## Was four hand-synced literals that drifted (HANDOFF §2 low-confidence). homebase.HOME
## is a DIFFERENT anchor on purpose — the build-footprint center, ~3 m off, same building.
const SAFEHOUSE := Vector3(110, 0, -323)


func _siege_records() -> Dictionary:
	var out: Dictionary = {}
	for gid in carousel.gates:
		if carousel.gates[gid].under_siege:
			out[gid] = carousel.gates[gid].siege_deadline_day
	return out


func _crew_records() -> Array:
	var out: Array = []
	for c in companions:
		if c is ProtoCompanion and is_instance_valid(c) and not c.dead:
			out.append(c.to_record())
	return out


func _garage_records() -> Dictionary:
	var out: Dictionary = {}
	for gid in carousel.gates:
		if not carousel.gates[gid].garage.is_empty():
			out[gid] = carousel.gates[gid].garage.duplicate(true)
	return out
 ## var_to_str format: Color/Vector3 round-trip natively (JSON strings them)


## THE FIRST RUN's GO-HOME beat calls this: light the SAFEHOUSE waypoint so the
## ⌂ arrow actually appears on screen (the beat told you to follow a marker that
## was never turned on — and never taught the N key). Now it just shows up.
func point_home_waypoint() -> void:
	for i in waypoints.size():
		if waypoints[i][0] == "SAFEHOUSE":
			waypoint_idx = i
			hud.toast("📍 Follow the ⌂ arrow to the safehouse  (N cycles waypoints)")
			return


## OLD SAVES speak the old tongue: the 2026-07-06 lore rename (jack→scrip) walks
## any restored container through this. One-way, additive — no coin is ever lost.
static func migrate_item_ids(slots: Dictionary) -> Dictionary:
	if slots.has("jack"):
		slots["scrip"] = int(slots.get("scrip", 0)) + int(slots["jack"])
		slots.erase("jack")
	return slots


## NEW GAME (from the front door): you're already spawned driving — this just
## hands you the first goal. THE FIRST RUN teaches THE CIRCUIT then bows out.
func begin_new_game() -> void:
	notify("🚗 The road starts here. Follow the wheel.")
	if objectives != null:
		objectives.arm()


func save_game() -> Dictionary:
	var dogs_out: Array = []
	for d in get_tree().get_nodes_in_group("proto_dog"): # the group never lies (arrays can)
		if d is ProtoDog and is_instance_valid(d) and d.adopted and not d.downed:
			var r: Dictionary = d.to_record()
			r["pos"] = [d.global_position.x, d.global_position.y, d.global_position.z]
			r["guard_pos"] = [d.guard_pos.x, d.guard_pos.y, d.guard_pos.z]
			dogs_out.append(r)
	var data := {
		"player": player_record(),
		"clock": {"day": daynight.day, "hour": daynight.hour, "moon": daynight.moon_phase},
		"stress": stress, "bleeding": bleeding,
		"respect": respect.ledger.duplicate(true),
		"carousel": carousel.active.keys(),
		"garages": _garage_records(),
		"sieges": _siege_records(),
		"homebase": homebase.owned.keys(),
		"circuit": {"level": circuit_level, "beats": circuit_beats.duplicate()},
		"objectives": objectives.to_record() if objectives != null else {},
		"deaths": deaths,
		"weather": weather.state if weather != null else "clear",
		"event": {"today": events.today_event, "war": events.war_state} if events != null else {},
		"crew": _crew_records(),
		"metaworld": metaworld.records.duplicate(true) if metaworld != null else [],
		"visited": visited_states.keys(),
		"fallen": fallen_dogs.duplicate(true),
		"dogs": dogs_out,
		# THE SHELF (docs/cinema.md Phase 4): what you've found and what you've watched.
		"media": {"unlocked": media_unlocked.keys(), "watched": media_watched.keys()},
	}
	# THE LIVING WORLD: politics + laws + queued bulletins persist; last_played stamps
	# "now" so the next load can size the absence and run offline catch-up.
	var now_utc := int(Time.get_unix_time_from_system())
	if world_state != null:
		world_state.last_played_utc = now_utc
		data["world"] = {
			"version": ProtoWorldState.WORLD_VERSION,
			"state_control": world_state.state_control.duplicate(true),
			"active_laws": world_state.active_laws.duplicate(true),
			"broadcast_queue": world_state.broadcast_queue.duplicate(true),
		}
	data["last_played_utc"] = now_utc
	data["version"] = SAVE_VERSION
	var f := FileAccess.open(SAVE_PATH, FileAccess.WRITE)
	f.store_string(var_to_str(data))
	f.close()
	notify("💾 SAVED — day %d · %s · %d dogs · %d nodes lit" % [daynight.day, daynight.clock_text(), dogs_out.size(), carousel.active.size()])
	return data


func load_game() -> bool:
	if not FileAccess.file_exists(SAVE_PATH):
		notify("💾 No save on disk yet — F5 writes one")
		return false
	var data: Variant = str_to_var(FileAccess.get_file_as_string(SAVE_PATH))
	if not (data is Dictionary):
		notify("💾 The save is corrupt — the wasteland ate it")
		return false
	apply_save(data)
	notify("💾 LOADED — day %d. The road remembers." % daynight.day)
	# THE LIVING WORLD: the world kept moving while you were gone. Size the absence and,
	# if it crossed the threshold, run offline catch-up + wake to the return briefing.
	if world_state != null:
		var digest: Dictionary = world_state.catchup_on_load(int(Time.get_unix_time_from_system()))
		if not digest.is_empty() and int(digest.get("days", 0)) > 0:
			_show_return_briefing(digest)
	return true


## THE RETURN BRIEFING (LIVING_WORLD_DSOA §4.4): you wake SAFE at home and learn what
## changed before stepping outside — days passed, who took what, what's now contraband in
## your kit, and the bulletins the world queued. Text-first (the fallback floor: always works).
func _show_return_briefing(digest: Dictionary) -> void:
	var days := int(digest.get("days", 0))
	var took := String(digest.get("took_state", ""))
	var lines: Array = []
	lines.append("━━━  STATE OF THE STATE  ━━━")
	lines.append("")
	lines.append("%d DAYS PASSED. You wake in the safehouse — the world moved without you." % days)
	if took != "":
		var law: Dictionary = ProtoWorldState.LAWS.get(String(digest.get("new_law", "")), {})
		var boss := ProtoWorldState.faction_name(world_state.controller_of(took))
		lines.append("")
		lines.append("HOME STATE:  %s" % took)
		lines.append("CONTROL:  %s" % boss.to_upper())
		lines.append("NEW LAW:  %s" % String(law.get("name", "occupation")))
		lines.append("   %s" % String(law.get("blurb", "")))
		var flags: Array = world_state.player_contraband(took)
		if not flags.is_empty():
			lines.append("")
			lines.append("⚠  CONTRABAND IN YOUR KIT (%d) — hide it or lose it at a checkpoint:" % flags.size())
			for f in flags:
				var meta: Dictionary = ProtoContainer.ITEMS.get(String(f), {})
				lines.append("   • %s" % String(meta.get("name", f)))
	# The bulletins the world queued while you were gone (also still on the radio dial).
	var bulletins: Array = []
	for b in world_state.broadcast_queue:
		if not bool(b.get("heard", false)):
			bulletins.append(String(b.get("text", "")))
	if not bulletins.is_empty():
		lines.append("")
		lines.append("📻  ON THE AIR:")
		for t in bulletins:
			lines.append("   • %s" % t)
	lines.append("")
	lines.append("[ E or any key — step into the day ]")
	hud.show_briefing("\n".join(lines))
	menu_open = true # swallow gameplay input while the wake-up screen is up (same gate as the title)
	notify("🏠 %d DAYS PASSED — check the briefing before you step outside" % days)
	if "audio" in self and audio != null:
		audio.play_ui("vo_radio_war", -4.0) # the DJ calls it through the static


## Dismiss the return briefing (E or any key): closes the screen, hands input back, and
## drains the bulletins to the radio dial so you can still hear them later.
func dismiss_briefing() -> void:
	hud.hide_briefing()
	menu_open = false
	for b in world_state.broadcast_queue:
		b["heard"] = true # you've read them at home; the dial won't re-interrupt for these


func apply_save(data: Dictionary) -> void:
	player_restore(data.get("player", {}))
	var ck: Dictionary = data.get("clock", {})
	daynight.day = int(ck.get("day", 1))
	daynight.hour = float(ck.get("hour", 9.0))
	daynight.moon_phase = float(ck.get("moon", 0.55))
	stress = float(data.get("stress", 0.0))
	bleeding = int(data.get("bleeding", 0))
	respect.ledger = (data.get("respect", {}) as Dictionary).duplicate(true)
	for id in data.get("carousel", []):
		carousel.set_active(String(id))
	var gj: Dictionary = data.get("garages", {})
	for gid in gj:
		if carousel.gates.has(String(gid)):
			var recs: Array = (gj[gid] as Array).duplicate(true)
			for r in recs: # old-save trunks speak the old tongue too
				if r is Dictionary and r.has("trunk"):
					r["trunk"] = migrate_item_ids(r["trunk"])
			carousel.gates[String(gid)].garage = recs
	for sid in data.get("sieges", {}):
		if carousel.gates.has(String(sid)):
			var g = carousel.gates[String(sid)]
			g.begin_siege(1)
			g.siege_deadline_day = int(data["sieges"][sid])
	homebase.restore(data.get("homebase", []))
	var circ: Dictionary = data.get("circuit", {})
	circuit_level = int(circ.get("level", 1))
	var b: Dictionary = circ.get("beats", {})
	for k in circuit_beats:
		circuit_beats[k] = bool(b.get(k, false))
	hud.set_circuit(circuit_level, circuit_beats)
	if objectives != null:
		objectives.from_record(data.get("objectives", {}))
	deaths = int(data.get("deaths", 0))
	if weather != null and data.has("weather"):
		weather.restore(String(data["weather"])) # the sky you saved under
	if events != null:
		var ev: Dictionary = data.get("event", {})
		events.today_event = String(ev.get("today", ""))
		events.war_state = String(ev.get("war", "")) # an active war survives the reload
	if metaworld != null:
		metaworld.records = (data.get("metaworld", []) as Array).duplicate(true) # a dog left GUARDING off-screen persists
	if world_state != null: # THE LIVING WORLD: whose states, whose laws, what the world was broadcasting
		var ws: Dictionary = data.get("world", {})
		world_state.state_control = (ws.get("state_control", {}) as Dictionary).duplicate(true)
		world_state.active_laws = (ws.get("active_laws", {}) as Dictionary).duplicate(true)
		world_state.broadcast_queue = (ws.get("broadcast_queue", []) as Array).duplicate(true)
		world_state.last_played_utc = int(data.get("last_played_utc", 0))
	visited_states.clear()
	for st in data.get("visited", []):
		visited_states[String(st)] = true
	fallen_dogs = (data.get("fallen", []) as Array).duplicate(true)
	# THE SHELF persists: found reels stay found, watched stays watched.
	var med: Dictionary = data.get("media", {})
	media_unlocked.clear()
	for mid in med.get("unlocked", []):
		media_unlocked[String(mid)] = true
	media_watched.clear()
	for mid in med.get("watched", []):
		media_watched[String(mid)] = true
	# The pack: clear the live dogs, rebuild each from its record (bond and all).
	for d in get_tree().get_nodes_in_group("proto_dog"):
		if d is ProtoDog and is_instance_valid(d) and d.adopted:
			d.remove_from_group("proto_dog") # freed next frame — never double-counted
			d.queue_free()
	dogs.clear()
	all_dogs = all_dogs.filter(func(x): return x is ProtoDog and is_instance_valid(x) and not x.adopted)
	for rec in data.get("dogs", []):
		var r2: Dictionary = (rec as Dictionary).duplicate()
		r2["type"] = int(r2.get("type", 0))
		var p: Array = r2.get("pos", [0, 0, 0])
		r2["pos"] = Vector3(float(p[0]), float(p[1]), float(p[2]))
		var gp: Array = r2.get("guard_pos", [0, 0, 0])
		r2["guard_pos"] = Vector3(float(gp[0]), float(gp[1]), float(gp[2]))
		var nd := ProtoDog.from_record(r2, self)
		add_child(nd)
		nd.global_position = r2["pos"]
		nd.state = ProtoDog.DogState.FOLLOW
		all_dogs.append(nd)
		register_dog(nd)
	# THE CREW: clear the live roster, rebuild each hire from its row (was leaking —
	# a hired gunner vanished on load while his death-memorial persisted).
	for c in companions:
		if c is ProtoCompanion and is_instance_valid(c):
			c.queue_free()
	companions.clear()
	for cr in data.get("crew", []):
		var crd: Dictionary = cr as Dictionary
		var comp := ProtoCompanion.create(self, String(crd.get("crew_id", "sam")))
		add_child(comp)
		var cp: Array = crd.get("pos", [110, 0.2, -320])
		comp.global_position = Vector3(float(cp[0]), float(cp[1]), float(cp[2]))
		comp.hp = float(crd.get("hp", 70.0))
		companions.append(comp)


# --- RIDING SHOTGUN (goal: NPCs drive; you can be the passenger) ----------------
var passenger_of_ai: bool = false
var _e_down: bool = false
var _e_t: float = 0.0
var motorists: Array = []
var _traffic_cd: float = 60.0


func enter_passenger(car: ProtoCar3D) -> void:
	mode = Mode.DRIVE
	active_car = car
	passenger_of_ai = true
	audio.play_at("car_door", car.global_position, -6.0)
	player.is_active = false
	player.visible = false
	player.process_mode = Node.PROCESS_MODE_DISABLED
	var who: String = car.ai_driver.moto_name if (car.ai_driver != null and "moto_name" in car.ai_driver) else "the driver"
	notify("🚗 You ride shotgun with %s — E out · HOLD E to take the wheel" % who)


## HOLD E from the passenger seat: the brain lets go, the wheel is yours.
func take_wheel() -> void:
	if not passenger_of_ai or active_car == null:
		return
	passenger_of_ai = false
	if active_car.ai_driver != null and active_car.ai_driver.has_method("yield_wheel"):
		active_car.ai_driver.yield_wheel()
	active_car.ai_driver = null
	active_car.use_player_input = true
	enter_car(active_car) # the real entry: skill mods, HUD, the seat is YOURS
	notify("🫱 You slide over and take the wheel")


## AMBIENT TRAFFIC: now and then, somebody up the road gets in a car and DRIVES —
## city to city, on the highway's own bones. The world moves without you.
func _update_traffic(delta: float) -> void:
	# CAMPERS carry their kit: any camper rig without one grows one (the RV law).
	for car in cars:
		if car is ProtoCar3D and is_instance_valid(car) and not car.dead 				and car.spec.get("camper", false) and not car.has_meta("camp_kit"):
			car.set_meta("camp_kit", true)
			var ck := ProtoCamp.create(self, car)
			add_child(ck)
	_traffic_cd -= delta
	if _traffic_cd > 0.0:
		return
	_traffic_cd = randf_range(150.0, 280.0)
	motorists = motorists.filter(func(m): return is_instance_valid(m))
	if motorists.size() >= 2 or stream == null or stream.usmap == null or not stream.usmap.ok:
		return
	var anchor: Vector3 = active_car.global_position if (mode == Mode.DRIVE and active_car) else player.global_position
	var near: Dictionary = stream.usmap.road_near(anchor, 600.0)
	if near.is_empty():
		return
	var a: Vector2 = near["a"]
	var spawn := Vector3(a.x, 0.0, a.y)
	if spawn.distance_to(anchor) < 70.0:
		spawn += Vector3(0, 0, 90)
	var trip_car := ProtoCar3D.create(["scavenger", "pickup", "van"][randi() % 3], Color(0.4, 0.42, 0.45).lightened(randf() * 0.15))
	add_child(trip_car)
	trip_car.global_position = spawn + Vector3(9, 1.0, 0)
	cars.append(trip_car)
	var town: Dictionary = stream.usmap.towns[randi() % stream.usmap.towns.size()]
	var m := ProtoMotorist.create(self, trip_car,
		Vector3((town["pos"] as Vector2).x, 0, (town["pos"] as Vector2).y),
		["drifter", "scav", "trader"][randi() % 3],
		["Dee", "Marlow", "Quinn", "Ester", "Roy"][randi() % 5])
	add_child(m)
	m.global_position = spawn + Vector3(4, 0.3, 4)
	motorists.append(m)
	if anchor.distance_to(spawn) < 240.0:
		notify("🚗 Somebody up the road is getting on the move — headed for %s" % town["name"])


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
		b.trunk.add("scrip", 10 + i * 8)
		b.trunk.add("scrap", 3)
	# THE MIRROR: a chaser drops in behind, wearing the chase brain.
	var ch := ProtoCar3D.create("buggy", Color(0.28, 0.1, 0.08))
	add_child(ch)
	ch.global_position = active_car.global_position - fwd * 70.0 + Vector3(0, 1.0, 0)
	ch.trunk.add("scrip", 25)
	ch.trunk.add("12ga", 8)
	var ai := ProtoAutopilot.attach(ch)
	ai.target_node = active_car
	ai.arrive_dist = 0.0 # never brake for the target — the ARRIVAL is the ram
	pirates.append(ch)
	audio.play_at("howl", ch.global_position, 2.0, 1.4) # a war-whoop off the wind
	hud.toast("🏴 ROAD PIRATES — headlights in your mirror, steel across the road")
	stress = minf(100.0, stress + 14.0)


## PILLAR 1 (WORLD_PILLARS.md) — roads are CHARACTERS. Drive onto a named road and
## it greets you like a welcome sign: nickname, danger read, toll. `danger` is now a
## real CONSUMER — it scales ambush_odds() (a danger-3 road spawns pirates ~2× as
## often); `toll`+`family` are consumed too (bill_toll on entry). All road rows FELT.
var _last_road_id: String = ""
func _update_road_read() -> void:
	if mode != Mode.DRIVE or active_car == null:
		return
	var r: Dictionary = stream.usmap.road_near(active_car.global_position, 55.0)
	var rid: String = String(r.get("id", ""))
	if rid == "" or rid == _last_road_id:
		if rid == "":
			_last_road_id = ""
		return
	_last_road_id = rid
	var nick: String = String(r.get("nickname", ""))
	if nick == "":
		return
	var dgr: int = int(r.get("danger", 0))
	var bar := "▰".repeat(dgr) + "▱".repeat(3 - dgr)
	var toll: int = int(r.get("toll", 0))
	var line := "🛣️ %s   danger %s" % [nick, bar]
	if toll > 0:
		line += "   toll %d scrip" % toll
	notify(line)
	if toll > 0:
		bill_toll(toll, String(r.get("family", "")))


## A toll road bills you ONCE on entry (the road-read latches per road). Pay if you
## can; if you're short, the family that runs the stretch marks you (stress) instead
## of a hard gate. `toll` + `family` rows are now CONSUMED.
func bill_toll(amount: int, family: String) -> void:
	var who: String = family.capitalize().replace("_", " ") if family != "" else "the road"
	if backpack.count("scrip") >= amount:
		backpack.remove("scrip", amount)
		notify("🪙 Toll paid — %d scrip to %s." % [amount, who])
	else:
		stress = minf(100.0, stress + 8.0)
		notify("🚧 Couldn't pay the toll — %s marks you for it." % who)


## The ambush dice read the WORLD (Pillar 1 — roads are CHARACTERS): night favors
## them, a posted BOUNTY doubles them, a state AT WAR triples them — and the ROAD'S
## OWN danger row scales it, so THE CRIMSON MILE (danger 3) earns its name.
func ambush_odds() -> float:
	var odds := (0.55 if daynight.is_dark() else 0.3) * (2.0 if bounty_hunted else 1.0)
	if active_car == null or not is_instance_valid(active_car):
		return odds
	if events != null:
		odds *= events.pirate_mult(stream.current_state(active_car.global_position))
	var road: Dictionary = stream.usmap.road_near(active_car.global_position, 60.0)
	odds *= 1.0 + 0.35 * float(int(road.get("danger", 0))) # the road's reputation is real
	return odds


## SIGNS FOR THE ILLITERATE: seed a few around the safehouse/market. Data rows —
## more become a ROW per placement. The symbol says "words here"; reading needs the
## sight cone.
var signs: Array = []
func _spawn_signs() -> void:
	var rows: Array = [
		[Vector3(112, 0, -327), "SAFEHOUSE — home. Bed inside, stash by the door."],
		[Vector3(118, 0, -322), "MARKET AHEAD → trade scrip for what the road takes."],
		[Vector3(104, 0, -318), "KEEP OUT. The dogs don't ask twice."],
	]
	for r in rows:
		var sign := ProtoSign.create(String(r[1]))
		sign.position = r[0]
		add_child(sign)
		signs.append(sign)


## Each frame: a sign is READABLE when it sits inside your sight cone and within
## reading range. Symbol always shows; the words surface only when you LOOK.
const SIGN_READ_RANGE := 14.0
func _update_signs() -> void:
	if signs.is_empty():
		return
	var eye: Vector3 = (active_car if mode == Mode.DRIVE and active_car else player).global_position
	var gaze: Vector3 = player.sight_facing()
	var half: float = vision_cone.current_half_angle() if vision_cone != null else 1.0
	var cos_half: float = cos(half)
	var read_any := false
	for s in signs:
		if not (s is ProtoSign) or not is_instance_valid(s):
			continue
		var to_s: Vector3 = s.global_position - eye
		to_s.y = 0.0
		var d: float = to_s.length()
		var in_cone: bool = d < SIGN_READ_RANGE and d > 0.1 and gaze.dot(to_s.normalized()) > cos_half
		s.set_readable(in_cone)
		read_any = read_any or in_cone
	if read_any and not _sign_reading:
		audio.play_ui("blip", -14.0)
	_sign_reading = read_any

var _sign_reading: bool = false


func _update_pirates(delta: float) -> void:
	# The road rolls the dice while you drive fast on asphalt — night doubles it.
	_ambush_cd -= delta
	if _ambush_cd <= 0.0 and mode == Mode.DRIVE and active_car != null \
			and absf(active_car.forward_speed) > 14.0 and active_car.current_surface == "road":
		_ambush_cd = randf_range(180.0, 320.0)
		if randf() < minf(ambush_odds(), 0.95):
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
var _last_hunger_hr: float = -1.0
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
	# TORSO + HUNGER → stamina regen tax (stress already throttles; these stack).
	player.wound_regen_mult = character.wound_stamina_mult() * character.hunger_stamina_mult()
	# HUNGER drains on the game clock; the belly reports to the moodle column.
	var hhr: float = daynight.hour + float(daynight.day) * 24.0
	if _last_hunger_hr < 0.0:
		_last_hunger_hr = hhr
	elif hhr > _last_hunger_hr:
		character.hunger_tick(hhr - _last_hunger_hr)
		_last_hunger_hr = hhr
	hud.set_condition("hungry", character.hunger_tier())


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
			# UX: the road introduces itself by NAME — "I-80 · THE GAUNTLET — WYOMING"
			# beats a bare id (the nickname rows are the lore, put them where eyes live).
			var nick := String(road.get("nickname", ""))
			var road_line: String = "%s · %s" % [road["id"], nick] if nick != "" else String(road["id"])
			hud.set_location(clock + "%s — %s" % [road_line, stream.current_state(pos)])
			return
	hud.set_location(clock + "DIVIDED STATES — %s" % stream.current_state(pos))


func enter_car(car: ProtoCar3D) -> void:
	mode = Mode.DRIVE
	active_car = car
	car.is_active = true
	audio.play_at("car_door", car.global_position, -6.0)
	# THE IGNITION (goal): sitting down doesn't start anything. Keyless junkers and your
	# own keys turn over on the first throttle; a keyed car you broke into needs the
	# WHEEL HOT-WIRE first. The crank beat plays when the engine actually catches.
	car.engine_on = false
	car.ignition = "key" if (car.key_id == "" or has_key(car.key_id)) else "none"
	if not car.engine_started.is_connected(_on_engine_started):
		car.engine_started.connect(_on_engine_started.bind(car))
	# ⭐ Your DRIVING rides with you into any seat.
	car.driver_control = character.drive_control()
	car.driver_top = character.drive_top_mult()
	player.is_active = false
	# THE VISIBLE RIDER (owner: "I want to SEE a model on the motorcycle — we
	# need the arm for aiming"): an EXPOSED rig (rider_exposed row) keeps the
	# puppet in the saddle — visible, pinned, aim arm live (_pose_exposed_rider
	# runs it per frame). Roofed cabs still hide the driver (no read through a
	# roof). Colliders drop either way so the ghost body never blocks the rig.
	var exposed := bool(car.spec.get("rider_exposed", false))
	player.visible = exposed
	player.process_mode = Node.PROCESS_MODE_DISABLED
	for pc in player.get_children():
		if pc is CollisionShape3D:
			(pc as CollisionShape3D).disabled = true
	cam_rig.target = car
	hud.set_mode(true)
	# THE PACK RIDES ALONG: nearby dogs hop in, up to the class's dog_seats
	# (van 4, car/pickup 2, buggy 1, bike none). Overflow holds the ground.
	# SEAT ANCHORS: bed seats show the rider (Sam gunning from the truck bed, the
	# dog with its tail in the wind); overflow past the anchors rides hidden.
	var seats: int = int(car.spec.get("dog_seats", 0))
	var bed_seats: Array = []
	for s in car.spec.get("seats", []):
		if String(s.get("type", "cab")) == "bed":
			var sp: Array = s["pos"]
			bed_seats.append(Vector3(float(sp[0]), float(sp[1]), float(sp[2])))
	var bi := 0
	# Humans call shotgun first (Stage 7: one boarding law, animal or human).
	for c in companions:
		if seats <= 0:
			break
		if is_instance_valid(c) and c.riding_in == null and not c.staying \
				and c.global_position.distance_to(car.global_position) < 9.0:
			if bi < bed_seats.size():
				c.board(car, bed_seats[bi], "bed"); bi += 1
			else:
				c.board(car)
			seats -= 1
			notify("🧍 %s climbs %s" % [c.comp_name, "into the bed, gun up" if bi <= bed_seats.size() and bi > 0 else "in"])
	for d in dogs:
		if seats <= 0:
			break
		# Only FOLLOWERS ride. A dog on GUARD/SIC/SEEK is WORKING — it holds its
		# post (the metaworld's stay-behind loop depends on exactly that).
		if is_instance_valid(d) and d.riding_in == null \
				and d.state != ProtoDog.DogState.GUARD and d.state != ProtoDog.DogState.SIC \
				and d.state != ProtoDog.DogState.SEEK \
				and d.global_position.distance_to(car.global_position) < 9.0:
			if bi < bed_seats.size():
				d.board(car, bed_seats[bi], "bed"); bi += 1
			else:
				d.board(car)
			seats -= 1
			notify("🐕 %s hops %s" % [d.dog_name, "in the bed" if bi <= bed_seats.size() and bi > 0 else "in"])


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


## THE VISIBLE RIDER's frame (owner: the arm must AIM): pin the body to the
## saddle, pose it riding, and keep the aim arm on the mouse while armed — the
## same twin-stick law the walker lives by, read from the seat of a motorcycle.
func _pose_exposed_rider(delta: float) -> void:
	if active_car == null or player.puppet == null:
		return
	var seat: Vector3 = active_car.global_transform * Vector3(0, float(active_car.spec["chassis"].y) * 0.5 + 0.32, 0.12)
	player.global_position = seat
	var wpn := current_weapon()
	var armed := wpn != null and not wpn.is_melee()
	player.set_armed(armed)
	_apply_hand_pose(wpn)
	player.puppet.raised = armed
	player.puppet.rotation.y = wrapf(active_car.rotation.y - player.rotation.y, -PI, PI)
	player.puppet.pose_riding(delta, armed)
	if armed:
		var to_aim: Vector3 = aim_point() - player.puppet.global_position
		to_aim.y = 0.0
		if to_aim.length_squared() > 0.01:
			player.puppet.aim_arm.rotation.y = wrapf(
				ProtoPlayer3D._yaw_of(to_aim.normalized()) - player.puppet.global_rotation.y, -PI, PI)
	else:
		player.puppet.aim_arm.rotation.y = move_toward(player.puppet.aim_arm.rotation.y, 0.0, 8.0 * delta)


func _exit_car() -> void:
	if active_car == null:
		return
	_unboard_dogs(active_car)
	audio.play_at("car_door", active_car.global_position, -6.0)
	mode = Mode.FOOT
	if active_car.ai_driver == null:
		active_car.is_active = false # an AI-driven ride keeps ROLLING — you just got off
		active_car.engine_on = false # ...and the ENGINE DIES with the door (start/stop law)
	passenger_of_ai = false
	# Step out on the driver's side (left). global_basis.x is the car's RIGHT, so negate it.
	var out_pos := active_car.global_position - active_car.global_basis.x * 2.3
	out_pos.y = active_car.global_position.y + 0.3
	player.global_position = out_pos
	player.velocity = Vector3.ZERO
	for pc in player.get_children():
		if pc is CollisionShape3D:
			(pc as CollisionShape3D).disabled = false # the walker gets his body back
	player.process_mode = Node.PROCESS_MODE_INHERIT
	player.visible = true
	player.is_active = true
	cam_rig.target = player
	active_car = null
	hud.set_mode(false)
