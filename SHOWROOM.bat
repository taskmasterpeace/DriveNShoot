@echo off
rem ============================================
rem  DRIVN SHOWROOM — render every vehicle + structure
rem  row to PNG (docs/renders/showroom/). Opens a real
rem  Godot window while it works (capture needs a live
rem  GPU swapchain, same law as the puppet photobooth)
rem  then closes itself when done.
rem  Usage: SHOWROOM.bat [vehicles|structures|all]
rem  Browse the results: EDITOR.bat -> the SHOWROOM tab.
rem ============================================
cd /d "%~dp0"
node tools\showroom\run.mjs %1
pause
