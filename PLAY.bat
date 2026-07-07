@echo off
rem ============================================
rem  DRIVN — double-click to play the latest build
rem  (runs straight from source, so it is ALWAYS current)
rem ============================================
start "DRIVN" "C:\Users\taskm\Downloads\projects\Godot\Godot_v4.5.1-stable_win64.exe" --path "%~dp0game" res://proto3d/proto3d.tscn
