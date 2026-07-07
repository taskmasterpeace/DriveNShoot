## HORSES — a rideable actor on the shared QUADRUPED rig (quadruped.gd, read-only:
## dogs/howlers already prove params → 50 animals off one rig; a horse is the same
## rig scaled up, nothing new added to it). E mounts/dismounts like a car door, but
## riding is its OWN state — NOT main.Mode.DRIVE — so this file needs ZERO edits to
## proto3d.gd: the generic "interactable" group scan (interact_position/interact_prompt/
## interact, same trio every chest/companion/dog already implements) is the whole
## mount hook, and this file drives its own fire dispatch exactly like companion.gd
## and dog.gd already do for their autonomous shots.
##
## TWO SEATS, front (the reins) + rear (pillion) — docs/design/DRIVE_BY_COMBAT.md's
## seat-arc law applied to horseback: front fires a generous forward cone (no cabin,
## fully exposed — exposure_mult 1.0, matching the spec's motorcycle floor: a horse
## has even less hull than a bike). Rear gets a WIDE arc MINUS a dead zone straight
## ahead (the front rider's own body blocks it) — the schema note in data/horses.json
## documents the extension: seats carry an optional blocked_center_deg/blocked_half_deg
## pair the arc check SUBTRACTS, on top of the spec's arc_center_deg/arc_half_deg pair.
class_name ProtoHorse
extends CharacterBody3D

enum Gait { WALK, TROT, GALLOP }

## MOTIONFORGE rows (MOVESET.txt SPEC B pattern): stock here, data/motions.json's
## "horse" rig row overlays it live — its OWN family, quadruped.gd/puppet.gd untouched.
## The quadruped's animate(delta, speed, morale) already turns speed into cadence; this
## row only tunes how SPEED maps to the perceived gait threshold + a mount/dismount beat.
static var MOTION: Dictionary = {
	"gait_break": {"walk_to_trot": 2.0, "trot_to_gallop": 8.0},
	"mount": {"climb_s": 0.35, "settle_s": 0.2},
}
static var _motion_folded: bool = false


static func ensure_motions() -> void:
	if _motion_folded:
		return
	_motion_folded = true
	ProtoPuppet.fold_motion_file("horse", MOTION)


## data/horses.json rows overlay this stock (mustang/draft) — additive, same law as
## car_3d.gd's VEHICLES / dog.gd's TYPE_PARAMS. A row missing a field keeps the stock
## value, so horses.json can be hand-edited without ever going invalid.
static var HORSES: Dictionary = {
	"mustang": {
		"name": "Mustang",
		"quad_params": {"scale": 2.6, "color": Color(0.42, 0.28, 0.16), "tail": 0.55, "snout": true, "ears": true},
		"trot_speed": 6.0, "gallop_speed": 11.0, "turn_rate_deg": 130.0, "accel": 9.0, "max_hp": 90.0,
		"seats": [
			{"side": "front", "pos": Vector3(0.0, 1.5, -0.15), "arc_center_deg": 0.0, "arc_half_deg": 100.0},
			{"side": "rear", "pos": Vector3(0.0, 1.42, 0.55), "arc_center_deg": 180.0, "arc_half_deg": 140.0,
				"blocked_center_deg": 0.0, "blocked_half_deg": 25.0},
		],
	},
	"draft": {
		"name": "Draft Horse",
		"quad_params": {"scale": 3.2, "color": Color(0.3, 0.22, 0.15), "tail": 0.4, "snout": true, "ears": true},
		"trot_speed": 5.5, "gallop_speed": 9.5, "turn_rate_deg": 100.0, "accel": 7.0, "max_hp": 130.0,
		"seats": [
			{"side": "front", "pos": Vector3(0.0, 1.75, -0.2), "arc_center_deg": 0.0, "arc_half_deg": 100.0},
			{"side": "rear", "pos": Vector3(0.0, 1.65, 0.7), "arc_center_deg": 180.0, "arc_half_deg": 140.0,
				"blocked_center_deg": 0.0, "blocked_half_deg": 25.0},
		],
	},
}
static var _rows_folded: bool = false


## The v1 (owner ask: "keep v1: speeds only") stock speeds — a row without its own
## trot_speed/gallop_speed keeps these. No stamina drain yet (flagged, not built).
const DEFAULT_TROT := 6.0
const DEFAULT_GALLOP := 11.0
const DEFAULT_TURN_RATE_DEG := 120.0
const DEFAULT_ACCEL := 8.0
const DEFAULT_MAX_HP := 100.0


## The one fold: data/horses.json overlays HORSES row-by-row, field-by-field — an
## unknown breed_id in the JSON adds a NEW row (a modder can add a horse with zero
## code), a known one only overrides the fields it lists.
static func ensure_horses() -> void:
	if _rows_folded:
		return
	_rows_folded = true
	var path := "res://data/horses.json"
	if not FileAccess.file_exists(path):
		return
	var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string(path))
	if not (parsed is Dictionary):
		return
	var rows: Dictionary = (parsed as Dictionary).get("horses", {})
	for breed_id in rows:
		var row: Dictionary = rows[breed_id]
		if not HORSES.has(String(breed_id)):
			HORSES[String(breed_id)] = {}
		var dst: Dictionary = HORSES[String(breed_id)]
		for k in row:
			if k == "quad_params" and row[k] is Dictionary:
				var qp: Dictionary = dst.get("quad_params", {}).duplicate(true)
				var qp_in: Dictionary = row[k]
				for qk in qp_in:
					var v: Variant = qp_in[qk]
					qp[qk] = Color(v[0], v[1], v[2]) if (qk == "color" and v is Array) else v
				dst["quad_params"] = qp
			elif k == "seats" and row[k] is Array:
				var seats_out: Array = []
				for s_v in (row[k] as Array):
					var s: Dictionary = s_v
					var seat_out: Dictionary = s.duplicate(true)
					if s.has("pos") and s["pos"] is Array:
						var p: Array = s["pos"]
						seat_out["pos"] = Vector3(float(p[0]), float(p[1]), float(p[2]))
					seats_out.append(seat_out)
				dst["seats"] = seats_out
			else:
				dst[k] = row[k]
		HORSES[String(breed_id)] = dst


var breed_id: String = "mustang"
var row: Dictionary = {}
var max_hp: float = 100.0
var hp: float = 100.0
var dead: bool = false

var _quad: ProtoQuadruped = null
var _main: Node = null ## the proto3d main scene — set at spawn, sim-safe (no current_scene reliance)
## The horse's own collider reach (capsule radius) — fire_from_seat() clears the
## shot past this so a rider's own mount never eats its own rider's bullet at
## point-blank range (the horse is never excluded from its own gunfire raycast,
## same as any other shootable body — so the ray must simply START outside it,
## mirroring how fire_from_vehicle() already offsets its origin off the car's hull).
var _body_radius: float = 0.5

## Riders: {"front": Rider, "rear": Rider}. A Rider is either the human PLAYER
## (control input drives the horse) or an NPC/companion puppet along for the ride.
class Rider:
	var puppet: ProtoPuppet = null
	var is_player: bool = false
	var hp: float = 60.0
	var max_hp: float = 60.0
	var dead: bool = false
	var node: Node3D = null ## the combatant node other systems shoot at (self for NPC riders, the player node when is_player)


var riders: Dictionary = {} ## "front"/"rear" -> Rider or null
var gait: Gait = Gait.WALK
var _speed: float = 0.0 ## current horizontal speed (m/s) — feeds the quadruped's cadence


static func create(breed_in: String = "mustang") -> ProtoHorse:
	ensure_motions()
	ensure_horses()
	var h := ProtoHorse.new()
	h.breed_id = breed_in if HORSES.has(breed_in) else "mustang"
	h.row = HORSES[h.breed_id]
	h.max_hp = float(h.row.get("max_hp", DEFAULT_MAX_HP))
	h.hp = h.max_hp
	h.add_to_group("interactable")
	h.add_to_group("combatant") # the horse itself can be shot (the one damage law)
	h.floor_max_angle = deg_to_rad(50)
	h.floor_snap_length = 0.6

	var shape := CollisionShape3D.new()
	var cap := CapsuleShape3D.new()
	var s: float = float((h.row.get("quad_params", {}) as Dictionary).get("scale", 2.6))
	cap.radius = 0.5 * (s / 2.6)
	cap.height = 1.5 * (s / 2.6)
	shape.shape = cap
	shape.position.y = cap.height * 0.5
	h.add_child(shape)
	h._body_radius = cap.radius + cap.height * 0.5 # generous: covers the whole capsule, not just its waist

	h._quad = ProtoQuadruped.create(h.row.get("quad_params", {}))
	h.add_child(h._quad)

	var tag := Label3D.new()
	tag.text = "🐴 %s" % String(h.row.get("name", "Horse"))
	tag.font_size = 84
	tag.pixel_size = 0.0042
	tag.modulate = Color(0.75, 0.65, 0.5)
	tag.position = Vector3(0, 2.2 * (s / 2.6), 0)
	tag.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	h.add_child(tag)

	h.riders = {"front": null, "rear": null}
	return h


# --- Interactable trio (the SAME hook chests/companions/dogs already use — this is
# the whole mount mechanism; proto3d.gd's group scan needs no new code at all) ------

func interact_position() -> Vector3:
	return global_position


func interact_prompt(main: Node) -> String:
	if dead:
		return ""
	if riders.get("front") == null:
		return "E — Mount %s" % String(row.get("name", "Horse"))
	if "player" in main and riders.get("front") != null and (riders["front"] as Rider).is_player \
			and riders.get("rear") == null:
		return "E — %s: Dismount" % String(row.get("name", "Horse"))
	return ""


func interact(main: Node) -> void:
	if dead:
		return
	var front: Rider = riders.get("front")
	if front != null and front.is_player:
		_dismount_player(main)
	elif front == null:
		_mount_player(main)


# --- Mounting: mirrors enter_car()/_exit_car() field-for-field, but NEVER touches
# main.mode/main.active_car — riding a horse is its own state so the vehicle mode
# enum stays exactly as the drive-by spec left it. ---------------------------------

func _mount_player(main: Node) -> void:
	_main = main
	var player: ProtoPlayer3D = main.player
	if player == null or not is_instance_valid(player):
		return
	var r := Rider.new()
	r.is_player = true
	r.node = player
	r.hp = 0.0 # the player's OWN hp lives on main.character — the horse doesn't shadow it
	riders["front"] = r
	# RIDERS RENDER ON THE HORSE (seat anchors — the companion bed-seat precedent):
	# the player's OWN puppet becomes the front-seat rider, parented at the seat's
	# local pos, so global_position tracks the saddle every frame (aim_point()'s
	# player-anchor fallback, and this file's own fire-dispatch math, both need that).
	player.process_mode = Node.PROCESS_MODE_DISABLED # feet/gravity stop; the horse drives the ride
	var seat := _seat_row("front")
	player.reparent(self)
	player.position = seat.get("pos", Vector3(0, 1.5, -0.15))
	player.rotation = Vector3.ZERO # faces the seat's arc_center_deg (0° = the horse's forward)
	player.velocity = Vector3.ZERO
	if main.has_method("notify"):
		main.notify("🐴 You swing up onto %s" % String(row.get("name", "Horse")))
	if "cam_rig" in main and main.cam_rig:
		main.cam_rig.target = self
	if "hud" in main and main.hud and main.hud.has_method("set_mode"):
		main.hud.set_mode(true) # the drive-style HUD reads (speed, mode chip) fit riding too
	if "audio" in main and main.audio:
		main.audio.play_at("car_door", global_position, -8.0) # a mount thump — no bespoke SFX yet


func _dismount_player(main: Node) -> void:
	var front: Rider = riders.get("front")
	if front == null or not front.is_player:
		return
	var player: ProtoPlayer3D = front.node
	riders["front"] = null
	if player != null and is_instance_valid(player):
		var drop: Vector3 = global_position - global_basis.x * 1.6
		drop.y = global_position.y + 0.2
		if player.get_parent() == self:
			player.reparent(_main if _main != null else get_parent())
		player.global_position = drop
		player.rotation = Vector3.ZERO
		player.velocity = Vector3.ZERO
		player.process_mode = Node.PROCESS_MODE_INHERIT
		player.visible = true
		player.is_active = true
	if "cam_rig" in main and main.cam_rig:
		main.cam_rig.target = player
	if "hud" in main and main.hud and main.hud.has_method("set_mode"):
		main.hud.set_mode(false)
	if main.has_method("notify"):
		main.notify("🐴 You swing down off %s" % String(row.get("name", "Horse")))


## An NPC/companion boards the REAR (pillion) seat — same reparent-to-anchor law as
## companion.gd's board()/dog.gd's board(): a puppet parented at the seat's local pos.
func board_rear(rider_node: Node3D, puppet: ProtoPuppet, node_hp: float = 60.0) -> void:
	var r := Rider.new()
	r.is_player = false
	r.node = rider_node
	r.puppet = puppet
	r.hp = node_hp
	r.max_hp = node_hp
	riders["rear"] = r
	if puppet != null:
		puppet.reparent(self)
		var seat := _seat_row("rear")
		puppet.position = seat.get("pos", Vector3(0, 1.4, 0.5))
		puppet.rotation = Vector3(0, PI, 0) # the pillion rider faces backward (rear arc center = 180°)


func unboard_rear(drop_pos: Vector3) -> void:
	var r: Rider = riders.get("rear")
	if r == null:
		return
	riders["rear"] = null
	if r.puppet != null and is_instance_valid(r.puppet):
		r.puppet.reparent(_main if _main != null else get_parent())
		r.puppet.global_position = drop_pos
		r.puppet.rotation = Vector3.ZERO


# --- The arc law (docs/design/DRIVE_BY_COMBAT.md §3.2/§4, extended with a BLOCKED
# band for the rear seat) — pure functions, sim-testable with no world at all. -------

func _seat_row(side: String) -> Dictionary:
	for s in (row.get("seats", []) as Array):
		if String((s as Dictionary).get("side", "")) == side:
			return s
	return {}


## World-space arc center for a seat, per the spec's formula: the local arc_center_deg
## rotated by the horse's CURRENT yaw (global_transform.basis) — the cone turns with
## the animal exactly like a car window turns with the car.
func world_arc_center(side: String) -> Vector3:
	var seat := _seat_row(side)
	var center_deg: float = float(seat.get("arc_center_deg", 0.0))
	var local_dir := Vector3(sin(deg_to_rad(center_deg)), 0.0, -cos(deg_to_rad(center_deg)))
	return (global_transform.basis * local_dir).normalized()


## The full arc test for a seat: in the seat's main cone AND NOT in its blocked band.
## blocked_half_deg <= 0 means no dead zone at all (the front seat's default shape).
func in_arc(side: String, aim_dir: Vector3) -> bool:
	var seat := _seat_row(side)
	var half_deg: float = float(seat.get("arc_half_deg", 180.0))
	var world_center := world_arc_center(side)
	var d := aim_dir.normalized()
	var angle_deg := rad_to_deg(acos(clampf(d.dot(world_center), -1.0, 1.0)))
	if angle_deg > half_deg:
		return false
	var blocked_half: float = float(seat.get("blocked_half_deg", 0.0))
	if blocked_half <= 0.0:
		return true
	var blocked_center_deg: float = float(seat.get("blocked_center_deg", 0.0))
	var local_blocked := Vector3(sin(deg_to_rad(blocked_center_deg)), 0.0, -cos(deg_to_rad(blocked_center_deg)))
	var world_blocked := (global_transform.basis * local_blocked).normalized()
	var blocked_angle_deg := rad_to_deg(acos(clampf(d.dot(world_blocked), -1.0, 1.0)))
	return blocked_angle_deg > blocked_half


## Clamp-to-edge (spec §4 default): aim inside the arc fires as-is; outside, the
## direction clamps to the nearest edge of the MAIN cone (the blocked band only ever
## refuses a shot that was already inside the main arc — see fire_from_seat()).
func clamp_to_arc(side: String, aim_dir: Vector3) -> Vector3:
	var seat := _seat_row(side)
	var half_deg: float = float(seat.get("arc_half_deg", 180.0))
	var world_center := world_arc_center(side)
	var d := aim_dir.normalized()
	var angle_deg := rad_to_deg(acos(clampf(d.dot(world_center), -1.0, 1.0)))
	if angle_deg <= half_deg:
		return d
	var cross_y := world_center.cross(d).y
	var sign_v: float = 1.0 if cross_y >= 0.0 else -1.0
	return world_center.rotated(Vector3.UP, sign_v * deg_to_rad(half_deg))


## The fire dispatch — this file's OWN input path (no proto3d.gd hook needed, exactly
## like companion.gd/dog.gd already fire on their own). side = which seat is shooting
## ("front" = the player at the reins, "rear" = a boarded companion or a co-op player).
## Returns false (refuses, toast) when the aim is inside the arc's BLOCKED band —
## clamp-to-edge only applies to the outer cone; the dead zone is a hard no (you
## cannot clip the person sitting in front of you by clamping around them).
var _arc_refuse_cd: float = 0.0

func fire_from_seat(side: String, main: Node, aim_dir: Vector3) -> bool:
	if dead or main == null:
		return false
	var w: ProtoWeapon = main.current_weapon() if main.has_method("current_weapon") else null
	if w == null or w.is_melee():
		return false
	var seat := _seat_row(side)
	if seat.is_empty():
		return false
	var world_center := world_arc_center(side)
	var d := aim_dir.normalized() if aim_dir.length_squared() > 0.0001 else world_center
	var half_deg: float = float(seat.get("arc_half_deg", 180.0))
	var angle_deg := rad_to_deg(acos(clampf(d.dot(world_center), -1.0, 1.0)))
	var blocked_half: float = float(seat.get("blocked_half_deg", 0.0))
	if angle_deg <= half_deg and blocked_half > 0.0:
		var blocked_center_deg: float = float(seat.get("blocked_center_deg", 0.0))
		var local_blocked := Vector3(sin(deg_to_rad(blocked_center_deg)), 0.0, -cos(deg_to_rad(blocked_center_deg)))
		var world_blocked := (global_transform.basis * local_blocked).normalized()
		var blocked_angle := rad_to_deg(acos(clampf(d.dot(world_blocked), -1.0, 1.0)))
		if blocked_angle <= blocked_half:
			_arc_refuse_cd = maxf(_arc_refuse_cd, 0.0)
			if _arc_refuse_cd <= 0.0 and main.has_method("notify"):
				main.notify("⛔ can't swing that far around")
				_arc_refuse_cd = 2.5
			return false
	var fired_dir := clamp_to_arc(side, d)
	var seat_pos: Vector3 = seat.get("pos", Vector3(0, 1.5, 0))
	# The seat sits ON the animal — a raycast starting there can clip the horse's
	# OWN collider at point-blank range (it's never excluded from its own rider's
	# shot, same as any other shootable body). Push the origin past the horse's
	# own reach along the fired direction, the same "outside the hull" law
	# fire_from_vehicle() already uses for the car's driver window.
	var origin: Vector3 = (global_transform * seat_pos) + fired_dir * (_body_radius + 0.3)
	if w.fire(main, origin, fired_dir):
		if "emit_noise" in main or main.has_method("emit_noise"):
			main.emit_noise(origin, 40.0, "gunfire")
		return true
	return false


func take_damage(amount: float, _attacker: Node3D = null) -> void:
	if dead:
		return
	hp -= amount
	if _quad:
		_quad.flinch()
	ProtoFloater.pop(get_parent() if get_parent() else self, global_position + Vector3(0, 2.0, 0),
		"-%d" % int(amount), Color(0.85, 0.55, 0.35), 110)
	if hp <= 0.0:
		dead = true
		if _quad:
			_quad.pose_dead()


func _physics_process(delta: float) -> void:
	_arc_refuse_cd = maxf(0.0, _arc_refuse_cd - delta)
	if not is_on_floor():
		velocity += get_gravity() * delta

	if dead:
		velocity.x = 0.0
		velocity.z = 0.0
		move_and_slide()
		return

	var front: Rider = riders.get("front")
	var turn_rate: float = float(row.get("turn_rate_deg", DEFAULT_TURN_RATE_DEG))
	var accel: float = float(row.get("accel", DEFAULT_ACCEL))
	var trot: float = float(row.get("trot_speed", DEFAULT_TROT))
	var gallop: float = float(row.get("gallop_speed", DEFAULT_GALLOP))

	if front != null and front.is_player and front.node != null and is_instance_valid(front.node):
		# RIDDEN MOVEMENT: WASD/left-stick like driving, but organic — the horse
		# TURNS at a rate (not an instant snap) and accelerates toward its gait speed.
		var mv := Vector3(Input.get_axis("move_left", "move_right"), 0.0, -Input.get_axis("move_down", "move_up"))
		var sprinting: bool = Input.is_action_pressed("drivn_sprint")
		var target_speed := 0.0
		if mv.length_squared() > 0.01:
			target_speed = gallop if sprinting else trot
			gait = Gait.GALLOP if sprinting else Gait.TROT
			var want_yaw := atan2(-mv.x, -mv.z)
			rotation.y = _rotate_toward(rotation.y, want_yaw, deg_to_rad(turn_rate) * delta)
		else:
			gait = Gait.WALK
		_speed = move_toward(_speed, target_speed, accel * delta)
		var fwd := -global_basis.z
		velocity.x = fwd.x * _speed
		velocity.z = fwd.z * _speed
	else:
		_speed = move_toward(_speed, 0.0, 6.0 * delta)
		velocity.x = move_toward(velocity.x, 0.0, 6.0 * delta)
		velocity.z = move_toward(velocity.z, 0.0, 6.0 * delta)

	if _quad:
		_quad.animate(delta, Vector2(velocity.x, velocity.z).length(), 1.0 if hp / max_hp > 0.4 else 0.3)

	move_and_slide()


static func _rotate_toward(from: float, to: float, amount: float) -> float:
	var d := wrapf(to - from, -PI, PI)
	return from + clampf(d, -amount, amount)


func _unhandled_input(event: InputEvent) -> void:
	var front: Rider = riders.get("front")
	if front == null or not front.is_player or _main == null:
		return
	if event.is_action_pressed("drivn_fire") or event.is_action_pressed("drivn_fire_drive"):
		var aim: Vector3 = (_main.aim_point() - _main.player.global_position) if _main.has_method("aim_point") else -global_basis.z
		aim.y = 0.0
		fire_from_seat("front", _main, aim)
