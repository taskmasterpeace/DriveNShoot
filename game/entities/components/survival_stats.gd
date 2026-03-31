class_name SurvivalStats
extends Node

## SurvivalStats
## Component that tracks Hunger, Thirst, and Fatigue.
## Connects to TimeSystem to drain stats over time.

signal stat_changed(stat_name: String, new_value: float, max_value: float)
signal player_died(cause: String)

@export var max_hunger: float = 100.0
@export var max_thirst: float = 100.0
@export var max_fatigue: float = 100.0

# Depletion rates per game hour
@export var hunger_drain_per_hour: float = 5.0
@export var thirst_drain_per_hour: float = 8.0
@export var fatigue_drain_base: float = 4.0

var hunger: float
var thirst: float
var fatigue: float

func _ready() -> void:
	hunger = max_hunger
	thirst = max_thirst
	fatigue = max_fatigue
	
	# Connect to global TimeSystem if available
	# Assuming 'TimeSystem' is the autoload name
	if has_node("/root/TimeSystem"):
		get_node("/root/TimeSystem").hour_changed.connect(_on_hour_changed)
	else:
		push_warning("TimeSystem autoload not found! Survival stats won't drain automatically.")

func _on_hour_changed(_hour: int) -> void:
	_drain_stats()

func _drain_stats() -> void:
	change_stat("hunger", -hunger_drain_per_hour)
	change_stat("thirst", -thirst_drain_per_hour)
	change_stat("fatigue", -fatigue_drain_base) # Fatigue might drain faster if running (handled separately)

func change_stat(stat_name: String, amount: float) -> void:
	match stat_name:
		"hunger":
			hunger = clamp(hunger + amount, 0.0, max_hunger)
			stat_changed.emit("hunger", hunger, max_hunger)
			if hunger <= 0:
				player_died.emit("starvation")
		"thirst":
			thirst = clamp(thirst + amount, 0.0, max_thirst)
			stat_changed.emit("thirst", thirst, max_thirst)
			if thirst <= 0:
				player_died.emit("dehydration")
		"fatigue":
			fatigue = clamp(fatigue + amount, 0.0, max_fatigue)
			stat_changed.emit("fatigue", fatigue, max_fatigue)
			if fatigue <= 0:
				player_died.emit("exhaustion")
		"stamina":
			stamina = clamp(stamina + amount, 0.0, max_stamina)
			stat_changed.emit("stamina", stamina, max_stamina)

# Stamina Logic
@export var max_stamina: float = 100.0
@export var stamina_regen: float = 20.0 ## per second
var stamina: float = 100.0

func _process(delta: float) -> void:
	# Regen stamina if not full (drain is handled by CharacterEntity)
	if stamina < max_stamina:
		change_stat("stamina", stamina_regen * delta)

func has_stamina(amount: float) -> bool:
	return stamina >= amount

