@echo off
echo Restarting eForm Locker services on Pi...
powershell -ExecutionPolicy Bypass -File "scripts\deployment\pi-manager.ps1" restart
pause