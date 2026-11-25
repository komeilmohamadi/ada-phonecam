@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found.
  pause
  exit /b 1
)
call node scripts\launch.mjs stop
if errorlevel 1 (
  pause
  exit /b 1
)
