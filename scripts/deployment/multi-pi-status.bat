@echo off
echo Multi-Pi Status Check
echo ====================
powershell -ExecutionPolicy Bypass -File "scripts\deployment\manage-all-pis.ps1" status all
pause