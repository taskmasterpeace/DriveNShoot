## Proof for the UI/UX PASS (owner: "enhance the UI and UX", grounded in
## UI_DESIGN_LANGUAGE.md + the house law "if the player can't see it, it
## doesn't exist"): the LOCATION line speaks the road's NICKNAME, the HUD's
## THREAT CHIP carries standing road threats (a shadowing drone, a checkpoint
## ahead) persistently instead of a fading toast, the atlas reads as a
## HIERARCHY (interstates heavy, backroads thin, ramps local-only), and the
## EXITS layer names the network's valves (T2/T3 labeled, T1 quiet dots).
## Run: godot --headless --path game res://proto3d/tests/ui_polish_sim.tscn
extends Node

var passed := 0
var failed := 0
var main: Node3D


func _check(check_name: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("UIPOLISH: %s - %s" % ["PASS" if ok else "FAIL", check_name])


func _ready() -> void:
	print("UIPOLISH: start")
	get_tree().create_timer(120.0).timeout.connect(func() -> void:
		print("UIPOLISH: WATCHDOG")
		print("UIPOLISH: FAILURES PRESENT")
		get_tree().quit(1))

	# === 1. THE MAP STYLE LAW (data, then draw) ====================================
	var i_style := ProtoWorldStream.atlas_road_style("interstate")
	var b_style := ProtoWorldStream.atlas_road_style("backroad")
	var r_style := ProtoWorldStream.atlas_road_style("exit")
	_check("the atlas reads as a HIERARCHY: interstates heavier than backroads (%.1f > %.1f)" %
		[float(i_style["width"]), float(b_style["width"])],
		float(i_style["width"]) > float(b_style["width"]))
	_check("exit ramps stay OFF the atlas (they live on the local map)",
		bool(i_style["atlas"]) and bool(b_style["atlas"]) and not bool(r_style["atlas"]))

	# === Boot ======================================================================
	main = (load("res://proto3d/proto3d.tscn") as PackedScene).instantiate()
	add_child(main)
	for _i in 8:
		await get_tree().process_frame

	# === 2. THE EXITS LAYER as data ================================================
	var marks: Array = main.stream.atlas_exit_markers()
	_check("the exits layer carries the whole network (%d markers, want >=80)" % marks.size(),
		marks.size() >= 80)
	var named := 0
	var quiet_t1 := true
	for mk in marks:
		if String(mk["label"]) != "":
			named += 1
		if String(mk["tier"]) == "T1" and String(mk["label"]) != "":
			quiet_t1 = false
	_check("T2/T3 exits are NAMED (%d labels) and T1s stay quiet dots (no label rash)" % named,
		named >= 15 and quiet_t1)

	# === 3. THE ROAD SPEAKS ITS NICKNAME ===========================================
	# Stage the car onto I-95 (THE CRIMSON MILE) and read the location line.
	main.active_car.global_position = Vector3(1875.0, 1.0, -1375.0)
	for _i in 12:
		await get_tree().physics_frame
	var loc: String = main.hud._mode_label.text
	_check("the location line speaks the nickname ('%s' carries THE CRIMSON MILE)" % loc,
		loc.contains("I-95") and loc.contains("THE CRIMSON MILE"))

	# === 4. THE THREAT CHIP: standing threats live on the HUD =====================
	main.hud.set_threat("")
	_check("the chip hides when the road is quiet",
		main.hud._threat_label == null or not main.hud._threat_label.visible)
	var b: ProtoBandits = main.bandits
	b.set_physics_process(false)
	b._spawn_drone(main.active_car.global_position)
	b._update_threat_chip(main.active_car.global_position)
	_check("a shadowing drone puts 🛸 SHADOWED on the chip (persistent, not a fading toast)",
		main.hud._threat_label != null and main.hud._threat_label.visible
		and main.hud._threat_label.text.contains("SHADOWED"))
	# the checkpoint joins the same line
	b._raise_checkpoint(main.active_car.global_position, "ARIZONA", 5)
	b._update_threat_chip(main.active_car.global_position)
	_check("a standing checkpoint joins it with DISTANCE + the demand ('%s')" % main.hud._threat_label.text,
		main.hud._threat_label.text.contains("CHECKPOINT") and main.hud._threat_label.text.contains("scrip"))
	b._clear_drone()
	if b.checkpoint != null:
		b.checkpoint.queue_free()
		b.checkpoint = null
	b._update_threat_chip(main.active_car.global_position)
	_check("threats gone -> the chip clears", not main.hud._threat_label.visible)

	# === 5. THE PALETTE LAW: the chip is house orange, never purple ================
	var col: Color = main.hud._threat_label.get_theme_color("font_color")
	var h := col.h * 360.0
	_check("the chip wears CRITICAL orange (hue %.0f — no purple, ever)" % h,
		h < 60.0 or h > 340.0)

	print("UIPOLISH RESULTS: %d passed, %d failed" % [passed, failed])
	print("UIPOLISH: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)
