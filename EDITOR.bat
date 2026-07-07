@echo off
title THE FORGE - DRIVN editor hub (close this window to stop all editors)
rem ============================================
rem  THE FORGE — double-click to start EVERY editor
rem  Map + Media + Vehicles + Motion, one page:
rem  http://localhost:8900  (opens automatically)
rem ============================================
cd /d "%~dp0"
node tools\forge\server.mjs
pause
