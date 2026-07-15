## Pure export-feature front door. The public companion executable carries one
## custom feature; every other way of opening the project remains DRIVN.
class_name ProtoBootRouter
extends Node

const DRIVN_SCENE := "res://proto3d/proto3d.tscn"
const COMPANION_SCENE := "res://proto3d/games/companion/game_deck_companion.tscn"
const COMPANION_FEATURE := "game_deck_companion"


static func route_for_features(features: Array[String]) -> String:
	return COMPANION_SCENE if features.has(COMPANION_FEATURE) else DRIVN_SCENE


func _ready() -> void:
	var relevant_features: Array[String] = []
	if OS.has_feature(COMPANION_FEATURE):
		relevant_features.append(COMPANION_FEATURE)
	get_tree().call_deferred("change_scene_to_file", route_for_features(relevant_features))
