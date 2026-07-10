## GAME DECK provenance proof: every declared source has a runtime-readable
## notice, revisions are pinned, exclusion rules remain explicit, and prohibited
## source-client/art identifiers are absent from shipped game/assets paths.
## Run: Godot --headless --path game res://proto3d/tests/game_license_sim.tscn
extends Node

var passed := 0
var failed := 0


func _check(label: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("GAME_LICENSE: %s - %s" % ["PASS" if ok else "FAIL", label])


func _ready() -> void:
	print("GAME_LICENSE: start")
	var reg := ProtoGameRegistry.load_catalog()
	var all_notices := true
	var all_license_paths := true
	var all_pinned := true
	for source_id in reg.sources:
		var source: Dictionary = reg.sources[source_id]
		var notice := String(source.get("notice_path", ""))
		if not notice.begins_with("res://third_party/licenses/") or not FileAccess.file_exists(notice):
			all_notices = false
			print("GAME_LICENSE: missing notice for %s -> %s" % [source_id, notice])
		var license_path := String(source.get("license_path", ""))
		if String(source.get("code_license", "")) != "not imported" \
				and (not license_path.begins_with("res://third_party/licenses/") \
				or not FileAccess.file_exists(license_path)):
			all_license_paths = false
		var revision := String(source.get("revision", ""))
		if not (revision.length() == 40 or revision.begins_with("accessed-")):
			all_pinned = false
	_check("every source notice ships inside res://", all_notices)
	_check("licensed sources distinguish a local license path", all_license_paths)
	_check("every source is pinned or access-dated", all_pinned)
	_check("aggregate notices ship", FileAccess.file_exists("res://THIRD_PARTY_NOTICES.md")
		and FileAccess.get_file_as_string("res://THIRD_PARTY_NOTICES.md").contains("LittleJS Arcade"))
	var tanks: Dictionary = reg.get_source("tanks_of_freedom")
	_check("Tanks audio exclusion remains explicit", (tanks.get("excluded", []) as Array).any(func(value: Variant) -> bool:
		return String(value).contains("CC-BY-SA audio")))
	var infantry: Dictionary = reg.get_source("freeinfantry_reference")
	_check("Infantry is reference-only with all client material excluded",
		String(infantry.get("code_license", "")) == "not imported"
		and (infantry.get("excluded", []) as Array).has("all client code")
		and (infantry.get("excluded", []) as Array).has("maps"))
	var soldat: Dictionary = reg.get_source("opensoldat")
	_check("OpenSoldat engine and excluded base-content licenses stay separate",
		FileAccess.file_exists(String(soldat.get("content_license_path", ""))))
	var prohibited_paths: Array[String] = []
	_scan_paths("res://proto3d/games", prohibited_paths)
	_scan_paths("res://assets", prohibited_paths)
	_check("no Twemoji, Infantry, or Soldat source asset path ships", prohibited_paths.is_empty())
	_finish()


func _scan_paths(path: String, hits: Array[String]) -> void:
	var dir := DirAccess.open(path)
	if dir == null:
		return
	dir.list_dir_begin()
	var name := dir.get_next()
	while name != "":
		if name != "." and name != "..":
			var child := path.path_join(name)
			if dir.current_is_dir():
				_scan_paths(child, hits)
			else:
				var lower := child.to_lower()
				if lower.contains("twemoji") or lower.contains("infantry") or lower.contains("soldat"):
					hits.append(child)
		name = dir.get_next()
	dir.list_dir_end()


func _finish() -> void:
	print("GAME_LICENSE RESULTS: %d passed, %d failed" % [passed, failed])
	print("GAME_LICENSE: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)
