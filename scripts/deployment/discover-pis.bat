@echo off
echo Discovering eForm Pis on Network
echo ================================
powershell -ExecutionPolicy Bypass -File "scripts\deployment\manage-all-pis.ps1" discover
pause