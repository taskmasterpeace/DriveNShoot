## THE BANDIT DIRECTOR (BANDIT_CONVOY_ECOSYSTEM.md §3.2-3.5, owner: "a whole AI
## for the bandits — how they act, how they spawn, what attracts them… drones…
## stronger in the southwest… put it all together"). One virtual GANG per state,
## ticked only where the player is (the world's cheapest predator): it WATCHES
## the road (sightings accrue off your driving, your noise, and its drone's
## eye), then COMMITS — strength ≥3 raises a CHECKPOINT ahead of you (the
## modular kit: barriers, cones, a toll — pay or bleed), weaker crews hit and
## run through the existing road-pirate law. REGION is the dial: the Southwest
## is their kingdom (AZ/NM 5), Virginia barely fields a crew (1), occupied
## Florida fields NONE (the Faith patrols that ground instead). Shoot the
## drone down and the gang goes BLIND for a day. Every knob is a row
## (data/bandit_regions.json folds over the code floor; F10 refolds).
class_name ProtoBandits
extends Node3D

enum GangState { WATCH, STALK, COOLDOWN }

## Code-floor regional strength (the bible's map). data/bandit_regions.json
## {"regions": {...}} overlays additively; unknown states default 1 (a ragged
## nuisance), FLORIDA 0 (no bandits — the occupation owns those roads).
static var REGIONS: Dictionary = {
	"ARIZONA": 5, "NEW MEXICO": 5, "NEVADA": 4, "UTAH": 4, "CALIFORNIA": 3,
	"TEXAS": 3, "OKLAHOMA": 3, "COLORADO": 3,
	"WYOMING": 2, "MONTANA": 2, "KANSAS": 2, "NEBRASKA": 2, "IDAHO": 2,
	"VIRGINIA": 1, "FLORIDA": 0,
}
static var TUNING: Dictionary = {
	"threshold_base": 12.0,   # sightings before a gang commits = base / strength
	"sight_drive": 2.0,       # sightings/game-hour while you drive their roads
	"sight_idle": 0.6,        # …while you linger in-state off the wheel
	"drone_mult": 1.6,        # the drone's eye multiplies everything
	"toll_per_strength": 8.0, # checkpoint demand = this x strength (scrip)
	"cooldown_h": 8.0,        # game-hours after a resolution before they re-commit
	"blind_h": 24.0,          # a downed drone blinds the gang this long
	"checkpoint_ahead_m": 420.0,
	"drone_min_strength": 4.0,
}
static var _folded: bool = false


static func ensure_rows() -> void:
	if _folded:
		return
	_folded = true
	fold_file(REGIONS, TUNING)


static func fold_file(regions: Dictionary, tuning: Dictionary, path: String = "res://data/bandit_regions.json") -> void:
	if not FileAccess.file_exists(path):
		return
	var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string(path))
	if not (parsed is Dictionary):
		return
	for k in (parsed as Dictionary).get("regions", {}):
		var v: Variant = (parsed as Dictionary)["regions"][k]
		if v is float or v is int:
			regions[String(k)] = int(v)
	for k2 in (parsed as Dictionary).get("tuning", {}):
		var v2: Variant = (parsed as Dictionary)["tuning"][k2]
		if v2 is float or v2 is int:
			tuning[String(k2)] = float(v2)


static func strength_of(state: String) -> int:
	return int(REGIONS.get(state, 1))


var main: Node = null
var rng := RandomNumberGenerator.new()
## Per-state gang ledgers: state -> {sightings, gstate, blind_until_h, cool_until_h}
var gangs: Dictionary = {}
var checkpoint: Node3D = null       ## at most ONE standing kit (the player's road)
var checkpoint_state: String = ""
var checkpoint_toll: int = 0
var _demanded: bool = false
var drone: Node3D = null            ## the gang's eye, when strength allows


## THE GANG'S EYE: a shadow drone that hangs off your shoulder and feeds the
## sightings ledger. Shootable (the one damage law) — down it and the crew is
## blind for a day, and the wreck drops scrap where it falls.
class BanditDrone extends StaticBody3D:
	var director: ProtoBandits = null
	var dead: bool = false
	var _t: float = 0.0
	func _init() -> void:
		add_to_group("threat")
		var body := MeshInstance3D.new()
		var bm := BoxMesh.new()
		bm.size = Vector3(0.7, 0.22, 0.7)
		body.mesh = bm
		body.material_override = ProtoWorldBuilder.material(Color(0.2, 0.16, 0.14), 0.7)
		add_child(body)
		for sx in [-0.42, 0.42]:
			var rotor := MeshInstance3D.new()
			var rm := BoxMesh.new()
			rm.size = Vector3(0.5, 0.04, 0.12)
			rotor.mesh = rm
			rotor.material_override = ProtoWorldBuilder.material(Color(0.5, 0.14, 0.1), 0.6)
			rotor.position = Vector3(sx, 0.16, 0)
			add_child(rotor)
		var shape := CollisionShape3D.new()
		var bs := BoxShape3D.new()
		bs.size = Vector3(0.8, 0.4, 0.8)
		shape.shape = bs
		add_child(shape)
	func take_damage(_amount: float) -> void:
		if dead:
			return
		dead = true
		if director != null:
			director.on_drone_down(self)


static func create(main_in: Node) -> ProtoBandits:
	ensure_rows()
	var b := ProtoBandits.new()
	b.main = main_in
	b.rng.randomize()
	return b


func _physics_process(delta: float) -> void:
	_tick(delta)


func _now_h() -> float:
	if main != null and "daynight" in main and main.daynight != null:
		return float(main.daynight.day) * 24.0 + float(main.daynight.hour)
	return 0.0


func _gang(state: String) -> Dictionary:
	if not gangs.has(state):
		gangs[state] = {"sightings": 0.0, "gstate": GangState.WATCH, "blind_until_h": -1.0, "cool_until_h": -1.0}
	return gangs[state]


## The whole director is a function of accumulated delta (sim-drivable). Runs
## only for the player's CURRENT state — gangs elsewhere are ledgers at rest.
func _tick(delta: float) -> void:
	if main == null or not ("stream" in main) or main.stream == null:
		return
	if main.has_method("net_is_client") and main.net_is_client():
		return # host-authoritative, like every enemy
	var anchor: Vector3 = main.active_car.global_position if (main.active_car != null and is_instance_valid(main.active_car)) else main.player.global_position
	var state: String = main.stream.current_state(anchor)
	var s := strength_of(state)
	var now := _now_h()
	_update_checkpoint(anchor)
	if s <= 0:
		_clear_drone() # no bandits here (occupied Florida runs Faith patrols instead)
		return
	var g := _gang(state)
	# --- THE EYE: strong gangs fly a shadow drone unless blinded ----------------
	var blind: bool = now < float(g["blind_until_h"])
	if s >= int(TUNING["drone_min_strength"]) and not blind:
		if drone == null or not is_instance_valid(drone):
			_spawn_drone(anchor)
	else:
		_clear_drone()
	if drone != null and is_instance_valid(drone):
		# hover off the player's shoulder — the buzz IS the warning
		var hover := anchor + Vector3(9.0, 13.0, 7.0)
		drone.global_position = drone.global_position.lerp(hover, clampf(1.2 * delta, 0.0, 1.0))
	# --- WATCH: the road remembers you (sightings ledger) ------------------------
	if g["gstate"] == GangState.COOLDOWN:
		if now >= float(g["cool_until_h"]):
			g["gstate"] = GangState.WATCH
			g["sightings"] = 0.0
		return
	var driving: bool = main.active_car != null and is_instance_valid(main.active_car) \
		and absf(main.active_car.forward_speed) > 8.0
	var rate: float = float(TUNING["sight_drive"]) if driving else float(TUNING["sight_idle"])
	if drone != null and is_instance_valid(drone):
		rate *= float(TUNING["drone_mult"])
	var dh := delta / 60.0 # one game hour = 60 real seconds (the 24-min-day law)
	g["sightings"] = float(g["sightings"]) + rate * float(s) * dh
	# --- COMMIT: strength >=3 raises the KIT; weaker crews hit and run -----------
	if float(g["sightings"]) >= float(TUNING["threshold_base"]) / float(s):
		g["gstate"] = GangState.COOLDOWN
		g["cool_until_h"] = now + float(TUNING["cooldown_h"])
		g["sightings"] = 0.0
		if s >= 3 and checkpoint == null:
			_raise_checkpoint(anchor, state, s)
		elif main.has_method("spawn_road_ambush"):
			main.spawn_road_ambush() # the ragged crew: the existing pirate law
			if main.has_method("notify"):
				main.notify("🏴 A %s crew comes off the shoulder — they were WATCHING" % state)


## THE CHECKPOINT KIT (bible §9 + contract §3.2): barriers across YOUR side of
## the road ahead, one squeeze gap, cones, a toll sign. Pay at the line or the
## crew takes it out of your hide (the pirate law answers a refusal).
func _raise_checkpoint(anchor: Vector3, state: String, s: int) -> void:
	if main.stream.usmap == null or not main.stream.usmap.ok:
		return
	var road: Dictionary = main.stream.usmap.road_near(anchor, 120.0)
	if road.is_empty():
		return
	var a: Vector2 = road["a"]
	var b: Vector2 = road["b"]
	var d := (b - a).normalized()
	# ahead = the direction the car is actually pointing, projected on the road
	var heading := Vector2(0, -1)
	if main.active_car != null and is_instance_valid(main.active_car):
		var f: Vector3 = -main.active_car.global_basis.z
		heading = Vector2(f.x, f.z).normalized()
	if heading.dot(d) < 0.0:
		d = -d
	var p2 := Vector2(anchor.x, anchor.z) + d * float(TUNING["checkpoint_ahead_m"])
	var right := Vector2(-d.y, d.x)
	var g := ProtoUSMap.road_geometry(road)
	var kit := Node3D.new()
	kit.name = "BanditCheckpoint"
	add_child(kit)
	var center_gap: float = float(g["center_gap"])
	var half_w: float = float(g["carriage_w"]) * (0.5 if bool(g["divided"]) else 0.5)
	var lane_mid := center_gap + (float(g["carriage_w"]) - center_gap) * 0.5 if bool(g["divided"]) else 0.0
	# two barrier runs across the travel side with a 3.0m squeeze gap
	var side_off := right * (lane_mid if bool(g["divided"]) else float(g["width"]) * 0.25)
	var mid := p2 + side_off
	var span: float = (float(g["carriage_w"]) if bool(g["divided"]) else float(g["width"]) * 0.5)
	for sgn in [-1.0, 1.0]:
		var seg_len := span * 0.5 - 1.5
		var c := mid + right * float(sgn) * (1.5 + seg_len * 0.5)
		var bar := ProtoWorldBuilder.box_body(kit, Vector3(seg_len, 0.9, 0.5),
			Vector3(c.x, 0.45, c.y), Color(0.55, 0.5, 0.46), atan2(right.x, -right.y))
		bar.set_meta("bandit_barrier", true)
	for k in 4:
		ProtoWorldBuilder.box_visual(kit, Vector3(0.3, 0.5, 0.3),
			Vector3(mid.x + right.x * (k - 1.5) * 2.0 - d.x * 6.0, 0.25, mid.y + right.y * (k - 1.5) * 2.0 - d.y * 6.0),
			Color(0.85, 0.45, 0.12))
	var l := Label3D.new()
	l.text = "🚧 %s CREW — %d SCRIP TO PASS" % [state, int(TUNING["toll_per_strength"]) * s]
	l.font_size = 44
	l.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	l.modulate = Color(1.0, 0.6, 0.3)
	l.outline_size = 8
	l.position = Vector3(mid.x, 3.2, mid.y)
	kit.add_child(l)
	checkpoint = kit
	checkpoint_state = state
	checkpoint_toll = int(TUNING["toll_per_strength"]) * s
	_demanded = false
	if main.has_method("notify"):
		main.notify("🚧 Barricade lights ahead — a %s crew wants %d scrip" % [state, checkpoint_toll])


## Approaching the line settles it: pay and the barriers come down; come up
## short and the crew comes off the shoulder (the pirate law).
func _update_checkpoint(anchor: Vector3) -> void:
	if checkpoint == null or not is_instance_valid(checkpoint):
		checkpoint = null
		return
	var kit_pos := (checkpoint.get_child(0) as Node3D).global_position if checkpoint.get_child_count() > 0 else checkpoint.global_position
	var dist := anchor.distance_to(kit_pos)
	if dist > 900.0:
		checkpoint.queue_free() # you went another way — the crew packs it up
		checkpoint = null
		return
	if dist < 32.0 and not _demanded:
		_demanded = true
		var pack: Variant = main.backpack if "backpack" in main else null
		if pack != null and pack.count("scrip") >= checkpoint_toll:
			pack.remove("scrip", checkpoint_toll)
			if main.has_method("notify"):
				main.notify("💰 Paid the %s crew %d scrip — the barriers part" % [checkpoint_state, checkpoint_toll])
			checkpoint.queue_free()
			checkpoint = null
		else:
			if main.has_method("notify"):
				main.notify("🏴 Short on scrip — the %s crew takes it out of your hide" % checkpoint_state)
			if main.has_method("spawn_road_ambush"):
				main.spawn_road_ambush()


func _spawn_drone(anchor: Vector3) -> void:
	drone = BanditDrone.new()
	(drone as BanditDrone).director = self
	add_child(drone)
	drone.global_position = anchor + Vector3(30, 18, 20)
	if main != null and "audio" in main and main.audio != null:
		main.audio.play_at("drone_loop", drone.global_position, -8.0)
	if main.has_method("notify"):
		main.notify("🛸 A drone shadows you — somebody's counting your cargo")


func _clear_drone() -> void:
	if drone != null and is_instance_valid(drone):
		drone.queue_free()
	drone = null


## The eye falls: scrap where it drops, the gang blind for a day.
func on_drone_down(d: Node3D) -> void:
	var state: String = main.stream.current_state(d.global_position) if (main != null and "stream" in main) else ""
	var g := _gang(state)
	g["blind_until_h"] = _now_h() + float(TUNING["blind_h"])
	var wreck := ProtoChest.create("Downed drone", {"scrap": 3, "power_cell": 1})
	main.add_child(wreck)
	wreck.global_position = Vector3(d.global_position.x, 0.4, d.global_position.z)
	if main.has_method("notify"):
		main.notify("🛸💥 The drone drops — the %s crew just went BLIND" % state)
	_clear_drone()
