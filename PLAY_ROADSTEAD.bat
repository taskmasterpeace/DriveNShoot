@echo off
setlocal
rem Resolve THIS isolated checkout, never the user's ordinary DRIVN profile.
set "ROOT=%~dp0"
set "GODOT=C:\Users\taskm\Downloads\projects\Godot\Godot_v4.5.1-stable_win64.exe"
if not exist "%GODOT%" (
  echo Godot 4.5.1 was not found. Edit the GODOT path in this launcher.
  pause
  exit /b 1
)
if not exist "%ROOT%game\proto3d\realm\road_life.gd" exit /b 1
set "APPDATA=%ROOT%.roadstead-profile"
if not exist "%APPDATA%" mkdir "%APPDATA%"
start "ROADSTEAD - isolated local build" "%GODOT%" --path "%ROOT%game" res://proto3d/proto3d.tscn
endlocal
