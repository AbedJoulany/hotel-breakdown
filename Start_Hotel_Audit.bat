@echo off
setlocal
cd /d "%~dp0"

REM Start a small local web server using Windows PowerShell (no Python required).
start "Hotel Group Audit - Local Server" powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0local_server.ps1"

timeout /t 2 /nobreak >nul
start "" "http://127.0.0.1:8000"
