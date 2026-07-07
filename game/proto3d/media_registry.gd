## THE MEDIA REGISTRY (docs/cinema.md Phase 1): the catalog of the creator's own
## films / show episodes / trailers / clips. Everything is a ROW in
## data/media_manifest.json — MediaForge (:8897) WRITES it, the engine only READS.
## Laws: missing files WARN (the UI says NOT INSTALLED), never crash; duplicate
## ids fail loudly in dev; the catalog is never hardcoded.
class_name ProtoMediaRegistry
extends RefCounted

const MANIFEST := "res://data/media_manifest.json"
const CATEGORIES: Array = ["film", "tvshow", "trailers", "clips", "musicvideo"]

var rows: Dictionary = {}     ## id -> manifest row
var order: Array = []         ## manifest order (stable listings)
var load_warnings: Array = [] ## sim/debug hook: everything that was off


static func load_manifest(path: String = MANIFEST) -> ProtoMediaRegistry:
	var reg := ProtoMediaRegistry.new()
	if not FileAccess.file_exists(path):
		reg.load_warnings.append("no manifest at %s (drop media via MediaForge :8897)" % path)
		return reg
	var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string(path))
	if not (parsed is Dictionary):
		reg.load_warnings.append("manifest unreadable — not a JSON object")
		return reg
	for row_v in (parsed as Dictionary).get("media", []):
		if not (row_v is Dictionary):
			continue
		var row := (row_v as Dictionary).duplicate(true)
		var id := String(row.get("id", ""))
		if id == "":
			reg.load_warnings.append("a row with no id was skipped")
			continue
		# Duplicate IDs fail LOUDLY in dev (cinema.md Phase 1) — but survivably,
		# so a bad manifest can be diagnosed in-game instead of killing the boot.
		if reg.rows.has(id):
			push_error("MediaRegistry: DUPLICATE media id '%s' — row skipped" % id)
			reg.load_warnings.append("duplicate id '%s' skipped" % id)
			continue
		if not CATEGORIES.has(String(row.get("category", ""))):
			reg.load_warnings.append("'%s' has bad category '%s'" % [id, String(row.get("category", ""))])
			continue
		if not FileAccess.file_exists(String(row.get("encoded_path", ""))):
			# Keep the row — screens show "NOT INSTALLED" instead of crashing (Phase 8).
			reg.load_warnings.append("'%s' encoded file missing (%s)" % [id, String(row.get("encoded_path", ""))])
		reg.rows[id] = row
		reg.order.append(id)
	return reg


func get_media(id: String) -> Dictionary:
	return rows.get(id, {})


func list_by_category(category: String) -> Array:
	var out: Array = []
	for id in order:
		if String((rows[id] as Dictionary).get("category", "")) == category:
			out.append(rows[id])
	return out


## Is the actual video on disk (vs a known-but-not-installed row)?
func installed(id: String) -> bool:
	var row: Dictionary = rows.get(id, {})
	return not row.is_empty() and FileAccess.file_exists(String(row.get("encoded_path", "")))


## Rows a given SCREEN may show: screen_context contains the context, and the
## region either doesn't matter or matches.
func list_for_context(context: String, region: String = "") -> Array:
	var out: Array = []
	for id in order:
		var row := rows[id] as Dictionary
		var ctx: Array = row.get("screen_context", [])
		if not ctx.has(context):
			continue
		var want := String(row.get("unlock_region", ""))
		if want != "" and region != "" and want != region:
			continue
		out.append(row)
	return out


## Rows the PLAYER can watch: always_available, or their id is in the save's
## unlocked set (found DVDs/tapes/reels, quest rewards — Phase 4).
func list_unlocked(unlocked: Dictionary) -> Array:
	var out: Array = []
	for id in order:
		var row := rows[id] as Dictionary
		if String(row.get("unlock_type", "always_available")) == "always_available" or unlocked.has(id):
			out.append(row)
	return out


## Open the actual video stream at RUNTIME — VideoStreamTheora takes a file path
## directly, so user-dropped .ogv needs NO import step. null = not installed.
func open_stream(id: String) -> VideoStreamTheora:
	if not installed(id):
		return null
	var vs := VideoStreamTheora.new()
	vs.file = String((rows[id] as Dictionary).get("encoded_path", ""))
	return vs
