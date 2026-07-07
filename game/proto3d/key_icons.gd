## PROTO KEY ICONS — resolves an input DESCRIPTOR ("key:E", "mouse:left", "key:CTRL")
## to a keyboard/mouse prompt glyph so the CONTROLS panel (and any HUD hint) can show
## a picture instead of raw text. Art is the MIT-licensed dark keyboard set from
## Ander2211/Vehicle-Controller (see assets/input_icons/ATTRIBUTION.md). Descriptors
## are ProtoInputMap's own strings; anything without art returns null → the caller
## falls back to its text label. Textures are loaded lazily and cached.
class_name ProtoKeyIcons
extends RefCounted

const DIR: String = "res://assets/input_icons/"
const SUFFIX: String = "_Key_Dark.png"

## Descriptor key-name (UPPER) -> icon basename. Single letters/digits are handled
## programmatically; only the named/special keys need a row here. NOTE "T_Crtl" is
## the art set's own (mis)spelling of the file — matched verbatim on purpose.
const SPECIAL: Dictionary = {
	"SPACE": "T_Space", "SHIFT": "T_Shift", "CTRL": "T_Crtl", "ALT": "T_Alt",
	"TAB": "T_Tab", "ESCAPE": "T_Esc", "ENTER": "T_Enter", "BACKSPACE": "T_BackSpace",
	"CAPSLOCK": "T_CapsLock", "QUOTELEFT": "T_Tilde", "ASTERISK": "T_Asterisk",
	"LEFT": "T_Left", "RIGHT": "T_Right", "UP": "T_Up", "DOWN": "T_Down",
	"DELETE": "T_Del", "INSERT": "T_Ins", "HOME": "T_Home", "END": "T_End",
	"PAGEUP": "T_PageUp", "PAGEDOWN": "T_PageDown", "MINUS": "T_Minus", "EQUAL": "T_Plus",
	"SLASH": "T_Slash", "SEMICOLON": "T_Semicolon",
	"BRACKETLEFT": "T_Brackets_L", "BRACKETRIGHT": "T_Brackets_R",
	"F1": "T_F1", "F2": "T_F2", "F3": "T_F3", "F4": "T_F4", "F5": "T_F5", "F6": "T_F6",
	"F7": "T_F7", "F8": "T_F8", "F9": "T_F9", "F10": "T_F10", "F11": "T_F11", "F12": "T_F12",
}
const MOUSE: Dictionary = {
	"left": "T_Mouse_Left", "right": "T_Mouse_Right", "middle": "T_Mouse_Middle",
}

static var _cache: Dictionary = {}


## The icon for one descriptor, or null if there's no art for it (letters/digits and
## the SPECIAL/MOUSE names have art; punctuation like Comma/Period deliberately don't).
static func texture_for(descriptor: String) -> Texture2D:
	var base := _basename(descriptor)
	if base == "":
		return null
	if _cache.has(base):
		return _cache[base]
	var path := DIR + base + SUFFIX
	var tex: Texture2D = load(path) if ResourceLoader.exists(path) else null
	_cache[base] = tex
	return tex


## First descriptor in a list that HAS art (so a "B + RMB" bind shows the B glyph
## rather than nothing). Returns null if none of them have art.
static func first_texture(descriptors: Array) -> Texture2D:
	for d in descriptors:
		var tex := texture_for(String(d))
		if tex != null:
			return tex
	return null


static func _basename(descriptor: String) -> String:
	var parts := descriptor.split(":")
	if parts.size() < 2:
		return ""
	match parts[0]:
		"mouse":
			return String(MOUSE.get(parts[1], ""))
		"key":
			var k := parts[1].to_upper()
			if SPECIAL.has(k):
				return String(SPECIAL[k])
			if k.length() == 1 and ((k >= "A" and k <= "Z") or (k >= "0" and k <= "9")):
				return "T_" + k
			return ""
	return ""
