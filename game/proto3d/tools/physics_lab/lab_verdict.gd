## Evidence-backed subjective notes. Objective metrics and five ratings coexist;
## no method computes a composite winner.
class_name ProtoLabVerdict
extends RefCounted

const ROOT := "user://physics_lab/verdicts"
const RATING_FIELDS: Array[String] = ["feel", "control", "weight", "readability", "fun"]


func save(input: Dictionary) -> Dictionary:
	if not _valid_ratings(input.get("ratings", {})):
		return {"ok": false, "error": "ratings must be integers from 1 to 10"}
	var id: String = "verdict_%s_%d" % [
		Time.get_datetime_string_from_system(true).replace(":", "-").replace(" ", "T"),
		Time.get_ticks_msec()]
	var record: Dictionary = input.duplicate(true)
	record["id"] = id
	record["timestamp_utc"] = Time.get_datetime_string_from_system(true)
	record["note"] = String(record.get("note", ""))
	record["metrics"] = (record.get("metrics", {}) as Dictionary).duplicate(true)
	for field in ["mode", "weapon", "surface", "camera", "condition", "scenario", "replay_id"]:
		record[field] = String(record.get(field, ""))
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(ROOT))
	var json_path: String = "%s/%s.json" % [ROOT, id]
	var markdown_path: String = "%s/%s.md" % [ROOT, id]
	if not _write(json_path, JSON.stringify(record, "  ")):
		return {"ok": false, "error": "could not write JSON"}
	if not _write(markdown_path, _record_markdown(record)):
		DirAccess.remove_absolute(ProjectSettings.globalize_path(json_path))
		return {"ok": false, "error": "could not write Markdown"}
	return {"ok": true, "id": id, "json_path": json_path,
		"markdown_path": markdown_path, "record": record}


func _valid_ratings(value: Variant) -> bool:
	if value is not Dictionary:
		return false
	var ratings := value as Dictionary
	for field in RATING_FIELDS:
		if not ratings.has(field):
			return false
		var number: float = float(ratings[field])
		if number < 1.0 or number > 10.0 or not is_equal_approx(number, round(number)):
			return false
	return true


func load_json(path: String) -> Dictionary:
	if not _inside_root(path) or not FileAccess.file_exists(path):
		return {}
	var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string(path))
	return _normalize_record(parsed as Dictionary) if parsed is Dictionary else {}


func load_markdown(path: String) -> Dictionary:
	if not _inside_root(path) or not FileAccess.file_exists(path):
		return {}
	var text: String = FileAccess.get_file_as_string(path)
	var begin: String = "<!-- DRIVN_VERDICT_JSON\n"
	var finish: String = "\nDRIVN_VERDICT_JSON -->"
	var start_index: int = text.find(begin)
	var end_index: int = text.find(finish, start_index + begin.length())
	if start_index < 0 or end_index < 0:
		return {}
	var payload: String = text.substr(start_index + begin.length(),
		end_index - start_index - begin.length())
	var parsed: Variant = JSON.parse_string(payload)
	return _normalize_record(parsed as Dictionary) if parsed is Dictionary else {}


func _normalize_record(record: Dictionary) -> Dictionary:
	var out: Dictionary = record.duplicate(true)
	var ratings: Dictionary = out.get("ratings", {})
	for field in RATING_FIELDS:
		if ratings.has(field):
			ratings[field] = int(ratings[field])
	out["ratings"] = ratings
	return out


func comparison_markdown(records: Array) -> String:
	var lines: Array[String] = ["# Physics Lab Verdict Comparison", "",
		"Objective metrics and subjective ratings are intentionally separate.", ""]
	for raw_record in records:
		var record := raw_record as Dictionary
		lines.append("## %s · %s · %s" % [String(record.get("mode", "unknown")),
			String(record.get("weapon", "unknown")), String(record.get("scenario", "free_play"))])
		lines.append("")
		lines.append("### Objective metrics")
		for key in (record.get("metrics", {}) as Dictionary):
			lines.append("- %s: %s" % [String(key), str(record["metrics"][key])])
		lines.append("")
		lines.append("### Subjective ratings")
		for field in RATING_FIELDS:
			lines.append("- %s: %s/10" % [field, str(record["ratings"].get(field, "—"))])
		lines.append("")
		lines.append("Note: %s" % String(record.get("note", "")))
		lines.append("")
	return "\n".join(lines)


func clear_all(confirmed: bool) -> bool:
	if not confirmed:
		return false
	var root_abs: String = ProjectSettings.globalize_path(ROOT)
	var dir := DirAccess.open(root_abs)
	if dir == null:
		return true
	dir.list_dir_begin()
	var name: String = dir.get_next()
	while name != "":
		if not dir.current_is_dir() and (name.ends_with(".json") or name.ends_with(".md")):
			dir.remove(name)
		name = dir.get_next()
	dir.list_dir_end()
	return true


func delete_export(id: String) -> bool:
	if id.contains("/") or id.contains("\\") or id.contains(".."):
		return false
	var removed: bool = false
	for extension in ["json", "md"]:
		var path: String = "%s/%s.%s" % [ROOT, id, extension]
		if FileAccess.file_exists(path):
			removed = DirAccess.remove_absolute(ProjectSettings.globalize_path(path)) == OK or removed
	return removed


func _record_markdown(record: Dictionary) -> String:
	return "%s\n\n<!-- DRIVN_VERDICT_JSON\n%s\nDRIVN_VERDICT_JSON -->\n" % [
		comparison_markdown([record]), JSON.stringify(record)]


func _write(path: String, content: String) -> bool:
	var file := FileAccess.open(path, FileAccess.WRITE)
	if file == null:
		return false
	file.store_string(content)
	file.close()
	return true


func _inside_root(path: String) -> bool:
	return path.begins_with(ROOT + "/") and not path.contains("..")
