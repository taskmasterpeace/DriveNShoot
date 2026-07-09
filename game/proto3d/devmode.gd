## DEV MODE (F10) — the in-game test environment (playtest ask: "we gotta build
## stuff within the game for you to be able to test it"). Time, teleport, spawn,
## give, heal: every playtest question ("what's a howler pack like at new-moon
## midnight in a forest town?") should be three clicks, not a twenty-minute drive.
## A TOOL, not a cheat screen — it reuses the game's real paths (use_item, the
## same create() constructors, the real clock) so what you test is what ships.
class_name ProtoDevMode
extends CanvasLayer

var _main: Node = null
var _root: PanelContainer
var _town_pick: OptionButton
var _car_pick: OptionButton


static func create(main: Node) -> ProtoDevMode:
	var d := ProtoDevMode.new()
	d._main = main
	d.layer = 4
	d._root = PanelContainer.new()
	d._root.set_anchors_preset(Control.PRESET_TOP_RIGHT)
	d._root.offset_left = -352.0
	d._root.offset_right = -8.0
	d._root.offset_top = 8.0
	var style := StyleBoxFlat.new()
	style.bg_color = Color(0.10, 0.09, 0.07, 0.94)
	style.border_color = Color(0.55, 0.85, 0.45) # green border: TOOL, not game UI
	style.set_border_width_all(2)
	style.set_corner_radius_all(6)
	d._root.add_theme_stylebox_override("panel", style)
	d.add_child(d._root)

	var v := VBoxContainer.new()
	v.add_theme_constant_override("separation", 5)
	d._root.add_child(v)
	d._title(v, "🛠 DEV MODE — F10 closes")

	# --- TIME ----------------------------------------------------------------
	d._title(v, "⏱ time", 12)
	d._row(v, [
		["Dawn", func() -> void: d._set_hour(6.0)],
		["Noon", func() -> void: d._set_hour(12.0)],
		["Dusk", func() -> void: d._set_hour(18.5)],
		["Midnight", func() -> void: d._set_hour(0.0)],
		["+1h", func() -> void: d._set_hour(d._main.daynight.hour + 1.0)],
	])
	d._row(v, [
		["clock ×1", func() -> void: d._clock_speed(1.0)],
		["×10", func() -> void: d._clock_speed(10.0)],
		["×60", func() -> void: d._clock_speed(60.0)],
		["🌑 new moon", func() -> void: d._moon(0.05)],
		["🌕 full", func() -> void: d._moon(1.0)],
	])

	# --- WEATHER (2026-07-09: the panel gains systems shipped since it was written —
	# dust kills the cone, rain kills grip, heat cooks engines) -----------------------
	d._title(v, "🌦 weather", 12)
	d._row(v, [
		["🌪 Dust", func() -> void: d._weather("dust")],
		["🌧 Rain", func() -> void: d._weather("rain")],
		["🥵 Heat", func() -> void: d._weather("heat")],
		["☀ Clear", func() -> void: d._weather("clear")],
	])

	# --- TELEPORT ------------------------------------------------------------
	d._title(v, "🚀 teleport", 12)
	var trow := HBoxContainer.new()
	v.add_child(trow)
	d._town_pick = OptionButton.new()
	d._town_pick.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	trow.add_child(d._town_pick)
	d._populate_towns() # fills the town dropdown (also rebuilt whenever the panel opens)
	var go := Button.new()
	go.text = "GO"
	go.pressed.connect(func() -> void: d._teleport_town())
	trow.add_child(go)
	d._row(v, [
		["Safehouse", func() -> void: d._teleport(d._main.SAFEHOUSE + Vector3(0, 0.5, 0))],
		["⚒ Meridian test town", func() -> void: d._teleport(Vector3(121, 1.5, -305))],
	])

	# --- SPAWN (lands ~6 m ahead of you) --------------------------------------
	d._title(v, "👾 spawn (ahead of you)", 12)
	d._row(v, [
		["Howler", func() -> void: d._spawn_howler()],
		["Lurker", func() -> void: d._spawn_lurker()],
		["Stray dog", func() -> void: d._spawn_dog()],
		["Loot chest", func() -> void: d._spawn_chest()],
	])
	var crow := HBoxContainer.new()
	v.add_child(crow)
	d._car_pick = OptionButton.new()
	d._car_pick.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	for vclass in ProtoCar3D.VEHICLES:
		if vclass != "trailer":
			d._car_pick.add_item(vclass)
	crow.add_child(d._car_pick)
	var sc := Button.new()
	sc.text = "Spawn rig"
	sc.pressed.connect(func() -> void: d._spawn_car())
	crow.add_child(sc)

	# --- GIVE / FIX -----------------------------------------------------------
	d._title(v, "🎁 give / fix", 12)
	d._row(v, [
		["Arsenal", func() -> void: d._give_arsenal()],
		["100 scrip", func() -> void: d._give({"scrip": 100})],
		["Meds", func() -> void: d._give({"bandage": 4, "medkit": 2, "painkillers": 2})],
		["Fuel+parts", func() -> void: d._give({"jerry_can": 2, "car_parts": 2, "tire_kit": 1, "duct_tape": 2})],
	])
	d._row(v, [["❤️ Heal me full", func() -> void: d._heal()]])

	# --- THE LIVING PIPELINE: tune in VehicleForge/MapForge → one press → the
	# running world wears the new data. The modding surface, arrived early.
	d._title(v, "🔧 forge (live content)", 12)
	d._row(v, [["Reload vehicles + map", func() -> void: d._main.reload_content()]])
	return d


func toggle() -> void:
	visible = not visible
	if visible:
		_populate_towns() # rebuild in case the map finished loading after the panel was built


# --- The buttons' hands ------------------------------------------------------

func _set_hour(h: float) -> void:
	_main.daynight.hour = fposmod(h, 24.0)
	_main.notify("⏱ dev: clock set to %s" % _main.daynight.clock_text())


func _clock_speed(mult: float) -> void:
	_main.daynight.dev_mult = mult
	_main.notify("⏱ dev: clock ×%d" % int(mult))


func _weather(kind: String) -> void:
	if _main.weather != null:
		_main.weather.force(kind) # "clear" un-pins; the others pin ~2 game-hours to test in
		_main.notify("🌦 dev: weather → %s" % ("cleared" if kind == "clear" else kind))


func _moon(phase: float) -> void:
	_main.daynight.moon_phase = phase
	_main.notify("%s dev: moon set" % _main.daynight.moon_icon())


## Fill (or rebuild) the town dropdown from the live map. Called at create AND every time
## the panel opens — the old code built it ONCE, so if the map wasn't ready yet the list
## stayed empty and GO did nothing (2026-07-09 playtest "you can't teleport there").
func _populate_towns() -> void:
	if _town_pick == null:
		return
	var prev: int = _town_pick.selected
	_town_pick.clear()
	var usmap: Variant = _main.stream.usmap if _main.stream else null
	if usmap != null and usmap.ok:
		for t in usmap.towns:
			_town_pick.add_item("%s (%s)" % [t["name"], t["kind"]])
	if _town_pick.item_count > 0:
		_town_pick.selected = clampi(prev, 0, _town_pick.item_count - 1)


func _teleport_town() -> void:
	var usmap: Variant = _main.stream.usmap if _main.stream else null
	if usmap == null or not usmap.ok:
		_main.notify("🚀 dev: the map isn't loaded yet")
		return
	if _town_pick.item_count == 0:
		_populate_towns()
	var idx: int = maxi(_town_pick.selected, 0)
	if idx >= usmap.towns.size():
		_main.notify("🚀 dev: pick a town first")
		return
	var t: Dictionary = usmap.towns[idx]
	var p: Vector2 = t["pos"]
	_teleport(Vector3(p.x, 1.5, p.y)) # arrive a touch high so the streamed floor beats you down
	_main.notify("🚀 dev: warped to %s" % t["name"])


## Move the player — and the rig under him, if he's driving.
func _teleport(pos: Vector3) -> void:
	if _main.mode == _main.Mode.DRIVE and _main.active_car:
		_main.active_car.global_position = pos + Vector3(0, 1.5, 0)
		_main.active_car.linear_velocity = Vector3.ZERO
		_main.active_car.angular_velocity = Vector3.ZERO
		_main.player.global_position = pos
	else:
		_main.player.global_position = pos + Vector3(0, 0.5, 0)
		_main.player.velocity = Vector3.ZERO


func _spawn_at() -> Vector3:
	return _main.player.global_position + _main.player.facing() * 6.0


func _spawn_howler() -> void:
	var h := ProtoHowler.create(_main)
	_main.add_child(h)
	h.global_position = _spawn_at() + Vector3(0, 0.4, 0)


func _spawn_lurker() -> void:
	var l := ProtoLurker.create()
	_main.add_child(l)
	l.global_position = _spawn_at() + Vector3(0, 0.4, 0)


func _spawn_dog() -> void:
	var names: Array = ["Rex", "Ash", "Bolt", "Juno", "Ghost"]
	var breeds: Array = ["Shepherd", "Rottweiler", "Bloodhound", "Mutt", "Pointer"]
	var dog := ProtoDog.create((randi() % 4) as ProtoDog.DogType,
		names[randi() % names.size()], breeds[randi() % breeds.size()])
	_main.add_child(dog)
	dog.global_position = _spawn_at() + Vector3(0, 0.4, 0)
	_main.all_dogs.append(dog)


func _spawn_chest() -> void:
	var c := ProtoChest.create("Dev cache", {"bandage": 2, "meat": 2, "12ga": 8,
		"9mm": 30, "scrip": 20, "water": 1, "scrap": 4})
	_main.add_child(c)
	c.global_position = _spawn_at()


func _spawn_car() -> void:
	if _car_pick.selected < 0:
		return
	var vclass: String = _car_pick.get_item_text(_car_pick.selected)
	var car := ProtoCar3D.create(vclass, Color(0.45, 0.4, 0.5).lightened(randf() * 0.2))
	_main.add_child(car)
	car.global_position = _spawn_at() + Vector3(0, 1.0, 0)
	_main.cars.append(car)
	_main.notify("🚗 dev: %s delivered" % car.display_name)


func _give(items: Dictionary) -> void:
	for id in items:
		_main.backpack.add(id, items[id])
	_main.notify("🎁 dev: delivered")


func _give_arsenal() -> void:
	_main.backpack.add("9mm", 60)
	_main.backpack.add("12ga", 20)
	_main.backpack.add("rocket", 4)
	_main.backpack.add("grenade", 3)
	for id in ["pistol", "shotgun", "pipe_rocket", "machete"]:
		_main.use_item(id) # the real equip path — already-carried guns just refuse
	_main.notify("🔫 dev: the whole arsenal")


func _heal() -> void:
	var c: Variant = _main.character
	for part in c.body:
		c.treat(part, 100.0)
	c.hp = c.hp_cap()
	_main.player.stamina = _main.player.max_stamina
	_main.stress = 0.0
	_main.bleeding = 0
	_main.notify("❤️ dev: good as new")


# --- Tiny UI helpers ----------------------------------------------------------

func _title(parent: Control, txt: String, size: int = 15) -> void:
	var l := Label.new()
	l.add_theme_font_override("font", ProtoHUD.mixed_font())
	l.add_theme_font_size_override("font_size", size)
	l.add_theme_color_override("font_color", Color(0.55, 0.85, 0.45))
	l.text = txt
	parent.add_child(l)


func _row(parent: Control, entries: Array) -> void:
	var h := HBoxContainer.new()
	h.add_theme_constant_override("separation", 4)
	parent.add_child(h)
	for e in entries:
		var b := Button.new()
		b.add_theme_font_override("font", ProtoHUD.mixed_font())
		b.add_theme_font_size_override("font_size", 13)
		b.text = e[0]
		b.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		b.pressed.connect(e[1])
		h.add_child(b)
