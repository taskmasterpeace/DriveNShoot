## One immutable-per-frame vocabulary shared by every Physics Lab body.
class_name ProtoLabCommand
extends RefCounted

const FIELDS: Array[StringName] = [
	&"stamp", &"move", &"aim_world", &"sprint", &"dive_pressed",
	&"fire_pressed", &"fire_held", &"fire_released", &"reload_pressed",
	&"throw_pressed", &"throw_held", &"throw_released", &"radial_pressed",
	&"radial_held", &"radial_released", &"interact_pressed",
]

var stamp: int = 0
var move: Vector3 = Vector3.ZERO
var aim_world: Vector3 = Vector3.FORWARD
var sprint: bool = false
var dive_pressed: bool = false
var fire_pressed: bool = false
var fire_held: bool = false
var fire_released: bool = false
var reload_pressed: bool = false
var throw_pressed: bool = false
var throw_held: bool = false
var throw_released: bool = false
var radial_pressed: bool = false
var radial_held: bool = false
var radial_released: bool = false
var interact_pressed: bool = false


func duplicate_frame() -> RefCounted:
	var out: Variant = (get_script() as Script).new()
	for field in FIELDS:
		out.set(field, get(field))
	return out


func as_dictionary() -> Dictionary:
	var out: Dictionary = {}
	for field in FIELDS:
		out[String(field)] = get(field)
	return out
