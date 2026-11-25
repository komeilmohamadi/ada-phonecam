@echo off
setlocal
set "ACTION=%~1"
if "%ACTION%"=="" set "ACTION=Status"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\Virtual-Camera.ps1" -Action "%ACTION%"
exit /b %ERRORLEVEL%
