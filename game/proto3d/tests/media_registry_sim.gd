## Proof for the MEDIA REGISTRY (docs/cinema.md Phase 1 + Phase 8 laws):
## the catalog is DATA (media_manifest.json), duplicate ids are flagged loudly
## and skipped, bad categories are skipped, MISSING FILES WARN BUT DO NOT CRASH
## (the row survives so the UI can say NOT INSTALLED), and the query surface
## (by-category / for-context / unlocked / installed) answers correctly.
## Runs a synthetic fixture manifest + the real one (if MediaForge made it).
## Run: godot --headless --path game res://proto3d/tests/media_registry_sim.tscn
extends Node

var passed := 0
var failed := 0


func _check(check_name: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("MEDREG: %s - %s" % ["PASS" if ok else "FAIL", check_name])


func _ready() -> void:
	print("MEDREG: start")
	get_tree().create_timer(30.0).timeout.connect(func() -> void:
		print("MEDREG: WATCHDOG"); print("MEDREG: FAILURES PRESENT"); get_tree().quit(1))

	# --- Fixture: every law violated once, one good row -----------------------
	# "exists_path" points at THIS script — a real file, so installed() is true.
	var exists_path := "res://proto3d/tests/media_registry_sim.gd"
	var fixture: Dictionary = {"media": [
		{"id": "good_film", "category": "film", "title": "Good Film", "runtime_seconds": 90.0,
			"encoded_path": exists_path, "unlock_type": "always_available",
			"screen_context": ["safehouse_tv", "drive_in"], "unlock_region": ""},
		{"id": "good_film", "category": "film", "title": "DUPE — must be skipped",
			"encoded_path": exists_path},
		{"id": "bad_cat", "category": "podcast", "title": "Wrong shelf",
			"encoded_path": exists_path},
		{"id": "ghost_reel", "category": "clips", "title": "Ghost Reel",
			"encoded_path": "res://media/clips/ghost/ghost.ogv", "unlock_type": "always_available",
			"screen_context": ["safehouse_tv"]},
		{"id": "locked_tape", "category": "tvshow", "title": "Locked Tape",
			"encoded_path": exists_path, "unlock_type": "found_dvd",
			"screen_context": ["safehouse_tv"], "unlock_region": "florida"},
	]}
	var f := FileAccess.open("user://test_media_manifest.json", FileAccess.WRITE)
	f.store_string(JSON.stringify(fixture))
	f.close()

	var reg := ProtoMediaRegistry.load_manifest("user://test_media_manifest.json")
	_check("the good row loads", reg.rows.has("good_film"))
	_check("the DUPLICATE is skipped (one good_film)", String(reg.get_media("good_film").get("title", "")) == "Good Film")
	_check("the duplicate was flagged LOUDLY", reg.load_warnings.any(func(w): return String(w).contains("duplicate")))
	_check("a bad category is skipped", not reg.rows.has("bad_cat"))
	_check("a MISSING FILE warns…", reg.load_warnings.any(func(w): return String(w).contains("ghost_reel")))
	_check("…but the row SURVIVES (NOT INSTALLED, not a crash)", reg.rows.has("ghost_reel"))
	_check("installed() tells them apart", reg.installed("good_film") and not reg.installed("ghost_reel"))

	# --- The query surface ------------------------------------------------------
	_check("list_by_category finds the film", reg.list_by_category("film").size() == 1)
	_check("list_for_context reads screen_context", reg.list_for_context("drive_in").size() == 1)
	_check("region gating holds (florida tape hidden in texas)",
		reg.list_for_context("safehouse_tv", "texas").size() == 2) # good_film + ghost_reel
	_check("region gating opens at home (florida)",
		reg.list_for_context("safehouse_tv", "florida").size() == 3)
	var no_unlocks: Dictionary = {}
	_check("locked rows stay off the shelf", reg.list_unlocked(no_unlocks).size() == 2)
	_check("an unlock opens the tape", reg.list_unlocked({"locked_tape": true}).size() == 3)
	var stream := reg.open_stream("ghost_reel")
	_check("open_stream on NOT INSTALLED returns null (no crash)", stream == null)

	# --- The REAL manifest (if MediaForge has run) ------------------------------
	var real := ProtoMediaRegistry.load_manifest()
	if FileAccess.file_exists(ProtoMediaRegistry.MANIFEST):
		_check("the real manifest loads clean of duplicates",
			not real.load_warnings.any(func(w): return String(w).contains("duplicate")))
	else:
		_check("no real manifest yet → warned, empty, NO CRASH",
			real.rows.is_empty() and not real.load_warnings.is_empty())

	DirAccess.remove_absolute("user://test_media_manifest.json")
	print("MEDREG RESULTS: %d passed, %d failed" % [passed, failed])
	print("MEDREG: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)
