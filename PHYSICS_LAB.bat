@echo off
setlocal
set "GODOT=C:\Users\taskm\Downloads\projects\Godot\Godot_v4.5.1-stable_win64.exe"
"%GODOT%" --path "%~dp0game" res://proto3d/tools/physics_combat_lab.tscn
endlocal
