@echo off
rem ============================================
rem  DRIVN — the POSE EDITOR (motion stage)
rem  Double-click, then press TAB to enter author mode and
rem  LEFT-DRAG the body's parts to pose them. Q/E fine-tunes
rem  the selected joint; C captures a pose; ENTER saves the
rem  row to data/strikes.json; SPACE previews; ESC exits.
rem  RMB-drag orbits the camera, wheel zooms.
rem ============================================
start "DRIVN POSE" "C:\Users\taskm\Downloads\projects\Godot\Godot_v4.5.1-stable_win64.exe" --path "%~dp0game" res://proto3d/tools/motion_stage.tscn
