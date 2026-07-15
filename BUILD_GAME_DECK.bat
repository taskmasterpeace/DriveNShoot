@echo off
setlocal EnableExtensions EnableDelayedExpansion
rem ============================================================================
rem  DRIVN: GAME DECK - tested, single-file Windows companion release
rem  Output: build\DRIVN-Game-Deck.exe (embedded PCK, no console sidecar)
rem ============================================================================

set "ROOT=%~dp0"
set "GODOT=C:\Users\taskm\Downloads\projects\Godot\Godot_v4.5.1-stable_win64_console.exe"
set "TDIR=%APPDATA%\Godot\export_templates\4.5.1.stable"
set "TPZ_URL=https://github.com/godotengine/godot/releases/download/4.5.1-stable/Godot_v4.5.1-stable_export_templates.tpz"
set "OUT=%ROOT%build\DRIVN-Game-Deck.exe"
set "SMOKE_LOG=%ROOT%build\DRIVN-Game-Deck-smoke.log"
set "MIN_BYTES=20971520"

echo.
echo   DRIVN: GAME DECK  --  Windows companion release
echo   =================================================
echo.

if not exist "%GODOT%" (
    echo [X] Godot 4.5.1 console executable is missing: %GODOT%
    goto :fail
)

if not exist "%TDIR%\windows_release_x86_64.exe" call :install_templates
if errorlevel 1 goto :fail

if not exist "%ROOT%build" mkdir "%ROOT%build"
if exist "%OUT%" del /q "%OUT%"
if exist "%SMOKE_LOG%" del /q "%SMOKE_LOG%"

echo [1/5] Importing every source asset and class...
"%GODOT%" --headless --path "%ROOT%game" --import
if errorlevel 1 goto :fail

echo.
echo [2/5] Running the eight companion release gates...
call :run_test game_companion_data_sim || goto :fail
call :run_test game_companion_save_sim || goto :fail
call :run_test game_companion_shelf_sim || goto :fail
call :run_test game_companion_inspector_sim || goto :fail
call :run_test game_companion_transition_sim || goto :fail
call :run_test game_companion_flow_sim || goto :fail
call :run_test game_companion_boot_sim || goto :fail
call :run_test game_companion_export_sim || goto :fail

echo.
echo [3/5] Running shared catalog, cover, input, and legal regressions...
call :run_test game_catalog_sim || goto :fail
call :run_test game_cover_sim || goto :fail
call :run_test game_input_sim || goto :fail
call :run_test game_license_sim || goto :fail

echo.
echo [4/5] Exporting preset "Windows Game Deck Companion"...
"%GODOT%" --headless --path "%ROOT%game" --export-release "Windows Game Deck Companion" "%OUT%"
if not exist "%OUT%" (
    echo [X] Export returned without producing DRIVN-Game-Deck.exe.
    goto :fail
)
for %%A in ("%OUT%") do set "SIZE=%%~zA"
if !SIZE! LSS %MIN_BYTES% (
    echo [X] Export is only !SIZE! bytes; embedded release must exceed 20971520 bytes.
    goto :fail
)

echo.
echo [5/5] Launching the exported app through its private smoke route...
start "" /wait "%OUT%" --headless --log-file "%SMOKE_LOG%" -- --companion-smoke
if errorlevel 1 (
    echo [X] Exported companion smoke exited with an error. See %SMOKE_LOG%
    goto :fail
)
findstr /c:"GAME_DECK_COMPANION_SMOKE: PASS - handheld, console AI, eject, and save" "%SMOKE_LOG%" >nul
if errorlevel 1 (
    echo [X] Exported app did not write its complete smoke proof. See %SMOKE_LOG%
    goto :fail
)

for /f "usebackq delims=" %%H in (`powershell -NoProfile -Command "(Get-FileHash -Algorithm SHA256 -LiteralPath '%OUT%').Hash"`) do set "HASH=%%H"
for %%A in ("%OUT%") do set "SIZE=%%~zA"

echo.
echo   =================================================
echo   [OK] DRIVN: GAME DECK is tested and distributable.
echo        Artifact: %OUT%
echo        Bytes:    !SIZE!
echo        SHA-256:  !HASH!
echo        Smoke:    %SMOKE_LOG%
echo   =================================================
exit /b 0

:run_test
echo     - %~1
"%GODOT%" --headless --path "%ROOT%game" "res://proto3d/tests/%~1.tscn"
if errorlevel 1 exit /b 1
exit /b 0

:install_templates
echo [SETUP] Installing official Godot 4.5.1 Windows export templates once.
set "TPZ=%TEMP%\Godot_v4.5.1-stable_export_templates.tpz"
powershell -NoProfile -Command "$ProgressPreference='SilentlyContinue'; Invoke-WebRequest -UseBasicParsing -Uri '%TPZ_URL%' -OutFile '!TPZ!'"
if errorlevel 1 exit /b 1
if not exist "%TDIR%" mkdir "%TDIR%"
tar -xf "!TPZ!" -C "%TDIR%" --strip-components=1
if errorlevel 1 exit /b 1
del /q "!TPZ!" >nul 2>&1
if not exist "%TDIR%\windows_release_x86_64.exe" exit /b 1
echo [OK] Export templates installed: %TDIR%
exit /b 0

:fail
echo.
echo [X] DRIVN: GAME DECK build stopped. No success claim was produced.
exit /b 1
