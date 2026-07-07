## Proof for ProtoKeyIcons (proto3d/key_icons.gd) + the MIT prompt-icon set. Resolves
## real ProtoInputMap descriptors to glyph textures, and verifies the graceful
## null-fallback for keys with no art. Also forces the icon PNGs to import.
## Run: godot --headless --path game res://proto3d/tests/key_icons_sim.tscn
extends Node

var passed := 0
var failed := 0


func _check(check_name: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("KEYICON: %s - %s" % ["PASS" if ok else "FAIL", check_name])


func _ready() -> void:
	# Descriptors that MUST resolve to art (a spread across our real binds).
	for d in ["key:E", "key:W", "key:A", "key:S", "key:D", "key:SPACE", "key:SHIFT",
			"key:CTRL", "key:TAB", "key:R", "key:1", "key:F5", "key:F11",
			"key:QUOTELEFT", "key:Left", "mouse:left", "mouse:right"]:
		_check("resolves %s" % d, ProtoKeyIcons.texture_for(d) is Texture2D)

	# Art-less descriptors return null (caller falls back to text) — never crash.
	for d in ["key:Comma", "key:Period", "joy:a", "axis:rt", "", "garbage"]:
		_check("null for art-less '%s'" % d, ProtoKeyIcons.texture_for(d) == null)

	# first_texture picks the first descriptor that HAS art (B has none of its own?
	# B is a letter -> has art; use an art-less-first combo to prove the skip).
	var combo := ["key:Comma", "key:B", "mouse:right"]
	_check("first_texture skips art-less, finds key:B", ProtoKeyIcons.first_texture(combo) is Texture2D)
	_check("first_texture null when none have art", ProtoKeyIcons.first_texture(["key:Comma", "joy:a"]) == null)

	# Cache returns the SAME texture instance on a second call (no reload).
	var t1 := ProtoKeyIcons.texture_for("key:E")
	var t2 := ProtoKeyIcons.texture_for("key:E")
	_check("texture cache returns same instance", t1 == t2 and t1 != null)

	# The panel row surface now carries raw descriptors for the glyph lookup.
	var rows := ProtoInputMap.rows_for_panel()
	var has_raw := not rows.is_empty() and (rows[0] as Dictionary).has("keys_raw")
	_check("rows_for_panel exposes keys_raw", has_raw)

	print("KEYICON: DONE — %d passed, %d failed" % [passed, failed])
	get_tree().quit(1 if failed > 0 else 0)
