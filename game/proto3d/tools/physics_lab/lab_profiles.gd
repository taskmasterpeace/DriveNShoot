## Data-folded tuning for the two articulated bodies. Shared mass/speed/stamina
## make the comparison fair; only motor, balance, and root authority differ.
class_name ProtoLabProfiles
extends RefCounted

const DATA_PATH := "res://data/physics_profiles.json"
const FLOOR: Dictionary = {
	"active_ragdoll": {"mass": 75.0, "target_speed": 7.2, "stamina": 100.0,
		"pose_kp": 45.0, "pose_kd": 8.0, "balance_kp": 80.0, "balance_kd": 12.0,
		"velocity_gain": 220.0, "move_force": 900.0, "stance_height": 1.08,
		"height_kp": 1600.0, "height_kd": 180.0, "max_lift_force": 2400.0,
		"dive_impulse": 7.5,
		"grip_kp": 180.0, "grip_kd": 18.0},
	"full_physics": {"mass": 75.0, "target_speed": 7.2, "stamina": 100.0,
		"pose_kp": 16.0, "pose_kd": 5.0, "balance_kp": 24.0, "balance_kd": 7.0,
		"velocity_gain": 0.0, "move_force": 650.0, "stance_height": 0.9,
		"height_kp": 800.0, "height_kd": 110.0, "max_lift_force": 1600.0,
		"dive_impulse": 8.5,
		"grip_kp": 120.0, "grip_kd": 14.0},
}

static var _profiles: Dictionary = {}


static func row(id: String) -> Dictionary:
	if _profiles.is_empty():
		_profiles = FLOOR.duplicate(true)
		if FileAccess.file_exists(DATA_PATH):
			var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string(DATA_PATH))
			if parsed is Dictionary:
				for profile_id in (parsed as Dictionary).get("profiles", {}):
					var merged: Dictionary = (_profiles.get(profile_id, {}) as Dictionary).duplicate(true)
					for key in (parsed as Dictionary)["profiles"][profile_id]:
						merged[key] = (parsed as Dictionary)["profiles"][profile_id][key]
					_profiles[profile_id] = merged
	return (_profiles.get(id, {}) as Dictionary).duplicate(true)
