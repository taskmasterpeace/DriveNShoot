@echo off
setlocal EnableDelayedExpansion
rem ============================================================
rem  DRIVN - one-click Windows release build  (Godot 4.5.1)
rem  Output: build\DRIVN.exe  (single exe, game data embedded)
rem  Details + road to Steam: docs\SHIPPING.md
rem ============================================================

set "GODOT=C:\Users\taskm\Downloads\projects\Godot\Godot_v4.5.1-stable_win64_console.exe"
set "TDIR=%APPDATA%\Godot\export_templates\4.5.1.stable"
set "TPZ_URL=https://github.com/godotengine/godot/releases/download/4.5.1-stable/Godot_v4.5.1-stable_export_templates.tpz"
set "OUT=%~dp0build\DRIVN.exe"

rem --- version read straight from game\project.godot ---
set "VERSION=unknown"
for /f "tokens=2 delims==" %%v in ('findstr /b /c:"config/version" "%~dp0game\project.godot"') do set "VERSION=%%~v"

echo.
echo   DRIVN  v!VERSION!  --  Windows Release build
echo   ------------------------------------------------
echo.

if not exist "%GODOT%" (
    echo [X] Godot console exe not found at:
    echo     %GODOT%
    echo     Fix the GODOT path at the top of BUILD.bat.
    goto :fail
)

rem --- one-time: export templates must be installed ---
if exist "%TDIR%\windows_release_x86_64.exe" goto :build

echo [!] Godot 4.5.1 export templates are NOT installed - one-time setup needed.
echo     Expected file: %TDIR%\windows_release_x86_64.exe
echo.
echo     Two ways to install:
echo       A^) Let this script download them now - about 900 MB, official Godot release
echo       B^) Manual: download
echo            %TPZ_URL%
echo          then extract the archive's inner "templates" folder INTO:
echo            %TDIR%
echo          Or in the Godot editor: Editor ^> Manage Export Templates ^> Download and Install
echo.
set "ANS=n"
set /p ANS="    Download templates now? [y/N] "
if /i not "!ANS!"=="y" goto :fail

set "TPZ=%TEMP%\godot_templates_4.5.1.tpz"
echo [*] Downloading export templates - about 900 MB, this takes a while...
curl.exe -L --fail -o "!TPZ!" "%TPZ_URL%"
if errorlevel 1 (
    echo [X] Download failed. Use the manual install - option B above.
    goto :fail
)
echo [*] Extracting into %TDIR% ...
if not exist "%TDIR%" mkdir "%TDIR%"
tar -xf "!TPZ!" -C "%TDIR%" --strip-components=1
del "!TPZ!" >nul 2>&1
if not exist "%TDIR%\windows_release_x86_64.exe" (
    echo [X] Extraction did not produce the expected files. Use the manual install - option B.
    goto :fail
)
echo [OK] Templates installed.
echo.

:build
if not exist "%~dp0build" mkdir "%~dp0build"
if exist "%OUT%" del "%OUT%"

echo [1/2] Import pass - first run after new assets can take a minute...
"%GODOT%" --headless --path "%~dp0game" --import >nul 2>&1

echo [2/2] Exporting preset "Windows Release" to build\DRIVN.exe ...
"%GODOT%" --headless --path "%~dp0game" --export-release "Windows Release" "%OUT%"

rem Godot can exit 0 even when an export fails - trust the artifact, not the exit code.
if not exist "%OUT%" (
    echo.
    echo [X] Export FAILED - no build\DRIVN.exe was produced. Scroll up for the error.
    echo     If it says "No export template found", re-run BUILD.bat and take the
    echo     template download, or see docs\SHIPPING.md section 0.
    goto :fail
)

for %%A in ("%OUT%") do set "SIZE=%%~zA"
set /a SIZE_MB=!SIZE:~0,-3! / 1049
echo.
echo   ------------------------------------------------
echo   [OK] DRIVN v!VERSION! built.
echo        %OUT%
echo        ~!SIZE_MB! MB - single exe, data embedded. Double-click it to play.
findstr /c:"rcedit" "%APPDATA%\Godot\editor_settings-4.5.tres" >nul 2>&1 || echo        note: Explorer file-icon/metadata needs the one-time rcedit setup - docs\SHIPPING.md
echo   ------------------------------------------------
echo.
pause
exit /b 0

:fail
echo.
pause
exit /b 1
