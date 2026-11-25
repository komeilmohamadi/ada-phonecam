@echo off
setlocal
where node >nul 2>&1 || (echo Node.js is required. & exit /b 1)
if /I "%~x1"==".ada-update" goto dropped
node "%~dp0.ada-upgrader\upgrader.cjs" --root "%~dp0." %*
set "RC=%ERRORLEVEL%"
if "%~1"=="" pause
exit /b %RC%
:dropped
node "%~dp0.ada-upgrader\upgrader.cjs" --root "%~dp0." check "%~1"
if errorlevel 1 goto failed
choice /C YN /M "Apply this verified package and create a Git commit"
if errorlevel 2 goto cancelled
if not errorlevel 1 goto cancelled
node "%~dp0.ada-upgrader\upgrader.cjs" --root "%~dp0." apply "%~1" --commit
if errorlevel 1 goto failed
pause
exit /b 0
:failed
pause
exit /b 1
:cancelled
echo Cancelled. No project files changed.
pause
exit /b 0
