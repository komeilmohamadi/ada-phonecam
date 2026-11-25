@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found. Run Install.bat first.
  pause
  exit /b 1
)
call node scripts\launch.mjs start
if errorlevel 1 (
  pause
  exit /b 1
)
