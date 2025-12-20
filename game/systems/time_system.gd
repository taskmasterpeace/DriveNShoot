extends Node

## TimeSystem
## Global autoload that manages game time (Day/Hour/Minute) and signals for other systems (Farming, Survival).

signal time_changed(day: int, hour: int, minute: int)
signal day_changed(day: int)
signal hour_changed(hour: int)

@export var day_duration_seconds: float = 600.0 ## Real seconds per game day
@export var start_hour: int = 8

var time_multiplier: float = 1.0
var _accumulated_time: float = 0.0

var day: int = 1
var hour: int = 0
var minute: int = 0

func _ready() -> void:
	hour = start_hour
	time_multiplier = (24.0 * 60.0) / day_duration_seconds # Game minutes per real second

func _process(delta: float) -> void:
	_accumulated_time += delta * time_multiplier
	
	if _accumulated_time >= 1.0:
		var minutes_passed = floor(_accumulated_time)
		_accumulated_time -= minutes_passed
		_advance_time(int(minutes_passed))

func _advance_time(add_minutes: int) -> void:
	minute += add_minutes
	
	if minute >= 60:
		var hours_passed = minute / 60
		minute = minute % 60
		_advance_hour(hours_passed)
	
	time_changed.emit(day, hour, minute)

func _advance_hour(add_hours: int) -> void:
	hour += add_hours
	
	if hour >= 24:
		var days_passed = hour / 24
		hour = hour % 24
		_advance_day(days_passed)
	
	hour_changed.emit(hour)

func _advance_day(add_days: int) -> void:
	day += add_days
	day_changed.emit(day)
	print("Day Changed: ", day)
