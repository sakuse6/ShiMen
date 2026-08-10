@echo off
setlocal
cd /d "%~dp0"
powershell.exe -NoProfile -Sta -ExecutionPolicy Bypass -File "%~dp0install-lmentor.ps1"
exit /b %errorlevel%
