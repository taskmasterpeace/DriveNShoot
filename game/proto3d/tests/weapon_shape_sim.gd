## WEAPONS-AS-DATA (owner 2026-07-08: "all weapons should look like their
## counterparts... all the weapons and their grips figured out"). Every combat
## weapon carries a SHAPE — a silhouette built from box PARTS — and equipping it
## rebuilds the held mesh so a pistol reads as a pistol and a shotgun as a
## shotgun, never one stick for everything. The shapes THEMSELVES are judged by
## eye (the photobooth contact sheet); this sim holds the LAWS: coverage, the
## rebuild, distinct silhouettes, and the per-weapon muzzle.
## Run: godot --headless --path game res://proto3d/tests/weapon_shape_sim.tscn
extends Node

var passed := 0
var failed := 0


func _check(check_name: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("WPNSHAPE: %s - %s" % ["PASS" if ok else "FAIL", check_name])


func _ready() -> void:
	print("WPNSHAPE: start")
	get_tree().create_timer(30.0).timeout.connect(func() -> void:
		print("WPNSHAPE: WATCHDOG"); print("WPNSHAPE: FAILURES PRESENT"); get_tree().quit(1))

	var combat: Array = ["pistol", "shotgun", "pipe_rocket", "wrench", "machete", "axe", "bat"]

	# === 1. COVERAGE: every combat weapon declares a shape with real parts ==========
	var covered := true
	for id in combat:
		var shp: Dictionary = ProtoWeapon.shape(id)
		var parts: Array = shp.get("parts", [])
		if parts.is_empty():
			covered = false
			print("WPNSHAPE:   %s has NO shape parts" % id)
	_check("every weapon has a SHAPE of >=1 box part (%d weapons)" % combat.size(), covered)

	# === 2. THE REBUILD: equipping swaps the held mesh to THIS weapon's parts =======
	var p := ProtoPuppet.create({})
	add_child(p)
	await get_tree().process_frame
	var rebuild_ok := true
	for id2 in combat:
		var parts2: Array = ProtoWeapon.shape(id2).get("parts", [])
		p.set_weapon_mesh(parts2, ProtoWeapon.shape(id2).get("muzzle_z", 0.34))
		if p.gun.get_child_count() != parts2.size():
			rebuild_ok = false
			print("WPNSHAPE:   %s built %d boxes, shape says %d" % [id2, p.gun.get_child_count(), parts2.size()])
	_check("equipping REBUILDS the held mesh to the weapon's own part count", rebuild_ok)

	# === 3. DISTINCT SILHOUETTES: a pistol is not a rocket is not a bat =============
	# Signature = the sorted part sizes; no two weapons may share one.
	var sigs: Dictionary = {}
	var clash := false
	for id3 in combat:
		var sig := ""
		for part in ProtoWeapon.shape(id3).get("parts", []):
			sig += "%.3v|" % (part.get("size", Vector3.ZERO) as Vector3)
		if sigs.has(sig):
			clash = true
			print("WPNSHAPE:   %s and %s share a silhouette" % [id3, sigs[sig]])
		sigs[sig] = id3
	_check("no two weapons share a silhouette (each reads as itself)", not clash)

	# === 4. CHARACTER: the long gun is LONG, the rocket is FAT =======================
	var fwd := func(id4: String) -> float: # furthest-forward reach of any part (−Z + half depth)
		var m := 0.0
		for part in ProtoWeapon.shape(id4).get("parts", []):
			var s: Vector3 = part.get("size", Vector3.ZERO)
			var po: Vector3 = part.get("pos", Vector3.ZERO)
			m = maxf(m, -(po.z) + s.z * 0.5)
		return m
	var girth := func(id5: String) -> float:
		var m := 0.0
		for part in ProtoWeapon.shape(id5).get("parts", []):
			m = maxf(m, (part.get("size", Vector3.ZERO) as Vector3).x)
		return m
	_check("the shotgun reaches further than the pistol (%.2fm > %.2fm)" % [fwd.call("shotgun"), fwd.call("pistol")],
		fwd.call("shotgun") > fwd.call("pistol"))
	_check("the pipe rocket is the FATTEST barrel (%.2fm > pistol %.2fm)" % [girth.call("pipe_rocket"), girth.call("pistol")],
		girth.call("pipe_rocket") > girth.call("pistol"))

	# === 5. THE MUZZLE is the weapon's OWN, forward of the grip =====================
	p.set_armed(true)
	p.set_weapon_mesh(ProtoWeapon.shape("pistol").get("parts", []), ProtoWeapon.shape("pistol").get("muzzle_z", 0.34))
	await get_tree().process_frame
	var d_pistol := p.gun.global_position.distance_to(p.muzzle_world())
	_check("the pistol muzzle sits at its own tip (%.2fm ~= 0.26)" % d_pistol, absf(d_pistol - 0.26) < 0.03)
	p.set_weapon_mesh(ProtoWeapon.shape("shotgun").get("parts", []), ProtoWeapon.shape("shotgun").get("muzzle_z", 0.34))
	await get_tree().process_frame
	var d_shotgun := p.gun.global_position.distance_to(p.muzzle_world())
	_check("the shotgun muzzle reaches further than the pistol's (%.2fm > %.2fm)" % [d_shotgun, d_pistol],
		d_shotgun > d_pistol + 0.1)

	print("WPNSHAPE RESULTS: %d passed, %d failed" % [passed, failed])
	print("WPNSHAPE: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)
