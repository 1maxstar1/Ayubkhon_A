@echo off
rem Double-click to start. Also: laptop.cmd autostart | status | backup | update | stop | uninstall
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0laptop.ps1" %*
echo.
pause
