@echo off
setlocal

set "SCRIPT_DIR=%~dp0"
powershell -NoProfile -NoExit -ExecutionPolicy Bypass -File "%SCRIPT_DIR%run.ps1"
