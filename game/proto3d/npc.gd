## Town NPC v1 (WORLD_NPCS.md §3 — archetype = DATA, never new code). Two ship
## in this slice: the TRADER (core economy node — the Container panel becomes a
## shop) and the SEC-MAN (law/bounties — refuses work if your standing is bad).
## NPCs are hittable: shooting one is a CRIME the Respect Ledger remembers.
class_name ProtoNPC
extends CharacterBody3D

const FACTION := "meridian"

## Archetype rows: adding an NPC type = adding a row (behavior keys, not code).
# Code floor; data/npcs.json → "archetypes" folds ADDITIVELY on top via
# ensure_archetypes() (same spine pattern as ITEMS/PRICES). A JSON row is a new
# hireable/tradeable NPC template with no code — this is how mechanic/medic (Hazel/
# Mercer, whose CREW rows already exist) become real archetypes.
static var ARCHETYPES: Dictionary = {
	# look = a ProtoPuppet.SURVIVORS row (the same rig, a different body); act = how
	# this NPC "acts its part" through STATE — trader gestures, guard scans, drifter idles.
	"trader": {"name": "Mercy", "title": "TRADER", "role": "trade", "look": "trader", "act": "gesture",
		"color": Color(0.72, 0.55, 0.28),
		"greet": "Mercy: 'Scrip talks. What are you buying?'",
		"refuse": "Mercy: 'Not to you. Not after what you did.'",
		"stock": {"bandage": 4, "meat": 3, "9mm": 30, "12ga": 12, "grenade": 2,
			"medkit": 1, "water": 3, "coffee": 2, "canned_food": 3, "whiskey": 2,
			"jerry_can": 2, "car_parts": 1, "tire_kit": 2, "duct_tape": 3,
			"flare": 4, "map_fragment": 2, "painkillers": 2}},
	"secman": {"name": "Bridger", "title": "SEC-MAN", "role": "bounty", "look": "guard", "act": "scan",
		"color": Color(0.30, 0.40, 0.55),
		"greet": "Bridger: 'Got a lurker problem by the water point. 25 scrip for its head.'",
		"refuse": "Bridger: 'Meridian doesn't work with your kind. Walk away.'",
		"stock": {}},
	"drifter": {"name": "Sam", "title": "DRIFTER — 40 SCRIP", "role": "hire", "look": "drifter", "act": "idle",
		"color": Color(0.33, 0.38, 0.30),
		"greet": "Sam: 'Forty scrip and my gun walks where you walk.'",
		"refuse": "Sam: 'I drift with anybody... except you.'",
		"stock": {}},
}

## Base prices (scrip) — the Respect Ledger's price_mult scales them per faction.
# Code floor; data/prices.json folds ADDITIVELY on top via ensure_prices() (same
# spine pattern as ProtoContainer.ITEMS). A JSON row prices a new item without code.
static var PRICES: Dictionary = {
	"bandage": 12, "meat": 6, "9mm": 1, "12ga": 2, "grenade": 18, "scrap": 4,
	"wrench": 10, "machete": 25, "axe": 35, "bat": 20, "pistol": 40, "shotgun": 60, "rocket": 15,
	"pipe_rocket": 75, "eyepatch": 8, "drone": 55,
	"medkit": 30, "painkillers": 10, "water": 5, "coffee": 7, "canned_food": 8,
	"whiskey": 14, "jerry_can": 22, "car_parts": 28, "tire_kit": 16,
	"duct_tape": 6, "flare": 5, "map_fragment": 20,
	"cooked_meal": 9, "power_cell": 25, "dog_collar": 2, "mine": 30,
	"targeting_core": 200, "mount_schematic": 120, # priced so Mercy CAN — selling Cheyenne's brain is your funeral
	# The 2026-07-07 arcs' items, priced (they shipped without rows — items_sim
	# was red on the "Mercy can stock anything" law until these landed):
	"surveil_cam": 45, "walkie": 30, "motion_sensor": 35, "lockpick": 15,
	"book_driving": 25, "book_onfoot": 25, "book_dogs": 25, "book_home": 25,
	"book_gadgets": 25, "book_carousel": 40, "book_states": 30,
	"clothes": 12, "gun_oil": 18,
	"confiscation_notice": 1, "case_file": 8, # law paper is nearly worthless — but tradeable
}

static var _archetypes_folded: bool = false
## Data-spine read-back for NPC ARCHETYPES (roadmap #3, NPC slice): fold the
## "archetypes" array in data/npcs.json additively onto the code floor. A JSON row is
## a full NPC template (name/title/role/look/act/color[r,g,b]/greet/refuse/stock);
## missing fields default. New ids only (code authoritative). Boot-time, idempotent.
static func ensure_archetypes() -> void:
	if _archetypes_folded:
		return
	_archetypes_folded = true
	var path := "res://data/npcs.json"
	if not FileAccess.file_exists(path):
		return
	var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string(path))
	if not (parsed is Dictionary):
		return
	for row in (parsed as Dictionary).get("archetypes", []):
		var aid: String = String((row as Dictionary).get("id", ""))
		if aid == "" or ARCHETYPES.has(aid):
			continue
		var col: Array = (row as Dictionary).get("color", [0.5, 0.5, 0.5])
		ARCHETYPES[aid] = {
			"name": String(row.get("name", aid.capitalize())),
			"title": String(row.get("title", aid.to_upper())),
			"role": String(row.get("role", "trade")),
			"look": String(row.get("look", "drifter")),
			"act": String(row.get("act", "idle")),
			"color": Color(float(col[0]), float(col[1]), float(col[2])),
			"greet": String(row.get("greet", "'...'")),
			"refuse": String(row.get("refuse", "'Not you.'")),
			"stock": (row.get("stock", {}) as Dictionary),
		}


static var _prices_folded: bool = false
## Data-spine read-back for PRICES (roadmap #3, NPC slice): fold data/prices.json
## additively onto the code floor. A JSON {id, price} row prices a new item with no
## code. Existing ids are left alone (code authoritative). Idempotent, boot-time.
static func ensure_prices() -> void:
	if _prices_folded:
		return
	_prices_folded = true
	var path := "res://data/prices.json"
	if not FileAccess.file_exists(path):
		return
	var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string(path))
	if not (parsed is Dictionary):
		return
	for row in (parsed as Dictionary).get("prices", []):
		var pid: String = String((row as Dictionary).get("id", ""))
		if pid != "" and not PRICES.has(pid):
			PRICES[pid] = int((row as Dictionary).get("price", 0))

var archetype: String = "trader"
var npc_name: String = ""
var role: String = "trade"
var act: String = "idle" ## how this NPC acts its part: gesture/scan/pace/aim_crouch/idle
var stock: ProtoContainer = null
var hp: float = 60.0
var _visual: Node3D
var _puppet: ProtoPuppet = null
var _hurt_flash: float = 0.0
var _act_t: float = 0.0
var _prev_yaw: float = 0.0
var _patrol_anchor: Vector3 = Vector3.INF ## lazily set on first tick (pace)
var _patrol_sign: float = 1.0
var _crouched: bool = false


static func create(arch: String) -> ProtoNPC:
	var n := ProtoNPC.new()
	n.archetype = arch
	var a: Dictionary = ARCHETYPES[arch]
	n.npc_name = a["name"]
	n.role = a["role"]
	n.act = a.get("act", "idle")
	n.add_to_group("interactable")
	n.add_to_group("npc") # sight fan excludes NPCs — bodies aren't walls
	n.stock = ProtoContainer.new("%s's stall" % a["name"])
	for id in a["stock"]:
		n.stock.add(id, a["stock"][id])

	var shape := CollisionShape3D.new()
	var cap := CapsuleShape3D.new()
	cap.radius = 0.34
	cap.height = 1.7
	shape.shape = cap
	shape.position.y = 0.85
	n.add_child(shape)

	# The SAME puppet the player wears — just a different look row and, each frame, a
	# different STATE. An NPC "acting its part" is not extra code, it's the rig fed data.
	var look: Dictionary = ProtoPuppet.look(a.get("look", ""), hash(n.get_instance_id())) # wardrobe law
	if not look.has("cloth"):
		look["cloth"] = a["color"] # fall back to the archetype's signature color
	n._puppet = ProtoPuppet.create(look)
	n._visual = n._puppet
	n.add_child(n._visual)
	if n.act == "aim_crouch":
		n._puppet.set_armed(true)
	var tag := Label3D.new()
	tag.text = "%s\n%s" % [a["name"], a["title"]]
	tag.font_size = 96
	tag.pixel_size = 0.0042
	tag.modulate = Color(0.95, 0.85, 0.55)
	tag.position = Vector3(0, 2.35, 0)
	tag.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	n._visual.add_child(tag)
	return n


## CONTEXTUAL BARKS (goal: NPCs that notice the world). One line every ~30s when
## you're close — and the line reads the SITUATION: the storm, the war, your
## limp, your dog, the posters with your face. Rows, in priority order.
const BARKS: Array = [
	{"when": "dust", "line": "Dust like this? Park it or lose it."},
	{"when": "rain", "line": "Grip goes first in the wet. Then the ditch."},
	{"when": "blood_moon", "line": "Big dark tonight. Stay near the lights."},
	{"when": "war", "line": "Roads out east are all teeth this week."},
	{"when": "bounty", "line": "…ain't you the one from the posters?"},
	{"when": "limping", "line": "That leg needs a medkit, not more miles."},
	{"when": "night", "line": "They circle the edge of what you can see. Remember that."},
	{"when": "dog", "line": "Good dog you got there. Keep it fed."},
	{"when": "carousel", "line": "Heard a ring lit up under one of the old bases. Government iron still turning."},
	{"when": "default", "line": "Keep the tank half full. Always."},
]
var _bark_cd: float = 10.0


func _pick_bark(m: Node) -> String:
	for b in BARKS:
		var hit := false
		match String(b["when"]):
			"dust": hit = "weather" in m and m.weather != null and m.weather.state == "dust"
			"rain": hit = "weather" in m and m.weather != null and m.weather.state == "rain"
			"blood_moon": hit = "events" in m and m.events != null and m.events.today_event == "blood_moon"
			"war": hit = "events" in m and m.events != null and m.events.war_state != ""
			"bounty": hit = "bounty_hunted" in m and m.bounty_hunted
			"limping": hit = "character" in m and m.character != null and m.character.limp_side() != ""
			"night": hit = "daynight" in m and m.daynight != null and m.daynight.is_dark()
			"dog": hit = "dogs" in m and m.dogs.size() > 0
			"carousel": hit = "carousel" in m and m.carousel != null and m.carousel.active.size() > 0
			_: hit = true
		if hit:
			return b["line"]
	return BARKS[-1]["line"]


func _physics_process(delta: float) -> void:
	if not is_on_floor():
		velocity += get_gravity() * delta
	# The bark tick: near, alive, and paying attention to YOUR situation.
	_bark_cd -= delta
	if _bark_cd <= 0.0:
		_bark_cd = randf_range(28.0, 48.0)
		var m := get_tree().current_scene
		if m == null or not m.has_method("notify"):
			m = get_parent()
		if m != null and m.has_method("notify") and "player" in m and m.player != null \
				and global_position.distance_to(m.player.global_position) < 9.0 \
				and m.respect.standing(FACTION) != "SUSPECT":
			m.notify("%s: '%s'" % [npc_name, _pick_bark(m)])
	else:
		# The "pace" act walks a short patrol; every other act stands still.
		if act == "pace":
			_do_pace(delta)
		else:
			velocity.x = move_toward(velocity.x, 0.0, 8.0 * delta)
			velocity.z = move_toward(velocity.z, 0.0, 8.0 * delta)
	move_and_slide()

	# THE RIG READS STATE: base gait/breathing off velocity, then the act overlays its
	# character (a gesture, a scan, a crouch) on top. Same puppet, different behavior.
	if _puppet:
		var turn_rate := wrapf(_visual.rotation.y - _prev_yaw, -PI, PI) / maxf(delta, 0.0001)
		_prev_yaw = _visual.rotation.y
		_puppet.animate(delta, velocity.length(), turn_rate, act == "aim_crouch", 0.0, false)
		_act_overlay(delta)

	if _hurt_flash > 0.0:
		_hurt_flash = maxf(0.0, _hurt_flash - delta)
		_visual.rotation.z = sin(_hurt_flash * 40.0) * 0.12
	elif _visual.rotation.z != 0.0:
		_visual.rotation.z = 0.0


## Each archetype ACTS ITS PART by overlaying character on the base rig.
func _act_overlay(delta: float) -> void:
	_act_t += delta
	# The town DRAWS on a suspect: security stops scanning and SIGHTS you the
	# moment the ledger marks you. Redemption (standing back to neutral) relaxes it.
	if archetype == "secman":
		var m := get_tree().current_scene
		if m == null or not ("respect" in m):
			m = get_parent()
		if m != null and "respect" in m and m.respect != null:
			var base_act: String = ARCHETYPES[archetype]["act"]
			act = "aim_crouch" if m.respect.standing(FACTION) == "SUSPECT" else base_act
			if act == base_act and _crouched:
				_crouched = false
				_puppet.position.y = 0.0
	match act:
		"gesture":
			# A trader talks with his hands: the free arm lifts in a slow, repeating gesture.
			var g := maxf(0.0, sin(_act_t * 0.9))
			_puppet.free_arm.rotation.x = -g * 1.1
		"scan":
			# A guard watches the road: the whole body sweeps side to side (a ~6 s beat).
			_visual.rotation.y = sin(_act_t * 1.1) * 0.6
		"aim_crouch":
			# A bandit sights down the barrel, crouched and small.
			if not _crouched:
				_crouched = true
				_puppet.position.y = -0.28
			_puppet.shoulder.rotation.x = 0.0 # sighting down the barrel — arm level at the joint
		_:
			# idle: the base breathing/lean is enough; add a tiny weight shift.
			_puppet.torso.rotation.z = sin(_act_t * 0.5) * 0.04


## Walk between the spawn anchor and a point a couple metres to the side, turning to
## face the way you're going. A guard on his beat — proven in sim, off the town NPCs.
func _do_pace(delta: float) -> void:
	if _patrol_anchor == Vector3.INF:
		_patrol_anchor = global_position
	var target := _patrol_anchor + Vector3(2.0 * _patrol_sign, 0, 0)
	var to_t := target - global_position
	to_t.y = 0.0
	if to_t.length() < 0.35:
		_patrol_sign *= -1.0
	else:
		var dir := to_t.normalized()
		velocity.x = move_toward(velocity.x, dir.x * 1.6, 8.0 * delta)
		velocity.z = move_toward(velocity.z, dir.z * 1.6, 8.0 * delta)
		_visual.rotation.y = lerp_angle(_visual.rotation.y, atan2(-dir.x, -dir.z), 8.0 * delta)


func interact_position() -> Vector3:
	return global_position


func interact_prompt(main: Node) -> String:
	var a: Dictionary = ARCHETYPES[archetype]
	if main.respect.standing(FACTION) == "SUSPECT":
		return "E — 🚫 %s won't deal with you" % npc_name
	if role == "hire":
		return "E — Hire %s (40 scrip — he FIGHTS and SCOUTS)" % npc_name
	if role == "trade":
		return "E — Trade with %s" % npc_name
	# Sec-Man prompt follows the bounty state machine in main.
	match main.bounty.get("state", ""):
		"open":
			return "E — Bounty is LIVE — bring its head"
		"filled":
			return "E — Claim bounty (%d scrip)" % int(main.bounty.get("reward", 25))
		_:
			return "E — Ask %s about WORK" % npc_name


## The town REMEMBERS (goal: standing visibly changes the place): greetings warm
## with your name, and the MARKET GROWS — each earned tier unlocks stock that
## stays unlocked. Prices already ride the ledger (price_mult); this is the part
## you can SEE.
const TIER_STOCK: Dictionary = {
	"TRUSTED": {"medkit": 2, "grenade": 3, "coffee": 3, "car_parts": 1},
	"HERO": {"pipe_rocket": 1, "rocket": 3, "power_cell": 2, "drone": 1},
}
const TIER_GREET: Dictionary = {
	"TRUSTED": "Mercy: 'There you are. Kept the good shelf stocked for you.'",
	"HERO": "Mercy: 'The hero of Meridian shops FREE— …kidding. But look at the back room.'",
}
var _stocked_tiers: Dictionary = {}


## The VOICE: consistent per-character TTS (tools/soundforge/voices.json) — the
## line you read is the line you HEAR, in the same throat every time.
func _vo(main: Node, suffix: String) -> void:
	var ch: String = {"trader": "mercy", "secman": "bridger", "drifter": "sam"}.get(archetype, "")
	if ch != "" and "audio" in main and main.audio:
		main.audio.play_at("vo_%s_%s" % [ch, suffix], global_position, 2.0)


func interact(main: Node) -> void:
	if main.respect.standing(FACTION) == "SUSPECT":
		main.notify(ARCHETYPES[archetype]["refuse"])
		_vo(main, "refuse")
		return
	if role == "hire":
		_vo(main, "hire")
		main.hire_companion(self)
	elif role == "trade":
		var st: String = main.respect.standing(FACTION)
		main.notify(TIER_GREET.get(st, ARCHETYPES[archetype]["greet"]))
		_vo(main, "trusted" if st in ["TRUSTED", "HERO"] else "greet")
		if TIER_STOCK.has(st) and not _stocked_tiers.has(st):
			_stocked_tiers[st] = true
			for id in TIER_STOCK[st]:
				stock.add(id, TIER_STOCK[st][id])
			main.notify("🏪 The market GREW — %s earned Mercy's %s shelf" % [main.respect.standing(FACTION), st])
		main.open_trade(self)
	else:
		main.secman_talk(self)


## Shooting a townsperson is a CRIME — the ledger remembers, the town gossips.
func take_damage(amount: float) -> void:
	hp = maxf(1.0, hp - amount) # town NPCs can't die in this slice — Stage 6 full adds it
	_hurt_flash = 0.8
	ProtoFloater.pop(get_parent(), global_position + Vector3(0, 2.0, 0), "CRIME!", Color(0.95, 0.3, 0.2), 130)
	var main := get_tree().current_scene
	if main == null or not main.has_method("on_npc_attacked"):
		main = get_parent()
	if main and main.has_method("on_npc_attacked"):
		main.on_npc_attacked(self, amount)
