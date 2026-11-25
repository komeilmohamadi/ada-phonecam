@echo off
setlocal
cd /d "%~dp0"
if /i "%~1"=="Status" goto status
if /i "%~1"=="Setup" goto setup
if /i "%~1"=="Start" goto start
echo Usage: Native-Camera.cmd Status ^| Setup ^| Start
echo Install the named UnityCapture device first. See docs\NATIVE-CAMERA.md.
exit /b 1
:status
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\Native-Camera-Status.ps1"
exit /b %errorlevel%
:setup
py -3.12 -m venv runtime\native-camera-venv
if errorlevel 1 exit /b 1
runtime\native-camera-venv\Scripts\python.exe -m pip install --only-binary=:all: pyvirtualcam==0.15.0 numpy==2.2.6
exit /b %errorlevel%
:start
if not exist runtime\native-camera-venv\Scripts\python.exe (
  echo Run Native-Camera.cmd Setup first.
  exit /b 1
)
runtime\native-camera-venv\Scripts\python.exe scripts\native-camera.py
exit /b %errorlevel%
