@echo off
rem ============================================
rem  DRIVN MOTION STAGE — double-click to open the
rem  animation preview window (biped + quadruped).
rem  Drag sliders in the MOTION tab (EDITOR.bat) and
rem  watch them land here LIVE — no F10 needed.
rem  Mouse aims · RMB-drag orbits · wheel zooms ·
rem  W cycles held weapon · WASD/arrows strafe · M/P/K strikes
rem ============================================
start "DRIVN STAGE" "C:\Users\taskm\Downloads\projects\Godot\Godot_v4.5.1-stable_win64.exe" --path "%~dp0game" res://proto3d/tools/motion_stage.tscn
