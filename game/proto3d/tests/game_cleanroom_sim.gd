## Final flagship provenance gate. Legal names may appear in notices/comments;
## runtime dependencies, identifiers, zones, maps, and assets may not import
## either upstream game's protected content.
extends Node

var passed := 0
var failed := 0


func _check(label: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("GAME_CLEANROOM: %s - %s" % ["PASS" if ok else "FAIL", label])


func _ready() -> void:
	print("GAME_CLEANROOM: start")
	var registry := ProtoGameRegistry.load_catalog()
	var soldat: Dictionary = registry.get_source("opensoldat")
	var infantry: Dictionary = registry.get_source("freeinfantry_reference")
	_check("OpenSoldat code reference is MIT and base content remains a separate exclusion",
		String(soldat.get("code_license", "")) == "MIT"
		and String(soldat.get("content_license", "")).contains("not imported")
		and (soldat.get("excluded", []) as Array).has("original maps"))
	_check("BLACK GRID source record imports no code and excludes every client material family",
		String(infantry.get("code_license", "")) == "not imported"
		and ["all client code", "all server code", "maps", "zone files", "art", "sounds",
			"names", "text", "branding"].all(func(term: String) -> bool:
				return (infantry.get("excluded", []) as Array).has(term)))

	var notices := FileAccess.get_file_as_string("res://THIRD_PARTY_NOTICES.md")
	var material_section := notices.get_slice("## Pre-integration provenance records", 0)
	_check("aggregate notice distinguishes used MIT knowledge and clean-room behavior reference",
		material_section.contains("OpenSoldat implementation reference")
		and material_section.contains("clean-room implementation")
		and material_section.contains("The Soldat mark") and material_section.contains("excluded")
		and material_section.contains("No FreeInfantry"))

	var runtime_files: Array[String] = []
	_scan_files("res://proto3d/games/rust_runners", runtime_files)
	_scan_files("res://proto3d/games/black_grid", runtime_files)
	_scan_files("res://proto3d/games/shooter", runtime_files)
	var prohibited_extensions := ["png", "jpg", "jpeg", "webp", "svg", "bmp", "wav", "ogg",
		"mp3", "pms", "smap", "map", "lvl", "zone", "zip"]
	_check("flagship runtime contains no imported art audio map zone or archive file",
		runtime_files.all(func(path: String) -> bool:
			return path.get_extension().to_lower() not in prohibited_extensions))
	_check("no runtime filename carries an upstream product or client identifier",
		runtime_files.all(func(path: String) -> bool:
			var lower := path.to_lower()
			return not lower.contains("soldat") and not lower.contains("infantry") \
				and not lower.contains("freeinfantry")))

	var dependency_paths: Array[String] = []
	for path in runtime_files:
		if path.get_extension().to_lower() != "gd":
			continue
		var source := FileAccess.get_file_as_string(path)
		var regex := RegEx.new()
		regex.compile("res://[^\\\"']+")
		for match_row in regex.search_all(source):
			dependency_paths.append(String(match_row.get_string()))
	_check("all flagship resource dependencies stay inside original DRIVN runtime paths",
		dependency_paths.all(func(path: String) -> bool:
			var lower := path.to_lower()
			return not lower.contains("soldat") and not lower.contains("infantry") \
				and not lower.contains("freeinfantry") and not lower.contains("third_party")))

	var rust_rows: Dictionary = JSON.parse_string(FileAccess.get_file_as_string(
		"res://data/rust_runners_maps.json"))
	var grid_rows: Dictionary = JSON.parse_string(FileAccess.get_file_as_string(
		"res://data/black_grid_zones.json"))
	var rust_ids: Array = (rust_rows.get("maps", []) as Array).map(func(row: Dictionary) -> String:
		return String(row.get("id", "")))
	var grid_ids: Array = (grid_rows.get("zones", []) as Array).map(func(row: Dictionary) -> String:
		return String(row.get("id", "")))
	_check("all original arena and zone ids are unique and use DRIVN naming",
		rust_ids.size() == 3 and grid_ids.size() == 3 \
		and rust_ids.duplicate().all(func(id: Variant) -> bool:
			return rust_ids.count(id) == 1 and not String(id).contains("soldat")) \
		and grid_ids.duplicate().all(func(id: Variant) -> bool:
			return grid_ids.count(id) == 1 and not String(id).contains("infantry")))

	var kernel_script := load("res://proto3d/games/shooter/shooter_kernel.gd") as GDScript
	var weapon_rows: Dictionary = kernel_script.load_weapon_rows()
	_check("every flagship weapon id belongs to an original rr/bg namespace",
		weapon_rows.size() >= 12 and weapon_rows.keys().all(func(id: Variant) -> bool:
			return String(id).begins_with("rr_") or String(id).begins_with("bg_")))
	_check("original row data references no external media path",
		_notices_only_strings(rust_rows) and _notices_only_strings(grid_rows) \
		and _notices_only_strings(JSON.parse_string(FileAccess.get_file_as_string(
			"res://data/game_shooter_weapons.json"))))

	var books: Dictionary = JSON.parse_string(FileAccess.get_file_as_string("res://data/books.json"))
	var guide_text := "\n".join((books.get("books", []) as Array).filter(func(row: Dictionary) -> bool:
		return String(row.get("id", "")) in ["book_rust_runners", "book_black_grid"]).map(
		func(row: Dictionary) -> String: return "\n".join(row.get("pages", []))))
	_check("in-world manuals disclose both source boundaries to the player",
		guide_text.contains("OpenSoldat") and guide_text.contains("No Infantry Online") \
		and guide_text.contains("original DRIVN"))
	_finish()


func _scan_files(path: String, out: Array[String]) -> void:
	var dir := DirAccess.open(path)
	if dir == null:
		return
	dir.list_dir_begin()
	var name := dir.get_next()
	while name != "":
		if name not in [".", ".."]:
			var child := path.path_join(name)
			if dir.current_is_dir():
				_scan_files(child, out)
			else:
				out.append(child)
		name = dir.get_next()
	dir.list_dir_end()


func _notices_only_strings(value: Variant) -> bool:
	var text := JSON.stringify(value).to_lower()
	return not [".png", ".jpg", ".svg", ".wav", ".ogg", ".mp3", ".pms", ".smap",
		".map", ".zone"].any(func(extension: String) -> bool: return text.contains(extension))


func _finish() -> void:
	print("GAME_CLEANROOM RESULTS: %d passed, %d failed" % [passed, failed])
	print("GAME_CLEANROOM: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)
