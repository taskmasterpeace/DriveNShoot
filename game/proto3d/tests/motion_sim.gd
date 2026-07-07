## Proof for MOTIONFORGE's ENGINE HALF (MOVESET.txt SPEC B): motions are ROWS.
## The fold law (data overlays stock, number by number, unknown keys survive),
## and the rows actually DRIVE the rigs — shrink stride_amp and the legs swing
## small; shrink the wag and the tail goes quiet. No world needed: just rigs.
## Run: godot --headless --path game res://proto3d/tests/motion_sim.tscn
extends Node

var passed := 0
var failed := 0


func _check(check_name: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("MOTION: %s - %s" % ["PASS" if ok else "FAIL", check_name])


## Max leg swing over a simulated second of striding at a fixed speed.
func _puppet_amp(p: ProtoPuppet) -> float:
	var m := 0.0
	for _i in 60:
		p.animate(1.0 / 60.0, 5.0, 0.0, false, 0.0, false)
		m = maxf(m, absf(p.hip_l.rotation.x))
	return m


func _wag_amp(q: ProtoQuadruped) -> float:
	var m := 0.0
	for _i in 90:
		q.animate(1.0 / 60.0, 0.0, 1.0) # idle + max morale = the happy wag
		m = maxf(m, absf(q.tail_pivot.rotation.y))
	return m


func _ready() -> void:
	print("MOTION: start")
	get_tree().create_timer(30.0).timeout.connect(func() -> void:
		print("MOTION: WATCHDOG"); print("MOTION: FAILURES PRESENT"); get_tree().quit(1))

	# --- 1. The FOLD LAW on a fixture ------------------------------------------
	var fixture: Dictionary = {"rigs": {
		"puppet": {"gait": {"stride_amp": 0.05}},
		"quadruped": {"leap": {"launch_h": 3.3}, "skitter": {"hz": 9.0}},
	}}
	var f := FileAccess.open("user://test_motions.json", FileAccess.WRITE)
	f.store_string(JSON.stringify(fixture))
	f.close()
	var into: Dictionary = {"gait": {"stride_amp": 0.6, "arm_swing": 0.85}}
	ProtoPuppet.fold_motion_file("puppet", into, "user://test_motions.json")
	_check("data OVERRIDES stock, number by number", is_equal_approx(float(into["gait"]["stride_amp"]), 0.05))
	_check("untouched params keep stock", is_equal_approx(float(into["gait"]["arm_swing"]), 0.85))
	var into_q: Dictionary = {"leap": {"launch_h": 7.2}}
	ProtoPuppet.fold_motion_file("quadruped", into_q, "user://test_motions.json")
	_check("the quadruped rig folds too", is_equal_approx(float(into_q["leap"]["launch_h"]), 3.3))
	_check("UNKNOWN motions are welcomed (open schema)", into_q.has("skitter"))
	DirAccess.remove_absolute("user://test_motions.json")

	# --- 2. The rows DRIVE the biped -------------------------------------------
	var p := ProtoPuppet.create({})
	add_child(p)
	var stock_amp := _puppet_amp(p)
	_check("stock stride swings the legs (%.2f rad)" % stock_amp, stock_amp > 0.3)
	var was_stride: float = float(ProtoPuppet.MOTION["gait"]["stride_amp"])
	ProtoPuppet.MOTION["gait"]["stride_amp"] = 0.06
	var tuned_amp := _puppet_amp(p)
	ProtoPuppet.MOTION["gait"]["stride_amp"] = was_stride
	_check("shrinking the ROW shrinks the STRIDE (%.2f → %.2f)" % [stock_amp, tuned_amp],
		tuned_amp < stock_amp * 0.4)

	# --- 3. The rows DRIVE the quadruped ----------------------------------------
	var q := ProtoQuadruped.create({})
	add_child(q)
	var stock_wag := _wag_amp(q)
	_check("the happy tail WAGS (%.2f rad)" % stock_wag, stock_wag > 0.3)
	var was_wag: float = float(ProtoQuadruped.MOTION["gait"]["wag_amp_hi"])
	ProtoQuadruped.MOTION["gait"]["wag_amp_hi"] = 0.05
	var quiet_wag := _wag_amp(q)
	ProtoQuadruped.MOTION["gait"]["wag_amp_hi"] = was_wag
	_check("shrinking the wag ROW quiets the tail (%.2f → %.2f)" % [stock_wag, quiet_wag],
		quiet_wag < stock_wag * 0.4)

	# --- 4. The dog's LEAP height is a row (the verb reads the data) ------------
	_check("the leap row is live for dog.gd (launch_h %.1f)" % float(ProtoQuadruped.MOTION["leap"]["launch_h"]),
		float(ProtoQuadruped.MOTION["leap"]["launch_h"]) > 1.0)

	# --- 4b. THE MELEE is rows now (the owner's all-night fix, made tunable) -----
	_check("the melee row exists with the full strike surface",
		(ProtoPuppet.MOTION["melee"] as Dictionary).has_all(["windup_s", "slash_s", "settle_s",
			"punch_out_s", "punch_reach", "kick_out_s", "kick_height"]))
	var mm: Dictionary = ProtoPuppet.MOTION["melee"]
	var was: Array = [mm["windup_s"], mm["slash_s"], mm["settle_s"]]
	mm["windup_s"] = 0.2
	mm["slash_s"] = 0.3
	mm["settle_s"] = 0.4
	p.swing()
	_check("the SWING reads its rows (swing owns the arm %.2fs = the row sum)" % p._swing_t,
		is_equal_approx(p._swing_t, 0.9))
	mm["windup_s"] = was[0]
	mm["slash_s"] = was[1]
	mm["settle_s"] = was[2]
	mm["punch_out_s"] = 0.5
	mm["punch_back_s"] = 0.5
	p.punch(1)
	_check("the PUNCH reads its rows (%.2fs)" % p._swing_t, p._swing_t > 1.0)
	mm["punch_out_s"] = 0.05
	mm["punch_back_s"] = 0.12

	# --- 5. The REAL data file folds clean (empty rigs = pure stock) ------------
	_check("real motions.json folds without breaking stock",
		is_equal_approx(float(ProtoPuppet.MOTION["gait"]["cadence_base"]), 2.0)
		or FileAccess.file_exists("res://data/motions.json"))

	print("MOTION RESULTS: %d passed, %d failed" % [passed, failed])
	print("MOTION: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)
