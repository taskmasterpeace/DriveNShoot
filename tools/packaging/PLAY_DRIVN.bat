@echo off
setlocal
rem Local evaluation launcher: the real executable contains the Godot runtime.
rem Never point evaluation saves/settings at the normal DRIVN profile.
if not exist "%~dp0DRIVN.exe" (
    echo DRIVN.exe is missing. Extract the entire candidate zip first.
    pause
    exit /b 1
)
if not defined LOCALAPPDATA goto :portable
set "PROFILE_ROOT=%LOCALAPPDATA%\DRIVN-Roadstead-Evaluation"
if not exist "%PROFILE_ROOT%\Roaming" mkdir "%PROFILE_ROOT%\Roaming" >nul 2>&1
if not exist "%PROFILE_ROOT%\Local" mkdir "%PROFILE_ROOT%\Local" >nul 2>&1
if exist "%PROFILE_ROOT%\Roaming" if exist "%PROFILE_ROOT%\Local" goto :launch

:portable
set "PROFILE_ROOT=%~dp0evaluation-profile"
if not exist "%PROFILE_ROOT%\Roaming" mkdir "%PROFILE_ROOT%\Roaming" >nul 2>&1
if not exist "%PROFILE_ROOT%\Local" mkdir "%PROFILE_ROOT%\Local" >nul 2>&1
if not exist "%PROFILE_ROOT%\Roaming" goto :failed
if not exist "%PROFILE_ROOT%\Local" goto :failed

:launch
set "APPDATA=%PROFILE_ROOT%\Roaming"
set "LOCALAPPDATA=%PROFILE_ROOT%\Local"
start "" /wait "%~dp0DRIVN.exe"
exit /b %errorlevel%

:failed
echo Could not create an isolated evaluation profile.
echo Move the extracted candidate to a writable folder and try again.
pause
exit /b 1
