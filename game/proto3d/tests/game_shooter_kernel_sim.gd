## Shared deterministic shooter-combat proof. Locomotion stays cartridge-owned;
## bullets, grenades, armor, teams, explosions, and restore live here once.
extends Node

const KERNEL_PATH := "res://proto3d/games/shooter/shooter_kernel.gd"

var passed := 0
var failed := 0


func _check(label: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("SHOOTER_KERNEL: %s - %s" % ["PASS" if ok else "FAIL", label])


func _ready() -> void:
	print("SHOOTER_KERNEL: start")
	get_tree().create_timer(45.0).timeout.connect(func() -> void: get_tree().quit(1))
	var exists := ResourceLoader.exists(KERNEL_PATH) \
		and FileAccess.file_exists("res://data/game_shooter_weapons.json")
	_check("shared kernel and weapon-row catalog exist", exists)
	if not exists:
		_finish()
		return
	var script := load(KERNEL_PATH) as GDScript
	var rows: Dictionary = script.load_weapon_rows()
	_check("both original arsenals load from valid unique rows", rows.size() >= 10
		and rows.has("rr_scrap_rifle") and rows.has("rr_frag")
		and rows.has("bg_pulse_carbine") and rows.has("bg_siege_shell"))
	var kernel: RefCounted = script.new()
	kernel.configure(rows, 424242, Rect2(0, 0, 1000, 600), [Rect2(475, 0, 20, 600)])
	_add_stock_actors(kernel)
	_check("combatants carry team health armor radius and deterministic loadouts",
		kernel.actor_state(0).get("hp") == 100.0
		and (kernel.actor_state(0).get("weapons", {}) as Dictionary).has("rr_scrap_rifle"))

	var second: RefCounted = script.new()
	second.configure(rows, 424242, Rect2(0, 0, 1000, 600), [Rect2(475, 0, 20, 600)])
	_add_stock_actors(second)
	var spread_a: Dictionary = kernel.fire(0, "rr_scrap_rifle", Vector2(100, 100), Vector2.RIGHT)
	var spread_b: Dictionary = second.fire(0, "rr_scrap_rifle", Vector2(100, 100), Vector2.RIGHT)
	_check("seeded spread and recoil are exactly repeatable",
		JSON.stringify(spread_a) == JSON.stringify(spread_b) and not spread_a.is_empty())
	_check("cadence refuses a second shot on the same tick",
		kernel.fire(0, "rr_scrap_rifle", Vector2(100, 100), Vector2.RIGHT).is_empty())
	var ammo_after := int((kernel.actor_state(0).get("weapons", {}) as Dictionary)["rr_scrap_rifle"]["ammo"])
	_check("a legal shot spends exactly one magazine round", ammo_after == 29)

	var hit_kernel: RefCounted = script.new()
	hit_kernel.configure(rows, 7, Rect2(0, 0, 1000, 600), [])
	hit_kernel.add_actor({"id": 0, "team": 0, "pos": Vector2(100, 200), "hp": 100.0,
		"armor": 0.0, "radius": 14.0, "velocity": Vector2.ZERO})
	hit_kernel.add_actor({"id": 1, "team": 1, "pos": Vector2(350, 200), "hp": 100.0,
		"armor": 20.0, "radius": 14.0, "velocity": Vector2.ZERO})
	hit_kernel.equip(0, ["rr_rivet_lance", "rr_frag"])
	hit_kernel.fire(0, "rr_rivet_lance", Vector2(100, 200), Vector2.RIGHT)
	_check("hitscan intersects a circular target and armor absorbs before health",
		float(hit_kernel.actor_state(1).get("armor", 20.0)) < 20.0
		and float(hit_kernel.actor_state(1).get("hp", 100.0)) < 100.0)

	var friendly_before := float(hit_kernel.actor_state(0).get("hp", 0.0))
	hit_kernel.add_actor({"id": 2, "team": 0, "pos": Vector2(220, 260), "hp": 100.0,
		"armor": 0.0, "radius": 14.0, "velocity": Vector2.ZERO})
	hit_kernel.actor_state(0)["pos"] = Vector2(100, 260)
	hit_kernel.step_many(40)
	hit_kernel.fire(0, "rr_rivet_lance", Vector2(100, 260), Vector2.RIGHT)
	_check("default team policy prevents friendly fire",
		float(hit_kernel.actor_state(2).get("hp", 0.0)) == 100.0
		and float(hit_kernel.actor_state(0).get("hp", 0.0)) == friendly_before)

	var projectile_kernel: RefCounted = script.new()
	projectile_kernel.configure(rows, 88, Rect2(0, 0, 1000, 600), [])
	projectile_kernel.add_actor({"id": 0, "team": 0, "pos": Vector2(100, 300), "hp": 100.0,
		"armor": 0.0, "radius": 14.0, "velocity": Vector2.ZERO})
	projectile_kernel.add_actor({"id": 1, "team": 1, "pos": Vector2(360, 300), "hp": 100.0,
		"armor": 0.0, "radius": 16.0, "velocity": Vector2.ZERO})
	projectile_kernel.equip(0, ["bg_pulse_carbine", "bg_frag_charge"])
	projectile_kernel.fire(0, "bg_pulse_carbine", Vector2(100, 300), Vector2.RIGHT)
	_check("traveling projectiles exist before their impact tick", projectile_kernel.projectiles.size() == 1
		and float(projectile_kernel.actor_state(1).get("hp", 0.0)) == 100.0)
	projectile_kernel.step_many(24)
	_check("projectile travel resolves damage at the fixed tick", projectile_kernel.projectiles.is_empty()
		and float(projectile_kernel.actor_state(1).get("hp", 100.0)) < 100.0)

	var blast_kernel: RefCounted = script.new()
	blast_kernel.configure(rows, 101, Rect2(0, 0, 1000, 600), [])
	blast_kernel.add_actor({"id": 0, "team": 0, "pos": Vector2(100, 400), "hp": 100.0,
		"armor": 0.0, "radius": 12.0, "velocity": Vector2.ZERO})
	blast_kernel.add_actor({"id": 1, "team": 1, "pos": Vector2(230, 400), "hp": 120.0,
		"armor": 0.0, "radius": 12.0, "velocity": Vector2.ZERO})
	blast_kernel.add_actor({"id": 2, "team": 1, "pos": Vector2(300, 400), "hp": 120.0,
		"armor": 0.0, "radius": 12.0, "velocity": Vector2.ZERO})
	blast_kernel.equip(0, ["rr_frag"])
	blast_kernel.fire(0, "rr_frag", Vector2(200, 400), Vector2.RIGHT,
		{"fuse_ticks": 1, "velocity_scale": 0.0})
	blast_kernel.step()
	var near_hp := float(blast_kernel.actor_state(1).get("hp", 120.0))
	var far_hp := float(blast_kernel.actor_state(2).get("hp", 120.0))
	_check("grenade blast damage falls off with distance", near_hp < far_hp and far_hp < 120.0)
	_check("explosion emits its declared deterministic shrapnel fan",
		blast_kernel.event_count("shrapnel") >= 8)

	var ricochet_kernel: RefCounted = script.new()
	ricochet_kernel.configure(rows, 33, Rect2(0, 0, 1000, 600), [Rect2(400, 0, 20, 600)])
	ricochet_kernel.add_actor({"id": 0, "team": 0, "pos": Vector2(300, 500), "hp": 100.0,
		"armor": 0.0, "radius": 12.0, "velocity": Vector2.ZERO})
	ricochet_kernel.equip(0, ["bg_rail_lance"])
	ricochet_kernel.fire(0, "bg_rail_lance", Vector2(300, 500), Vector2.RIGHT)
	_check("declared hitscan ricochet reflects from field geometry",
		ricochet_kernel.event_count("ricochet") == 1)

	var reload_kernel: RefCounted = script.new()
	reload_kernel.configure(rows, 12, Rect2(0, 0, 1000, 600), [])
	reload_kernel.add_actor({"id": 0, "team": 0, "pos": Vector2.ZERO, "hp": 100.0,
		"armor": 0.0, "radius": 12.0, "velocity": Vector2.ZERO})
	reload_kernel.equip(0, ["rr_scrap_rifle"])
	var weapon_state: Dictionary = (reload_kernel.actor_state(0)["weapons"] as Dictionary)["rr_scrap_rifle"]
	weapon_state["ammo"] = 0
	_check("empty magazines refuse fire and can begin a timed reload",
		reload_kernel.fire(0, "rr_scrap_rifle", Vector2.ZERO, Vector2.RIGHT).is_empty()
		and reload_kernel.start_reload(0, "rr_scrap_rifle"))
	reload_kernel.step_many(int(rows["rr_scrap_rifle"].get("reload_ticks", 1)))
	_check("reload transfers reserve rounds without exceeding magazine size",
		int(weapon_state.get("ammo", 0)) == int(rows["rr_scrap_rifle"].get("magazine", 0))
		and int(weapon_state.get("reserve", 0)) < int(rows["rr_scrap_rifle"].get("reserve", 0)))

	var restore_kernel: RefCounted = script.new()
	restore_kernel.configure(rows, 989, Rect2(0, 0, 1000, 600), [])
	restore_kernel.add_actor({"id": 0, "team": 0, "pos": Vector2(100, 100), "hp": 100.0,
		"armor": 0.0, "radius": 12.0, "velocity": Vector2.ZERO})
	restore_kernel.equip(0, ["bg_pulse_carbine"])
	restore_kernel.fire(0, "bg_pulse_carbine", Vector2(100, 100), Vector2.RIGHT)
	var saved: Dictionary = restore_kernel.snapshot()
	restore_kernel.step()
	var expected: Dictionary = restore_kernel.snapshot()
	restore_kernel.restore_snapshot(saved)
	restore_kernel.step()
	_check("deep snapshot restore reproduces the exact next combat tick",
		JSON.stringify(restore_kernel.snapshot()) == JSON.stringify(expected))
	_finish()


func _add_stock_actors(kernel: RefCounted) -> void:
	kernel.add_actor({"id": 0, "team": 0, "pos": Vector2(100, 100), "hp": 100.0,
		"armor": 0.0, "radius": 14.0, "velocity": Vector2.ZERO})
	kernel.add_actor({"id": 1, "team": 1, "pos": Vector2(800, 100), "hp": 100.0,
		"armor": 0.0, "radius": 14.0, "velocity": Vector2.ZERO})
	kernel.equip(0, ["rr_scrap_rifle", "rr_frag"])


func _finish() -> void:
	print("SHOOTER_KERNEL RESULTS: %d passed, %d failed" % [passed, failed])
	print("SHOOTER_KERNEL: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)
