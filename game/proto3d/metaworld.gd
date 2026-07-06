## THE METASYSTEM (first slice) — the metaworld that never sleeps.
## Guarding dogs left behind DEHYDRATE to a data record when you drive out of the
## AoI bubble; while gone, a stubbed off-screen roll can wound/kill the record; when
## you return, it HYDRATES back — and you come home to find it hurt, or gone.
## One engine; NPCs (Stage 6) and netcode inherit the same seam. See METASYSTEM.md.
class_name ProtoMetaworld
extends Node

signal come_home(text: String)

@export var aoi: float = 150.0        ## the simulation "bubble" radius
@export var offscreen_period: float = 3.0

var main: Node = null                  ## the proto3d scene (owns .player, adds children)
var records: Array = []                ## dehydrated dogs (Dictionaries)
var _tick: float = 0.0
var _rng := RandomNumberGenerator.new()
var _auto_events: bool = true          ## sims turn this off for deterministic control


func setup(main_in: Node) -> void:
	main = main_in
	_rng.randomize()


func _physics_process(delta: float) -> void:
	if main == null or main.player == null:
		return
	var ppos: Vector3 = main.player.global_position

	# DEHYDRATE: a guarding dog that's now outside the bubble becomes a record.
	for node in get_tree().get_nodes_in_group("proto_dog"):
		var dog := node as ProtoDog
		if dog and is_instance_valid(dog) and dog.state == ProtoDog.DogState.GUARD:
			if dog.global_position.distance_to(ppos) > aoi:
				dehydrate(dog)

	# Off-screen AGGREGATE sim — ONE stubbed roll per record. The real
	# storylet/incident engine plugs in here at Stage 6.
	if _auto_events:
		_tick += delta
		if _tick >= offscreen_period:
			_tick = 0.0
			for rec in records:
				offscreen_event(rec)

	# HYDRATE: a record the player has driven back to becomes a live dog again.
	for rec in records.duplicate():
		if Vector2(rec["pos"].x, rec["pos"].z).distance_to(Vector2(ppos.x, ppos.z)) < aoi:
			hydrate(rec)


func dehydrate(dog: ProtoDog) -> void:
	records.append(dog.to_record())
	dog.queue_free()


func hydrate(rec: Dictionary) -> void:
	records.erase(rec)
	if rec.get("killed", false):
		# Come home to find it gone — just the collar in the dirt.
		var remains := ProtoChest.create("%s's remains" % rec["name"], {"meat": 1}, false)
		main.add_child(remains)
		remains.global_position = rec["pos"]
		come_home.emit("You find %s's collar in the dirt. It held the spot — and paid for it." % rec["name"])
		return
	var dog := ProtoDog.from_record(rec, main)
	main.add_child(dog)
	dog.global_position = rec["pos"]
	main.register_dog(dog)
	if rec.get("wounded", false):
		come_home.emit("%s is bloodied but still guarding. Something came through here." % rec["name"])


## The single stubbed off-screen roll (deterministic hook for sims via force_raid).
## HOME MATTERS now: walls thin the odds for anything guarding inside the ring.
func offscreen_event(rec: Dictionary) -> void:
	var chance := 0.4
	if _at_home(rec):
		chance = 0.4 / (1.0 + float(main.homebase.walls_tier())) # walls III = a quarter the raids
	if _rng.randf() < chance:
		force_raid(rec, 30.0)


func force_raid(rec: Dictionary, dmg: float) -> void:
	rec["hp"] = rec.get("hp", 50.0) - dmg
	rec["wounded"] = true
	# The KENNEL upgrade holds the line: a home dog gets hurt, never taken.
	if _at_home(rec) and main.homebase.owned.has("kennel"):
		rec["hp"] = maxf(8.0, rec["hp"])
	if rec["hp"] <= 0.0:
		rec["killed"] = true


func _at_home(rec: Dictionary) -> bool:
	if main == null or not ("homebase" in main) or main.homebase == null:
		return false
	var p: Vector3 = rec.get("pos", Vector3.ZERO)
	return Vector2(p.x, p.z).distance_to(Vector2(ProtoHomebase.HOME.x, ProtoHomebase.HOME.z)) < ProtoHomebase.HOME_R + 15.0
